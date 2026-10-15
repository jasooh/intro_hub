import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyState, PageSpinner, PageTitle, reveal, Sheet } from "@/components/ui";
import { requireDevTools } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { isEditableTable } from "@/lib/dev-tools";
import { createClient } from "@/lib/supabase/server";
import { JsonBlock } from "../dev-tools-ui";

export const metadata: Metadata = {
  title: "Audit log",
};

type AuditRow = {
  id: number;
  at: string;
  action: string;
  target_table: string | null;
  target_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  note: string | null;
};

/** For edits, only the fields that changed. */
function changedFields(a: AuditRow) {
  if (!a.before || !a.after) return null;
  return Object.keys(a.after).filter((k) => JSON.stringify(a.before![k]) !== JSON.stringify(a.after![k]));
}

export default function AuditPage() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <AuditView />
    </Suspense>
  );
}

async function AuditView() {
  await requireDevTools();
  const supabase = await createClient();
  const { data, error } = await supabase.from("devtools_audit").select("*").order("at", { ascending: false }).limit(200);
  if (error) throw error;
  const rows = (data ?? []) as AuditRow[];

  return (
    <div className="space-y-10">
      <PageTitle eyebrow="Dev tools" sub="Everything done with these tools, newest first, with the values from before each change.">
        Audit log
      </PageTitle>

      <Sheet label={`Last ${rows.length}`} className="reveal" style={reveal(1)}>
        {rows.length === 0 ? (
          <EmptyState>Nothing yet</EmptyState>
        ) : (
          <ul className="divide-y divide-ink/20 border-b border-ink/20">
            {rows.map((a) => {
              const changed = changedFields(a);
              const canOpen = a.target_table && a.target_id && isEditableTable(a.target_table) && a.action !== "delete_row";
              return (
                <li key={a.id} className="py-3">
                  <details className="group">
                    <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-x-4 gap-y-1">
                      <span aria-hidden className="text-line transition-transform group-open:rotate-90">
                        ▸
                      </span>
                      <span className="font-display text-lg font-bold tracking-wide uppercase">{a.action.replace(/_/g, " ")}</span>
                      <span className="min-w-0 flex-1 truncate text-ink-soft">
                        {[a.target_table, a.target_id?.slice(0, 8), changed?.join(", "), a.note].filter(Boolean).join(" · ")}
                      </span>
                      <span className="text-sm text-ink-soft">{formatDateTime(a.at)}</span>
                    </summary>
                    <div className="mt-3 space-y-3 pl-5">
                      {canOpen && (
                        <Link
                          href={`/dev-tools/data/${a.target_table}/${a.target_id}`}
                          className="underline decoration-line decoration-2 underline-offset-4"
                        >
                          Open this row
                        </Link>
                      )}
                      {a.before && (
                        <div className="space-y-1">
                          <p className="font-display text-sm font-bold tracking-[0.15em] uppercase">Before</p>
                          <JsonBlock value={changed ? Object.fromEntries(changed.map((k) => [k, a.before![k]])) : a.before} />
                        </div>
                      )}
                      {a.after && (
                        <div className="space-y-1">
                          <p className="font-display text-sm font-bold tracking-[0.15em] uppercase">After</p>
                          <JsonBlock value={changed ? Object.fromEntries(changed.map((k) => [k, a.after![k]])) : a.after} />
                        </div>
                      )}
                      {!a.before && !a.after && <p className="text-ink-soft">No row data for this action.</p>}
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </Sheet>
    </div>
  );
}
