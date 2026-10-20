"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

/**
 * Email settings, one shape everywhere: a main switch, and when it's on, a
 * "Choose which emails" dropdown with the individual choices (`children`).
 * The count in the dropdown's label follows what's ticked: each ticked
 * checkbox counts, and a radio group counts unless it's on "off".
 * Hidden (not removed) while switched off, so the picks are kept and saved.
 */
export function EmailSwitch({
  name,
  defaultOn,
  label,
  hint,
  total,
  children,
}: {
  /** The main switch's form field. */
  name: string;
  defaultOn: boolean;
  label: ReactNode;
  hint: ReactNode;
  /** How many choices are in the dropdown (for "2 of 3"). */
  total: number;
  children: ReactNode;
}) {
  const [on, setOn] = useState(defaultOn);
  const [count, setCount] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const recount = () => {
      const boxes = [...el.querySelectorAll<HTMLInputElement>("input[type=checkbox]")].filter((i) => i.checked).length;
      const radios = new Set([...el.querySelectorAll<HTMLInputElement>("input[type=radio]")].map((i) => i.name));
      const onRadios = [...radios].filter((n) => {
        const picked = el.querySelector<HTMLInputElement>(`input[type=radio][name="${n}"]:checked`);
        return picked && picked.value !== "off";
      }).length;
      setCount(boxes + onRadios);
    };
    recount();
    el.addEventListener("change", recount);
    return () => el.removeEventListener("change", recount);
  }, []);

  const summary = count == null ? "" : count === total ? "all" : count === 0 ? "none" : `${count} of ${total}`;

  return (
    <div className="space-y-3">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          name={name}
          defaultChecked={defaultOn}
          onChange={(e) => setOn(e.target.checked)}
          className="mt-1 size-5 shrink-0 accent-[var(--line)]"
        />
        <span>
          <b>{label}</b>
          <span className="block text-sm text-ink-soft">{hint}</span>
        </span>
      </label>
      <details hidden={!on} className="group ml-8 border-l-2 border-ink/20 pl-4">
        <summary className="flex cursor-pointer list-none items-center gap-2 font-display text-sm font-bold tracking-[0.15em] uppercase">
          <span aria-hidden className="text-line transition-transform group-open:rotate-90">
            ▸
          </span>
          Choose which emails
          {summary && (
            <span className="font-sans text-sm font-normal tracking-normal normal-case text-ink-soft">· {summary}</span>
          )}
        </summary>
        <div ref={box} className="mt-3 space-y-3">
          {children}
        </div>
      </details>
    </div>
  );
}

/** One choice inside an EmailSwitch: a checkbox (or radio) with a title and a hint. */
export function EmailChoice({
  name,
  value,
  type = "checkbox",
  defaultChecked,
  title,
  hint,
}: {
  name: string;
  value?: string;
  type?: "checkbox" | "radio";
  defaultChecked: boolean;
  title: ReactNode;
  hint: ReactNode;
}) {
  return (
    <label className="flex items-start gap-3">
      <input
        type={type}
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        className="mt-1 size-5 shrink-0 accent-[var(--line)]"
      />
      <span>
        {title}
        <span className="block text-sm text-ink-soft">{hint}</span>
      </span>
    </label>
  );
}
