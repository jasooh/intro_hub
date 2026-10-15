import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Suspense } from "react";
import { SubmitButton } from "@/components/submit-button";
import { inputClass, Mark, PageSpinner, PageTitle, reveal, Sheet } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import { BACKUP_COOKIE, databaseName } from "@/lib/dev-tools";
import { clearData, resetDatabase } from "../actions";
import { BackupLink } from "../backup-link";

export const metadata: Metadata = {
  title: "Danger zone",
};

const CLEANUPS = [
  {
    scope: "past_sessions",
    title: "Past sessions",
    what: "Deletes sessions that have ended, with their sign-ups, teams and emails. Payments stay, unlinked.",
  },
  { scope: "unmatched_payments", title: "Unmatched payments", what: "Deletes payments that aren't linked to a sign-up." },
  {
    scope: "email_log",
    title: "Email log",
    what: "Forgets which emails were sent. Anything still due (reminders for upcoming sessions) may send again.",
  },
  { scope: "audit", title: "Old audit entries", what: "Deletes audit log entries older than 30 days." },
] as const;

export default function DangerPage() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <DangerView />
    </Suspense>
  );
}

async function DangerView() {
  await requireOwner();
  const db = databaseName();
  const backedUp = Boolean((await cookies()).get(BACKUP_COOKIE));

  return (
    <div className="space-y-12">
      <PageTitle eyebrow="Dev tools" sub="Clean-ups and the reset button. Each asks you to confirm first, and each is written to the audit log.">
        Danger zone
      </PageTitle>

      <Sheet label="Backup" className="reveal" style={reveal(1)}>
        <div className="flex flex-wrap items-center gap-4">
          <p className="min-w-0 flex-1 text-ink-soft">
            Every table as one JSON file, so anything removed by mistake can be put back by hand. Downloading it unlocks
            Reset for an hour.
          </p>
          <BackupLink />
        </div>
      </Sheet>

      <Sheet label="Clean up" className="reveal" style={reveal(2)}>
        <ul className="divide-y divide-ink/20 border-b border-ink/20">
          {CLEANUPS.map((c) => (
            <li key={c.scope} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-display text-lg font-bold tracking-wide uppercase">{c.title}</p>
                <p className="text-sm text-ink-soft">{c.what}</p>
              </div>
              <form action={clearData}>
                <input type="hidden" name="scope" value={c.scope} />
                <SubmitButton
                  variant="danger"
                  size="sm"
                  confirm={{ title: `Clear ${c.title.toLowerCase()}?`, description: c.what, action: "Clear" }}
                >
                  Clear
                </SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      </Sheet>

      <Sheet label={`Reset the ${db} database`} className="reveal" style={reveal(3)}>
        <form action={resetDatabase} className="space-y-5 border-2 border-bad p-4 sm:p-5">
          <p>
            Deletes <b>every session, sign-up, payment, team, post and email record</b>. Keeps player accounts, the weekly
            schedule, settings and the audit log.
            {db === "PROD" && <b className="text-bad"> This is the live site.</b>}
          </p>
          <label className="flex items-start gap-2">
            <input type="checkbox" name="wipe_players" className="mt-1 size-5 shrink-0 accent-[var(--bad)]" />
            <span>Also delete every account except yours (players and hosts sign up again from scratch).</span>
          </label>
          <label className="block space-y-1">
            <span className="font-display text-sm font-bold tracking-[0.15em] uppercase">
              Type <span className="font-score text-bad">RESET {db}</span> to confirm
            </span>
            <input name="confirm" autoComplete="off" spellCheck={false} className={`${inputClass} font-score`} />
          </label>
          <div className="flex flex-wrap items-center gap-4">
            {backedUp ? (
              <Mark tone="ok" glyph="●">
                Backup downloaded
              </Mark>
            ) : (
              <Mark tone="warn" glyph="◐">
                Download a backup first
              </Mark>
            )}
            <SubmitButton
              variant="danger"
              confirm={{
                title: `Reset the ${db} database?`,
                description: "This can't be undone from the app. Your backup file is the only way back.",
                action: "Reset",
              }}
            >
              Reset database
            </SubmitButton>
          </div>
        </form>
      </Sheet>
    </div>
  );
}
