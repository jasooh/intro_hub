import type { SkillLevel } from "@/lib/types";

/**
 * The one skill scale: players pick their own rank on their profile, hosts can
 * overrule it with a rating after watching them play. Weakest first.
 */
export const SKILL_RANKS: readonly { value: SkillLevel; label: string; blurb: string }[] = [
  { value: 1, label: "Beginner", blurb: "Never played, or only in gym class. Learning to bump and serve." },
  { value: 2, label: "Learning", blurb: "Played here and there. Can keep a rally going sometimes." },
  { value: 3, label: "Comfortable", blurb: "Play fairly often. Pass, set and serve over most of the time." },
  { value: 4, label: "Strong", blurb: "Played on a team or in a league. Consistent, can hit and read the play." },
  { value: 5, label: "Advanced", blurb: "Competitive experience (school, club, rep). Solid at every skill." },
];

/** Used for balancing when a player has no rank at all. */
export const DEFAULT_SKILL: SkillLevel = 2;

export function skillLabel(value: number | null | undefined) {
  return SKILL_RANKS.find((r) => r.value === value)?.label ?? null;
}

/** "3 · Comfortable" */
export function skillName(value: number | null | undefined) {
  const label = skillLabel(value);
  return label ? `${value} · ${label}` : null;
}
