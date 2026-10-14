"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { buttonClass, inputClass, PageSpinner } from "@/components/ui";
import type { AdminSessionView } from "@/lib/queries";

const VIEWS: { key: AdminSessionView; label: string }[] = [
  { key: "upcoming", label: "Upcoming" },
  { key: "past", label: "Past" },
  { key: "cancelled", label: "Cancelled" },
];

/**
 * Tabs + search for the dashboard session list. Navigates client-side (no page
 * reload): the active tab switches instantly and the list shows the bouncing
 * ball until the server sends the new results.
 */
export function SessionFilters({
  view,
  q,
  totals,
  path = "/admin",
  children,
}: {
  view: AdminSessionView;
  q: string;
  totals: Record<AdminSessionView, number>;
  path?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [activeView, setActiveView] = useOptimistic(view);
  const [text, setText] = useState(q);
  const firstRender = useRef(true);

  const go = (nextView: AdminSessionView, nextQ: string) => {
    const params = new URLSearchParams({ view: nextView });
    if (nextQ.trim()) params.set("q", nextQ.trim());
    startTransition(() => {
      setActiveView(nextView);
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
    const timer = setTimeout(() => go(activeView, text), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <nav className="flex gap-6" aria-label="Session views">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => v.key !== activeView && go(v.key, text)}
              aria-current={v.key === activeView ? "page" : undefined}
              className={`border-b-4 pb-1 font-display text-lg font-bold tracking-wide uppercase transition-colors ${
                v.key === activeView ? "border-line text-ink" : "border-transparent text-ink-soft hover:text-ink"
              }`}
            >
              {v.label} <span className="font-score font-black">{totals[v.key]}</span>
            </button>
          ))}
        </nav>
        <form
          className="flex items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            go(activeView, text);
          }}
        >
          <input
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Search title, location, notes"
            aria-label="Search sessions"
            className={`${inputClass} w-64 text-base`}
          />
          {text && (
            <button
              type="button"
              onClick={() => {
                setText("");
                go(activeView, "");
              }}
              className={buttonClass("ghost", "sm")}
            >
              Clear
            </button>
          )}
        </form>
      </div>

      <div aria-busy={pending}>{pending ? <PageSpinner /> : children}</div>
    </div>
  );
}
