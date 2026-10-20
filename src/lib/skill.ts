import type { SkillLevel } from "@/lib/types";

/**
 * The one skill scale: players pick their own rank on their profile, hosts can
 * overrule it with a rating after watching them play. Weakest first.
 */
export const SKILL_RANKS: readonly { value: SkillLevel; label: string; blurb: string }[] = [
  { value: 1, label: "Beginner", blurb: "Little or no volleyball experience. Happy to learn the basics and have fun." },
  { value: 2, label: "Learning", blurb: "Can serve most of the time, do a basic set, and bump the ball to a teammate. Knows the basic rules." },
  { value: 3, label: "Comfortable", blurb: "Passes with decent technique some of the time, understands most rules, and moves well in a basic defense. Starting to learn rotations." },
  { value: 4, label: "Strong", blurb: "Understands offence and defence in most systems. Smooth touch and court movement, and keeps the ball in play." },
  { value: 5, label: "Advanced", blurb: "Strong all-round fundamentals: blocks, attacks and a reliable pass or set. Plays competitively." },
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
