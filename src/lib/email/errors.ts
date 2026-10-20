// What a Gmail SMTP failure means for the rest of the queue. Pure, so it's tested.

/**
 * quota: Gmail's daily sending limit (pause for a few hours).
 * auth: the app password was rejected (nothing goes out until it's fixed).
 * recipient: this one address is bad (drop that email, keep sending the rest).
 * transient: a hiccup (try again in a few minutes).
 */
export type EmailFailure = "quota" | "auth" | "recipient" | "transient";

type SmtpError = { code?: string; responseCode?: number; response?: string; message?: string };

export function classifyEmailError(err: unknown): EmailFailure {
  const e = (err ?? {}) as SmtpError;
  const text = `${e.response ?? ""} ${e.message ?? ""}`;
  if (/5\.4\.5|sending limit|limit exceeded|quota|too many (messages|recipients)/i.test(text)) return "quota";
  if (e.code === "EAUTH" || e.responseCode === 535 || /username and password not accepted|invalid login|5\.7\.8/i.test(text)) {
    return "auth";
  }
  if (e.code === "EENVELOPE" || /5\.1\.[0-9]/.test(text) || /recipient address rejected|no such user|does not exist/i.test(text)) {
    return "recipient";
  }
  return "transient";
}

/** How long to stop sending after each kind of failure, in minutes. */
export const PAUSE_MINUTES: Record<Exclude<EmailFailure, "recipient">, number> = {
  quota: 180, // Gmail's limit is a rolling 24 hours; try one email every few hours
  auth: 30, // keep checking, in case the password was just fixed
  transient: 5,
};

/** Queued emails older than this are dropped instead of sent late. */
export const QUEUE_MAX_AGE_HOURS = 72;
