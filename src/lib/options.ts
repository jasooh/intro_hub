import type { Session, SessionCounts, SignupOption } from "@/lib/types";

// The sign-up options a session offers, what each costs, and which queue it's in.
// Mirrors _option_offered / _signup_price / _has_room in the migrations.

/** Instructional + Drop-in and Drop-in only take a drop-in spot (and play in the games). */
export function usesSpot(option: SignupOption) {
  return option !== "instructional";
}

/**
 * Whether this sign-up holds a lesson place right now (mirrors `_instructional_used` in SQL):
 * everyone at the lesson except a Full row still waiting on its place (`lesson_queued_at` set --
 * it holds its drop-in spot but hasn't got a lesson place yet). An Instructional only row never
 * carries `lesson_queued_at` while pending/confirmed, so one check covers both options.
 */
export function usesLessonPlace(reg: { option: SignupOption; lesson_queued_at: string | null }) {
  return reg.option !== "dropin" && reg.lesson_queued_at == null;
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

/**
 * Whether a new sign-up for this option would go on a waitlist (mirrors `_fits` in SQL).
 * For `full`, a session that prices drop-in standalone can land on a third
 * outcome, `"partial"`: the drop-in spot is open but the lesson isn't, so the
 * sign-up takes the spot now and waits on the lesson place in the background
 * (mirrors `register_for_session`/`_promote`'s split grant). A session with
 * no standalone drop-in price has no partial state to land in, so a full
 * lesson still means `"full"`, same as today.
 */
export function optionFull(
  session: Session,
  option: SignupOption,
  counts?: SessionCounts,
): boolean | "full" | "partial" | "ok" {
  const dropInFull = (counts?.confirmed ?? 0) + (counts?.holding ?? 0) >= session.capacity;
  if (option === "instructional") return lessonFull(session, counts);
  if (option === "dropin") return dropInFull;
  if (dropInFull) return "full";
  if (lessonFull(session, counts)) return session.dropin_price_cents != null ? "partial" : "full";
  return "ok";
}

/** Strict "would get no spot/place at all" check, for callers that need a boolean (e.g. the waitlist button/copy). A partial grant still gets the drop-in spot, so it isn't blocked. */
export function optionBlocked(session: Session, option: SignupOption, counts?: SessionCounts) {
  const result = optionFull(session, option, counts);
  return result === true || result === "full";
}
