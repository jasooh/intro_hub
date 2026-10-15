import "server-only";
import { render } from "@react-email/components";
import { buildEmail } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/send";
import { env } from "@/lib/env";
import { formatDateTime, formatMoney } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/server";
import type { Profile, Registration, RegistrationEvent, Session } from "@/lib/types";

// Registration status changes happen in Postgres (supabase/migrations), which
// returns a list of events. This module turns those events into emails.

type Loaded = Registration & { session: Session; profile: Profile };

export function parseEvents(data: unknown): RegistrationEvent[] {
  return Array.isArray(data) ? (data as RegistrationEvent[]) : [];
}

export async function dispatchEvents(events: RegistrationEvent[]): Promise<void> {
  if (events.length === 0) return;
  const admin = createAdminClient();

  const ids = [...new Set(events.map((e) => e.registration_id))];
  const { data, error } = await admin
    .from("registrations")
    .select("*, session:sessions(*), profile:profiles(*)")
    .in("id", ids);
  if (error) throw error;
  const byId = new Map((data as Loaded[]).map((r) => [r.id, r]));

  for (const event of events) {
    const reg = byId.get(event.registration_id);
    if (!reg) continue;
    try {
      await sendForEvent(event, reg);
    } catch (err) {
      console.error(`Failed to send ${event.event} email for ${reg.id}`, err);
    }
  }
}

async function sendForEvent(event: RegistrationEvent, reg: Loaded) {
  const admin = createAdminClient();

  // Claim the email first so retries / overlapping cron ticks never double-send.
  // Each partial payment gets its own email; everything else once per sign-up.
  const dedupeKey =
    event.event === "partial_payment" && event.payment_id ? `partial_payment:${event.payment_id}` : `${event.event}:${reg.id}`;
  const { error: claimError } = await admin
    .from("email_log")
    .insert({ dedupe_key: dedupeKey, registration_id: reg.id, kind: event.event });
  if (claimError) {
    if (claimError.code === "23505") return; // already sent
    throw claimError;
  }

  let waitlistPosition: number | null = null;
  if (event.event === "waitlisted" && reg.queued_at) {
    const { count } = await admin
      .from("registrations")
      .select("id", { count: "exact", head: true })
      .eq("session_id", reg.session_id)
      .eq("status", "waitlisted")
      .lte("queued_at", reg.queued_at);
    waitlistPosition = count ?? null;
  }

  const appUrl = env.appUrl();
  const { subject, element } = buildEmail(event.event, {
    playerName: reg.profile.display_name ?? reg.profile.full_name ?? "there",
    sessionTitle: reg.option === "instructional" ? `${reg.session.title} (Instructional only)` : reg.session.title,
    when: formatDateTime(reg.session.starts_at),
    location: reg.session.location,
    price: formatMoney(reg.amount_cents),
    paid: formatMoney(reg.paid_cents),
    remaining: formatMoney(Math.max(reg.amount_cents - reg.paid_cents, 0)),
    deposit: reg.session.deposit_cents != null,
    refCode: reg.ref_code,
    holdUntil: reg.hold_expires_at ? formatDateTime(reg.hold_expires_at) : null,
    waitlistPosition,
    etransferEmail: env.etransferEmail(),
    sessionUrl: `${appUrl}/s/${reg.session_id}`,
    myUrl: `${appUrl}/me/signups`,
    cancelReason: reg.session.cancel_reason,
  });

  try {
    await sendEmail({
      to: reg.profile.email,
      subject,
      html: await render(element),
      text: await render(element, { plainText: true }),
    });
  } catch (err) {
    await admin.from("email_log").delete().eq("dedupe_key", dedupeKey);
    throw err;
  }
}
