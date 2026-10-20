import "server-only";
import { render } from "@react-email/components";
import { pause } from "@/lib/announcements";
import {
  buildHostAlertEmail,
  buildHostDigestEmail,
  buildSessionDayEmail,
  type DigestSession,
  type SessionDayPlayer,
} from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/send";
import { env } from "@/lib/env";
import { formatDateTime, formatMoney, formatTime } from "@/lib/format";
import { digestDue, digestSince, sessionDayDue, type HostDigest } from "@/lib/host-schedule";
import { OPTION_LABELS } from "@/lib/profile";
import { createAdminClient } from "@/lib/supabase/server";
import type { Profile, Registration, Session, SessionCounts } from "@/lib/types";

// Host emails, run by the cron route every minute after run_tick:
//   * instant alerts (late cancellations, e-Transfers nobody matched),
//   * the digest of what changed (every 3 hours, held overnight, or daily),
//   * the session-day email (from 9am on the day of each session).
// Each send is claimed first (a column or email_log), so overlapping runs
// never double-send. Host settings live on profiles (see the account page).

type Admin = ReturnType<typeof createAdminClient>;
type Host = Pick<
  Profile,
  | "id"
  | "email"
  | "display_name"
  | "full_name"
  | "host_digest"
  | "host_session_day"
  | "host_alert_late_cancel"
  | "host_alert_unmatched"
  | "host_digest_sent_at"
>;
type PlayerName = Pick<Profile, "display_name" | "full_name" | "email">;
type Activity = {
  id: number;
  kind: "joined" | "waitlisted" | "promoted" | "paid" | "cancelled" | "expired" | "unmatched_payment" | "payment_reversed";
  late: boolean;
  created_at: string;
  session: Pick<Session, "id" | "title" | "starts_at" | "capacity" | "instructional_capacity"> | null;
  registration: (Pick<Registration, "option" | "status" | "amount_cents" | "paid_cents"> & { profile: PlayerName | null }) | null;
  payment: { sender_name: string | null; amount_cents: number; memo: string | null; registration_id: string | null; dismissed: boolean } | null;
  cancellation: { amount_cents: number | null; sender_name: string | null; payment_id: string | null; note: string | null } | null;
};

const ACTIVITY_SELECT =
  "id, kind, late, created_at, session:sessions(id, title, starts_at, capacity, instructional_capacity), registration:registrations(option, status, amount_cents, paid_cents, profile:profiles(display_name, full_name, email)), payment:payments(sender_name, amount_cents, memo, registration_id, dismissed), cancellation:payment_cancellations(amount_cents, sender_name, payment_id, note)";

const nameOf = (p: PlayerName | null | undefined) => p?.display_name ?? p?.full_name ?? p?.email ?? "Someone";
const hostName = (h: Host) => h.display_name ?? h.full_name ?? "host";

export async function sendHostNotifications(now = new Date()) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select(
      "id, email, display_name, full_name, host_digest, host_session_day, host_alert_late_cancel, host_alert_unmatched, host_digest_sent_at",
    )
    .eq("role", "admin")
    .eq("guest", false);
  if (error) throw error;
  const hosts = (data ?? []) as Host[];
  if (hosts.length === 0) return;

  for (const step of [sendAlerts, sendDigests, sendSessionDays]) {
    try {
      await step(admin, hosts, now);
    } catch (err) {
      console.error(`Host notifications: ${step.name} failed`, err);
    }
  }
}

/** Send one host email, claimed in email_log so a retry or overlapping run never repeats it. */
async function sendTo(admin: Admin, host: Host, dedupeKey: string, built: { subject: string; element: React.ReactNode }) {
  const { error: claimError } = await admin.from("email_log").insert({ dedupe_key: dedupeKey, kind: "host" });
  if (claimError) {
    if (claimError.code !== "23505") console.error(`Couldn't claim host email ${dedupeKey}`, claimError);
    return;
  }
  try {
    await sendEmail({
      to: host.email,
      subject: built.subject,
      html: await render(built.element),
      text: await render(built.element, { plainText: true }),
    });
  } catch (err) {
    await admin.from("email_log").delete().eq("dedupe_key", dedupeKey);
    console.error(`Failed to send host email ${dedupeKey}`, err);
  }
  await pause(400);
}

async function countsFor(admin: Admin, sessionIds: string[]) {
  if (sessionIds.length === 0) return new Map<string, SessionCounts>();
  const { data } = await admin.rpc("get_session_counts", { p_session_ids: sessionIds });
  return new Map(((data ?? []) as SessionCounts[]).map((c) => [c.session_id, c]));
}

