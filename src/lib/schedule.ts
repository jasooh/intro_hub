// Game schedule for a session's teams: a round robin (every team plays every
// other team once), laid out in time slots across the courts.

export type Pairing = { slot: number; court: number; a: string; b: string };

/**
 * Every team plays every other team once, packed into as few time slots as the
 * courts allow, with nobody in two games at once.
 *
 * The games come from the circle method (fix the first team, rotate the rest,
 * pair from both ends; an odd count gives one team a bye per round). Slots are
 * then filled greedily across rounds rather than round by round, so a round
 * that doesn't divide evenly by the courts doesn't leave a court empty while
 * teams wait. Each slot takes, in order of preference: games whose teams have
 * the most games left (so nobody is left with a long run of back-to-back games
 * at the end), then teams that have waited longest, then circle order.
 */
export function roundRobin(teamIds: string[], courts: number): Pairing[] {
  if (teamIds.length < 2) return [];
  const perSlot = Math.max(1, Math.min(Math.floor(courts), Math.floor(teamIds.length / 2)));

  let ring: (string | null)[] = teamIds.length % 2 ? [...teamIds, null] : [...teamIds];
  const n = ring.length;
  const games: { a: string; b: string; order: number }[] = [];
  for (let round = 0; round < n - 1; round++) {
    for (let i = 0; i < n / 2; i++) {
      const a = ring[i];
      const b = ring[n - 1 - i];
      if (a && b) games.push({ a, b, order: games.length });
    }
    ring = [ring[0], ring[n - 1], ...ring.slice(1, n - 1)];
  }

  const left = new Map(teamIds.map((t) => [t, teamIds.length - 1]));
  const lastSlot = new Map(teamIds.map((t) => [t, 0]));
  const out: Pairing[] = [];
  let remaining = games;
  for (let slot = 1; remaining.length > 0; slot++) {
    const busy = new Set<string>();
    const ranked = [...remaining].sort(
      (x, y) =>
        left.get(y.a)! + left.get(y.b)! - (left.get(x.a)! + left.get(x.b)!) ||
        lastSlot.get(x.a)! + lastSlot.get(x.b)! - (lastSlot.get(y.a)! + lastSlot.get(y.b)!) ||
        x.order - y.order,
    );
    const picked: typeof games = [];
    for (const g of ranked) {
      if (picked.length === perSlot) break;
      if (busy.has(g.a) || busy.has(g.b)) continue;
      picked.push(g);
      busy.add(g.a).add(g.b);
    }
    picked.forEach((g, c) => {
      out.push({ slot, court: c + 1, a: g.a, b: g.b });
      for (const t of [g.a, g.b]) {
        left.set(t, left.get(t)! - 1);
        lastSlot.set(t, slot);
      }
    });
    remaining = remaining.filter((g) => !picked.includes(g));
  }
  return out;
}

/** Fewest slots any schedule could use: every court busy every slot. */
export function minimumSlots(teamCount: number, courts: number) {
  if (teamCount < 2) return 0;
  const perSlot = Math.max(1, Math.min(Math.floor(courts), Math.floor(teamCount / 2)));
  return Math.ceil((teamCount * (teamCount - 1)) / 2 / perSlot);
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
