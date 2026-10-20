import { describe, expect, it } from "vitest";
import { blockOffsets, clockPlus, formatMinutes } from "@/lib/session-times";

const ok = (c: Parameters<typeof blockOffsets>[0]) => {
  const r = blockOffsets(c);
  if ("error" in r) throw new Error(r.error);
  return r.offsets;
};

describe("blockOffsets", () => {
  it("an evening: lesson, a break, then drop-in", () => {
    expect(ok({ instructional_start: "20:00", instructional_end: "20:45", dropin_start: "21:00", dropin_end: "23:45" })).toEqual({
      instructionalEnd: 45,
      dropinStart: 60,
      end: 225,
    });
  });

  it("drop-in straight after the lesson, ending past midnight", () => {
    expect(ok({ instructional_start: "21:00", instructional_end: "22:00", dropin_start: "22:00", dropin_end: "00:30" })).toEqual({
      instructionalEnd: 60,
      dropinStart: 60,
      end: 210,
    });
  });

  it("rejects times out of order", () => {
    const bad = (c: Parameters<typeof blockOffsets>[0]) => ("error" in blockOffsets(c) ? blockOffsets(c) : null);
    expect(bad({ instructional_start: "20:00", instructional_end: "20:00", dropin_start: "21:00", dropin_end: "22:00" })).toEqual({
      error: "Instructional has to end after it starts",
    });
    expect(bad({ instructional_start: "20:00", instructional_end: "21:00", dropin_start: "20:30", dropin_end: "22:00" })).toEqual({
      error: "Drop-in has to start after instructional ends",
    });
    expect(bad({ instructional_start: "20:00", instructional_end: "21:00", dropin_start: "21:00", dropin_end: "21:00" })).toEqual({
      error: "Drop-in has to end after it starts",
    });
    expect(bad({ instructional_start: "20:00", instructional_end: "", dropin_start: "21:00", dropin_end: "22:00" })).toEqual({
      error: "Fill in all four times",
    });
  });
});

describe("helpers", () => {
  it("clockPlus wraps past midnight; formatMinutes reads naturally", () => {
    expect(clockPlus("23:30", 45)).toBe("00:15");
    expect(clockPlus("20:00:00", 225)).toBe("23:45");
    expect(formatMinutes(225)).toBe("3 h 45 min");
    expect(formatMinutes(45)).toBe("45 min");
    expect(formatMinutes(120)).toBe("2 h");
  });
});
