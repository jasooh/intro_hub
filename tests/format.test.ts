import { describe, expect, it } from "vitest";
import { utcToZonedLocal, zonedLocalToUtc } from "@/lib/format";

describe("zonedLocalToUtc", () => {
  it("handles EDT and EST", () => {
    expect(zonedLocalToUtc("2026-07-11T18:00", "America/Toronto").toISOString()).toBe("2026-07-11T22:00:00.000Z");
    expect(zonedLocalToUtc("2026-12-12T18:00", "America/Toronto").toISOString()).toBe("2026-12-12T23:00:00.000Z");
  });

  it("round-trips", () => {
    for (const local of ["2026-03-08T12:00", "2026-11-01T09:30", "2026-10-17T18:00"]) {
      const utc = zonedLocalToUtc(local, "America/Vancouver").toISOString();
      expect(utcToZonedLocal(utc, "America/Vancouver")).toBe(local);
    }
  });
});
