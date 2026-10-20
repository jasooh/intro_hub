import "server-only";
import nodemailer from "nodemailer";
import { classifyEmailError, PAUSE_MINUTES, QUEUE_MAX_AGE_HOURS, type EmailFailure } from "@/lib/email/errors";
import { createAdminClient } from "@/lib/supabase/server";

export type OutgoingEmail = { to: string; subject: string; html: string; text: string };
/** sent: delivered to Gmail. queued: Gmail can't take it right now; the every-minute job retries it. */
export type SendResult = "sent" | "queued" | "failed" | "logged";

// Reused across sends: logging in to Gmail for every email is slow and gets throttled.
let gmail: ReturnType<typeof nodemailer.createTransport> | null = null;
function gmailTransport() {
  gmail ??= nodemailer.createTransport({
    service: "gmail",
    pool: true,
    maxConnections: 2,
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  });
  return gmail;
}

const gmailConfigured = () => Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);

function deliver(email: OutgoingEmail) {
  return gmailTransport().sendMail({
    from: process.env.EMAIL_FROM ?? `Intro Hub <${process.env.GMAIL_USER}>`,
    to: email.to,
    subject: email.subject,
    html: email.html,
    text: email.text,
    replyTo: process.env.EMAIL_REPLY_TO || undefined,
  });
}

type Admin = ReturnType<typeof createAdminClient>;

/** When sending is paused (Gmail's limit, a rejected password, a hiccup), until when. */
async function pausedUntil(admin: Admin): Promise<Date | null> {
  const { data } = await admin.from("email_health").select("paused_until").maybeSingle();
  const until = data?.paused_until ? new Date(data.paused_until) : null;
  return until && until > new Date() ? until : null;
}

async function pause(admin: Admin, kind: Exclude<EmailFailure, "recipient">, err: unknown): Promise<Date> {
  const until = new Date(Date.now() + PAUSE_MINUTES[kind] * 60_000);
  await admin
    .from("email_health")
    .update({ paused_until: until.toISOString(), reason: kind, detail: errorText(err), updated_at: new Date().toISOString() })
    .eq("id", true);
  console.error(`Email paused (${kind}) until ${until.toISOString()}`, err);
  return until;
}

/** Gmail took an email again: sending is healthy. */
async function clearPause(admin: Admin) {
  await admin
    .from("email_health")
    .update({ paused_until: null, reason: null, detail: null, updated_at: new Date().toISOString() })
    .eq("id", true)
    .not("reason", "is", null);
}

const errorText = (err: unknown) => {
  const e = err as { response?: string; message?: string } | null;
  return (e?.response ?? e?.message ?? String(err)).slice(0, 500);
};

/**
 * Send one email through the host's Gmail. Never throws because Gmail said no:
 * a bad address is marked failed, and anything else (daily limit, rejected
 * password, a hiccup) is queued, sending is paused, and the host panel says so.
 * Without Gmail settings (local dev), emails are printed to the server log.
 */
export async function sendEmail(email: OutgoingEmail): Promise<SendResult> {
  if (!gmailConfigured()) {
    console.info(`[email:dev] to=${email.to} subject="${email.subject}"\n${email.text}`);
    return "logged";
  }
  const admin = createAdminClient();

  const paused = await pausedUntil(admin);
  if (paused) {
    await admin.from("email_sends").insert({
      to_email: email.to,
      subject: email.subject,
      html: email.html,
      body_text: email.text,
      status: "queued",
      next_try_at: paused.toISOString(),
    });
    return "queued";
  }

  try {
    await deliver(email);
  } catch (err) {
    const kind = classifyEmailError(err);
    if (kind === "recipient") {
      await admin
        .from("email_sends")
        .insert({ to_email: email.to, subject: email.subject, status: "failed", attempts: 1, last_error: errorText(err) });
      return "failed";
    }
    const until = await pause(admin, kind, err);
    await admin.from("email_sends").insert({
      to_email: email.to,
      subject: email.subject,
      html: email.html,
      body_text: email.text,
      status: "queued",
      attempts: 1,
      last_error: errorText(err),
      next_try_at: until.toISOString(),
    });
    return "queued";
  }

  await admin
    .from("email_sends")
    .insert({ to_email: email.to, subject: email.subject, status: "sent", attempts: 1, sent_at: new Date().toISOString() });
  await clearPause(admin);
  return "sent";
}

/**
 * Called by the every-minute job: send queued emails once Gmail works again,
 * oldest first, a batch at a time; drop ones that waited too long.
 */
export async function retryQueuedEmails(limit = 20): Promise<void> {
  if (!gmailConfigured()) return;
  const admin = createAdminClient();
  const now = new Date();

  await admin
    .from("email_sends")
    .update({ status: "expired", html: null, body_text: null })
    .eq("status", "queued")
    .lt("created_at", new Date(now.getTime() - QUEUE_MAX_AGE_HOURS * 3_600_000).toISOString());

  if (await pausedUntil(admin)) return;

  const { data: due } = await admin
    .from("email_sends")
    .select("id, to_email, subject, html, body_text, attempts")
    .eq("status", "queued")
    .lte("next_try_at", now.toISOString())
    .order("created_at")
    .limit(limit);

  for (const row of due ?? []) {
    // Claim it so an overlapping run can't send it twice.
    const { data: claimed } = await admin
      .from("email_sends")
      .update({ status: "sending" })
      .eq("id", row.id)
      .eq("status", "queued")
      .select("id");
    if (!claimed?.length) continue;

    try {
      await deliver({ to: row.to_email, subject: row.subject, html: row.html ?? "", text: row.body_text ?? "" });
    } catch (err) {
      const kind = classifyEmailError(err);
      if (kind === "recipient") {
        await admin
          .from("email_sends")
          .update({ status: "failed", attempts: row.attempts + 1, last_error: errorText(err), html: null, body_text: null })
          .eq("id", row.id);
        continue;
      }
      const until = await pause(admin, kind, err);
      await admin
        .from("email_sends")
        .update({ status: "queued", attempts: row.attempts + 1, last_error: errorText(err), next_try_at: until.toISOString() })
        .eq("id", row.id);
      return; // Gmail is refusing again: stop here, the rest wait for the next try
    }

    await admin
      .from("email_sends")
      .update({ status: "sent", attempts: row.attempts + 1, sent_at: new Date().toISOString(), html: null, body_text: null })
      .eq("id", row.id);
    await clearPause(admin);
  }
}
