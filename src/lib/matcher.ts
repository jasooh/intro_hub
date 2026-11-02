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
  /** Already received toward it (partial payments add up). */
  paidCents?: number;
  names: string[]; // e-Transfer names, display name, Google name
  /** What the friends this sign-up pays for still owe (pay for friends). */
  coveredDueCents?: number;
};

export type MatchResult =
  | { kind: "match"; registrationId: string; by: "ref" | "name_amount" }
  /** The payer's code (or name + group total): split it across the friends they cover. */
  | { kind: "group_match"; registrationId: string; by: "ref" | "name_amount" }
  | {
      kind: "unmatched";
      reason: string;
      /** The ref code's sign-up, when it was found but isn't waiting for payment (e.g. already confirmed). */
      registrationId?: string;
      status?: RegistrationStatus;
    };

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

/** A payer who still has friends to pay for (their own spot may already be paid). */
function coversFriends(c: Candidate) {
  return (c.coveredDueCents ?? 0) > 0 && (c.status === "pending_payment" || c.status === "confirmed");
}

export function matchPayment(payment: IncomingPayment, candidates: Candidate[]): MatchResult {
  const ref = extractRefCode(payment.memo, payment.text);

  if (ref) {
    const byRef = candidates.find((c) => c.refCode === ref);
    if (!byRef) return { kind: "unmatched", reason: `Ref code ${ref} not found among open sign-ups` };
    if (coversFriends(byRef)) return { kind: "group_match", registrationId: byRef.registrationId, by: "ref" };
    if (byRef.status !== "pending_payment") {
      return {
        kind: "unmatched",
        reason: `Ref code ${ref} belongs to a ${byRef.status.replace("_", " ")} registration`,
        registrationId: byRef.registrationId,
        status: byRef.status,
      };
    }
    // A short payment still belongs to this sign-up: the database adds it up
    // and keeps the spot held until the rest arrives.
    return { kind: "match", registrationId: byRef.registrationId, by: "ref" };
  }

  if (!payment.senderName) return { kind: "unmatched", reason: "No ref code and no sender name" };
  const sender = normalizeName(payment.senderName);
  const byName = candidates
    .filter((c) => c.names.some((n) => normalizeName(n) === sender))
    .flatMap((c) => {
      const amount = payment.amountCents;
      // The full price, or exactly what's left after a partial payment.
      if (c.status === "pending_payment" && (c.owedCents === amount || (!!c.paidCents && c.owedCents - c.paidCents === amount))) {
        return [{ c, kind: "match" as const }];
      }
      // What's left for them plus everything their friends still owe.
      const ownLeft = c.status === "pending_payment" ? Math.max(c.owedCents - (c.paidCents ?? 0), 0) : 0;
      if (coversFriends(c) && ownLeft + c.coveredDueCents! === amount) return [{ c, kind: "group_match" as const }];
      return [];
    });

  if (byName.length === 1) {
    return { kind: byName[0].kind, registrationId: byName[0].c.registrationId, by: "name_amount" };
  }
  if (byName.length > 1) {
    return { kind: "unmatched", reason: `No ref code; ${byName.length} pending sign-ups match "${payment.senderName}"` };
  }
  return { kind: "unmatched", reason: `No ref code; no pending sign-up for "${payment.senderName}" at this amount` };
}
