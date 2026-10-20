import { describe, expect, it } from "vitest";
import { customDates, statWindow } from "@/lib/stats";

describe("stats ranges", () => {
  it("custom dates must both be YYYY-MM-DD; backwards ranges are swapped", () => {
    expect(customDates("2026-09-01", "2026-10-01")).toEqual({ from: "2026-09-01", to: "2026-10-01" });
    expect(customDates("2026-10-01", "2026-09-01")).toEqual({ from: "2026-09-01", to: "2026-10-01" });
    expect(customDates("2026-10-01", undefined)).toBeNull();
    expect(customDates("Oct 1", "2026-10-02")).toBeNull();
  });

  it("presets count back from now", () => {
    const now = Date.parse("2026-10-20T12:00:00Z");
    expect(statWindow("1y", now).from.toISOString()).toBe("2025-10-20T12:00:00.000Z");
    expect(statWindow("6m", now).from.toISOString()).toBe("2026-04-21T12:00:00.000Z");
  });
});
