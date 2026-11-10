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

/** Whether the lesson (Instructional only + Instructional + Drop-in) is at its cap. */
export function lessonFull(session: Pick<Session, "instructional_capacity">, counts?: SessionCounts) {
  return session.instructional_capacity != null && (counts?.lesson ?? 0) >= session.instructional_capacity;
}

/** Whether a new sign-up for this option would go on a waitlist (mirrors `_fits` in SQL). */
export function optionFull(session: Session, option: SignupOption, counts?: SessionCounts) {
  const dropInFull = (counts?.confirmed ?? 0) + (counts?.holding ?? 0) >= session.capacity;
  if (option === "instructional") return lessonFull(session, counts);
  if (option === "dropin") return dropInFull;
  return dropInFull || lessonFull(session, counts);
}
