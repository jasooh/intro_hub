import { describe, expect, it } from "vitest";
import { signupMatches, signupView } from "@/lib/signups";

const now = new Date("2026-10-20T12:00:00Z").getTime();
const at = (iso: string, status = "confirmed", sessionStatus = "scheduled") =>
  ({ status, session: { starts_at: iso, status: sessionStatus } }) as Parameters<typeof signupView>[0];

describe("signupView", () => {
  it("upcoming until a few hours after the start, then past", () => {
    expect(signupView(at("2026-10-24T00:00:00Z"), now)).toBe("upcoming");
    expect(signupView(at("2026-10-20T10:00:00Z"), now)).toBe("upcoming"); // started 2h ago
    expect(signupView(at("2026-10-20T08:00:00Z"), now)).toBe("past"); // started 4h ago
  });

  it("cancelled, expired and cancelled-session sign-ups go to Cancelled", () => {
    expect(signupView(at("2026-10-24T00:00:00Z", "cancelled"), now)).toBe("cancelled");
    expect(signupView(at("2026-10-24T00:00:00Z", "expired"), now)).toBe("cancelled");
    expect(signupView(at("2026-10-24T00:00:00Z", "confirmed", "cancelled"), now)).toBe("cancelled");
  });
});

describe("signupMatches", () => {
  const fields = ["Intro 2 Volleyball", "Aaniin Community Centre", "Sat, Oct 24, 8:00 p.m.", "VB-7K3Q", "$15.00"];
  it("needs every word, in any order, case-insensitive", () => {
    expect(signupMatches(fields, "")).toBe(true);
    expect(signupMatches(fields, "oct 24")).toBe(true);
    expect(signupMatches(fields, "aaniin vb-7k3q")).toBe(true);
    expect(signupMatches(fields, "oct 25")).toBe(false);
  });
});
