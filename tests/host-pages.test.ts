import { describe, expect, it } from "vitest";
import { HOST_GROUPS, needsAttention } from "@/lib/host-pages";

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
