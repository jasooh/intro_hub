// Row shapes for the tables in supabase/migrations. Regenerate full types with
// `npx supabase gen types typescript` once a project is linked, if you like.

export type Role = "player" | "admin";
export type RegistrationStatus = "pending_payment" | "confirmed" | "waitlisted" | "expired" | "cancelled";
/**
 * full = instructional + drop-in; dropin = drop-in only (games, no lesson); both use a drop-in spot.
 * instructional = instructional only: no drop-in spot (its own, optionally capped, queue).
 */
export type SignupOption = "full" | "instructional" | "dropin";
export type SkillLevel = "never" | "some" | "experienced" | "prefer_not";
export type HeardAbout = "word_of_mouth" | "instagram" | "javelin" | "other";

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  display_name: string | null;
  avatar_url: string | null;
  role: Role;
  etransfer_names: string[];
  onboarded_at: string | null;
  created_at: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  skill_level: SkillLevel | null;
  attended_before: boolean | null;
  learning_goals: string | null;
  hype_song: string | null;
  heard_about: HeardAbout | null;
  heard_about_other: string | null;
  media_consent: boolean | null;
  /** Host announcement emails (opt-out). Sign-up/payment emails are always sent. */
  announcement_emails: boolean;
  media_consent_at: string | null;
  waiver_accepted_at: string | null;
  waiver_version: string | null;
  /** Added by a host without an account: no sign-in, no emails. */
  guest: boolean;
  /** Host notification settings (only used for hosts). */
  host_digest: "off" | "3h" | "daily";
  host_session_day: boolean;
  host_alert_late_cancel: boolean;
  host_alert_unmatched: boolean;
  host_digest_sent_at: string | null;
};

export type SessionTemplate = {
  id: string;
  title: string;
  weekday: number;
  start_time: string;
  duration_minutes: number;
  location: string;
  capacity: number;
  price_cents: number;
  open_hours_before: number;
  hold_hours: number;
  cancel_cutoff_hours: number;
  timezone: string;
  active: boolean;
  instructional_price_cents: number | null;
  instructional_minutes: number | null;
  dropin_offset_minutes: number | null;
  /** Drop-in only price; null = not offered. */
  dropin_price_cents: number | null;
  /** Instructional-only spots; null = no limit. */
  instructional_capacity: number | null;
};

export type Session = {
  id: string;
  template_id: string | null;
  title: string;
  starts_at: string;
  ends_at: string;
  location: string;
  capacity: number;
  price_cents: number;
  opens_at: string;
  hold_hours: number;
  cancel_cutoff: string;
  status: "scheduled" | "cancelled";
  notes: string | null;
  roster_version: number;
  instructional_price_cents: number | null;
  instructional_ends_at: string | null;
  dropin_starts_at: string | null;
  teams_published_at: string | null;
  cancel_reason: string | null;
  /** Minutes per game in the team schedule; null = order only, no times. */
  schedule_game_minutes: number | null;
  /** Free session with a refundable deposit: what each sign-up pays to hold a spot. */
  deposit_cents: number | null;
  /** Set once the deposits were marked as owed back after the session. */
  deposits_released_at: string | null;
  /** Drop-in only price; null = not offered. */
  dropin_price_cents: number | null;
  /** Instructional-only spots; null = no limit (past it, a separate waitlist). */
  instructional_capacity: number | null;
  /** Email players when sign-ups open. */
  announce: boolean;
  /** When the "sign-ups are open" email went out (sessions from before it existed are marked too). */
  announced_at: string | null;
  /** When the hosts' session-day email went out. */
  host_day_sent_at: string | null;
};

export type Team = { id: string; session_id: string; name: string; position: number };

/** One game in a session's team schedule. Slots are time blocks, in order. */
export type Match = { id: string; session_id: string; slot: number; court: number; team_a_id: string; team_b_id: string };

/** A host post on the Updates board. body_html is sanitized (src/lib/rich-text.ts). */
export type Post = {
  id: string;
  title: string;
  body_html: string;
  published_at: string | null;
  featured: boolean;
  emailed_at: string | null;
  author_id: string | null;
  created_at: string;
  updated_at: string;
};

export type Registration = {
  id: string;
  session_id: string;
  profile_id: string;
  status: RegistrationStatus;
  ref_code: string;
  queued_at: string | null;
  hold_expires_at: string | null;
  confirmed_at: string | null;
  cancelled_at: string | null;
  refund_owed: boolean;
  refunded_at: string | null;
  refund_waived_at: string | null;
  created_at: string;
  option: SignupOption;
  amount_cents: number;
  /** Total of the payments linked to this sign-up (partial payments add up). */
  paid_cents: number;
  /** Bring a Friend: on the new friend's sign-up, the regular who brought them. */
  brought_by: string | null;
  /** Bring a Friend: this sign-up is at half price. */
  friend_discount: boolean;
  note: string | null;
  team_id: string | null;
};

export type Payment = {
  id: string;
  gmail_message_id: string | null;
  sender_name: string | null;
  amount_cents: number;
  memo: string | null;
  received_at: string;
  registration_id: string | null;
  matched_by: "ref" | "name_amount" | "admin" | null;
  matched_at: string | null;
  note: string | null;
  dismissed: boolean;
  /** The sender cancelled it (or it expired) before it was deposited; it no longer counts. */
  reversed_at: string | null;
};

/** A "your e-Transfer was cancelled / expired" email, and the payment it took back. */
export type PaymentCancellation = {
  id: string;
  gmail_message_id: string;
  sender_name: string | null;
  amount_cents: number | null;
  memo: string | null;
  reference: string | null;
  /** The day the cancelled transfer was sent ("2026-10-19"), when the email says. */
  sent_on: string | null;
  received_at: string;
  payment_id: string | null;
  /** Why it wasn't matched automatically. */
  note: string | null;
  dismissed_at: string | null;
};

/**
 * confirmed / holding / waitlisted: drop-in spots (Instructional + Drop-in and Drop-in only).
 * instructional / instructional_waitlisted: the instructional-only queue. dropin: Drop-in only among the spots.
 */
export type SessionCounts = {
  session_id: string;
  confirmed: number;
  holding: number;
  waitlisted: number;
  instructional: number;
  instructional_waitlisted: number;
  dropin: number;
};

/** Session-level events from run_tick (not tied to one sign-up). */
export type SessionEvent = { event: "session_open"; session_id: string };

export type Attendee = {
  registration_id: string;
  display_name: string;
  avatar_url: string | null;
  status: RegistrationStatus;
  option: SignupOption;
  /** Only set once the host has published teams. */
  team_id: string | null;
  waitlist_position: number | null;
  is_me: boolean;
};

export type RegistrationEvent = {
  event:
    | "signed_up"
    | "waitlisted"
    | "promoted"
    | "confirmed"
    | "partial_payment"
    | "expired"
    | "reminder"
    | "hold_reminder"
    | "payment_reversed"
    | "spot_released"
    | "session_cancelled";
  registration_id: string;
  /** partial_payment: the payment that arrived; payment_reversed / spot_released: the one cancelled (each gets its own email). */
  payment_id?: string;
  /** hold_reminder only: when it was sent (each reminder gets its own email). */
  nudged_at?: string;
};
