import "server-only";
import { render } from "@react-email/components";
import { announcementRecipients, pause } from "@/lib/announcements";
import { buildSessionOpenEmail } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/send";
import { env } from "@/lib/env";
import { formatDateTime, formatMoney, sessionTimes } from "@/lib/format";
import { offeredOptions, optionPrice } from "@/lib/options";
import { OPTION_LABELS } from "@/lib/profile";
import { spotsLeft } from "@/lib/queries";
import { createAdminClient } from "@/lib/supabase/server";
import type { Session, SessionCounts } from "@/lib/types";

/**
 * "Sign-ups are open" for one session, to every player who gets announcements,
 * one at a time (Gmail throttles bursts). Each send is claimed in email_log
 * first, so a retry never double-sends.
 */
export async function sendSessionOpen(sessionId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: session, error } = await admin.from("sessions").select("*").eq("id", sessionId).maybeSingle<Session>();
  if (error) throw error;
  if (!session || session.status !== "scheduled") return;

  const appUrl = env.appUrl();
  // Service client: this runs from the cron route (no signed-in user).
  const { data: countRows } = await admin.rpc("get_session_counts", { p_session_ids: [session.id] });
  const counts = ((countRows ?? []) as SessionCounts[])[0];
  const times = sessionTimes(session);
  const options = offeredOptions(session).map((o) => ({
    label: OPTION_LABELS[o],
    price: formatMoney(optionPrice(session, o)),
    time: o === "instructional" ? times.instructional : o === "dropin" ? times.dropin : times.full,
  }));

  for (const r of await announcementRecipients()) {
    const dedupeKey = `session_open:${session.id}:${r.id}`;
    const { error: claimError } = await admin.from("email_log").insert({ dedupe_key: dedupeKey, kind: "session_open" });
    if (claimError) {
      if (claimError.code !== "23505") console.error(`Couldn't claim sign-ups-open email for ${r.id}`, claimError);
      continue;
    }
    const { subject, element } = buildSessionOpenEmail({
      playerName: r.display_name ?? r.full_name ?? "there",
      sessionTitle: session.title,
      when: formatDateTime(session.starts_at),
      location: session.location,
      options,
      deposit: session.deposit_cents != null ? formatMoney(session.deposit_cents) : null,
      spotsLeft: spotsLeft(session, counts),
      notes: session.notes,
      sessionUrl: `${appUrl}/s/${session.id}`,
      profileUrl: `${appUrl}/me`,
    });
    try {
      await sendEmail({
        to: r.email,
        subject,
        html: await render(element),
        text: await render(element, { plainText: true }),
      });
    } catch (err) {
      await admin.from("email_log").delete().eq("dedupe_key", dedupeKey);
      console.error(`Failed to send sign-ups-open email to ${r.id}`, err);
    }
    await pause(400);
  }
}
