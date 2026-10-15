// Decides which registration an incoming Interac e-Transfer belongs to.
// Pure function: the ingest route loads candidates and applies the result.

import type { RegistrationStatus } from "@/lib/types";

export type IncomingPayment = {
  senderName: string | null;
  amountCents: number;
  memo: string | null;
  /** Extra email text to search for a ref code if the memo wasn't parsed. */
  text?: string | null;
};

export type Candidate = {
  registrationId: string;
  refCode: string;
  status: RegistrationStatus;
  /** What this sign-up owes ($10 instructional-only or the full price). */
  owedCents: number;
  names: string[]; // e-Transfer names, display name, Google name
};

export type MatchResult =
  | { kind: "match"; registrationId: string; by: "ref" | "name_amount" }
  | { kind: "unmatched"; reason: string };

// Same alphabet as public.gen_ref_code(), tolerant of "VB 7K3Q", "vb7k3q", etc.
const REF_PATTERN = /\bVB[\s-]?([A-HJKMNP-Z2-9]{4})\b/i;

export function extractRefCode(...texts: (string | null | undefined)[]): string | null {
  for (const text of texts) {
    const m = text?.match(REF_PATTERN);
    if (m) return `VB-${m[1].toUpperCase()}`;
  }
  return null;
}

function normalizeName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchPayment(payment: IncomingPayment, candidates: Candidate[]): MatchResult {
  const ref = extractRefCode(payment.memo, payment.text);

  if (ref) {
    const byRef = candidates.find((c) => c.refCode === ref);
    if (!byRef) return { kind: "unmatched", reason: `Ref code ${ref} not found among open sign-ups` };
    if (byRef.status !== "pending_payment") {
      return { kind: "unmatched", reason: `Ref code ${ref} belongs to a ${byRef.status.replace("_", " ")} registration` };
    }
    if (payment.amountCents < byRef.owedCents) {
      return { kind: "unmatched", reason: `Ref code ${ref} matched, but the amount is less than what this sign-up owes` };
    }
    return { kind: "match", registrationId: byRef.registrationId, by: "ref" };
  }

  if (!payment.senderName) return { kind: "unmatched", reason: "No ref code and no sender name" };
  const sender = normalizeName(payment.senderName);
  const byName = candidates.filter(
    (c) =>
      c.status === "pending_payment" &&
      c.owedCents === payment.amountCents &&
      c.names.some((n) => normalizeName(n) === sender),
  );

  if (byName.length === 1) return { kind: "match", registrationId: byName[0].registrationId, by: "name_amount" };
  if (byName.length > 1) {
    return { kind: "unmatched", reason: `No ref code; ${byName.length} pending sign-ups match "${payment.senderName}"` };
  }
  return { kind: "unmatched", reason: `No ref code; no pending sign-up for "${payment.senderName}" at this amount` };
}
