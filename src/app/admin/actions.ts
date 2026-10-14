"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { env } from "@/lib/env";
import { zonedLocalToUtc } from "@/lib/format";
import { dispatchEvents, parseEvents } from "@/lib/registrations";
import { createAdminClient, createClient } from "@/lib/supabase/server";

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

async function rpc(fn: string, args: Record<string, unknown>, path: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) fail(path, error.message);
  const events = parseEvents(data);
  after(() => dispatchEvents(events));
  revalidatePath(path);
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

const dollars = z.coerce.number().min(0).max(1000).transform((d) => Math.round(d * 100));
/** Blank = not offered. */
const optionalDollars = z.preprocess((v) => (v === "" || v == null ? null : v), dollars.nullable());
const optionalClock = z
  .string()
  .regex(/^(\d{2}:\d{2})?$/, "Times must be HH:MM")
  .default("")
  .transform((v) => v || null);

/** Minutes from `start` (HH:MM) to `time` (HH:MM), wrapping past midnight. */
function minutesAfter(start: string, time: string) {
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  return (toMin(time) - toMin(start) + 1440) % 1440;
}

const SessionForm = z.object({
  title: z.string().trim().min(1).max(100),
  starts_at: z.string().min(1, "Start time is required"),
  duration_minutes: z.coerce.number().int().min(15).max(600),
  location: z.string().trim().min(1).max(200),
  capacity: z.coerce.number().int().min(1).max(200),
  price: dollars,
  opens_at: z.string().min(1, "Sign-up open time is required"),
  hold_hours: z.coerce.number().int().min(1).max(168),
  cancel_cutoff_hours: z.coerce.number().int().min(0).max(336),
  notes: z.string().max(2000).optional(),
  instructional_price: optionalDollars,
  instructional_ends: optionalClock,
  dropin_starts: optionalClock,
});

function sessionRow(formData: FormData, path: string) {
  const parsed = SessionForm.safeParse(Object.fromEntries(formData));
  if (!parsed.success) fail(path, parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  const f = parsed.data;
  const startsAt = zonedLocalToUtc(f.starts_at);
  return {
    title: f.title,
    starts_at: startsAt.toISOString(),
    ends_at: new Date(startsAt.getTime() + f.duration_minutes * 60_000).toISOString(),
    location: f.location,
    capacity: f.capacity,
    price_cents: f.price,
    opens_at: zonedLocalToUtc(f.opens_at).toISOString(),
    hold_hours: f.hold_hours,
    cancel_cutoff: new Date(startsAt.getTime() - f.cancel_cutoff_hours * 3_600_000).toISOString(),
    notes: f.notes?.trim() || null,
    instructional_price_cents: f.instructional_price,
    instructional_ends_at: atClock(startsAt, f.starts_at, f.instructional_ends),
    dropin_starts_at: atClock(startsAt, f.starts_at, f.dropin_starts),
  };
}

/** The instant `clock` (HH:MM) falls at, on or after the session start. */
function atClock(startsAt: Date, startsLocal: string, clock: string | null) {
  if (!clock) return null;
  return new Date(startsAt.getTime() + minutesAfter(startsLocal.slice(11, 16), clock) * 60_000).toISOString();
}

export async function createSession(formData: FormData) {
  await requireAdmin();
  const row = sessionRow(formData, "/admin/sessions/new");
  const supabase = await createClient();
  const { data, error } = await supabase.from("sessions").insert(row).select("id").single();
  if (error) fail("/admin/sessions/new", error.message);
  revalidatePath("/", "layout");
  redirect(`/admin/sessions/${data.id}`);
}

export async function updateSession(sessionId: string, formData: FormData) {
  await requireAdmin();
  const path = `/admin/sessions/${sessionId}`;
  const row = sessionRow(formData, path);
  const supabase = await createClient();
  const { error } = await supabase.from("sessions").update(row).eq("id", sessionId);
  if (error) fail(path, error.message);
  // Capacity may have gone up: pull people off the waitlist.
  await rpc("admin_promote", { p_session_id: sessionId }, path);
  revalidatePath("/", "layout");
}

export async function cancelSession(sessionId: string) {
  await requireAdmin();
  await rpc("admin_cancel_session", { p_session_id: sessionId }, `/admin/sessions/${sessionId}`);
  revalidatePath("/", "layout");
}

// ---------------------------------------------------------------------------
// Roster
// ---------------------------------------------------------------------------

export async function markPaid(registrationId: string, sessionId: string) {
  await requireAdmin();
  await rpc("admin_mark_paid", { p_registration_id: registrationId }, `/admin/sessions/${sessionId}`);
}

export async function removeRegistration(registrationId: string, sessionId: string) {
  await requireAdmin();
  await rpc("cancel_registration", { p_registration_id: registrationId }, `/admin/sessions/${sessionId}`);
}

export async function moveWaitlist(registrationId: string, direction: -1 | 1, sessionId: string) {
  await requireAdmin();
  await rpc(
    "admin_move_waitlist",
    { p_registration_id: registrationId, p_direction: direction },
    `/admin/sessions/${sessionId}`,
  );
}

// ---------------------------------------------------------------------------
// Payments & refunds
// ---------------------------------------------------------------------------

export async function assignPayment(paymentId: string, formData: FormData) {
  await requireAdmin();
  const registrationId = formData.get("registration_id");
  if (typeof registrationId !== "string" || !registrationId) fail("/admin/payments", "Pick a player first");
  await rpc("admin_assign_payment", { p_payment_id: paymentId, p_registration_id: registrationId }, "/admin/payments");
}

export async function setPaymentDismissed(paymentId: string, dismissed: boolean) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("payments").update({ dismissed }).eq("id", paymentId);
  if (error) fail("/admin/payments", error.message);
  revalidatePath("/admin/payments");
}

