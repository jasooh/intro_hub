"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PlayerSearch } from "@/components/player-search";
import { MAX_TEAMMATES } from "@/lib/teams";

export type TeammateOption = { id: string; name: string };

/**
 * Pick up to `max` players (already signed up for drop-in) to be teamed with.
 * Submits as repeated hidden `name` inputs.
 */
export function TeammatePicker({
  options,
  defaultSelected = [],
  name = "teammates",
  max = MAX_TEAMMATES,
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
      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {selected.map((id) => (
            <span key={id} className="inline-flex items-center gap-1.5 border-2 border-ink bg-[#fbf3e3] py-0.5 pr-1 pl-2.5">
              <span className="font-semibold">{nameOf(id)}</span>
              <button
                type="button"
                aria-label={`Remove ${nameOf(id)}`}
                onClick={() => setSelected(selected.filter((x) => x !== id))}
                className="-my-1 inline-flex size-9 items-center justify-center text-ink-soft hover:text-bad sm:my-0 sm:size-6"
              >
                <X className="size-4" aria-hidden />
              </button>
            </span>
          ))}
        </div>
      )}
      {selected.length < max && remaining.length > 0 && (
        <PlayerSearch
          label="Add a teammate"
          placeholder="+ Add a teammate: search by name"
          options={remaining}
          onPick={(o) => setSelected([...selected, o.id])}
        />
      )}
    </div>
  );
}
