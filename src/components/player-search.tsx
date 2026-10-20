"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { inputClass } from "@/components/ui";

export type PlayerOption = { id: string; name: string };

/**
 * Type-to-search instead of a long dropdown: shows up to `limit` matching
 * players under the box (all of them, when there are only a few). Arrow keys
 * move, Enter picks, Escape closes.
 */
export function PlayerSearch({
  options,
  onPick,
  placeholder = "Search by name",
  label,
  limit = 6,
}: {
  options: PlayerOption[];
  onPick: (option: PlayerOption) => void;
  placeholder?: string;
  /** Accessible name of the search box. */
  label: string;
  limit?: number;
}) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const q = query.trim().toLowerCase();
  const matches = options.filter((o) => !q || o.name.toLowerCase().includes(q)).slice(0, limit);
  const more = options.filter((o) => !q || o.name.toLowerCase().includes(q)).length - matches.length;
  const showList = open && matches.length + (q ? 1 : 0) > 0;

  // The list renders in <body> (fixed, under the box) so animated page
  // sections, which each form their own stacking layer, can't cover it.
  const box = useRef<HTMLInputElement>(null);
  const [rect, setRect] = useState<{ left: number; top: number; width: number } | null>(null);
  useLayoutEffect(() => {
    if (!showList) return;
    const place = () => {
      const r = box.current?.getBoundingClientRect();
      if (r) setRect({ left: r.left, top: r.bottom + 4, width: r.width });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [showList]);

  const pick = (o: PlayerOption) => {
    onPick(o);
    setQuery("");
    setOpen(false);
    setCursor(0);
  };

  return (
    <div className="relative max-w-sm">
      <input
        ref={box}
        type="search"
        role="combobox"
        aria-label={label}
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={showList && matches[cursor] ? `${listId}-${cursor}` : undefined}
        autoComplete="off"
        value={query}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setCursor(0);
        }}
        onFocus={() => setOpen(true)}
        // Let a click on an option land before the list closes.
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setCursor((c) => Math.min(c + 1, matches.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setCursor((c) => Math.max(c - 1, 0));
          } else if (e.key === "Enter") {
            // Never submit the form from the search box.
            e.preventDefault();
            if (showList && matches[cursor]) pick(matches[cursor]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className={inputClass}
      />
      {showList &&
        rect &&
        createPortal(
        <ul
          id={listId}
          role="listbox"
          style={{ left: rect.left, top: rect.top, width: rect.width }}
          className="fixed z-40 max-h-72 divide-y divide-ink/15 overflow-y-auto border-2 border-ink bg-[#fbf3e3] shadow-[4px_4px_0_var(--ink)]"
        >
          {matches.map((o, i) => (
            <li
              key={o.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === cursor}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(o)}
              onMouseEnter={() => setCursor(i)}
              className={`cursor-pointer px-3 py-2.5 [overflow-wrap:anywhere] sm:py-2 ${
                i === cursor ? "bg-line text-board" : "hover:bg-maple-deep/60"
              }`}
            >
              {o.name}
            </li>
          ))}
          {matches.length === 0 && <li className="px-3 py-2 text-sm text-ink-soft">No one by that name is signed up.</li>}
          {more > 0 && <li className="px-3 py-1.5 text-sm text-ink-soft">{more} more: keep typing to narrow it down</li>}
        </ul>,
        document.body,
      )}
    </div>
  );
}
