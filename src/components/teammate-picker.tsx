"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export type TeammateOption = { id: string; name: string };

/**
 * Pick up to `max` players (already signed up for drop-in) to be teamed with.
 * Submits as repeated hidden `name` inputs.
 */
export function TeammatePicker({
  options,
  defaultSelected = [],
  name = "teammates",
  max = 2,
}: {
  options: TeammateOption[];
  defaultSelected?: string[];
  name?: string;
  max?: number;
}) {
  const [selected, setSelected] = useState(defaultSelected.filter((id) => options.some((o) => o.id === id)));
  const nameOf = (id: string) => options.find((o) => o.id === id)?.name ?? "";
  const remaining = options.filter((o) => !selected.includes(o.id));

  // Tell the form (SubmitButton requireChange) once the hidden inputs reflect the change.
  const root = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    root.current?.dispatchEvent(new Event("change", { bubbles: true }));
  }, [selected]);

  if (options.length === 0) {
    return <p className="text-sm text-ink-soft">No one else is signed up for drop-in yet. You can add teammates later.</p>;
  }

  return (
    <div ref={root} className="space-y-2">
      {selected.map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}
      <div className="flex flex-wrap items-center gap-2">
        {selected.map((id) => (
          <span key={id} className="inline-flex items-center gap-1.5 border-2 border-ink bg-[#fbf3e3] py-0.5 pr-1 pl-2.5">
            <span className="font-semibold">{nameOf(id)}</span>
            <button
              type="button"
              aria-label={`Remove ${nameOf(id)}`}
              onClick={() => setSelected(selected.filter((x) => x !== id))}
              className="inline-flex size-6 items-center justify-center text-ink-soft hover:text-bad"
            >
              <X className="size-4" aria-hidden />
            </button>
          </span>
        ))}
        {selected.length < max && remaining.length > 0 && (
          <select
            aria-label="Add a teammate"
            value=""
            onChange={(e) => {
              if (e.target.value) setSelected([...selected, e.target.value]);
            }}
            className="min-w-0 border-0 border-b-2 border-ink bg-transparent py-1 pr-7 pl-0 font-display text-sm font-bold tracking-wide uppercase focus:border-line focus:ring-0"
          >
            <option value="">+ Add a teammate</option>
            {remaining.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
