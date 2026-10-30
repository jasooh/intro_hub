import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

// Unsubscribe links in optional emails. Each link is signed for one player and
// one kind of email, so it works without signing in but can't be guessed or
// pointed at someone else. The key is derived from CRON_SECRET (no extra setting).

export const UNSUBSCRIBE_KINDS = ["updates", "session_open", "reminders", "messages", "host"] as const;
export type UnsubscribeKind = (typeof UNSUBSCRIBE_KINDS)[number];

/** The profile switch each kind turns off. */
export const UNSUBSCRIBE_COLUMNS = {
  updates: "email_updates",
  session_open: "email_session_open",
  reminders: "email_reminders",
  messages: "email_messages",
  host: "host_emails",
} as const satisfies Record<UnsubscribeKind, string>;

/** "You won't get … any more." */
export const UNSUBSCRIBE_LABELS: Record<UnsubscribeKind, string> = {
  updates: "updates from the hosts",
  session_open: "“sign-ups are open” emails",
  reminders: "day-before reminders",
  messages: "email about new messages from the hosts",
  host: "host emails (summaries and alerts)",
};

export const isUnsubscribeKind = (k: unknown): k is UnsubscribeKind =>
  typeof k === "string" && (UNSUBSCRIBE_KINDS as readonly string[]).includes(k);

function sign(profileId: string, kind: UnsubscribeKind) {
  const key = createHmac("sha256", env.cronSecret()).update("unsubscribe-links-v1").digest();
  return createHmac("sha256", key).update(`${profileId}:${kind}`).digest("base64url").slice(0, 32);
}

export function verifyUnsubscribe(profileId: string, kind: string, token: string): kind is UnsubscribeKind {
  if (!isUnsubscribeKind(kind) || !/^[0-9a-f-]{36}$/i.test(profileId)) return false;
  const expected = sign(profileId, kind);
  return token.length === expected.length && timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

const query = (profileId: string, kind: UnsubscribeKind) =>
  `u=${profileId}&k=${kind}&t=${sign(profileId, kind)}`;

/** The link in the email footer: a page that asks before turning anything off. */
export const unsubscribeUrl = (profileId: string, kind: UnsubscribeKind) =>
  `${env.appUrl()}/unsubscribe?${query(profileId, kind)}`;

/** One-click unsubscribe headers (RFC 8058), for mail apps' own "Unsubscribe" button. */
export const unsubscribeHeaders = (profileId: string, kind: UnsubscribeKind): Record<string, string> => ({
  "List-Unsubscribe": `<${env.appUrl()}/api/unsubscribe?${query(profileId, kind)}>`,
  "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
});
