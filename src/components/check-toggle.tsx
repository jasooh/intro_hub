"use client";

import { Check } from "lucide-react";
import { useFormStatus } from "react-dom";
import { useFlashOnSettle } from "@/components/flash-toaster";

/**
 * A square scoresheet checkbox that submits its form (put it inside a <form>
 * whose action flips the state). Shows the new state while the action runs.
 */
export function CheckToggle({ checked, label }: { checked: boolean; label: string }) {
  const { pending } = useFormStatus();
  useFlashOnSettle();
  const shown = pending ? !checked : checked;
  return (
    <button
      type="submit"
      role="checkbox"
      aria-checked={shown}
      aria-label={label}
      title={label}
      disabled={pending}
      className={`grid size-8 shrink-0 place-items-center border-2 transition-colors disabled:opacity-60 ${
        shown ? "border-ink bg-line text-maple" : "border-ink bg-transparent text-transparent hover:bg-maple-deep"
      }`}
    >
      <Check className="size-5" strokeWidth={3} aria-hidden />
    </button>
  );
}
