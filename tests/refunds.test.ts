import { describe, expect, it } from "vitest";
import { refundReason, refundStatus } from "@/lib/refunds";

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
  it("separates whole-session cancellations from single spots", () => {
    expect(refundReason({ status: "cancelled" })).toBe("session_cancelled");
    expect(refundReason({ status: "scheduled" })).toBe("spot_cancelled");
  });
});
