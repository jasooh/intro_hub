import type { ReactNode } from "react";
import { Mark, type Tone } from "@/components/ui";

const glyphFor: Record<Tone, string> = { ok: "●", warn: "◐", bad: "✕", mat: "○", muted: "○", line: "●" };

/** One health check as a ruled row: what, its state, and a line of detail. */
export function Check({ label, tone, status, detail }: { label: string; tone: Tone; status: string; detail: ReactNode }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-3">
      <span className="w-full font-display text-lg font-bold tracking-wide uppercase sm:w-60 sm:shrink-0">{label}</span>
      <Mark tone={tone} glyph={glyphFor[tone]} className="w-32 shrink-0">
        {status}
      </Mark>
      <span className="min-w-0 flex-1 text-ink-soft">{detail}</span>
    </li>
  );
}

/** A stored JSON value, pretty-printed and scrollable. */
export function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-80 overflow-auto border-2 border-ink/20 bg-maple-deep/40 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
