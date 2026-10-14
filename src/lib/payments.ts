import type { Payment } from "@/lib/types";

/** How a payment came to be recorded. */
export type PaymentMethod = "ref" | "name_amount" | "assigned" | "manual" | "unmatched" | "dismissed";

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  ref: "Ref code",
  name_amount: "Name + amount",
  assigned: "Assigned by host",
  manual: "Marked paid",
  unmatched: "Unmatched",
  dismissed: "Dismissed",
};

export function paymentMethod(p: Pick<Payment, "registration_id" | "matched_by" | "gmail_message_id" | "dismissed">): PaymentMethod {
  if (!p.registration_id) return p.dismissed ? "dismissed" : "unmatched";
  if (p.matched_by === "ref") return "ref";
  if (p.matched_by === "name_amount") return "name_amount";
  // Admin-matched: a real e-Transfer the host linked by hand, or a manual "Mark paid" with no email.
  return p.gmail_message_id ? "assigned" : "manual";
}

export type PaymentStatus = "attention" | "matched" | "dismissed";

export function paymentStatus(method: PaymentMethod): PaymentStatus {
  return method === "unmatched" ? "attention" : method === "dismissed" ? "dismissed" : "matched";
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
