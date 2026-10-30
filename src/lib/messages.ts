import "server-only";
import { render } from "@react-email/components";
import { pause } from "@/lib/announcements";
import { buildMessageEmail } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/send";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/server";
import { unsubscribeHeaders, unsubscribeUrl } from "@/lib/unsubscribe";
import type { Profile } from "@/lib/types";

// Emails for new inbox messages. A host's message goes to the player (if they
// allow message emails); a player's message goes to every host who wants the
// alert. Each send is claimed in email_log first, so a retry never repeats it.

type Person = Pick<
  Profile,
  "id" | "email" | "display_name" | "full_name" | "guest" | "announcement_emails" | "email_messages" | "host_emails" | "host_alert_messages"
>;

const PERSON_COLUMNS =
  "id, email, display_name, full_name, guest, announcement_emails, email_messages, host_emails, host_alert_messages";

const nameOf = (p: Pick<Person, "display_name" | "full_name"> | null | undefined, fallback: string) =>
  p?.display_name ?? p?.full_name ?? fallback;

const canEmail = (p: Person) => !p.guest && !p.email.endsWith(".invalid");

/** Emails the other side about one new message. Never throws: a failed email shouldn't fail the message. */
export async function notifyNewMessage(messageId: string): Promise<void> {
  try {
    await notify(messageId);
  } catch (err) {
    console.error(`Couldn't send message email for ${messageId}`, err);
  }
}

/** Same, for a batch (a host writing to a whole session), one at a time. */
export async function notifyNewMessages(messageIds: string[]): Promise<void> {
  for (const id of messageIds) {
    await notifyNewMessage(id);
    await pause(400); // Gmail throttles bursts
  }
}

async function notify(messageId: string) {
  const admin = createAdminClient();
  const { data: message, error } = await admin
    .from("messages")
    .select(
      `id, body, from_host, author:profiles!messages_author_id_fkey(${PERSON_COLUMNS}),
       thread:message_threads!inner(id, subject, player:profiles!message_threads_profile_id_fkey(${PERSON_COLUMNS}))`,
    )
    .eq("id", messageId)
    .maybeSingle<{
      id: string;
      body: string;
      from_host: boolean;
      author: Person | null;
      thread: { id: string; subject: string; player: Person };
    }>();
  if (error) throw error;
  if (!message) return;

  const app = env.appUrl();
  const { thread } = message;

  const recipients: { person: Person; toHost: boolean }[] = [];
  if (message.from_host) {
    const p = thread.player;
    if (canEmail(p) && p.announcement_emails && p.email_messages) recipients.push({ person: p, toHost: false });
  } else {
    const { data: hosts, error: hostError } = await admin
      .from("profiles")
      .select(PERSON_COLUMNS)
      .eq("role", "admin")
      .eq("guest", false)
      .eq("host_emails", true)
      .eq("host_alert_messages", true);
    if (hostError) throw hostError;
    for (const h of (hosts ?? []) as Person[]) {
      if (canEmail(h)) recipients.push({ person: h, toHost: true });
    }
  }

  const sender = message.from_host
    ? `${nameOf(message.author, "A host")} (host)`
    : nameOf(message.author ?? thread.player, "A player");

  for (const { person, toHost } of recipients) {
    const dedupeKey = `msg:${message.id}:${person.id}`;
    const { error: claimError } = await admin.from("email_log").insert({ dedupe_key: dedupeKey, kind: "message" });
    if (claimError) {
      if (claimError.code !== "23505") console.error(`Couldn't claim message email ${dedupeKey}`, claimError);
      continue; // already sent (or claim failed)
    }
    const kind = toHost ? "host" : "messages";
    const { subject, element } = buildMessageEmail({
      subject: thread.subject,
      body: message.body,
      recipientName: nameOf(person, "there"),
      senderName: sender,
      threadUrl: toHost ? `${app}/admin/messages/${thread.id}` : `${app}/me/messages/${thread.id}`,
      settingsUrl: toHost ? `${app}/me#host-notifications` : `${app}/me`,
      unsubscribeUrl: unsubscribeUrl(person.id, kind),
      toHost,
    });
    try {
      await sendEmail({
        to: person.email,
        subject,
        html: await render(element),
        text: await render(element, { plainText: true }),
        headers: unsubscribeHeaders(person.id, kind),
      });
    } catch (err) {
      await admin.from("email_log").delete().eq("dedupe_key", dedupeKey);
      console.error(`Failed to send message email to ${person.id}`, err);
    }
  }
}
