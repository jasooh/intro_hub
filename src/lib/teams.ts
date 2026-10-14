import type { SkillLevel } from "@/lib/types";

// Higher = more experienced. "Prefer not to say" sits in the middle.
const SKILL_RANK: Record<SkillLevel | "unknown", number> = {
  experienced: 3,
  some: 2,
  prefer_not: 1.5,
  unknown: 1.5,
  never: 1,
};

/** Default team count for a session: one team per 6 drop-in spots, at least 2. */
export function defaultTeamCount(capacity: number) {
  return Math.max(2, Math.round(capacity / 6));
}

/**
 * Splits players into `teamCount` teams of near-equal size with skill spread
 * evenly: sort strongest first (ties shuffled), then deal in a snake order
 * 1,2,3,3,2,1,... so no team keeps getting the first pick.
 */
export function balanceTeams<T extends { id: string; skill: SkillLevel | null }>(
  players: T[],
  teamCount: number,
  random: () => number = Math.random,
): T[][] {
  const n = Math.max(1, Math.floor(teamCount));
  const shuffled = players
    .map((p) => ({ p, tie: random() }))
    .sort((a, b) => SKILL_RANK[b.p.skill ?? "unknown"] - SKILL_RANK[a.p.skill ?? "unknown"] || a.tie - b.tie)
    .map((x) => x.p);

  const teams: T[][] = Array.from({ length: n }, () => []);
  shuffled.forEach((p, i) => {
    const round = Math.floor(i / n);
    const slot = i % n;
    teams[round % 2 === 0 ? slot : n - 1 - slot].push(p);
  });
  return teams;
}
