"use client";

import { useState } from "react";
import { inputClass } from "@/components/ui";
import { blockOffsets, clockLabel, clockPlus, formatMinutes, type BlockClocks } from "@/lib/session-times";

const ROWS = [
  { label: "Instructional", start: "instructional_start", end: "instructional_end" },
  { label: "Drop-in", start: "dropin_start", end: "dropin_end" },
] as const;

/**
 * The session's two blocks as start/end times (instructional, then drop-in),
 * with a live summary of the whole session or what's wrong with the order.
 */
export function SessionTimes({ defaultValue }: { defaultValue: BlockClocks }) {
  const [clocks, setClocks] = useState(defaultValue);
  const result = blockOffsets(clocks);

  return (
    <div className="space-y-3">
      <div className="divide-y divide-ink/20 border-y border-ink/20">
        {ROWS.map((row) => (
          <div
            key={row.label}
            className="grid grid-cols-1 items-end gap-x-4 gap-y-1 py-3 sm:grid-cols-[9rem_minmax(0,10rem)_auto_minmax(0,10rem)] sm:justify-start"
          >
            <span className="font-display text-sm font-bold tracking-[0.15em] uppercase sm:pb-2">{row.label}</span>
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-x-3 sm:contents">
              <label className="block min-w-0">
                <span className="sr-only">{row.label} starts</span>
                <input
                  type="time"
                  name={row.start}
                  required
                  value={clocks[row.start]}
                  onChange={(e) => setClocks({ ...clocks, [row.start]: e.target.value })}
                  className={inputClass}
                />
              </label>
              <span aria-hidden className="pb-2 font-display font-bold text-ink-soft">
                to
              </span>
              <label className="block min-w-0">
                <span className="sr-only">{row.label} ends</span>
                <input
                  type="time"
                  name={row.end}
                  required
                  value={clocks[row.end]}
                  onChange={(e) => setClocks({ ...clocks, [row.end]: e.target.value })}
                  className={inputClass}
                />
              </label>
            </div>
          </div>
        ))}
      </div>
      {"error" in result ? (
        <p className="text-sm font-bold text-bad">{result.error}</p>
      ) : (
        <p className="text-sm text-ink-soft">
          <b className="text-ink">
            {clockLabel(clocks.instructional_start)} – {clockLabel(clockPlus(clocks.instructional_start, result.offsets.end))}
          </b>{" "}
          · {formatMinutes(result.offsets.end)} in all
          {result.offsets.dropinStart > result.offsets.instructionalEnd
            ? ` · ${formatMinutes(result.offsets.dropinStart - result.offsets.instructionalEnd)} break`
            : " · drop-in starts right after the lesson"}
        </p>
      )}
    </div>
  );
}
