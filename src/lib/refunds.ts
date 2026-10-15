import type { Registration, Session } from "@/lib/types";

export type RefundStatus = "to_refund" | "refunded" | "waived";
export type RefundReason = "session_cancelled" | "spot_cancelled" | "hold_expired" | "overpaid";

export const REFUND_STATUS_LABELS: Record<RefundStatus, string> = {
  to_refund: "To refund",
  refunded: "Refunded",
  waived: "Waived",
};

export const REFUND_REASON_LABELS: Record<RefundReason, string> = {
  session_cancelled: "Session cancelled",
  spot_cancelled: "Spot cancelled",
  hold_expired: "Hold expired",
  overpaid: "Overpaid",
};

export function refundStatus(r: Pick<Registration, "refunded_at" | "refund_waived_at">): RefundStatus {
  if (r.refunded_at) return "refunded";
  if (r.refund_waived_at) return "waived";
  return "to_refund";
}

/**
 * Why the refund is owed: the whole session was cancelled, this one spot was
 * (by the player or a host), a partly paid hold ran out, or they're playing
 * but sent more than they owed.
 */
export function refundReason(r: Pick<Registration, "status">, s: Pick<Session, "status">): RefundReason {
  if (s.status === "cancelled") return "session_cancelled";
  if (r.status === "confirmed") return "overpaid";
  if (r.status === "expired") return "hold_expired";
  return "spot_cancelled";
}

/** How much to send back: the extra if they're still playing, otherwise everything they paid. */
export function refundAmount(r: Pick<Registration, "status" | "amount_cents" | "paid_cents">): number {
  return r.status === "confirmed" ? Math.max(r.paid_cents - r.amount_cents, 0) : r.paid_cents;
}
