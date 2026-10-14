"use client";

import { FlashOnSettle } from "@/components/flash-toaster";
import type { Team } from "@/lib/types";

/**
 * Team dropdown that saves as soon as the host picks a team.
 * `move` shows a compact "Move" picker listing only the other options.
 */
export function TeamSelect({
  action,
  teams,
  current,
  mode = "assign",
}: {
  action: (formData: FormData) => Promise<void>;
  teams: Pick<Team, "id" | "name">[];
  current: string | null;
  mode?: "assign" | "move";
}) {
  const move = mode === "move";
  return (
    <form action={action} className="min-w-0 shrink-0">
      <select
        name="team_id"
        defaultValue={move ? "__" : (current ?? "")}
        aria-label={move ? "Move to team" : "Team"}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className={`min-w-0 truncate border-0 border-b-2 border-ink bg-transparent py-1 pr-6 pl-0 font-display text-sm font-bold tracking-wide uppercase focus:border-line focus:ring-0 ${
          move ? "w-[5.75rem] text-ink-soft" : "w-full max-w-40"
        }`}
      >
        {move && (
          <option value="__" disabled>
            Move
          </option>
        )}
        {(!move || current) && <option value="">No team</option>}
        {teams
          .filter((t) => !move || t.id !== current)
          .map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
      </select>
      <FlashOnSettle />
    </form>
  );
}
