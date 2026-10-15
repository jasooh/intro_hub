import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonClass, EmptyState, inputClass, PageSpinner, PageTitle, reveal, Sheet } from "@/components/ui";
import { requireDevTools } from "@/lib/auth";
import { cellText, isEditableTable, EDITABLE_TABLES, type EditableTable } from "@/lib/dev-tools";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Data",
};

const PAGE_SIZE = 50;

export default function DevToolsDataPage(props: PageProps<"/dev-tools/data">) {
  return (
    <Suspense fallback={<PageSpinner />}>
      <DataView searchParams={props.searchParams} />
    </Suspense>
  );
}

async function DataView({ searchParams }: { searchParams: PageProps<"/dev-tools/data">["searchParams"] }) {
  await requireDevTools();
  const params = await searchParams;
  const table: EditableTable = isEditableTable(params.table) ? params.table : "registrations";
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const page = Math.max(0, Number(params.page) || 0);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("devtools_rows", {
    p_table: table,
    p_search: q,
    p_limit: PAGE_SIZE,
    p_offset: page * PAGE_SIZE,
  });
  if (error) throw error;
  const { rows, total } = data as { rows: Record<string, unknown>[]; total: number };
  const summary = EDITABLE_TABLES[table].summary as readonly string[];
  const href = (p: number) => `/dev-tools/data?${new URLSearchParams({ table, ...(q ? { q } : {}), page: String(p) })}`;

  return (
    <div className="space-y-10">
      <PageTitle eyebrow="Dev tools" sub="Find a row and fix it. Every change is saved to the audit log with the old values.">
        Data
      </PageTitle>

      <div className="reveal space-y-4" style={reveal(1)}>
        <nav aria-label="Tables" className="flex flex-wrap gap-x-5 gap-y-2">
          {(Object.keys(EDITABLE_TABLES) as EditableTable[]).map((t) => (
            <Link
              key={t}
              href={`/dev-tools/data?table=${t}`}
              aria-current={t === table ? "page" : undefined}
              className={`font-display text-lg font-bold tracking-wide uppercase underline-offset-[6px] ${
                t === table ? "text-ink underline decoration-line decoration-[3px]" : "text-ink-soft hover:text-ink"
              }`}
            >
              {EDITABLE_TABLES[t].label}
            </Link>
          ))}
        </nav>
        <form className="flex items-end gap-3">
          <input type="hidden" name="table" value={table} />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search anything in the row: name, email, ref code, id…"
            className={inputClass}
            aria-label="Search"
          />
          <button className={buttonClass("secondary", "sm")}>Search</button>
        </form>
      </div>

      <Sheet
        label={`${table} · ${total}`}
        action={
          q ? (
            <Link href={`/dev-tools/data?table=${table}`} className="text-sm text-ink-soft underline">
              Clear search
            </Link>
          ) : undefined
        }
        className="reveal"
        style={reveal(2)}
      >
        {rows.length === 0 ? (
          <EmptyState>No rows{q ? " match" : ""}</EmptyState>
        ) : (
          <ul className="divide-y divide-ink/20 border-b border-ink/20">
            {rows.map((row) => (
              <li key={String(row.id)}>
                <Link
                  href={`/dev-tools/data/${table}/${row.id}`}
                  className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 py-2.5 hover:bg-maple-deep/50"
                >
                  <span className="w-20 shrink-0 font-score text-sm text-ink-soft">{String(row.id).slice(0, 8)}</span>
                  {summary.map((col, i) => (
                    <span key={col} className={`min-w-0 truncate ${i === 0 ? "flex-1 font-semibold" : "text-sm text-ink-soft"}`}>
                      {cellText(row[col])}
                    </span>
                  ))}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {total > PAGE_SIZE && (
          <div className="mt-4 flex items-center justify-between gap-3">
            {page > 0 ? (
              <Link href={href(page - 1)} className={buttonClass("secondary", "sm")}>
                ← Newer
              </Link>
            ) : (
              <span />
            )}
            <span className="font-score text-sm">
              {page * PAGE_SIZE + 1}–{Math.min(total, (page + 1) * PAGE_SIZE)} / {total}
            </span>
            {(page + 1) * PAGE_SIZE < total ? (
              <Link href={href(page + 1)} className={buttonClass("secondary", "sm")}>
                Older →
              </Link>
            ) : (
              <span />
            )}
          </div>
        )}
      </Sheet>
    </div>
  );
}