/** "16/18 drop-in · 2 instructional · 3 waiting" */
function statusLine(s: Pick<Session, "capacity" | "instructional_capacity">, c?: SessionCounts) {
  const taken = (c?.confirmed ?? 0) + (c?.holding ?? 0);
  const parts = [`${taken}/${s.capacity} drop-in`];
  if (c?.instructional) parts.push(`${c.instructional}${s.instructional_capacity ? `/${s.instructional_capacity}` : ""} instructional`);
  const waiting = (c?.waitlisted ?? 0) + (c?.instructional_waitlisted ?? 0);
  if (waiting) parts.push(`${waiting} waiting`);
  return parts.join(" · ");
}

const urls = () => {
  const app = env.appUrl();
  return {
    session: (id: string) => `${app}/admin/sessions/${id}`,
    payments: `${app}/admin/payments`,
    settings: `${app}/me#host-notifications`,
  };
};

// ---------------------------------------------------------------------------
// Instant alerts
// ---------------------------------------------------------------------------
async function sendAlerts(admin: Admin, hosts: Host[], now: Date) {
  // Unmatched payments wait a couple of minutes: the ingest matches right after inserting.
  const settled = new Date(now.getTime() - 2 * 60_000).toISOString();
  const { data, error } = await admin
    .from("host_activity")
    .select(ACTIVITY_SELECT)
    .is("alerted_at", null)
    .or("late.eq.true,kind.in.(unmatched_payment,payment_reversed)")
    .lte("created_at", settled)
    .order("created_at")
    .limit(20);
  if (error) throw error;
  const u = urls();

  for (const a of (data ?? []) as unknown as Activity[]) {
    const { data: claimed } = await admin
      .from("host_activity")
      .update({ alerted_at: now.toISOString() })
      .eq("id", a.id)
      .is("alerted_at", null)
      .select("id");
    if (!claimed?.length) continue;

    if (a.kind === "unmatched_payment") {
      const p = a.payment;
      if (!p || p.registration_id || p.dismissed) continue; // sorted out in the meantime
      for (const h of hosts.filter((x) => x.host_alert_unmatched)) {
        await sendTo(
          admin,
          h,
          `host_alert:${a.id}:${h.id}`,
          buildHostAlertEmail({
            title: "Unmatched e-Transfer",
            subject: `Unmatched e-Transfer: ${formatMoney(p.amount_cents)} from ${p.sender_name ?? "unknown sender"}`,
            hostName: hostName(h),
            lines: [
              `${formatMoney(p.amount_cents)} from ${p.sender_name ?? "an unknown sender"}${p.memo ? ` ("${p.memo}")` : ""} didn't match any sign-up.`,
              "Assign it to the right player so their spot is confirmed.",
            ],
            buttonLabel: "Assign it",
            buttonUrl: u.payments,
            settingsUrl: u.settings,
          }),
        );
      }
      continue;
    }

    if (a.kind === "payment_reversed") {
      const c = a.cancellation;
      const amount = c?.amount_cents != null ? formatMoney(c.amount_cents) : a.payment ? formatMoney(a.payment.amount_cents) : "An";
      const from = a.payment?.sender_name ?? c?.sender_name;
      const lines = [`${amount} e-Transfer${from ? ` from ${from}` : ""} was cancelled before it was deposited, so that money never arrived.`];
      if (!a.payment) {
        lines.push(c?.note ?? "The site couldn't tell which payment it was.", "Pick the payment on the Payments page so it stops counting as paid.");
      } else if (a.registration && a.session) {
        const who = `${nameOf(a.registration.profile)} (${a.session.title}, ${formatDateTime(a.session.starts_at)})`;
        lines.push(
          a.registration.status === "pending_payment"
            ? `${who} is back to unpaid. Their spot is held for the rest of their time to pay, and they've been asked to send it again.`
            : a.registration.status === "expired"
              ? `${who} was past their time to pay, so their spot went to the next person. They've been emailed.`
              : Date.parse(a.session.starts_at) <= Date.parse(a.created_at)
                ? `${who}: the session had already started, so nothing was changed. Sort it out with them directly.`
                : `${who}: their sign-up wasn't affected.`,
        );
      } else {
        lines.push("It wasn't linked to a sign-up, so nothing else changed.");
      }
      for (const h of hosts.filter((x) => x.host_alert_unmatched)) {
        await sendTo(
          admin,
          h,
          `host_alert:${a.id}:${h.id}`,
          buildHostAlertEmail({
            title: "e-Transfer cancelled",
            subject: `e-Transfer cancelled: ${amount}${from ? ` from ${from}` : ""}`,
            hostName: hostName(h),
            lines,
            buttonLabel: a.payment ? "See payments" : "Pick the payment",
            buttonUrl: a.session && a.payment ? u.session(a.session.id) : u.payments,
            settingsUrl: u.settings,
          }),
        );
      }
      continue;
    }

    // Late cancellation.
    if (!a.session) continue;
    const counts = (await countsFor(admin, [a.session.id])).get(a.session.id);
    const hoursBefore = Math.max(1, Math.round((Date.parse(a.session.starts_at) - Date.parse(a.created_at)) / 3_600_000));
    for (const h of hosts.filter((x) => x.host_alert_late_cancel)) {
      await sendTo(
        admin,
        h,
        `host_alert:${a.id}:${h.id}`,
        buildHostAlertEmail({
          title: "Late cancellation",
          subject: `Late cancel: ${nameOf(a.registration?.profile)} · ${a.session.title} (${formatDateTime(a.session.starts_at)})`,
          hostName: hostName(h),
          lines: [
            `${nameOf(a.registration?.profile)} cancelled ${a.session.title} (${formatDateTime(a.session.starts_at)}), about ${hoursBefore} hour${hoursBefore === 1 ? "" : "s"} before it starts.`,
            `Now: ${statusLine(a.session, counts)}. Anyone waiting has been moved up and emailed automatically.`,
          ],
          buttonLabel: "Open the session",
          buttonUrl: u.session(a.session.id),
          settingsUrl: u.settings,
        }),
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Digest
// ---------------------------------------------------------------------------
const DIGEST_LABEL: Record<Exclude<Activity["kind"], "unmatched_payment">, string> = {
  payment_reversed: "e-Transfer cancelled",
  joined: "Joined",
  promoted: "Off the waitlist",
  paid: "Paid",
  waitlisted: "Waitlisted",
  cancelled: "Cancelled",
  expired: "Hold expired",
};

async function sendDigests(admin: Admin, hosts: Host[], now: Date) {
  const timeZone = env.timezone();
  const u = urls();
  for (const h of hosts) {
    const setting = h.host_digest as HostDigest;
    const lastSent = h.host_digest_sent_at ? new Date(h.host_digest_sent_at) : null;
    if (!digestDue(setting, lastSent, now, timeZone)) continue;

    const since = digestSince(setting, lastSent, now);
    const { data, error } = await admin
      .from("host_activity")
      .select(ACTIVITY_SELECT)
      .gt("created_at", since.toISOString())
      .lte("created_at", now.toISOString())
      .order("created_at")
      .limit(500);
    if (error) throw error;
    const activity = (data ?? []) as unknown as Activity[];
    if (activity.length === 0) continue; // nothing new: check again next minute

    // Claim this digest (only if nobody else sent one meanwhile).
    const claim = admin.from("profiles").update({ host_digest_sent_at: now.toISOString() }).eq("id", h.id);
    const { data: claimed } = await (lastSent
      ? claim.eq("host_digest_sent_at", h.host_digest_sent_at!)
      : claim.is("host_digest_sent_at", null)
    ).select("id");
    if (!claimed?.length) continue;

    const sessions = new Map<string, { session: NonNullable<Activity["session"]>; byKind: Map<string, string[]> }>();
    let unmatched = 0;
    for (const a of activity) {
      if (a.kind === "unmatched_payment") {
        if (a.payment && !a.payment.registration_id && !a.payment.dismissed) unmatched += 1;
        continue;
      }
      if (!a.session) continue;
      const entry = sessions.get(a.session.id) ?? { session: a.session, byKind: new Map<string, string[]>() };
      const label = a.kind === "cancelled" && a.late ? "Cancelled late" : DIGEST_LABEL[a.kind];
      const name = `${nameOf(a.registration?.profile)}${a.registration && a.registration.option !== "full" ? ` (${OPTION_LABELS[a.registration.option]})` : ""}`;
      entry.byKind.set(label, [...(entry.byKind.get(label) ?? []), name]);
      sessions.set(a.session.id, entry);
    }
    if (sessions.size === 0 && unmatched === 0) continue;

    const ids = [...sessions.keys()];
    const counts = await countsFor(admin, ids);
    const { data: unpaidRows } = ids.length
      ? await admin
          .from("registrations")
          .select("session_id, amount_cents, paid_cents")
          .in("session_id", ids)
          .eq("status", "pending_payment")
      : { data: [] };
    const unpaid = new Map<string, { n: number; cents: number }>();
    for (const r of unpaidRows ?? []) {
      const owed = Math.max(r.amount_cents - r.paid_cents, 0);
      if (!owed) continue;
      const u2 = unpaid.get(r.session_id) ?? { n: 0, cents: 0 };
      unpaid.set(r.session_id, { n: u2.n + 1, cents: u2.cents + owed });
    }

    const order = ["Joined", "Off the waitlist", "Paid", "Waitlisted", "Cancelled late", "Cancelled", "Hold expired", "e-Transfer cancelled"];
    const digestSessions: DigestSession[] = [...sessions.values()]
      .sort((a, b) => a.session.starts_at.localeCompare(b.session.starts_at))
      .map(({ session, byKind }) => {
        const owed = unpaid.get(session.id);
        return {
          title: session.title,
          when: formatDateTime(session.starts_at),
          url: u.session(session.id),
          status: statusLine(session, counts.get(session.id)),
          lines: order.filter((k) => byKind.has(k)).map((k) => ({ label: k, names: byKind.get(k)! })),
          unpaid: owed ? `${owed.n} · ${formatMoney(owed.cents)}` : null,
        };
      });

    await sendTo(
      admin,
      h,
      `host_digest:${h.id}:${now.toISOString()}`,
      buildHostDigestEmail({
        hostName: hostName(h),
        since: lastSent ? `since ${formatTime(lastSent.toISOString())}` : setting === "daily" ? "in the last day" : "in the last 3 hours",
        sessions: digestSessions,
        unmatched,
        paymentsUrl: u.payments,
        settingsUrl: u.settings,
      }),
    );
  }
}

// ---------------------------------------------------------------------------
// Session day
// ---------------------------------------------------------------------------
type RosterRow = Pick<Registration, "status" | "option" | "amount_cents" | "paid_cents" | "note" | "queued_at" | "friend_discount"> & {
  profile: PlayerName & Pick<Profile, "attended_before" | "guest"> | null;
};

async function sendSessionDays(admin: Admin, hosts: Host[], now: Date) {
  const recipients = hosts.filter((h) => h.host_session_day);
  const timeZone = env.timezone();
  const { data, error } = await admin
    .from("sessions")
    .select("*")
    .eq("status", "scheduled")
    .is("host_day_sent_at", null)
    .gt("starts_at", now.toISOString())
    .lte("starts_at", new Date(now.getTime() + 24 * 3_600_000).toISOString());
  if (error) throw error;
  const u = urls();

  for (const s of (data ?? []) as Session[]) {
    if (!sessionDayDue(new Date(s.starts_at), now, timeZone)) continue;
    const { data: claimed } = await admin
      .from("sessions")
      .update({ host_day_sent_at: now.toISOString() })
      .eq("id", s.id)
      .is("host_day_sent_at", null)
      .select("id");
    if (!claimed?.length || recipients.length === 0) continue;

    const { data: regs } = await admin
      .from("registrations")
      .select("status, option, amount_cents, paid_cents, note, queued_at, friend_discount, profile:profiles(display_name, full_name, email, attended_before, guest)")
      .eq("session_id", s.id)
      .in("status", ["pending_payment", "confirmed", "waitlisted"])
      .order("created_at");
    const rows = (regs ?? []) as unknown as RosterRow[];
    const detail = (r: RosterRow) => {
      const bits: string[] = [];
      const owed = Math.max(r.amount_cents - r.paid_cents, 0);
      if (r.status === "pending_payment" && owed) bits.push(`owes ${formatMoney(owed)}`);
      if (r.option === "dropin") bits.push("drop-in only");
      if (r.profile?.attended_before === false) bits.push("first time");
      if (r.profile?.guest) bits.push("guest");
      if (r.friend_discount) bits.push("Bring a Friend");
      if (r.note) bits.push(`note: "${r.note}"`);
      return bits.length ? bits.join(" · ") : null;
    };
    const toPlayer = (r: RosterRow): SessionDayPlayer => ({ name: nameOf(r.profile), detail: detail(r) });
    const active = rows.filter((r) => r.status !== "waitlisted");
    const roster = active.filter((r) => r.option !== "instructional").map(toPlayer);
    const instructional = active.filter((r) => r.option === "instructional").map(toPlayer);
    const waitlist = rows
      .filter((r) => r.status === "waitlisted")
      .sort((a, b) => (a.queued_at ?? "").localeCompare(b.queued_at ?? ""))
      .map((r) => nameOf(r.profile));
    const unpaid = active.filter((r) => r.status === "pending_payment" && r.amount_cents > r.paid_cents);
    const owedCents = unpaid.reduce((sum, r) => sum + (r.amount_cents - r.paid_cents), 0);
    const counts = (await countsFor(admin, [s.id])).get(s.id);

    for (const h of recipients) {
      await sendTo(
        admin,
        h,
        `host_day:${s.id}:${h.id}`,
        buildSessionDayEmail({
          hostName: hostName(h),
          sessionTitle: s.title,
          when: formatDateTime(s.starts_at),
          location: s.location,
          status: statusLine(s, counts),
          roster,
          instructional,
          waitlist,
          owed: unpaid.length ? `${unpaid.length} · ${formatMoney(owedCents)}` : null,
          notes: s.notes,
          adminUrl: u.session(s.id),
          settingsUrl: u.settings,
        }),
      );
    }
  }
}
