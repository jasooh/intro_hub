"use client";

import { Dropdown } from "@/components/dropdown";
import { FlashOnSettle } from "@/components/flash-toaster";
import { HOST_RATINGS, skillLevel } from "@/lib/teams";
import type { SkillLevel } from "@/lib/types";

/** Short versions of the profile's skill answers, for the "their pick" option. */
const OWN_WORDS: Record<SkillLevel, string> = {
  never: "never played",
  some: "some experience",
  experienced: "experienced",
  prefer_not: "didn't say",
};

/**
 * A host's 1–5 rating for a player, saved as soon as it's picked. "Their pick"
 * clears it, so balancing goes back to the level the player chose. `compact`
 * shows just the number (orange when a host set it), for team rows.
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
  const ownLabel = skill ? OWN_WORDS[skill] : "not given";
  return (
    <form action={action} className="min-w-0 shrink-0">
      <Dropdown
        name="rating"
        submitOnChange
        label={`Skill rating (${rating ? `host: ${rating}` : `their pick: ${own}`})`}
        look={compact ? "compact" : "field"}
        defaultValue={rating ? String(rating) : ""}
        className={compact ? `w-12 ${rating ? "text-line" : "text-ink-soft"}` : "w-full max-w-64"}
        options={[
          { value: "", label: `Their pick: ${own} (${ownLabel})`, short: compact ? String(own) : `Their pick: ${own}` },
          ...HOST_RATINGS.map((r) => ({ value: String(r.value), label: `${r.value} · ${r.label}`, short: compact ? String(r.value) : undefined })),
        ]}
      />
      <FlashOnSettle />
    </form>
  );
}
