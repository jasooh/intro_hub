import type { Registration } from "@/lib/types";

// Who a host message to one session can go to. Instructional-only players are
// their own group; everyone else goes by their sign-up status.

export const AUDIENCES = ["confirmed", "pending_payment", "waitlisted", "instructional"] as const;
export type Audience = (typeof AUDIENCES)[number];

export const AUDIENCE_LABELS: Record<Audience, string> = {
  confirmed: "Confirmed",
  pending_payment: "Awaiting payment",
  waitlisted: "Waitlist",
  instructional: "Instructional only",
};

/** Which audience a sign-up falls in (instructional-only players are their own group), or null if it's inactive. */
export function audienceOf(r: Pick<Registration, "status" | "option">): Audience | null {
  if (r.status === "expired" || r.status === "cancelled") return null;
  if (r.option === "instructional" && r.status !== "waitlisted") return "instructional";
  return r.status;
}
