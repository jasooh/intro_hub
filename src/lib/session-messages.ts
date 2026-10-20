import "server-only";
import { render } from "@react-email/components";
import { buildSessionMessageEmail } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/send";
import { env } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { sanitizePostHtml } from "@/lib/rich-text";
import { createAdminClient } from "@/lib/supabase/server";
import { audienceOf, type Audience } from "@/lib/audiences";
import type { Profile, Registration, Session } from "@/lib/types";

// Host emails to one session's players ("We're in Gym 2 tonight"). These are
// about a session the player signed up for, so the announcement opt-out
// doesn't apply.

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Recipient = Pick<Registration, "id" | "status" | "option"> & {
  profile: Pick<Profile, "id" | "email" | "display_name" | "full_name" | "guest">;
};

/** Sends a saved session message to everyone in its audiences, one at a time (Gmail throttles bursts). */
export async function sendSessionMessage(messageId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: message, error } = await admin
    .from("session_messages")
    .select("*, session:sessions(*)")
    .eq("id", messageId)
    .maybeSingle<{ id: string; subject: string; body_html: string; audiences: Audience[]; session: Session }>();
  if (error) throw error;
  if (!message) return;

  const { data: regs, error: regError } = await admin
    .from("registrations")
    .select("id, status, option, profile:profiles(id, email, display_name, full_name, guest)")
    .eq("session_id", message.session.id);
  if (regError) throw regError;

  const appUrl = env.appUrl();
  const bodyHtml = sanitizePostHtml(message.body_html);
  const recipients = ((regs ?? []) as unknown as Recipient[]).filter((r) => {
    if (r.profile.guest || r.profile.email.endsWith(".invalid")) return false; // added by a host, no inbox
    const audience = audienceOf(r);
    return audience != null && message.audiences.includes(audience);
  });

  for (const r of recipients) {
    const dedupeKey = `session_message:${message.id}:${r.profile.id}`;
    const { error: claimError } = await admin
      .from("email_log")
      .insert({ dedupe_key: dedupeKey, registration_id: r.id, kind: "session_message" });
    if (claimError) {
      if (claimError.code !== "23505") console.error(`Couldn't claim session message for ${r.profile.id}`, claimError);
      continue; // already sent (or claim failed)
    }
    const { subject, element } = buildSessionMessageEmail({
      subject: message.subject,
      bodyHtml,
      playerName: r.profile.display_name ?? r.profile.full_name ?? "there",
      sessionTitle: message.session.title,
      when: formatDateTime(message.session.starts_at),
      sessionUrl: `${appUrl}/s/${message.session.id}`,
    });
    try {
      await sendEmail({
        to: r.profile.email,
        subject,
        html: await render(element),
        text: await render(element, { plainText: true }),
      });
    } catch (err) {
      await admin.from("email_log").delete().eq("dedupe_key", dedupeKey);
      console.error(`Failed to send session message to ${r.profile.id}`, err);
    }
    await pause(400);
  }
}
