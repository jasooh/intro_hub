import { describe, expect, it } from "vitest";
import { customDates, fillByDate, statWindow, type SessionStat } from "@/lib/stats";

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

describe("stats helpers", () => {
  it("formats durations", async () => {
    const { formatDuration } = await import("@/lib/stats");
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(200)).toBe("3 h 20 min");
    expect(formatDuration(120)).toBe("2 h");
    expect(formatDuration(3000)).toBe("2 days 2 h");
  });

  it("finds the busiest 3-hour stretch, wrapping past midnight", async () => {
    const { busiestWindow } = await import("@/lib/stats");
    expect(busiestWindow([{ dow: 2, hour: 20, count: 3 }])).toBeNull(); // too few to say
    const cells = [
      { dow: 2, hour: 20, count: 6 },
      { dow: 2, hour: 21, count: 5 },
      { dow: 2, hour: 22, count: 1 },
      { dow: 5, hour: 9, count: 2 },
    ];
    expect(busiestWindow(cells)).toMatchObject({ label: "Tue 8–11 pm", count: 12 });
    expect(busiestWindow([{ dow: 6, hour: 23, count: 6 }, { dow: 0, hour: 0, count: 6 }])?.label).toBe("Sat 10 pm–1 am");
  });

  it("lays the heatmap out Monday first", async () => {
    const { heatGrid } = await import("@/lib/stats");
    const g = heatGrid([{ dow: 0, hour: 9, count: 4 }, { dow: 1, hour: 20, count: 2 }]);
    expect(g.rows[0].dow).toBe(1);
    expect(g.rows[6].hours[9]).toBe(4);
    expect(g.max).toBe(4);
    expect(g.total).toBe(6);
  });
});

describe("fillByDate", () => {
  const base = { id: "x", title: "T", status: "scheduled", capacity: 10, confirmed: 0, holding: 0, instructional: 0, waitlisted: 0, expired: 0, collected: 0, owed: 0, minutes_to_full: null, first_hour_pct: null, first_day_pct: null };
  const session = (starts_at: string, over: Partial<SessionStat> = {}) => ({ ...base, starts_at, ...over }) as SessionStat;
  const now = Date.parse("2026-10-20T12:00:00Z");

  it("lists played sessions oldest first with the percent paid", () => {
    const rows = fillByDate(
      [session("2026-10-17T22:00:00Z", { confirmed: 10, waitlisted: 3 }), session("2026-10-03T22:00:00Z", { confirmed: 4 })],
      now,
      "America/Toronto",
    );
    expect(rows.map((r) => [r.label, r.value])).toEqual([["Oct 3", 40], ["Oct 17", 100]]);
    expect(rows[1].detail).toBe("10/10 paid · 3 waitlisted");
  });

  it("skips upcoming, cancelled and zero-capacity sessions, and caps at 100", () => {
    const rows = fillByDate(
      [
        session("2026-10-27T22:00:00Z", { confirmed: 5 }),
        session("2026-10-10T22:00:00Z", { status: "cancelled", confirmed: 5 }),
        session("2026-10-11T22:00:00Z", { capacity: 0 }),
        session("2026-10-12T22:00:00Z", { confirmed: 12 }),
      ],
      now,
      "America/Toronto",
    );
    expect(rows.map((r) => r.value)).toEqual([100]);
  });
});
