"use client";

import { useEffect, useRef, useState } from "react";
import { formatMinutes } from "@/lib/session-times";

// Wall-clock arithmetic: times are built and printed in UTC so the host's
// browser time zone (and DST) never shifts what they typed.
const fmt = (d: Date, withDate: boolean) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    weekday: "short",
    ...(withDate ? { month: "short", day: "numeric" } : {}),
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
const HOUR = 3_600_000;

/** "5 days before", "1 day before", or "3 h 30 min before". */
function before(minutes: number) {
  const days = minutes / 1440;
  return Number.isInteger(days) && days > 0 ? `${days} day${days === 1 ? "" : "s"} before` : `${formatMinutes(minutes)} before`;
}
/** End a sentence after a time like "8:00 a.m." without doubling the period. */
const stop = (text: string) => (text.endsWith(".") ? text : `${text}.`);

type Line = { label: string; value: string };

/** What the session form's rules mean in actual dates, from the form's current values. */
function sessionLines(f: FormData): Line[] | null {
  const date = String(f.get("date") ?? "");
  const startClock = String(f.get("instructional_start") ?? "");
  const opens = String(f.get("opens_at") ?? "");
  const hold = Number(f.get("hold_hours"));
  const cutoff = Number(f.get("cancel_cutoff_hours"));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(startClock)) return null;
  const start = new Date(`${date}T${startClock}:00Z`);
  const lines: Line[] = [{ label: "Session starts", value: fmt(start, true) }];
  if (opens) {
    const open = new Date(`${opens}:00Z`);
    const diff = start.getTime() - open.getTime();
    lines.push({
      label: "Sign-ups open",
      value: diff > 0 ? `${fmt(open, true)} (${before(Math.round(diff / 60_000))})` : `${fmt(open, true)} · after the start!`,
    });
    if (hold > 0) {
      const heldUntil = new Date(Math.min(open.getTime() + hold * HOUR, start.getTime()));
      lines.push({
        label: "Time to pay",
        value: stop(
          `Within ${hold} h of signing up, or the spot goes to the next person. Sign up when sign-ups open and you have until ${fmt(heldUntil, true)}${
            heldUntil.getTime() === start.getTime() ? " (never later than the start)" : ""
          }`,
        ),
      });
    }
  }
  if (cutoff >= 0 && Number.isFinite(cutoff)) {
    lines.push({ label: "Refund cutoff", value: `Cancel before ${fmt(new Date(start.getTime() - cutoff * HOUR), true)} for a refund.` });
  }
  return lines;
}

/** Same for a weekly session: days and times relative to its weekday. */
function templateLines(f: FormData): Line[] | null {
  const weekday = Number(f.get("weekday"));
  const startClock = String(f.get("instructional_start") ?? "");
  const openBefore = Number(f.get("open_hours_before"));
  const hold = Number(f.get("hold_hours"));
  const cutoff = Number(f.get("cancel_cutoff_hours"));
  if (!/^\d{2}:\d{2}$/.test(startClock) || !(weekday >= 0 && weekday <= 6)) return null;
  // Any week works; 2026-01-04 is a Sunday.
  const start = new Date(`2026-01-${String(4 + weekday).padStart(2, "0")}T${startClock}:00Z`);
  const daysBefore = (h: number) => before(h * 60);
  const lines: Line[] = [{ label: "Session starts", value: `Every ${fmt(start, false)}` }];
  if (openBefore >= 0) {
    lines.push({
      label: "Sign-ups open",
      value: `${fmt(new Date(start.getTime() - openBefore * HOUR), false)} (${daysBefore(openBefore)})`,
    });
  }
  if (hold > 0) {
    lines.push({
      label: "Time to pay",
      value: `Within ${hold} h of signing up (never later than the start), or the spot goes to the next person.`,
    });
  }
  if (cutoff >= 0) {
    lines.push({
      label: "Refund cutoff",
      value: `${fmt(new Date(start.getTime() - cutoff * HOUR), false)}${cutoff ? ` (${daysBefore(cutoff)})` : " (the start)"}`,
    });
  }
  return lines;
}

/**
 * Live preview of when sign-ups open, how long holds last and when refunds
 * stop, read from the surrounding form as the host types.
 */
export function TimingPreview({ kind }: { kind: "session" | "template" }) {
  const root = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<Line[] | null>(null);

  useEffect(() => {
    const form = root.current?.closest("form");
    if (!form) return;
    const update = () => {
      const data = new FormData(form);
      setLines(kind === "session" ? sessionLines(data) : templateLines(data));
    };
    update();
    form.addEventListener("input", update);
    form.addEventListener("change", update);
    return () => {
      form.removeEventListener("input", update);
      form.removeEventListener("change", update);
    };
  }, [kind]);

  return (
    <div ref={root} className="border-l-4 border-line py-1 pl-3">
      <p className="font-display text-sm font-bold tracking-[0.15em] uppercase">What players see</p>
      {lines ? (
        <dl className="mt-1 space-y-1 text-sm">
          {lines.map((l) => (
            <div key={l.label} className="grid grid-cols-1 gap-x-3 sm:grid-cols-[8.5rem_minmax(0,1fr)]">
              <dt className="font-semibold">{l.label}</dt>
              <dd className="text-ink-soft">{l.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-1 text-sm text-ink-soft">Fill in the date and times to see the timeline.</p>
      )}
    </div>
  );
}
