import { describe, expect, it } from "vitest";
import { HOST_GROUPS, needsAttention } from "@/lib/host-pages";
import { coverNote, nestSplits } from "@/lib/pay-for-friends";

describe("host pages", () => {
  it("list every admin page once", () => {
    const hrefs = HOST_GROUPS.flatMap((g) => g.links.map((l) => l.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(hrefs).toContain("/admin/refunds");
  });

  it("only count to-dos for the avatar dot (owed money is a reminder)", () => {
    expect(needsAttention({ payments: 0, owed: 7, refunds: 0, feedback: 0, messages: 0 })).toBe(0);
    expect(needsAttention({ payments: 2, owed: 7, refunds: 1, feedback: 1, messages: 3 })).toBe(7);
  });
});

describe("pay for friends, host views", () => {
  const rows = [
    { id: "a", status: "confirmed", covered_by: null },
    { id: "b", status: "pending_payment", covered_by: "a" },
    { id: "c", status: "confirmed", covered_by: "a" },
    { id: "d", status: "cancelled", covered_by: "a" },
  ] as const;
  const names: Record<string, string> = { a: "Alex", b: "Blake", c: "Casey", d: "Dana" };
  const nameOf = (id: string) => names[id];

  it("labels who is covering whom", () => {
    expect(coverNote(rows[1], [...rows], nameOf)).toBe("Alex is covering");
    expect(coverNote(rows[2], [...rows], nameOf)).toBe("Paid by Alex");
    expect(coverNote(rows[0], [...rows], nameOf)).toBe("Paying for Blake, Casey");
    expect(coverNote(rows[3], [...rows], nameOf)).toBeUndefined();
  });

  it("nests split shares under their e-Transfer", () => {
    const payments = [
      { id: "p1", split_from: null },
      { id: "s1", split_from: "p1" },
      { id: "p2", split_from: null },
      { id: "s2", split_from: "gone" }, // its e-Transfer was filtered out: show it on its own
    ];
    expect(nestSplits(payments).map((p) => [p.id, p.splits.map((s) => s.id)])).toEqual([
      ["p1", ["s1"]],
      ["p2", []],
      ["s2", []],
    ]);
  });
});
