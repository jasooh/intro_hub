// Game schedule for a session's teams: a round robin (every team plays every
// other team once), laid out in time slots across the courts.

export type Pairing = { slot: number; court: number; a: string; b: string };

/**
 * Circle method: fix the first team, rotate the rest, pair from both ends.
 * An odd team count adds a bye, so one team sits out each round. Each round
 * then fills slots of at most `courts` games, so nobody plays twice at once.
 */
export function roundRobin(teamIds: string[], courts: number): Pairing[] {
  if (teamIds.length < 2) return [];
  const perSlot = Math.max(1, Math.floor(courts));
  let ring: (string | null)[] = teamIds.length % 2 ? [...teamIds, null] : [...teamIds];
  const n = ring.length;
  const out: Pairing[] = [];
  let slot = 0;

  for (let round = 0; round < n - 1; round++) {
    const games: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = ring[i];
      const b = ring[n - 1 - i];
      if (a && b) games.push([a, b]);
    }
    for (let i = 0; i < games.length; i += perSlot) {
      slot += 1;
      games.slice(i, i + perSlot).forEach(([a, b], c) => out.push({ slot, court: c + 1, a, b }));
    }
    ring = [ring[0], ring[n - 1], ...ring.slice(1, n - 1)];
  }
  return out;
}

/** Start time of each slot (1-based index - 1), counting up from `startIso`; null without a game length. */
export function slotTimes(startIso: string, minutes: number | null, slots: number): string[] | null {
  if (!minutes) return null;
  const start = new Date(startIso).getTime();
  return Array.from({ length: slots }, (_, i) => new Date(start + i * minutes * 60_000).toISOString());
}

/** Teams with no game in this slot. */
export function sittingOut(teamIds: string[], games: { team_a_id: string; team_b_id: string }[]) {
  const playing = new Set(games.flatMap((g) => [g.team_a_id, g.team_b_id]));
  return teamIds.filter((id) => !playing.has(id));
}
