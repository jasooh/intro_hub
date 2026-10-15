import "server-only";
import nodemailer from "nodemailer";
import { Resend } from "resend";

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

// Picks a transport from whatever is configured:
//   RESEND_API_KEY + EMAIL_FROM          -> Resend (needs a verified domain to email others)
//   GMAIL_USER + GMAIL_APP_PASSWORD      -> Gmail SMTP (free, sends from the host's Gmail)
//   neither                              -> logged to the console (local dev)
export async function sendEmail(email: OutgoingEmail): Promise<void> {
  const replyTo = process.env.EMAIL_REPLY_TO || undefined;

  if (process.env.RESEND_API_KEY) {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: process.env.EMAIL_FROM ?? "Intro Hub <onboarding@resend.dev>",
      to: email.to,
      subject: email.subject,
      html: email.html,
      text: email.text,
      replyTo,
    });
    if (error) throw new Error(`Resend: ${error.message}`);
    return;
  }

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
