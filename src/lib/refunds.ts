import type { Registration, Session } from "@/lib/types";

export type RefundStatus = "to_refund" | "refunded" | "waived";
export type RefundReason = "session_cancelled" | "spot_cancelled" | "hold_expired" | "overpaid" | "deposit_return";

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
  deposit_return: "Deposit",
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
export function refundReason(
  r: Pick<Registration, "status">,
  s: Pick<Session, "status"> & { deposit_cents?: number | null },
): RefundReason {
  if (s.status === "cancelled") return "session_cancelled";
  if (s.deposit_cents != null && r.status === "confirmed") return "deposit_return";
  if (r.status === "confirmed") return "overpaid";
  if (r.status === "expired") return "hold_expired";
  return "spot_cancelled";
}

/**
 * How much to send back: on a deposit session, everything they paid; otherwise
 * the extra if they're still playing, or everything if they're not.
 */
export function refundAmount(
  r: Pick<Registration, "status" | "amount_cents" | "paid_cents">,
  s?: { deposit_cents?: number | null },
): number {
  if (s?.deposit_cents != null) return r.paid_cents;
  return r.status === "confirmed" ? Math.max(r.paid_cents - r.amount_cents, 0) : r.paid_cents;
}