export async function setRefunded(registrationId: string, refunded: boolean) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("registrations")
    .update({ refunded_at: refunded ? new Date().toISOString() : null })
    .eq("id", registrationId);
  if (error) fail("/admin/refunds", error.message);
  revalidatePath("/admin/refunds");
}

export async function waiveRefund(registrationId: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("registrations").update({ refund_owed: false }).eq("id", registrationId);
  if (error) fail("/admin/refunds", error.message);
  revalidatePath("/admin/refunds");
}

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------

export async function setRole(profileId: string, role: "player" | "admin") {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_role", { p_profile_id: profileId, p_role: role });
  if (error) fail("/admin/players", error.message);
  revalidatePath("/admin/players");
}

export async function updateEtransferNames(profileId: string, formData: FormData) {
  await requireAdmin();
  const names = String(formData.get("etransfer_names") ?? "")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean)
    .slice(0, 5);
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ etransfer_names: names }).eq("id", profileId);
  if (error) fail("/admin/players", error.message);
  revalidatePath("/admin/players");
}

// ---------------------------------------------------------------------------
// Weekly templates
// ---------------------------------------------------------------------------

const TemplateForm = z.object({
  title: z.string().trim().min(1).max(100),
  weekday: z.coerce.number().int().min(0).max(6),
  start_time: z.string().regex(/^\d{2}:\d{2}$/, "Start time must be HH:MM"),
  duration_minutes: z.coerce.number().int().min(15).max(600),
  location: z.string().trim().min(1).max(200),
  capacity: z.coerce.number().int().min(1).max(200),
  price: dollars,
  open_hours_before: z.coerce.number().int().min(0).max(1000),
  hold_hours: z.coerce.number().int().min(1).max(168),
  cancel_cutoff_hours: z.coerce.number().int().min(0).max(336),
  active: z.literal("on").optional(),
  instructional_price: optionalDollars,
  instructional_ends: optionalClock,
  dropin_starts: optionalClock,
});

export async function saveTemplate(templateId: string | null, formData: FormData) {
  await requireAdmin();
  const parsed = TemplateForm.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    fail("/admin/templates", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  }
  const { price, active, instructional_price, instructional_ends, dropin_starts, ...rest } = parsed.data;
  const row = {
    ...rest,
    price_cents: price,
    active: active === "on",
    timezone: env.timezone(),
    instructional_price_cents: instructional_price,
    instructional_minutes: instructional_ends ? minutesAfter(rest.start_time, instructional_ends) || null : null,
    dropin_offset_minutes: dropin_starts ? minutesAfter(rest.start_time, dropin_starts) : null,
  };

  const supabase = await createClient();
  const { error } = templateId
    ? await supabase.from("session_templates").update(row).eq("id", templateId)
    : await supabase.from("session_templates").insert(row);
  if (error) fail("/admin/templates", error.message);

  // Create the next session right away instead of waiting for the cron tick.
  await createAdminClient().rpc("create_sessions_from_templates");
  revalidatePath("/", "layout");
}
