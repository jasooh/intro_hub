import { env } from "@/lib/env";
import { formatDateTime, formatTime } from "@/lib/format";
import { getEmailHealth, type EmailHealth } from "@/lib/email/health";

/**
 * Host panel warning when emails aren't going out (Gmail's daily limit, a
 * rejected app password, a hiccup), with how many are waiting and when they'll
 * be retried; and an early warning as the day's sending gets close to the limit.
 */
export async function EmailHealthBanner() {
  return <EmailHealthNotice health={await getEmailHealth()} limit={env.emailDailyLimit()} />;
}

/** The notice itself, from the numbers (separate so it can be previewed with sample data). */
export function EmailHealthNotice({ health, limit }: { health: EmailHealth; limit: number }) {
  const { paused, waiting, sentToday, failedToday: failed } = health;
  const waitingLine =
    waiting > 0 ? `${waiting} email${waiting === 1 ? " is" : "s are"} waiting and will go out automatically.` : null;

  let tone: "bad" | "warn" = "warn";
  let title: string | null = null;
  let body: string | null = null;
  if (paused?.reason === "quota") {
    tone = "bad";
    title = "Emails are paused: Gmail's daily limit";
    body = `Gmail stopped accepting emails after ${sentToday} in the last 24 hours. ${waitingLine ?? ""} Next try around ${formatTime(paused.until)}; it can take up to a day to reset. Sign-ups still work, and players see payment details on the session page.`;
  } else if (paused?.reason === "auth") {
    tone = "bad";
    title = "Emails aren't going out: Gmail rejected the password";
    body = `${waitingLine ?? ""} Make a new app password for the Gmail account and put it in GMAIL_APP_PASSWORD (Vercel → Settings → Environment Variables), then redeploy. Checking again every 30 minutes.`;
  } else if (paused?.reason === "transient") {
    title = "Gmail is having trouble";
    body = `${waitingLine ?? ""} Trying again at ${formatTime(paused.until)}.`;
  } else if (waiting > 0) {
    title = "Catching up on emails";
    body = waitingLine;
  } else if (sentToday >= limit * 0.8) {
    title = "Close to Gmail's daily limit";
    body = `${sentToday} of about ${limit} emails sent in the last 24 hours. Past the limit, emails wait and go out once Gmail allows more. Hold off on emailing a post to everyone if you can.`;
  }
  const failedLine =
    failed > 0
      ? `${failed} email${failed === 1 ? "" : "s"} bounced in the last 24 hours (bad address); those players won't get them.`
      : null;
  if (!title && !failedLine) return null;

  return (
    <div
      role="status"
      className={`space-y-1 border-l-4 py-2 pl-3 text-sm ${tone === "bad" ? "border-bad" : "border-warn"} bg-maple-deep/40`}
    >
      {title && (
        <p className={`font-display text-base font-bold tracking-wide uppercase ${tone === "bad" ? "text-bad" : "text-warn"}`}>
          {title}
        </p>
      )}
      {body && <p>{body}</p>}
      {failedLine && <p className="text-ink-soft">{failedLine}</p>}
      {paused?.detail && (
        <p className="text-xs text-ink-soft [overflow-wrap:anywhere]">
          Gmail said: {paused.detail} (paused until {formatDateTime(paused.until)})
        </p>
      )}
    </div>
  );
}
