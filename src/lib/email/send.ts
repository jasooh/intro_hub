import "server-only";
import nodemailer from "nodemailer";

export type OutgoingEmail = { to: string; subject: string; html: string; text: string };

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

// Gmail SMTP when GMAIL_USER + GMAIL_APP_PASSWORD are set (sends from the
// host's Gmail); otherwise emails are printed to the server log (local dev).
export async function sendEmail(email: OutgoingEmail): Promise<void> {
  const replyTo = process.env.EMAIL_REPLY_TO || undefined;

  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    await gmailTransport().sendMail({
      from: process.env.EMAIL_FROM ?? `Intro Hub <${process.env.GMAIL_USER}>`,
      to: email.to,
      subject: email.subject,
      html: email.html,
      text: email.text,
      replyTo,
    });
    return;
  }

  console.info(`[email:dev] to=${email.to} subject="${email.subject}"\n${email.text}`);
}
