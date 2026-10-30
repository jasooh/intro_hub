import { describe, expect, it } from "vitest";
import { extractRefCode, matchPayment, type Candidate } from "@/lib/matcher";

const candidates: Candidate[] = [
  { registrationId: "r1", refCode: "VB-7K3Q", status: "pending_payment", owedCents: 1000, names: ["Jane Doe"] },
  { registrationId: "r2", refCode: "VB-AB23", status: "pending_payment", owedCents: 1000, names: ["José Álvarez", "Joe A"] },
  { registrationId: "r3", refCode: "VB-ZZ99", status: "waitlisted", owedCents: 1000, names: ["Sam Lee"] },
  { registrationId: "r4", refCode: "VB-QQ44", status: "pending_payment", owedCents: 1000, names: ["Sam Lee"] },
];

describe("extractRefCode", () => {
  it.each([
    ["VB-7K3Q", "VB-7K3Q"],
    ["volleyball vb 7k3q thanks", "VB-7K3Q"],
    ["vb7k3q", "VB-7K3Q"],
    ["no code here", null],
    ["VB-7K3O", null], // O is not in the alphabet
  ])("%s -> %s", (input, expected) => {
    expect(extractRefCode(input)).toBe(expected);
  });

  it("falls back to the email text", () => {
    expect(extractRefCode(null, "Message: VB-AB23")).toBe("VB-AB23");
  });
});

describe("matchPayment", () => {
  it("matches by ref code", () => {
    expect(matchPayment({ senderName: "Someone Else", amountCents: 1000, memo: "VB-7K3Q" }, candidates)).toEqual({
      kind: "match",
      registrationId: "r1",
      by: "ref",
    });
  });

  it("matches over- and under-payments by ref code (the database adds up partials)", () => {
    expect(matchPayment({ senderName: null, amountCents: 1500, memo: "VB-7K3Q" }, candidates).kind).toBe("match");
    expect(matchPayment({ senderName: null, amountCents: 500, memo: "VB-7K3Q" }, candidates)).toEqual({
      kind: "match",
      registrationId: "r1",
      by: "ref",
    });
  });

  it("matches a top-up without a code by name + exactly what's left", () => {
    const partly: Candidate[] = [
      { registrationId: "p1", refCode: "VB-PPPP", status: "pending_payment", owedCents: 1500, paidCents: 1000, names: ["Kim Park"] },
    ];
    expect(matchPayment({ senderName: "KIM PARK", amountCents: 500, memo: null }, partly)).toMatchObject({ kind: "match", by: "name_amount" });
    expect(matchPayment({ senderName: "KIM PARK", amountCents: 700, memo: null }, partly).kind).toBe("unmatched");
  });

  it("does not confirm a waitlisted registration by ref", () => {
    const result = matchPayment({ senderName: null, amountCents: 1000, memo: "VB-ZZ99" }, candidates);
    expect(result).toMatchObject({ kind: "unmatched", reason: expect.stringContaining("waitlisted") });
  });

  it("says which sign-up a ref code belongs to when it isn't waiting for payment", () => {
    const paid: Candidate[] = [{ registrationId: "c1", refCode: "VB-YA5D", status: "confirmed", owedCents: 1000, names: [] }];
    expect(matchPayment({ senderName: null, amountCents: 1000, memo: "VB-YA5D" }, paid)).toMatchObject({
      kind: "unmatched",
      registrationId: "c1",
      status: "confirmed",
    });
  });

  it("matches by sender name + amount, ignoring case and accents", () => {
    expect(matchPayment({ senderName: "JOSE ALVAREZ", amountCents: 1000, memo: null }, candidates)).toEqual({
      kind: "match",
      registrationId: "r2",
      by: "name_amount",
    });
  });

  it("only considers pending registrations for name matching", () => {
    expect(matchPayment({ senderName: "Sam Lee", amountCents: 1000, memo: "" }, candidates)).toEqual({
      kind: "match",
      registrationId: "r4",
      by: "name_amount",
    });
  });

  it("refuses ambiguous name matches", () => {
    const dupes = [...candidates, { ...candidates[0], registrationId: "r5", refCode: "VB-CCCC" }];
    expect(matchPayment({ senderName: "Jane Doe", amountCents: 1000, memo: null }, dupes).kind).toBe("unmatched");
  });

  it("refuses name matches with the wrong amount", () => {
    expect(matchPayment({ senderName: "Jane Doe", amountCents: 2000, memo: null }, candidates).kind).toBe("unmatched");
  });

  it("uses each sign-up's own amount (instructional-only owes less)", () => {
    const mixed: Candidate[] = [
      { registrationId: "full", refCode: "VB-FFFF", status: "pending_payment", owedCents: 1500, names: ["Kim Park"] },
      { registrationId: "instr", refCode: "VB-IIII", status: "pending_payment", owedCents: 1000, names: ["Lee Chan"] },
    ];
    expect(matchPayment({ senderName: "Lee Chan", amountCents: 1000, memo: null }, mixed)).toEqual({
      kind: "match",
      registrationId: "instr",
      by: "name_amount",
    });
    expect(matchPayment({ senderName: "Kim Park", amountCents: 1000, memo: null }, mixed).kind).toBe("unmatched");
    // With the code, a short payment is linked as a partial payment (the database adds it up).
    expect(matchPayment({ senderName: "x", amountCents: 1000, memo: "VB-FFFF" }, mixed)).toMatchObject({ kind: "match", registrationId: "full" });
  });
});
