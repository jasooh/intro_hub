import { extractRefCode } from "@/lib/matcher";
import type { Payment, RegistrationStatus } from "@/lib/types";

/** How a payment came to be recorded. */
export type PaymentMethod = "ref" | "name_amount" | "assigned" | "manual" | "unmatched" | "dismissed" | "reversed";

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  ref: "Ref code",
  name_amount: "Name + amount",
  assigned: "Assigned by host",
  manual: "Marked paid",
  unmatched: "Unmatched",
  dismissed: "Dismissed",
  reversed: "Cancelled by sender",
};

export function paymentMethod(
  p: Pick<Payment, "registration_id" | "matched_by" | "gmail_message_id" | "dismissed" | "reversed_at">,
): PaymentMethod {
  if (p.reversed_at) return "reversed";
  if (!p.registration_id) return p.dismissed ? "dismissed" : "unmatched";
  if (p.matched_by === "ref") return "ref";
  if (p.matched_by === "name_amount") return "name_amount";
  // Admin-matched: a real e-Transfer the host linked by hand, or a manual "Mark paid" with no email.
  return p.gmail_message_id ? "assigned" : "manual";
}

export type PaymentStatus = "attention" | "matched" | "cancelled" | "dismissed";

export function paymentStatus(method: PaymentMethod): PaymentStatus {
  if (method === "unmatched") return "attention";
  if (method === "dismissed") return "dismissed";
  return method === "reversed" ? "cancelled" : "matched";
}

/** Case-insensitive match over the payment's text, linked player and amount ("10", "$10.00"). */
export function paymentMatches(
  p: { sender_name: string | null; memo: string | null; amount_cents: number },
  extra: (string | null | undefined)[],
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const amount = (p.amount_cents / 100).toFixed(2);
  const haystack = [p.sender_name, p.memo, amount, `$${amount}`, ...extra].filter(Boolean).join(" ").toLowerCase();
  return q.split(/\s+/).every((word) => haystack.includes(word.replace(/^\$/, "")) || haystack.includes(word));
}

/** Note left on an e-Transfer that was dismissed because a host had already marked its sign-up paid. */
export const HOST_MARKED_NOTE =
  "A host already marked this sign-up paid by hand, so this is that e-Transfer. Dismissed automatically.";

/**
 * True when every payment still counting toward a sign-up is a host's "Mark paid"
 * (no e-Transfer linked yet). An e-Transfer for that sign-up is then the money the
 * mark stood for. If one is already linked, another may be a double payment.
 */
export function onlyHostMarked(linked: { matched_by: string | null; gmail_message_id: string | null }[]): boolean {
  return linked.length > 0 && linked.every((p) => p.matched_by === "admin" && !p.gmail_message_id);
}

type InboxPayment = Pick<Payment, "id" | "registration_id" | "matched_by" | "gmail_message_id" | "dismissed" | "reversed_at" | "memo" | "note"> & {
  registration: { ref_code: string; status: RegistrationStatus } | null;
};

/**
 * Unmatched e-Transfers whose ref code belongs to a confirmed sign-up that a host
 * already marked paid by hand (e.g. the Gmail script was down and caught up later).
 */
export function alreadyMarkedPaid(payments: InboxPayment[]): string[] {
  const byRef = new Map<string, { status: RegistrationStatus; linked: InboxPayment[] }>();
  for (const p of payments) {
    if (!p.registration || p.reversed_at) continue;
    const group = byRef.get(p.registration.ref_code) ?? { status: p.registration.status, linked: [] };
    group.linked.push(p);
    byRef.set(p.registration.ref_code, group);
  }
  return payments
    .filter((p) => paymentMethod(p) === "unmatched")
    .filter((p) => {
      const ref = extractRefCode(p.memo, p.note);
      const group = ref ? byRef.get(ref) : undefined;
      return group?.status === "confirmed" && onlyHostMarked(group.linked);
    })
    .map((p) => p.id);
}
