import type { SkillLevel } from "@/lib/types";

// Higher = more experienced. "Prefer not to say" sits in the middle.
const SKILL_RANK: Record<SkillLevel | "unknown", number> = {
  experienced: 3,
  some: 2,
  prefer_not: 1.5,
  unknown: 1.5,
  never: 1,
};

type Player = { id: string; skill: SkillLevel | null };

/** Most teammates one player can ask for: enough to bring a whole team. Also enforced in set_team_requests(). */
export const MAX_TEAMMATES = 5;

/** "from asked to play with to" (one-way is enough to group them). */
export type TeamRequest = { from: string; to: string };

/** Default team count for a session: one team per 6 drop-in spots, at least 2. */
export function defaultTeamCount(capacity: number) {
  return Math.max(2, Math.round(capacity / 6));
}

const rank = (p: Player) => SKILL_RANK[p.skill ?? "unknown"];

/** Strongest first, ties shuffled. */
function bySkill<T extends Player>(players: T[], random: () => number) {
  return players
    .map((p) => ({ p, tie: random() }))
    .sort((a, b) => rank(b.p) - rank(a.p) || a.tie - b.tie)
    .map((x) => x.p);
}

/**
 * Splits players into `teamCount` teams of near-equal size with skill spread
 * evenly.
 *
 * Without requests: sort strongest first (ties shuffled), then deal in a snake
 * order 1,2,3,3,2,1,... so no team keeps getting the first pick.
 *
 * With requests: players who asked to play together are grouped and placed
 * first, each group kept whole if it fits on one team, onto the team with the
 * fewest players (then the lowest skill total); everyone else is then dealt
 * strongest-first the same way.
 */
export function balanceTeams<T extends Player>(
  players: T[],
  teamCount: number,
  random: () => number = Math.random,
  requests: TeamRequest[] = [],
): T[][] {
  const n = Math.max(1, Math.floor(teamCount));
  const teams: T[][] = Array.from({ length: n }, () => []);
  const ids = new Set(players.map((p) => p.id));
  const usable = requests.filter((r) => r.from !== r.to && ids.has(r.from) && ids.has(r.to));

  if (usable.length === 0) {
    bySkill(players, random).forEach((p, i) => {
      const round = Math.floor(i / n);
      const slot = i % n;
      teams[round % 2 === 0 ? slot : n - 1 - slot].push(p);
    });
    return teams;
  }

  // Union-find: anyone linked by a request ends up in the same group.
  const parent = new Map(players.map((p) => [p.id, p.id]));
  const find = (id: string): string => {
    const up = parent.get(id)!;
    if (up === id) return id;
    const root = find(up);
    parent.set(id, root);
    return root;
  };
  for (const r of usable) parent.set(find(r.from), find(r.to));

  const groups = new Map<string, T[]>();
  for (const p of players) {
    const root = find(p.id);
    groups.set(root, [...(groups.get(root) ?? []), p]);
  }

  // Requests come first: a group stays together as long as it fits on one team
  // (a full team's share, rounded up). Only bigger groups are split.
  const maxGroup = Math.max(1, Math.ceil(players.length / n));
  const units: T[][] = [];
  const singles: T[] = [];
  for (const g of groups.values()) {
    if (g.length === 1) {
      singles.push(g[0]);
      continue;
    }
    const sorted = bySkill(g, random);
    for (let i = 0; i < sorted.length; i += maxGroup) {
      const chunk = sorted.slice(i, i + maxGroup);
      if (chunk.length === 1) singles.push(chunk[0]);
      else units.push(chunk);
    }
  }

  const total = (t: T[]) => t.reduce((sum, p) => sum + rank(p), 0);
  const smallestTeam = () =>
    teams.reduce((best, t) => (t.length < best.length || (t.length === best.length && total(t) < total(best)) ? t : best));

  units
    .sort((a, b) => b.length - a.length || total(b) - total(a))
    .forEach((unit) => smallestTeam().push(...unit));
  bySkill(singles, random).forEach((p) => smallestTeam().push(p));
  return teams;
}
