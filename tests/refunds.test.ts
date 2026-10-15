import { describe, expect, it } from "vitest";
import { refundAmount, refundReason, refundStatus } from "@/lib/refunds";

describe("refundStatus", () => {
  it.each([
    [{ refunded_at: null, refund_waived_at: null }, "to_refund"],
    [{ refunded_at: "2026-10-14", refund_waived_at: null }, "refunded"],
    [{ refunded_at: null, refund_waived_at: "2026-10-14" }, "waived"],
    // Refunded wins if both are somehow set.
    [{ refunded_at: "2026-10-14", refund_waived_at: "2026-10-13" }, "refunded"],
  ] as const)("%o -> %s", (r, expected) => {
    expect(refundStatus(r)).toBe(expected);
  });
});

describe("refundReason", () => {
  it("separates whole-session cancellations, single spots, expired holds and overpayments", () => {
    expect(refundReason({ status: "cancelled" }, { status: "cancelled" })).toBe("session_cancelled");
    expect(refundReason({ status: "cancelled" }, { status: "scheduled" })).toBe("spot_cancelled");
    expect(refundReason({ status: "expired" }, { status: "scheduled" })).toBe("hold_expired");
    expect(refundReason({ status: "confirmed" }, { status: "scheduled" })).toBe("overpaid");
  });
});

describe("refundAmount", () => {
  it("gives back everything paid, or just the extra for someone still playing", () => {
    expect(refundAmount({ status: "cancelled", amount_cents: 1500, paid_cents: 1500 })).toBe(1500);
    expect(refundAmount({ status: "expired", amount_cents: 1500, paid_cents: 500 })).toBe(500);
    expect(refundAmount({ status: "confirmed", amount_cents: 1500, paid_cents: 2000 })).toBe(500);
    expect(refundAmount({ status: "confirmed", amount_cents: 1500, paid_cents: 1500 })).toBe(0);
  });
});
