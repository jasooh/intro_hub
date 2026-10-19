import { describe, expect, it } from "vitest";
import { calendarDays, zonedDayKey } from "@/lib/format";

const TZ = "America/Toronto";

/** Every date in a year as "YYYY-MM-DD", built from the calendar (not from calendarDays). */
function everyDay(year: number) {
  const lengths = [31, year % 4 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return lengths.flatMap((n, m) =>
    Array.from({ length: n }, (_, d) => `${year}-${String(m + 1).padStart(2, "0")}-${String(d + 1).padStart(2, "0")}`),
  );
}

describe("calendarDays", () => {
  it("starts on the Sunday of this week", () => {
    const days = calendarDays("2026-10-19", 5);
    expect(days).toHaveLength(35);
    expect(days[0].key).toBe("2026-10-18");
    expect(days.at(-1)!.key).toBe("2026-11-21");
  });

  it("crosses into the next year", () => {
    expect(calendarDays("2026-12-30", 1).map((d) => d.key)).toEqual([
      "2026-12-27",
      "2026-12-28",
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
    ]);
  });

  it("includes Feb 29 in a leap year only", () => {
    expect(calendarDays("2028-02-27", 1).map((d) => d.key)).toContain("2028-02-29");
    expect(calendarDays("2027-02-27", 1).map((d) => d.key)).toEqual([
      "2027-02-21",
      "2027-02-22",
      "2027-02-23",
      "2027-02-24",
      "2027-02-25",
      "2027-02-26",
      "2027-02-27",
    ]);
  });

  it("has no skipped or repeated days across clock changes", () => {
    // Toronto springs forward Mar 8 and falls back Nov 1, 2026.
    expect(calendarDays("2026-03-08", 1).map((d) => d.key)).toEqual(everyDay(2026).slice(66, 73));
    expect(calendarDays("2026-11-01", 1).map((d) => d.key)).toEqual(everyDay(2026).slice(304, 311));
  });

  it("is a run of consecutive real dates for any day of the year", () => {
    for (const year of [2026, 2027, 2028]) {
      const all = [...everyDay(year - 1).slice(-7), ...everyDay(year), ...everyDay(year + 1).slice(0, 42)];
      for (const today of everyDay(year)) {
        const days = calendarDays(today, 5);
        const start = all.indexOf(days[0].key);
        expect(days.map((d) => d.key)).toEqual(all.slice(start, start + 35));
        expect(new Date(`${days[0].key}T12:00:00Z`).getUTCDay()).toBe(0);
        expect(days.slice(0, 7).map((d) => d.key)).toContain(today);
        expect(days.every((d) => d.key.endsWith(`-${String(d.day).padStart(2, "0")}`))).toBe(true);
        expect(days.every((d) => d.key.slice(5, 7) === String(d.month + 1).padStart(2, "0"))).toBe(true);
      }
    }
  });
});

describe("zonedDayKey", () => {
  it("puts evening sessions on their local day, not the UTC one", () => {
    expect(zonedDayKey("2026-10-25T00:00:00Z", TZ)).toBe("2026-10-24"); // 8 p.m. EDT
    expect(zonedDayKey("2026-12-13T01:00:00Z", TZ)).toBe("2026-12-12"); // 8 p.m. EST
    expect(zonedDayKey("2027-01-01T01:00:00Z", TZ)).toBe("2026-12-31"); // New Year's Eve
  });

  it("handles the clock-change days", () => {
    expect(zonedDayKey("2026-03-09T00:30:00Z", TZ)).toBe("2026-03-08"); // 8:30 p.m. EDT, first day
    expect(zonedDayKey("2026-11-02T01:30:00Z", TZ)).toBe("2026-11-01"); // 8:30 p.m. EST, first day
  });
});
