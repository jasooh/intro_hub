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

describe("balanceTeams with team requests", () => {
  const skills: SkillLevel[] = ["experienced", "some", "never", "some", "experienced", "never"];
  const roster = (count: number) => Array.from({ length: count }, (_, i) => player(`p${i}`, skills[i % skills.length]));
  const teamOf = (teams: { id: string }[][], id: string) => teams.findIndex((t) => t.some((p) => p.id === id));

  it("keeps requested pairs and trios together (one-way is enough)", () => {
    const teams = balanceTeams(roster(12), 3, Math.random, [
      { from: "p0", to: "p1" },
      { from: "p2", to: "p3" },
      { from: "p3", to: "p4" }, // p2-p3-p4 chain
    ]);
    expect(teamOf(teams, "p0")).toBe(teamOf(teams, "p1"));
    expect(teamOf(teams, "p2")).toBe(teamOf(teams, "p3"));
    expect(teamOf(teams, "p3")).toBe(teamOf(teams, "p4"));
  });

  it("still uses everyone once and keeps team sizes within one", () => {
    for (let run = 0; run < 25; run++) {
      const teams = balanceTeams(roster(17), 3, Math.random, [
        { from: "p0", to: "p1" },
        { from: "p5", to: "p6" },
        { from: "p6", to: "p7" },
      ]);
      expect(new Set(teams.flat().map((p) => p.id)).size).toBe(17);
      const sizes = teams.map((t) => t.length);
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
    }
  });

  it("splits a group too big for one team", () => {
    const players = roster(6);
    const everyone = players.slice(1).map((p) => ({ from: "p0", to: p.id }));
    const teams = balanceTeams(players, 2, () => 0.5, everyone);
    expect(teams.map((t) => t.length).sort()).toEqual([3, 3]);
  });

  it("ignores requests for people who aren't playing", () => {
    const players = roster(6);
    const withGhost = balanceTeams(players, 2, () => 0.5, [{ from: "p0", to: "someone-else" }]);
    expect(withGhost).toEqual(balanceTeams(players, 2, () => 0.5));
  });
});
