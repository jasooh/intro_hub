import { describe, expect, it } from "vitest";
import { paymentMatches, paymentMethod, paymentStatus } from "@/lib/payments";

const base = { registration_id: "r", matched_by: null, gmail_message_id: "g", dismissed: false } as const;

describe("paymentMethod", () => {
  it.each([
    [{ ...base, registration_id: null }, "unmatched"],
    [{ ...base, registration_id: null, dismissed: true }, "dismissed"],
    [{ ...base, matched_by: "ref" }, "ref"],
    [{ ...base, matched_by: "name_amount" }, "name_amount"],
    [{ ...base, matched_by: "admin" }, "assigned"],
    [{ ...base, matched_by: "admin", gmail_message_id: null }, "manual"],
  ] as const)("%o -> %s", (p, expected) => {
    expect(paymentMethod(p)).toBe(expected);
  });

  it("groups methods into statuses", () => {
    expect(paymentStatus("unmatched")).toBe("attention");
    expect(paymentStatus("dismissed")).toBe("dismissed");
    expect(paymentStatus("manual")).toBe("matched");
  });
});

describe("paymentMatches", () => {
  const p = { sender_name: "JANE DOE", memo: "VB-7K3Q thanks", amount_cents: 1500 };
  it.each([
    ["", true],
    ["jane", true],
    ["vb-7k3q", true],
    ["15", true],
    ["$15.00", true],
    ["Kim", true], // linked player name
    ["jane kim", true], // every word must match somewhere
    ["sam", false],
    ["$20", false],
  ])("%s -> %s", (query, expected) => {
    expect(paymentMatches(p, ["Kim Park", "VB-ZZZZ"], query)).toBe(expected);
  });
});
