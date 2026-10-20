"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { inputClass } from "@/components/ui";

/** `short`: what the closed button shows instead of the label (e.g. just a number in tight rows). */
export type DropdownOption = { value: string; label: string; short?: string; disabled?: boolean };

/** Underlined field like the other inputs, or the compact caps style used in rows (team picks). */
const LOOKS = {
  field: `${inputClass} flex items-center justify-between gap-2 text-left`,
  compact:
    "flex min-w-0 items-center justify-between gap-1.5 border-0 border-b-2 border-ink bg-transparent py-1.5 font-display text-base font-bold tracking-wide uppercase sm:py-1 sm:text-sm",
};

/**
 * The app's dropdown, in place of the browser's <select>: a button showing the
 * choice and a list that opens above the page (in <body>, so animated sections
 * can't cover it). Long lists get a search box. Submits `name` like a select;
 * `required` is enforced by the browser's form validation.
 */
export function Dropdown({
  name,
  options,
  defaultValue = "",
  placeholder = "Choose…",
  label,
  required = false,
  look = "field",
  className = "",
  searchAt = 9,
  submitOnChange = false,
}: {
  name: string;
  options: DropdownOption[];
  defaultValue?: string;
  placeholder?: string;
  /** Accessible name when there's no visible <label> around it. */
  label?: string;
  required?: boolean;
  look?: keyof typeof LOOKS;
  className?: string;
  /** Show a search box when there are at least this many options. */
  searchAt?: number;
  /** Submit the surrounding form as soon as something is picked (e.g. team moves). */
  submitOnChange?: boolean;
}) {
  const listId = useId();
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const button = useRef<HTMLButtonElement>(null);
  const root = useRef<HTMLSpanElement>(null);
  const searchable = options.length >= searchAt;
  const q = query.trim().toLowerCase();
  const shown = options.filter((o) => !q || o.label.toLowerCase().includes(q));
  const current = options.find((o) => o.value === value);

  // Position the list under the button while it's open. Inside a modal the list
  // goes into the modal itself (positioned against it): a list in <body> would sit
  // under the modal, and the modal treats clicks outside it as "close".
  const [rect, setRect] = useState<{ left: number; top: number; width: number; host: HTMLElement | null } | null>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = button.current?.getBoundingClientRect();
      if (!r) return;
      const host = button.current?.closest<HTMLElement>('[role="dialog"]') ?? null;
      const width = Math.max(r.width, 176);
      if (!host) return setRect({ left: r.left, top: r.bottom + 4, width, host });
      const h = host.getBoundingClientRect();
      setRect({
        left: Math.min(r.left - h.left - host.clientLeft, host.clientWidth - width - 8),
        top: r.bottom + 4 - h.top - host.clientTop + host.scrollTop,
        width,
        host,
      });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  // Tell the form a field changed (SubmitButton requireChange), or submit it. Compared
  // with the last value reported, not "first run", so React's double-run of effects
  // in development can't submit the starting value.
  const reported = useRef(defaultValue);
  useEffect(() => {
    if (value === reported.current) return;
    reported.current = value;
    root.current?.dispatchEvent(new Event("change", { bubbles: true }));
    if (submitOnChange) root.current?.closest("form")?.requestSubmit();
  }, [value, submitOnChange]);

  const close = () => {
    setOpen(false);
    setQuery("");
    button.current?.focus();
  };
  const choose = (o: DropdownOption) => {
    if (o.disabled) return;
    setValue(o.value);
    close();
  };
  const openList = () => {
    setCursor(Math.max(0, shown.findIndex((o) => o.value === value)));
    setOpen(true);
  };
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) return openList();
      setCursor((c) => Math.min(c + 1, shown.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && shown[cursor]) choose(shown[cursor]);
      else if (!open) openList();
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      close();
    }
  };

  return (
    <span ref={root} className={`relative block min-w-0 ${className}`}>
      {required ? (
        // Visually hidden but focusable by validation, so "required" works like a <select>.
        <input
          name={name}
          value={value}
          required
          tabIndex={-1}
          aria-hidden
          onChange={() => {}}
          className="pointer-events-none absolute bottom-0 left-0 h-px w-px opacity-0"
        />
      ) : (
        <input type="hidden" name={name} value={value} />
      )}
      <button
        ref={button}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={label}
        onClick={() => (open ? close() : openList())}
        onKeyDown={keys}
        onBlur={(e) => {
          // Close when focus leaves for something outside the open panel (its search box counts as inside).
          const to = e.relatedTarget as Node | null;
          if (!to || !document.getElementById(`${listId}-panel`)?.contains(to)) setTimeout(() => setOpen(false), 120);
        }}
        className={`w-full ${LOOKS[look]}`}
      >
        <span className={`min-w-0 truncate ${current ? "" : "text-ink-soft"}`}>{current?.short ?? current?.label ?? placeholder}</span>
        <ChevronDown aria-hidden className={`size-4 shrink-0 text-ink-soft transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open &&
        rect &&
        createPortal(
          <div
            id={`${listId}-panel`}
            style={{ left: rect.left, top: rect.top, width: rect.width }}
            className={`${rect.host ? "absolute" : "fixed"} z-40 border-2 border-ink bg-[#fbf3e3] font-sans text-base font-normal tracking-normal normal-case shadow-[4px_4px_0_var(--ink)]`}
          >
            {searchable && (
              <input
                autoFocus
                type="search"
                value={query}
                placeholder="Search"
                aria-label="Search the options"
                onChange={(e) => {
                  setQuery(e.target.value);
                  setCursor(0);
                }}
                onKeyDown={keys}
                onBlur={(e) => {
                  const to = e.relatedTarget as Node | null;
                  if (to !== button.current && !document.getElementById(`${listId}-panel`)?.contains(to)) {
                    setTimeout(() => setOpen(false), 150);
                  }
                }}
                className="w-full border-0 border-b-2 border-ink/20 bg-transparent px-3 py-2 focus:border-line focus:ring-0"
              />
            )}
            <ul id={listId} role="listbox" className="max-h-72 divide-y divide-ink/10 overflow-y-auto">
              {shown.map((o, i) => (
                <li
                  key={o.value}
                  role="option"
                  aria-selected={o.value === value}
                  aria-disabled={o.disabled || undefined}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(o)}
                  onMouseEnter={() => setCursor(i)}
                  className={`px-3 py-2.5 [overflow-wrap:anywhere] sm:py-2 ${
                    o.disabled
                      ? "cursor-default text-ink-soft"
                      : i === cursor
                        ? "cursor-pointer bg-line text-board"
                        : "cursor-pointer hover:bg-maple-deep/60"
                  } ${o.value === value && i !== cursor ? "font-bold" : ""}`}
                >
                  {o.label}
                </li>
              ))}
              {shown.length === 0 && <li className="px-3 py-2 text-sm text-ink-soft">No matches</li>}
            </ul>
          </div>,
          rect.host ?? document.body,
        )}
    </span>
  );
}
