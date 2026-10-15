import { describe, expect, it } from "vitest";
import { roundRobin, sittingOut, slotTimes } from "@/lib/schedule";

const teams = (n: number) => Array.from({ length: n }, (_, i) => `t${i + 1}`);

describe("roundRobin", () => {
  for (let n = 2; n <= 8; n++) {
    for (let courts = 1; courts <= 3; courts++) {
      it(`${n} teams on ${courts} court(s): every pair once, nobody twice in a slot`, () => {
        const games = roundRobin(teams(n), courts);
        const pairs = games.map((g) => [g.a, g.b].sort().join("-"));
        expect(pairs.length).toBe((n * (n - 1)) / 2);
        expect(new Set(pairs).size).toBe(pairs.length);

        const bySlot = Map.groupBy(games, (g) => g.slot);
        for (const slot of bySlot.values()) {
          expect(slot.length).toBeLessThanOrEqual(courts);
          const playing = slot.flatMap((g) => [g.a, g.b]);
          expect(new Set(playing).size).toBe(playing.length);
          expect(slot.map((g) => g.court)).toEqual(slot.map((_, i) => i + 1));
        }
        // Slots are numbered 1..N with no gaps.
        expect([...bySlot.keys()]).toEqual(Array.from({ length: bySlot.size }, (_, i) => i + 1));
      });
    }
  }

  it("gives each team one bye per round with an odd count", () => {
    const games = roundRobin(teams(5), 3);
    // 5 teams: 5 rounds of 2 games, each round one team sits out.
    expect(Map.groupBy(games, (g) => g.slot).size).toBe(5);
    const byes = [...Map.groupBy(games, (g) => g.slot).values()].map((slot) =>
      sittingOut(
        teams(5),
        slot.map((g) => ({ team_a_id: g.a, team_b_id: g.b })),
      ),
    );
    expect(byes.every((b) => b.length === 1)).toBe(true);
    expect(new Set(byes.flat()).size).toBe(5);
  });

  it("needs at least two teams", () => {
    expect(roundRobin(teams(1), 2)).toEqual([]);
  });
});

describe("slotTimes", () => {
  it("counts up by the game length, or gives nothing without one", () => {
    expect(slotTimes("2026-10-17T01:00:00.000Z", 15, 3)).toEqual([
      "2026-10-17T01:00:00.000Z",
      "2026-10-17T01:15:00.000Z",
      "2026-10-17T01:30:00.000Z",
    ]);
    expect(slotTimes("2026-10-17T01:00:00.000Z", null, 3)).toBeNull();
  });
});
