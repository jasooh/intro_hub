import { describe, expect, it } from "vitest";
import { balanceTeams, defaultTeamCount } from "@/lib/teams";
import type { SkillLevel } from "@/lib/types";

const player = (id: string, skill: SkillLevel | null) => ({ id, skill });

describe("balanceTeams", () => {
  it("makes near-equal team sizes and uses everyone once", () => {
    const players = Array.from({ length: 17 }, (_, i) => player(`p${i}`, "some"));
    const teams = balanceTeams(players, 3);
    expect(teams.map((t) => t.length).sort()).toEqual([5, 6, 6]);
    expect(new Set(teams.flat().map((p) => p.id)).size).toBe(17);
  });

  it("spreads experienced players across teams instead of stacking one", () => {
    const players = [
      ...["e1", "e2", "e3"].map((id) => player(id, "experienced")),
      ...["n1", "n2", "n3", "n4", "n5", "n6"].map((id) => player(id, "never")),
    ];
    const teams = balanceTeams(players, 3, () => 0.5);
    for (const team of teams) {
      expect(team.filter((p) => p.skill === "experienced")).toHaveLength(1);
      expect(team.filter((p) => p.skill === "never")).toHaveLength(2);
    }
  });

  it("deals in snake order so the first pick doesn't also get the next best", () => {
    const skills: SkillLevel[] = ["experienced", "experienced", "some", "some", "never", "never"];
    const players = skills.map((s, i) => player(`p${i}`, s));
    const teams = balanceTeams(players, 2, () => 0.5);
    // Round 1: p0 -> A, p1 -> B; round 2 reversed: p2 -> B, p3 -> A.
    expect(teams[0].map((p) => p.id)).toEqual(["p0", "p3", "p4"]);
    expect(teams[1].map((p) => p.id)).toEqual(["p1", "p2", "p5"]);
  });
});

describe("defaultTeamCount", () => {
  it.each([
    [18, 3],
    [12, 2],
    [6, 2],
    [24, 4],
  ])("%i spots -> %i teams", (capacity, expected) => {
    expect(defaultTeamCount(capacity)).toBe(expected);
  });
});
