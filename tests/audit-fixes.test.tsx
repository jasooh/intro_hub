import { render } from "@react-email/components";
import { beforeAll, describe, expect, it } from "vitest";
import { groupErrors } from "@/lib/app-errors";
import { buildAnnouncementEmail, buildEmail, type EmailContext } from "@/lib/email/templates";
import { sessionIcs } from "@/lib/ics";
import { missingProfileExtras, profileComplete } from "@/lib/profile";
import type { Profile } from "@/lib/types";
import { unsubscribeHeaders, unsubscribeUrl, verifyUnsubscribe } from "@/lib/unsubscribe";

const ID = "6f1c2c1e-3b1a-4d55-9a1e-0c4b8d2a7f10";

beforeAll(() => {
  process.env.CRON_SECRET = "test-secret";
  process.env.APP_URL = "https://example.com";
});

describe("unsubscribe links", () => {
  it("verify for the right player and kind only", () => {
    const url = new URL(unsubscribeUrl(ID, "updates"));
    const t = url.searchParams.get("t")!;
    expect(url.pathname).toBe("/unsubscribe");
    expect(verifyUnsubscribe(ID, "updates", t)).toBe(true);
    expect(verifyUnsubscribe(ID, "reminders", t)).toBe(false);
    expect(verifyUnsubscribe(ID.replace("6f", "7f"), "updates", t)).toBe(false);
    expect(verifyUnsubscribe(ID, "updates", t.slice(0, -1) + (t.endsWith("A") ? "B" : "A"))).toBe(false);
    expect(verifyUnsubscribe(ID, "everything", t)).toBe(false);
  });

  it("come with one-click headers", () => {
    const h = unsubscribeHeaders(ID, "host");
    expect(h["List-Unsubscribe"]).toMatch(/^<https:\/\/example\.com\/api\/unsubscribe\?u=.+&k=host&t=.+>$/);
    expect(h["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });

  it("show in announcement footers", async () => {
    const { element } = buildAnnouncementEmail({
      title: "Gym change",
      bodyHtml: "<p>Hi</p>",
      playerName: "Jane",
      postUrl: "https://example.com/updates/1",
      profileUrl: "https://example.com/me",
      unsubscribeUrl: "https://example.com/unsubscribe?u=x",
    });
    expect(await render(element)).toContain("https://example.com/unsubscribe?u=x");
  });
});

describe("session changes", () => {
  it("calendar files carry the revision so apps update the event", () => {
    const session = {
      id: "abc",
      title: "Intro 2 Volleyball",
      starts_at: "2026-10-31T22:00:00.000Z",
      ends_at: "2026-11-01T00:00:00.000Z",
      location: "Gym",
      instructional_ends_at: null,
      dropin_starts_at: null,
    };
    expect(sessionIcs(session, "x")).toContain("SEQUENCE:0");
    expect(sessionIcs({ ...session, schedule_revision: 3 }, "x")).toContain("SEQUENCE:3");
  });

  it("the email shows the old and new time and place", async () => {
    const ctx = {
      playerName: "Jane",
      sessionTitle: "Intro 2 Volleyball",
      when: "Sat, Oct 31, 7:00 p.m.",
      location: "Gym B",
      price: "$15.00",
      paid: "$0.00",
      remaining: "$15.00",
      refCode: "VB-7K3Q",
      holdUntil: null,
      waitlistPosition: null,
      etransferEmail: "host@example.com",
      sessionUrl: "https://example.com/s/1",
      myUrl: "https://example.com/me/signups",
      previous: { when: "Sat, Oct 31, 6:00 p.m.", location: "Gym A" },
    } satisfies EmailContext;
    const { subject, element } = buildEmail("session_changed", ctx);
    expect(subject).toContain("7:00 p.m.");
    const text = await render(element, { plainText: true });
    expect(text).toContain("Was: Sat, Oct 31, 6:00 p.m. · Gym A");
    expect(text).toContain("Now: Sat, Oct 31, 7:00 p.m. · Gym B");
    expect(text).toContain("the time and place");
  });
});

describe("profile completeness", () => {
  const complete = {
    first_name: "Jane",
    last_name: "Doe",
    phone: "555",
    emergency_name: "Sam",
    emergency_phone: "556",
    adult_confirmed_at: "2026-10-01",
    skill_level: 2,
    attended_before: true,
    media_consent: true,
    waiver_accepted_at: "2026-10-01",
  } as unknown as Profile;

  it("doesn't need the emergency contact or 18+ tick; those are reminders", async () => {
    const { WAIVER_VERSION } = await import("@/lib/agreements");
    const p = { ...complete, waiver_version: WAIVER_VERSION } as Profile;
    expect(profileComplete(p)).toBe(true);
    expect(missingProfileExtras(p)).toEqual([]);
    const bare = { ...p, emergency_phone: " ", adult_confirmed_at: null };
    expect(profileComplete(bare)).toBe(true);
    expect(missingProfileExtras(bare)).toEqual(["an emergency contact", "your 18+ confirmation"]);
  });
});

describe("server errors", () => {
  it("group by message, newest first", () => {
    const groups = groupErrors([
      { message: "A", at: "3", path: "/x", kind: "render" },
      { message: "B", at: "2", path: "/y", kind: "action" },
      { message: "A", at: "1", path: "/x", kind: "render" },
    ]);
    expect(groups).toEqual([
      { message: "A", count: 2, last: "3", path: "/x", kind: "render" },
      { message: "B", count: 1, last: "2", path: "/y", kind: "action" },
    ]);
  });
});
