import type { Registration, Session } from "@/lib/types";

export type RefundStatus = "to_refund" | "refunded" | "waived";
export type RefundReason = "session_cancelled" | "spot_cancelled";

export const REFUND_STATUS_LABELS: Record<RefundStatus, string> = {
  to_refund: "To refund",
  refunded: "Refunded",
  waived: "Waived",
};

export const REFUND_REASON_LABELS: Record<RefundReason, string> = {
  session_cancelled: "Session cancelled",
  spot_cancelled: "Spot cancelled",
};

export function refundStatus(r: Pick<Registration, "refunded_at" | "refund_waived_at">): RefundStatus {
  if (r.refunded_at) return "refunded";
  if (r.refund_waived_at) return "waived";
  return "to_refund";
}

/** Why the refund is owed: the whole session was cancelled, or this one spot was (by the player or a host). */
export function refundReason(s: Pick<Session, "status">): RefundReason {
  return s.status === "cancelled" ? "session_cancelled" : "spot_cancelled";
}
