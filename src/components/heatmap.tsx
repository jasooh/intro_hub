"use client";

import { useState } from "react";
import { heatGrid, hourLabel, WEEKDAYS_SHORT, type Stats } from "@/lib/stats";

/** Sign-ups by weekday and hour: one orange, light to dark, with a scale. Tap (or hover/focus) a square to read its count. */
export function Heatmap({ cells }: { cells: Stats["timing"]["heatmap"] }) {
  const { rows, max, total } = heatGrid(cells);
  const [picked, setPicked] = useState<{ dow: number; h: number } | null>(null);
  if (total === 0) return <p className="text-ink-soft">No sign-ups in this range yet.</p>;
  const shade = (n: number) => (n === 0 ? 0 : Math.ceil((n / max) * 4)); // 0 = none, 1-4 = light to dark
  const fill = ["transparent", "color-mix(in oklab, var(--line) 25%, var(--maple))", "color-mix(in oklab, var(--line) 50%, var(--maple))", "color-mix(in oklab, var(--line) 75%, var(--maple))", "var(--line)"];
  const count = picked ? (rows.find((r) => r.dow === picked.dow)?.hours[picked.h] ?? 0) : 0;
  return (
    <figure className="space-y-2">
      <p className="min-h-6 text-sm" aria-live="polite">
        {picked ? (
          <>
            <b>
              {WEEKDAYS_SHORT[picked.dow]} {hourLabel(picked.h)}
            </b>
            : {count} sign-up{count === 1 ? "" : "s"}
          </>
        ) : (
          <span className="text-ink-soft">Tap a square to see how many signed up then.</span>
        )}
      </p>
      <div className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-2 gap-y-[3px]">
        {rows.map((row) => (
          <div key={row.dow} className="contents">
            <span className="text-xs leading-[22px] text-ink-soft">{WEEKDAYS_SHORT[row.dow]}</span>
            <span className="grid grid-cols-[repeat(24,minmax(0,1fr))] gap-[2px]">
              {row.hours.map((n, h) => {
                const on = picked?.dow === row.dow && picked.h === h;
                return (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setPicked(on ? null : { dow: row.dow, h })}
                    onMouseEnter={() => setPicked({ dow: row.dow, h })}
                    aria-label={`${WEEKDAYS_SHORT[row.dow]} ${hourLabel(h)}: ${n} sign-up${n === 1 ? "" : "s"}`}
                    aria-pressed={on}
                    className={`h-[22px] border p-0 ${on ? "border-ink outline outline-2 outline-ink" : "border-ink/10"}`}
                    style={{ background: fill[shade(n)] }}
                  />
                );
              })}
            </span>
          </div>
        ))}
        <span />
        <span className="flex justify-between text-[11px] text-ink-soft">
          <span>12 am</span>
          <span>6 am</span>
          <span>12 pm</span>
          <span>6 pm</span>
          <span>11 pm</span>
        </span>
      </div>
      <figcaption className="flex flex-wrap items-center gap-2 text-xs text-ink-soft">
        Fewer
        {fill.slice(1).map((f, i) => (
          <span key={i} className="size-3 border border-ink/10" style={{ background: f }} />
        ))}
        More sign-ups (busiest hour: {max})
      </figcaption>
    </figure>
  );
}
