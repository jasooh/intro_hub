"use client";

import type { Team } from "@/lib/types";

/** Team dropdown that saves as soon as the host picks a team. */
export function TeamSelect({
  action,
  teams,
  current,
}: {
  action: (formData: FormData) => Promise<void>;
  teams: Pick<Team, "id" | "name">[];
  current: string | null;
}) {
  return (
    <form action={action} className="min-w-0 shrink">
      <select
        name="team_id"
        defaultValue={current ?? ""}
        aria-label="Team"
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="w-full max-w-40 min-w-0 truncate border-0 border-b-2 border-ink bg-transparent py-1 pr-6 pl-0 font-display text-sm font-bold tracking-wide uppercase focus:border-line focus:ring-0"
      >
        <option value="">No team</option>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </form>
  );
}
