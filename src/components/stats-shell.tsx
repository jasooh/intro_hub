"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { createContext, type FormEvent, type ReactNode, useContext, useState, useTransition } from "react";
import { NavGroup, NavLink, PendingContent } from "@/components/nav-pending";
import { buttonClass, inputClass, PageSpinner, reveal } from "@/components/ui";
import { customDates, STAT_RANGES, STAT_TABS, type StatRange, type StatTab } from "@/lib/stats";

const TabContext = createContext<StatTab>("overview");

const tabOf = (v: string | null): StatTab => STAT_TABS.find((t) => t.key === v)?.key ?? "overview";

/**
 * The Stats page's controls. Picking a time range highlights at once and the content shows the
 * bouncing ball until the new numbers arrive. Switching sections needs no query (every section's
 * data comes with the range), so it swaps instantly and only updates the URL.
 */
export function StatsShell({ children }: { children: ReactNode }) {
  const params = useSearchParams();
  const router = useRouter();
  const custom = params.get("range") === "custom" ? customDates(params.get("from"), params.get("to")) : null;
  const range: StatRange = custom ? "custom" : (STAT_RANGES.find((r) => r.key === params.get("range"))?.key ?? "3m");
  const [tab, setTab] = useState<StatTab>(tabOf(params.get("tab")));
  const [submitting, startTransition] = useTransition();

  const tabQuery = (t: StatTab) => (t === "overview" ? "" : `&tab=${t}`);
  const rangeQuery = (r: StatRange) =>
    r === "custom" && custom ? `range=custom&from=${custom.from}&to=${custom.to}` : `range=${r}`;
  const rangeHref = (r: StatRange) => `/admin/stats?${rangeQuery(r)}${tabQuery(tab)}`;
  const tabHref = (t: StatTab) => `/admin/stats?${rangeQuery(range)}${tabQuery(t)}`;

  const submitCustom = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const next = customDates(f.get("from"), f.get("to"));
    if (!next) return;
    startTransition(() => router.push(`/admin/stats?range=custom&from=${next.from}&to=${next.to}${tabQuery(tab)}`));
  };

  return (
    <TabContext.Provider value={tab}>
      <NavGroup>
        <div className="reveal space-y-4" style={reveal(1)}>
          <nav className="flex flex-wrap gap-3" aria-label="Time range">
            {STAT_RANGES.map((r) => (
              <NavLink
                key={r.key}
                href={rangeHref(r.key)}
                active={r.key === range}
                className={({ active }) => buttonClass(active ? "primary" : "secondary", "sm")}
              >
                {r.label}
              </NavLink>
            ))}
          </nav>
          <form
            onSubmit={submitCustom}
            action="/admin/stats"
            className={`flex flex-wrap items-end gap-x-4 gap-y-3 border-l-4 py-1 pl-3 ${
              range === "custom" || submitting ? "border-line" : "border-ink/20"
            }`}
          >
            <input type="hidden" name="range" value="custom" />
            <label className="block min-w-0 space-y-1">
              <span className="font-display text-sm font-bold tracking-[0.15em] uppercase">From</span>
              <input type="date" name="from" required defaultValue={custom?.from} className={`${inputClass} w-44`} />
            </label>
            <label className="block min-w-0 space-y-1">
              <span className="font-display text-sm font-bold tracking-[0.15em] uppercase">To</span>
              <input type="date" name="to" required defaultValue={custom?.to} className={`${inputClass} w-44`} />
            </label>
            <button type="submit" className={buttonClass(range === "custom" || submitting ? "primary" : "secondary", "sm")}>
              {range === "custom" ? "Update range" : "Custom range"}
            </button>
          </form>
        </div>

        <nav aria-label="Stats sections" className="reveal flex flex-wrap gap-x-5 border-b-2 border-ink" style={reveal(2)}>
          {STAT_TABS.map((t) => (
            <a
              key={t.key}
              href={tabHref(t.key)}
              aria-current={t.key === tab ? "page" : undefined}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                e.preventDefault();
                setTab(t.key);
                window.history.replaceState(null, "", tabHref(t.key));
              }}
              className={`-mb-[2px] border-b-4 py-2 font-display text-base font-bold tracking-wide whitespace-nowrap uppercase ${
                t.key === tab ? "border-line text-ink" : "border-transparent text-ink-soft hover:text-ink"
              }`}
            >
              {t.label}
            </a>
          ))}
        </nav>

        {submitting ? <PageSpinner /> : <PendingContent>{children}</PendingContent>}
      </NavGroup>
    </TabContext.Provider>
  );
}

/** Shows the section for the current tab; the sections themselves are rendered on the server. */
export function StatsPanelSwitch({ panels }: { panels: Record<StatTab, ReactNode> }) {
  return <>{panels[useContext(TabContext)]}</>;
}
