// Row shapes for the tables in supabase/migrations. Regenerate full types with
// `npx supabase gen types typescript` once a project is linked, if you like.

export type Role = "player" | "admin";
export type RegistrationStatus = "pending_payment" | "confirmed" | "waitlisted" | "expired" | "cancelled";
/** full = instructional + drop-in (uses a spot); instructional = instructional only (no spot). */
export type SignupOption = "full" | "instructional";
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
};

/** confirmed/holding count drop-in sign-ups only; instructional-only sign-ups are counted separately. */
export type SessionCounts = {
  session_id: string;
  confirmed: number;
  holding: number;
  waitlisted: number;
  instructional: number;
};

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
  event: "signed_up" | "waitlisted" | "promoted" | "confirmed" | "expired" | "reminder" | "session_cancelled";
  registration_id: string;
};
