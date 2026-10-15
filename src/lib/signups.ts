// Sorting and searching a player's own sign-ups (the My sign-ups page).
import type { RegistrationStatus, Session, SignupOption } from "@/lib/types";

export type SignupView = "upcoming" | "past" | "cancelled";

export const SIGNUP_VIEW_LABELS: Record<SignupView, string> = {
  upcoming: "Upcoming",
  past: "Past",
  cancelled: "Cancelled",
};

/** A session counts as "past" a few hours after it starts (it's still on today). */
const PAST_AFTER_MS = 3 * 3600 * 1000;

const ACTIVE: RegistrationStatus[] = ["pending_payment", "confirmed", "waitlisted"];

export function signupView(
  r: { status: RegistrationStatus; session: Pick<Session, "starts_at" | "status"> },
  now: number,
): SignupView {
  if (r.session.status === "cancelled" || !ACTIVE.includes(r.status)) return "cancelled";
  return new Date(r.session.starts_at).getTime() + PAST_AFTER_MS > now ? "upcoming" : "past";
}

export type OptionFilter = "any" | SignupOption;

/** Every word of the query has to appear somewhere in the sign-up's text. */
export function signupMatches(fields: (string | null | undefined)[], query: string) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = fields.filter(Boolean).join(" ").toLowerCase();
  return words.every((w) => haystack.includes(w));
}

/** Whether a sign-up is still something the player can act on (pay, cancel, leave waitlist). */
export function isActive(status: RegistrationStatus) {
  return ACTIVE.includes(status);
}

