"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { env } from "@/lib/env";
import { zonedLocalToUtc } from "@/lib/format";
import { dispatchEvents, parseEvents } from "@/lib/registrations";
import { balanceTeams } from "@/lib/teams";
import type { SkillLevel } from "@/lib/types";
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

/** Decide not to refund (kept on the Waived tab), or undo that. */
export async function setRefundWaived(registrationId: string, waived: boolean) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("registrations")
    .update({ refund_waived_at: waived ? new Date().toISOString() : null })
    .eq("id", registrationId);
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

const TEMPLATE_FIELD_LABELS: Record<string, string> = {
  title: "Title",
  weekday: "Day",
  start_time: "Start time",
  duration_minutes: "Length",
  location: "Location",
  capacity: "Spots",
  price: "Price",
  open_hours_before: "Sign-ups open",
  hold_hours: "Payment window",
  cancel_cutoff_hours: "Refund cutoff",
  instructional_price: "Instructional-only price",
  instructional_ends: "Instructional ends",
  dropin_starts: "Drop-in starts",
};

export async function saveTemplate(templateId: string | null, formData: FormData) {
  await requireAdmin();
  const formPath = templateId ? `/admin/templates/${templateId}` : "/admin/templates/new";
  const parsed = TemplateForm.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    fail(
      formPath,
      parsed.error.issues.map((i) => `${TEMPLATE_FIELD_LABELS[String(i.path[0])] ?? i.path.join(".")}: ${i.message}`).join("; "),
    );
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
  if (error) fail(formPath, error.message);

  // Create the next session right away instead of waiting for the cron tick.
  await createAdminClient().rpc("create_sessions_from_templates");
  revalidatePath("/", "layout");
  redirect(`/admin/templates?saved=${templateId ? "updated" : "created"}`);
}

/** Pause or resume a weekly session (paused templates stop creating new sessions). */
export async function setTemplateActive(templateId: string, active: boolean) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("session_templates").update({ active }).eq("id", templateId);
  if (error) fail("/admin/templates", error.message);
  if (active) await createAdminClient().rpc("create_sessions_from_templates");
  revalidatePath("/", "layout");
}

/** Deletes a weekly session. Sessions it already created stay (cancel those separately). */
export async function deleteTemplate(templateId: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("session_templates").delete().eq("id", templateId);
  if (error) fail("/admin/templates", error.message);
  revalidatePath("/", "layout");
  redirect("/admin/templates?saved=deleted");
}

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

function revalidateTeams(sessionId: string) {
  revalidatePath(`/admin/sessions/${sessionId}`);
  revalidatePath(`/s/${sessionId}`);
}

/** (Re)builds teams: drops any existing ones, then balances drop-in players by skill. */
export async function makeTeams(sessionId: string, formData: FormData) {
  await requireAdmin();
  const path = `/admin/sessions/${sessionId}`;
  const count = z.coerce.number().int().min(2).max(12).safeParse(formData.get("count"));
  if (!count.success) fail(path, "Pick between 2 and 12 teams");

  const supabase = await createClient();
  const { data: regs, error: regsError } = await supabase
    .from("registrations")
    .select("id, profile:profiles(skill_level)")
    .eq("session_id", sessionId)
    .eq("option", "full")
    .in("status", ["pending_payment", "confirmed"]);
  if (regsError) fail(path, regsError.message);

  const { error: delError } = await supabase.from("session_teams").delete().eq("session_id", sessionId);
  if (delError) fail(path, delError.message);
  const { data: teams, error: teamError } = await supabase
    .from("session_teams")
    .insert(Array.from({ length: count.data }, (_, i) => ({ session_id: sessionId, name: `Team ${i + 1}`, position: i })))
    .select("id, position")
    .order("position");
  if (teamError || !teams) fail(path, teamError?.message ?? "Couldn't create teams");

  const players = ((regs ?? []) as unknown as { id: string; profile: { skill_level: SkillLevel | null } }[]).map((r) => ({
    id: r.id,
    skill: r.profile.skill_level,
  }));
  const groups = balanceTeams(players, teams.length);
  for (const [i, group] of groups.entries()) {
    if (group.length === 0) continue;
    const { error } = await supabase
      .from("registrations")
      .update({ team_id: teams[i].id })
      .in(
        "id",
        group.map((p) => p.id),
      );
    if (error) fail(path, error.message);
  }
  revalidateTeams(sessionId);
}

export async function renameTeam(teamId: string, sessionId: string, formData: FormData) {
  await requireAdmin();
  const name = z.string().trim().min(1).max(40).safeParse(formData.get("name"));
  if (!name.success) fail(`/admin/sessions/${sessionId}`, "Team names need 1–40 characters");
  const supabase = await createClient();
  const { error } = await supabase.from("session_teams").update({ name: name.data }).eq("id", teamId);
  if (error) fail(`/admin/sessions/${sessionId}`, error.message);
  revalidateTeams(sessionId);
}

export async function moveToTeam(registrationId: string, sessionId: string, formData: FormData) {
  await requireAdmin();
  const teamId = String(formData.get("team_id") ?? "") || null;
  const supabase = await createClient();
  const { error } = await supabase.from("registrations").update({ team_id: teamId }).eq("id", registrationId);
  if (error) fail(`/admin/sessions/${sessionId}`, error.message);
  revalidateTeams(sessionId);
}

export async function setTeamsPublished(sessionId: string, published: boolean) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("sessions")
    .update({ teams_published_at: published ? new Date().toISOString() : null })
    .eq("id", sessionId);
  if (error) fail(`/admin/sessions/${sessionId}`, error.message);
  revalidateTeams(sessionId);
}

export async function removeTeams(sessionId: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("session_teams").delete().eq("session_id", sessionId);
  if (!error) await supabase.from("sessions").update({ teams_published_at: null }).eq("id", sessionId);
  if (error) fail(`/admin/sessions/${sessionId}`, error.message);
  revalidateTeams(sessionId);
}
