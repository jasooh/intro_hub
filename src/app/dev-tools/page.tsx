import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SubmitButton } from "@/components/submit-button";
import { inputClass, Mark, PageSpinner, PageTitle, reveal, Sheet } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { ENV_CHECKS, EDITABLE_TABLES } from "@/lib/dev-tools";
import { createClient } from "@/lib/supabase/server";
import { createFromTemplates, resendEmail, runTickNow, setMaintenance } from "./actions";
import { Check } from "./dev-tools-ui";

export const metadata: Metadata = {
  title: "Health",
};

type Health = {
  counts: Record<string, number>;
  cron: { status: string; start_time: string; message: string | null; jobname: string | null }[] | null;
  last_payment_at: string | null;
  unmatched_payments: number;
  stuck_holds: number;
  recent_emails: { id: number; kind: string; sent_at: string; registration_id: string | null; recipient: string | null }[];
  maintenance: { on: boolean; message: string } | null;
};

const minutesSince = (iso: string) => (Date.now() - new Date(iso).getTime()) / 60000;

export default function DevToolsHealthPage() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <HealthView />
    </Suspense>
  );
}

async function HealthView() {
  await requireOwner();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("owner_health");
  if (error) throw error;
  const h = data as Health;

  const lastCron = h.cron?.[0];
  const cronOk = lastCron?.status === "succeeded" && minutesSince(lastCron.start_time) < 5;
  const maintenance = h.maintenance ?? { on: false, message: "" };

  return (
    <div className="space-y-12">
      <PageTitle eyebrow="Dev tools" sub="What's running, what's stuck, and buttons to nudge it.">
        Health
      </PageTitle>

      <Sheet label="Checks" className="reveal" style={reveal(1)}>
        <ul className="divide-y divide-ink/20 border-b border-ink/20">
          <Check
            label="Every-minute job"
            tone={h.cron === null ? "muted" : cronOk ? "ok" : "bad"}
            status={h.cron === null ? "No pg_cron here" : cronOk ? "Running" : "Not running"}
            detail={
              lastCron
                ? `Last run ${formatDateTime(lastCron.start_time)} (${lastCron.status})${lastCron.message && !cronOk ? `: ${lastCron.message}` : ""}`
                : "No runs recorded"
            }
          />
          <Check
            label="Expired holds still waiting"
            tone={h.stuck_holds === 0 ? "ok" : "bad"}
            status={h.stuck_holds === 0 ? "None" : `${h.stuck_holds} stuck`}
            detail={h.stuck_holds === 0 ? "Holds are expiring on time." : "The job isn't expiring holds. Try “Run tick now”."}
          />
          <Check
            label="Gmail payment script"
            tone={h.last_payment_at ? "ok" : "warn"}
            status={h.last_payment_at ? "Seen" : "Never"}
            detail={
              h.last_payment_at
                ? `Last e-Transfer received ${formatDateTime(h.last_payment_at)}`
                : "No e-Transfer has come in through the script yet."
            }
          />
          <Check
            label="Unmatched payments"
            tone={h.unmatched_payments === 0 ? "ok" : "warn"}
            status={String(h.unmatched_payments)}
            detail={
              <Link href="/admin/payments" className="underline decoration-line decoration-2 underline-offset-4">
                Open the payments inbox
              </Link>
            }
          />
        </ul>
      </Sheet>

      <Sheet label="Maintenance mode" className="reveal" style={reveal(2)}>
        <form action={setMaintenance} className="space-y-4">
          <p className="text-ink-soft">
            Pauses new sign-ups and option switches for players and shows a banner on every page. Cancelling still works;
            hosts aren&apos;t blocked.
          </p>
          <label className="flex items-center gap-2 font-display text-sm font-bold tracking-[0.15em] uppercase">
            <input type="checkbox" name="on" defaultChecked={maintenance.on} className="size-5 accent-[var(--line)]" />
            Maintenance on
          </label>
          <input
            name="message"
            defaultValue={maintenance.message}
            maxLength={300}
            placeholder="Banner message, e.g. Sign-ups are paused while we fix payments. Back soon!"
            className={inputClass}
          />
          <SubmitButton requireChange>Save</SubmitButton>
        </form>
      </Sheet>

      <Sheet label="Repairs" className="reveal" style={reveal(3)}>
        <div className="flex flex-wrap gap-3">
          <form action={runTickNow}>
            <SubmitButton variant="secondary">Run tick now</SubmitButton>
          </form>
          <form action={createFromTemplates}>
            <SubmitButton variant="secondary">Create sessions from weekly schedule</SubmitButton>
          </form>
        </div>
        <p className="mt-3 text-sm text-ink-soft">
          The tick expires unpaid holds, moves waitlists up, sends reminders and posts weekly sessions (it normally runs
          every minute).
        </p>
      </Sheet>

      <Sheet label="Recent emails" className="reveal" style={reveal(4)}>
        {h.recent_emails.length === 0 ? (
          <p className="text-ink-soft">No emails sent yet.</p>
        ) : (
          <ul className="divide-y divide-ink/20 border-b border-ink/20">
            {h.recent_emails.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
                <span className="w-36 shrink-0 font-display font-bold tracking-wide uppercase">{e.kind.replace(/_/g, " ")}</span>
                <span className="min-w-0 flex-1 truncate">{e.recipient ?? "everyone (announcement)"}</span>
                <span className="text-sm text-ink-soft">{formatDateTime(e.sent_at)}</span>
                {e.registration_id && e.kind !== "announcement" && (
                  <form action={resendEmail.bind(null, e.id)}>
                    <SubmitButton variant="ghost" size="sm" confirm={`Send this ${e.kind.replace(/_/g, " ")} email again?`}>
                      Resend
                    </SubmitButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-sm text-ink-soft">
          Emails that fail to send aren&apos;t listed (they&apos;re retried by whatever triggered them).
        </p>
      </Sheet>

      <div className="grid grid-cols-1 gap-12 sm:grid-cols-2">
        <Sheet label="Rows" className="reveal" style={reveal(5)}>
          <ul className="divide-y divide-ink/20 border-b border-ink/20">
            {Object.entries(h.counts).map(([table, n]) => (
              <li key={table} className="flex items-center justify-between gap-3 py-1.5">
                {table in EDITABLE_TABLES ? (
                  <Link href={`/dev-tools/data?table=${table}`} className="underline decoration-line decoration-2 underline-offset-4">
                    {table}
                  </Link>
                ) : (
                  <span>{table}</span>
                )}
                <span className="font-score font-black">{n}</span>
              </li>
            ))}
          </ul>
        </Sheet>

        <Sheet label="Settings" className="reveal" style={reveal(6)}>
          <ul className="divide-y divide-ink/20 border-b border-ink/20">
            {ENV_CHECKS.map((v) => {
              const set = Boolean(process.env[v.name]?.trim());
              return (
                <li key={v.name} className="flex items-center justify-between gap-3 py-1.5">
                  <span className="min-w-0">
                    <span className="block truncate font-mono text-sm">{v.name}</span>
                    <span className="block text-xs text-ink-soft">{v.why}</span>
                  </span>
                  {set ? (
                    <Mark tone="ok" glyph="●">
                      Set
                    </Mark>
                  ) : (
                    <Mark tone={v.required ? "bad" : "muted"} glyph="○">
                      {v.required ? "Missing" : "Not set"}
                    </Mark>
                  )}
                </li>
              );
            })}
          </ul>
        </Sheet>
      </div>
    </div>
  );
}
