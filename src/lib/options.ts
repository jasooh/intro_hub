import type { Session, SessionCounts, SignupOption } from "@/lib/types";

// The sign-up options a session offers, what each costs, and which queue it's in.
// Mirrors _option_offered / _signup_price / _has_room in the migrations.

/** Instructional + Drop-in and Drop-in only take a drop-in spot (and play in the games). */
export function usesSpot(option: SignupOption) {
  return option !== "instructional";
}

/** In the order players see them. */
export function offeredOptions(session: Pick<Session, "instructional_price_cents" | "dropin_price_cents">): SignupOption[] {
  return [
    "full",
    ...(session.dropin_price_cents != null ? (["dropin"] as const) : []),
    ...(session.instructional_price_cents != null ? (["instructional"] as const) : []),
  ];
}

export function optionPrice(
  session: Pick<Session, "price_cents" | "instructional_price_cents" | "dropin_price_cents" | "deposit_cents">,
  option: SignupOption,
  discounted = false,
) {
  if (session.deposit_cents != null) return session.deposit_cents;
  const base =
    option === "instructional"
      ? (session.instructional_price_cents ?? session.price_cents)
      : option === "dropin"
        ? (session.dropin_price_cents ?? session.price_cents)
        : session.price_cents;
  return discounted ? Math.round(base / 2) : base;
}

/** Instructional-only places left, or null when there's no limit. */
function instructionalLeft(session: Pick<Session, "instructional_capacity">, counts?: SessionCounts) {
  if (session.instructional_capacity == null) return null;
  return Math.max(session.instructional_capacity - (counts?.instructional ?? 0), 0);
}

/** Whether a new sign-up for this option would go on a waitlist. */
export function optionFull(session: Session, option: SignupOption, counts?: SessionCounts) {
  if (option === "instructional") {
    const left = instructionalLeft(session, counts);
    return left != null && (left === 0 || (counts?.instructional_waitlisted ?? 0) > 0);
  }
  const taken = (counts?.confirmed ?? 0) + (counts?.holding ?? 0);
  return taken >= session.capacity || (counts?.waitlisted ?? 0) > 0;
}
