import { describe, expect, it } from "vitest";
import { alreadyMarkedPaid, paymentMatches, paymentMethod, paymentStatus } from "@/lib/payments";

const base = { registration_id: "r", matched_by: null, gmail_message_id: "g", dismissed: false, reversed_at: null } as const;

describe("paymentMethod", () => {
  it.each([
    [{ ...base, registration_id: null }, "unmatched"],
    [{ ...base, registration_id: null, dismissed: true }, "dismissed"],
    [{ ...base, matched_by: "ref" }, "ref"],
    [{ ...base, matched_by: "name_amount" }, "name_amount"],
    [{ ...base, matched_by: "admin" }, "assigned"],
    [{ ...base, matched_by: "admin", gmail_message_id: null }, "manual"],
    [{ ...base, matched_by: "ref", reversed_at: "2026-10-20T00:00:00Z" }, "reversed"],
  ] as const)("%o -> %s", (p, expected) => {
    expect(paymentMethod(p)).toBe(expected);
  });

  it("groups methods into statuses", () => {
    expect(paymentStatus("unmatched")).toBe("attention");
    expect(paymentStatus("dismissed")).toBe("dismissed");
    expect(paymentStatus("manual")).toBe("matched");
    expect(paymentStatus("reversed")).toBe("cancelled");
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

describe("alreadyMarkedPaid", () => {
  const pay = (over: Partial<Parameters<typeof alreadyMarkedPaid>[0][number]>) => ({
    id: "x",
    registration_id: null,
    matched_by: null,
    gmail_message_id: "g",
    dismissed: false,
    reversed_at: null,
    memo: null,
    note: null,
    registration: null,
    ...over,
  });
  const reg = (ref_code: string, status: "confirmed" | "pending_payment" = "confirmed") => ({ ref_code, status });

  it("flags an e-Transfer for a confirmed sign-up only a host marked paid", () => {
    const rows = [
      pay({ id: "mark", registration_id: "r1", matched_by: "admin", gmail_message_id: null, registration: reg("VB-YA5D") }),
      pay({ id: "late", note: "Ref code VB-YA5D belongs to a confirmed registration" }),
    ];
    expect(alreadyMarkedPaid(rows)).toEqual(["late"]);
  });

  it("keeps possible double payments, unknown refs and already-dismissed ones", () => {
    const rows = [
      pay({ id: "etransfer", registration_id: "r1", matched_by: "ref", registration: reg("VB-AAAA") }),
      pay({ id: "double", memo: "VB-AAAA" }),
      pay({ id: "mark", registration_id: "r2", matched_by: "admin", gmail_message_id: null, registration: reg("VB-BBBB") }),
      pay({ id: "gone", memo: "VB-BBBB", dismissed: true }),
      pay({ id: "nocode", memo: "thanks!" }),
      pay({ id: "pending-mark", registration_id: "r3", matched_by: "admin", gmail_message_id: null, registration: reg("VB-CCCC", "pending_payment") }),
      pay({ id: "pending", memo: "VB-CCCC" }),
    ];
    expect(alreadyMarkedPaid(rows)).toEqual([]);
  });
});
