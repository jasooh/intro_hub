import { describe, expect, it } from "vitest";
import { clockText, elapsed, pauseClock, positionAt, startClock, stepGame, STOPPED } from "@/lib/court";
import { balanceTeams, skillLevel } from "@/lib/teams";

const MIN = 60_000;

describe("court mode", () => {
  it("starts on the game the clock says is on, repeating the rotation", () => {
    const start = Date.UTC(2026, 9, 20, 19);
    expect(positionAt(start, start - MIN, 10, 3)).toEqual({ round: 1, slot: 1 });
    expect(positionAt(start, start + 25 * MIN, 10, 3)).toEqual({ round: 1, slot: 3 });
    expect(positionAt(start, start + 35 * MIN, 10, 3)).toEqual({ round: 2, slot: 1 });
    expect(positionAt(start, start + 35 * MIN, null, 3)).toEqual({ round: 1, slot: 1 });
  });

  it("steps through games and starts the rotation over", () => {
    expect(stepGame({ round: 1, slot: 3 }, 3, 1)).toEqual({ round: 2, slot: 1 });
    expect(stepGame({ round: 2, slot: 1 }, 3, -1)).toEqual({ round: 1, slot: 3 });
    expect(stepGame({ round: 1, slot: 1 }, 3, -1)).toEqual({ round: 1, slot: 1 });
  });

  it("runs the game clock with pauses", () => {
    let c = startClock(STOPPED, 1000);
    expect(elapsed(c, 6000)).toBe(5000);
    c = pauseClock(c, 6000);
    expect(elapsed(c, 60_000)).toBe(5000);
    c = startClock(c, 70_000);
    expect(elapsed(c, 72_000)).toBe(7000);
    expect(clockText(10 * MIN - 500, true)).toBe("10:00");
    expect(clockText(65_400, false)).toBe("1:05");
    expect(clockText(-5, true)).toBe("0:00");
  });
});

describe("host ratings", () => {
  it("replace the player's own pick", () => {
    expect(skillLevel(5, null)).toBe(5);
    expect(skillLevel(5, 2)).toBe(2);
    expect(skillLevel(null, null)).toBe(2);
  });

  it("change how teams balance", () => {
    // Two said 5; the host rated one of them a beginner, so the two
    // strongest by rating (a, c) end up apart.
    const players = [
      { id: "a", skill: 5 as const, rating: 5 },
      { id: "b", skill: 5 as const, rating: 1 },
      { id: "c", skill: 1 as const, rating: 5 },
      { id: "d", skill: 1 as const, rating: 1 },
    ];
    const teams = balanceTeams(players, 2, () => 0.5);
    const teamOf = (id: string) => teams.findIndex((t) => t.some((p) => p.id === id));
    expect(teamOf("a")).not.toBe(teamOf("c"));
    expect(teamOf("b")).not.toBe(teamOf("d"));
  });
});
