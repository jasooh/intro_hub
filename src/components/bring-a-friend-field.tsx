"use client";

import { useEffect, useRef, useState } from "react";
import { InfoTip } from "@/components/info-tip";
import { PlayerSearch } from "@/components/player-search";

/**
 * "Did a friend bring you?" for first-time players (Bring a Friend), with a
 * "?" that explains the rate. Search the players who are signed up instead of
 * scrolling a long dropdown. Submits `brought_by` (empty = nobody). Used on the
 * sign-up form and in "Your spot".
 */
export function BringAFriendField({
  id,
  options,
  defaultValue = "",
  hint,
  optional = false,
}: {
  /** Unique per page: ties the label to the search box. */
  id: string;
  options: { id: string; name: string }[];
  defaultValue?: string;
  hint: string;
  optional?: boolean;
}) {
  const [chosen, setChosen] = useState(defaultValue);
  const name = options.find((o) => o.id === chosen)?.name;

  // Tell the form (SubmitButton requireChange) once the hidden input changed.
  const root = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    root.current?.dispatchEvent(new Event("change", { bubbles: true }));
  }, [chosen]);

  return (
    <div ref={root} className="space-y-1.5">
      <input type="hidden" name="brought_by" value={chosen} />
      <div className="flex items-center gap-2">
        <span id={`${id}-label`} className="font-display text-sm font-bold tracking-[0.15em] text-ink uppercase">
          Did a friend bring you?{optional && " (optional)"}
        </span>
        <InfoTip title="Bring a Friend">
          <span className="block">
            First time at Intro 2 Volleyball? If a regular brought you, pick them here and{" "}
            <b>you both pay half</b> for this session.
          </span>
          <span className="mt-1.5 block text-ink-soft">
            Only for first-time players. If your friend can&apos;t make it, you still keep your half price.
          </span>
        </InfoTip>
      </div>
      {name ? (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1.5 border-2 border-ink bg-[#fbf3e3] px-2.5 py-0.5 font-semibold [overflow-wrap:anywhere]">
            {name}
          </span>
          <button
            type="button"
            onClick={() => setChosen("")}
            className="text-sm underline decoration-line decoration-2 underline-offset-4 hover:text-line"
          >
            Change / nobody
          </button>
        </p>
      ) : (
        <PlayerSearch
          label="Did a friend bring you? Search the players signed up"
          placeholder="Search who brought you (or leave blank)"
          options={options}
          onPick={(o) => setChosen(o.id)}
        />
      )}
      <span className="block text-sm text-ink-soft">{hint}</span>
    </div>
  );
}
