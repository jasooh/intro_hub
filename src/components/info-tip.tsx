import type { ReactNode } from "react";

/**
 * A small "?" that shows a short explanation on hover, focus or tap. On
 * phones the tip is pinned to the bottom of the screen so it never runs off
 * the edge; from `sm` it floats above the button.
 * Keep it outside a <label>, or tapping it also activates the field.
 */
export function InfoTip({ title, label, children }: { title: string; label?: string; children: ReactNode }) {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label={`About ${title}`}
        className="inline-flex items-center gap-1.5 text-ink-soft hover:text-line focus:text-line focus:outline-none"
      >
        {label && <span className="underline decoration-dotted underline-offset-2">{label}</span>}
        <span
          aria-hidden
          className="inline-flex size-5 items-center justify-center rounded-full border-2 border-current font-display text-xs font-black"
        >
          ?
        </span>
      </button>
      <span
        role="tooltip"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-30 border-2 border-ink bg-[#f7ecd6] p-3 text-left text-sm font-normal tracking-normal text-ink normal-case opacity-0 shadow-[4px_4px_0_var(--ink)] transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 sm:absolute sm:inset-x-auto sm:bottom-full sm:left-0 sm:mb-3 sm:w-80"
      >
        <b className="mb-1 block font-display tracking-wide uppercase">{title}</b>
        {children}
      </span>
    </span>
  );
}
