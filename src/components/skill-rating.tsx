"use client";

import { Dropdown } from "@/components/dropdown";
import { FlashOnSettle } from "@/components/flash-toaster";
import { SkillMeter } from "@/components/skill-rank";
import { SKILL_RANKS, skillName } from "@/lib/skill";
import { skillLevel } from "@/lib/teams";
import type { SkillLevel } from "@/lib/types";

/**
 * A host's 1–5 rating for a player, saved as soon as it's picked. "Their pick"
 * clears it, so balancing goes back to the rank the player chose. `compact`
 * shows just the number (orange when a host set it) and a small meter, for team rows.
 */
export function SkillRating({
  action,
  rating,
  skill,
  compact = false,
}: {
  action: (formData: FormData) => Promise<void>;
  rating: number | null;
  skill: SkillLevel | null;
  compact?: boolean;
}) {
  const own = skillLevel(skill, null);
  const shown = skillLevel(skill, rating);
  return (
    <form action={action} className="flex min-w-0 shrink-0 items-center gap-1.5">
      {compact && <SkillMeter value={shown} size="sm" className={rating ? "text-line" : "text-ink-soft"} />}
      <Dropdown
        name="rating"
        submitOnChange
        label={`Skill rating (${rating ? `host: ${skillName(rating)}` : `their pick: ${skillName(own)}`})`}
        look={compact ? "compact" : "field"}
        defaultValue={rating ? String(rating) : ""}
        className={compact ? `w-12 ${rating ? "text-line" : "text-ink-soft"}` : "w-full max-w-64"}
        options={[
          { value: "", label: `Their pick: ${skillName(own)}${skill ? "" : " (not given)"}`, short: compact ? String(own) : `Their pick: ${own}` },
          ...SKILL_RANKS.map((r) => ({ value: String(r.value), label: `${r.value} · ${r.label}`, short: compact ? String(r.value) : undefined })),
        ]}
      />
      <FlashOnSettle />
    </form>
  );
}
