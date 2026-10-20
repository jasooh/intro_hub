import { describe, expect, it } from "vitest";
import { escapeIcsText, foldIcsLine, googleCalendarUrl, sessionIcs } from "@/lib/ics";

const session = {
  id: "abc",
  title: "Intro 2 Volleyball",
  // 6pm Toronto on both sides of the November DST change (EDT -4, then EST -5).
  starts_at: "2026-10-31T22:00:00.000Z",
  ends_at: "2026-11-01T00:00:00.000Z",
  location: "Aaniin Community Centre, 5665 14th Ave, Markham",
  instructional_ends_at: "2026-10-31T23:00:00.000Z",
  dropin_starts_at: "2026-10-31T23:15:00.000Z",
};

describe("sessionIcs", () => {
  const ics = sessionIcs(session, "https://example.com/s/abc", { now: new Date("2026-10-20T12:00:00Z") });

  it("writes UTC times and a stable UID", () => {
    expect(ics).toContain("DTSTART:20261031T220000Z\r\n");
    expect(ics).toContain("DTEND:20261101T000000Z\r\n");
    expect(ics).toContain("UID:session-abc@intro-hub\r\n");
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("escapes commas in the location", () => {
    expect(ics).toContain("LOCATION:Aaniin Community Centre\\, 5665 14th Ave\\, Markham");
  });

  it("ends at the lesson for instructional-only players", () => {
    const instr = sessionIcs(session, "https://example.com/s/abc", { option: "instructional" });
    expect(instr).toContain("DTEND:20261031T230000Z");
    expect(instr).toContain("SUMMARY:Intro 2 Volleyball (Instructional only)\r\n");
  });

  it("starts at drop-in for drop-in-only players", () => {
    const dropin = sessionIcs(session, "https://example.com/s/abc", { option: "dropin" });
    expect(dropin).toContain("DTSTART:20261031T231500Z");
    expect(dropin).toContain("DTEND:20261101T000000Z");
    expect(dropin).toContain("(Drop-in only)");
  });

  it("adds the club name only when the title doesn't have it", () => {
    expect(ics).toContain("SUMMARY:Intro 2 Volleyball\r\n");
    expect(sessionIcs({ ...session, title: "Saturday drop-in" }, "x")).toContain("SUMMARY:Saturday drop-in · Intro 2 Volleyball");
  });

  it("keeps the same UTC instant across DST (calendars convert to local time)", () => {
    const after = sessionIcs({ ...session, starts_at: "2026-11-07T23:00:00.000Z", ends_at: "2026-11-08T01:00:00.000Z" }, "x");
    expect(after).toContain("DTSTART:20261107T230000Z");
  });
});

describe("ics text helpers", () => {
  it("escapes backslashes, semicolons, commas and newlines", () => {
    expect(escapeIcsText("a\\b;c,d\ne")).toBe("a\\\\b\\;c\\,d\\ne");
  });

  it("folds lines over 75 octets", () => {
    const folded = foldIcsLine(`SUMMARY:${"x".repeat(200)}`);
    const lines = folded.split("\r\n");
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
    expect(lines.slice(1).every((l) => l.startsWith(" "))).toBe(true);
    expect(lines.map((l, i) => (i ? l.slice(1) : l)).join("")).toBe(`SUMMARY:${"x".repeat(200)}`);
  });

  it("never splits a multi-byte character", () => {
    const folded = foldIcsLine(`SUMMARY:${"é".repeat(60)}`);
    expect(folded.split("\r\n").map((l, i) => (i ? l.slice(1) : l)).join("")).toBe(`SUMMARY:${"é".repeat(60)}`);
  });
});

describe("googleCalendarUrl", () => {
  it("builds a template link with UTC dates", () => {
    const url = new URL(googleCalendarUrl(session, "https://example.com/s/abc"));
    expect(url.hostname).toBe("calendar.google.com");
    expect(url.searchParams.get("dates")).toBe("20261031T220000Z/20261101T000000Z");
    expect(url.searchParams.get("location")).toBe(session.location);
  });
});
