"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { buttonClass, inputClass, PageSpinner } from "@/components/ui";

export type FilterOption = { key: string; label: string; count?: number };
type Filters = Record<string, string>;

/**
 * Tabs, optional filter chips and a live search box for a server-rendered list.
 * Navigates client-side (no page reload): the selection changes instantly and
 * the list shows the bouncing ball until the server sends the new results.
 * State lives in the URL, e.g. ?view=matched&method=ref&q=jane.
 */
export function ListFilters({
  path,
  tabs,
  chips,
  q,
  placeholder,
  children,
}: {
  path: string;
  tabs: { param: string; value: string; options: FilterOption[] };
  chips?: { param: string; value: string; options: FilterOption[] };
  q: string;
  placeholder: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const current: Filters = { [tabs.param]: tabs.value, ...(chips ? { [chips.param]: chips.value } : {}) };
  const [filters, setFilters] = useOptimistic(current);
  const [text, setText] = useState(q);
  const firstRender = useRef(true);

  const go = (next: Filters, nextQ: string) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) params.set(k, v);
    if (nextQ.trim()) params.set("q", nextQ.trim());
    startTransition(() => {
      setFilters(next);
      router.replace(`${path}?${params}`, { scroll: false });
    });
  };

  // Search as you type, after a short pause.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (text.trim() === q.trim()) return;
    const timer = setTimeout(() => go(filters, text), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <nav className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Views">
          {tabs.options.map((o) => {
            const active = filters[tabs.param] === o.key;
            return (
              <button
                key={o.key}
                type="button"
                onClick={() => !active && go({ ...filters, [tabs.param]: o.key }, text)}
                aria-current={active ? "page" : undefined}
                className={`border-b-4 pb-1 font-display text-lg font-bold tracking-wide whitespace-nowrap uppercase transition-colors ${
                  active ? "border-line text-ink" : "border-transparent text-ink-soft hover:text-ink"
                }`}
              >
                {o.label}
                {o.count !== undefined && <span className="ml-1.5 font-score font-black">{o.count}</span>}
              </button>
            );
          })}
        </nav>
        <form
          className="flex items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            go(filters, text);
          }}
        >
          <input
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={placeholder}
            aria-label="Search"
            className={`${inputClass} w-64 text-base`}
          />
          {text && (
            <button
              type="button"
              onClick={() => {
                setText("");
                go(filters, "");
              }}
              className={buttonClass("ghost", "sm")}
            >
              Clear
            </button>
          )}
        </form>
      </div>

      {chips && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter">
          {chips.options.map((o) => {
            const active = filters[chips.param] === o.key;
            return (
              <button
                key={o.key}
                type="button"
                onClick={() => !active && go({ ...filters, [chips.param]: o.key }, text)}
                aria-pressed={active}
                className={`border-2 px-2.5 py-0.5 font-display text-sm font-bold tracking-wide uppercase transition-colors ${
                  active ? "border-ink bg-ink text-[#f2e3c6]" : "border-ink/30 text-ink-soft hover:border-ink hover:text-ink"
                }`}
              >
                {o.label}
                {o.count !== undefined && <span className="ml-1.5 font-score font-black">{o.count}</span>}
              </button>
            );
          })}
        </div>
      )}

      <div aria-busy={pending}>{pending ? <PageSpinner /> : children}</div>
    </div>
  );
}
