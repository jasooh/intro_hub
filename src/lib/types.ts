// Row shapes for the tables in supabase/migrations. Regenerate full types with
// `npx supabase gen types typescript` once a project is linked, if you like.

export type Role = "player" | "admin";
export type RegistrationStatus = "pending_payment" | "confirmed" | "waitlisted" | "expired" | "cancelled";

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
  created_at: string;
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

export type SessionCounts = { session_id: string; confirmed: number; holding: number; waitlisted: number };

export type Attendee = {
  registration_id: string;
  display_name: string;
  avatar_url: string | null;
  status: RegistrationStatus;
  waitlist_position: number | null;
  is_me: boolean;
};

export type RegistrationEvent = {
  event: "signed_up" | "waitlisted" | "promoted" | "confirmed" | "expired" | "reminder" | "session_cancelled";
  registration_id: string;
};
