"use client";

import { Dropdown } from "@/components/dropdown";
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
      <Dropdown
        name="team_id"
        submitOnChange
        label={move ? "Move to team" : "Team"}
        look="compact"
        placeholder={move ? "Move" : "No team"}
        // "Move" mode starts on no choice (shows "Move"); picking "No team" ("") still counts as a change.
        defaultValue={move ? "__move" : (current ?? "")}
        className={move ? "w-[5.75rem] text-ink-soft" : "w-full max-w-40"}
        options={[
          ...(!move || current ? [{ value: "", label: "No team" }] : []),
          ...teams.filter((t) => !move || t.id !== current).map((t) => ({ value: t.id, label: t.name })),
        ]}
      />
      <FlashOnSettle />
    </form>
  );
}
