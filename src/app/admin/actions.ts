"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { countAnnouncementRecipients, sendPostToPlayers } from "@/lib/announcements";
import { requireAdmin } from "@/lib/auth";
import { env } from "@/lib/env";
import { flash } from "@/lib/flash";
import { zonedLocalToUtc } from "@/lib/format";
import { dispatchEvents, parseEvents } from "@/lib/registrations";
import { isEmptyPost, sanitizePostHtml } from "@/lib/rich-text";
import { roundRobin } from "@/lib/schedule";
import { balanceTeams } from "@/lib/teams";
import type { SkillLevel } from "@/lib/types";
import { createAdminClient, createClient } from "@/lib/supabase/server";

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

async function rpc(fn: string, args: Record<string, unknown>, path: string, success?: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) fail(path, error.message);
  const events = parseEvents(data);
  after(() => dispatchEvents(events));
  revalidatePath(path);
  if (success) await flash("success", success);
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
  await flash("success", "Session created");
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
  await rpc("admin_promote", { p_session_id: sessionId }, path, "Session saved");
  revalidatePath("/", "layout");
}

export async function cancelSession(sessionId: string, formData: FormData) {
  await requireAdmin();
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 500);
  await rpc(
    "admin_cancel_session",
    { p_session_id: sessionId, p_reason: reason || null },
    `/admin/sessions/${sessionId}`,
    "Session cancelled. Everyone signed up is being emailed.",
  );
  revalidatePath("/", "layout");
}

// ---------------------------------------------------------------------------
// Roster
// ---------------------------------------------------------------------------

export async function markPaid(registrationId: string, sessionId: string) {
  await requireAdmin();
  await rpc("admin_mark_paid", { p_registration_id: registrationId }, `/admin/sessions/${sessionId}`, "Marked as paid");
}

export async function removeRegistration(registrationId: string, sessionId: string) {
  await requireAdmin();
  await rpc(
    "cancel_registration",
    { p_registration_id: registrationId },
    `/admin/sessions/${sessionId}`,
    "Removed from the session",
  );
}

export async function moveWaitlist(registrationId: string, direction: -1 | 1, sessionId: string) {
  await requireAdmin();
  await rpc(
    "admin_move_waitlist",
    { p_registration_id: registrationId, p_direction: direction },
    `/admin/sessions/${sessionId}`,
    "Waitlist order updated",
  );
}

// ---------------------------------------------------------------------------
// Payments & refunds
// ---------------------------------------------------------------------------

export async function assignPayment(paymentId: string, formData: FormData) {
  await requireAdmin();
  const registrationId = formData.get("registration_id");
  if (typeof registrationId !== "string" || !registrationId) fail("/admin/payments", "Pick a player first");
  await rpc(
    "admin_assign_payment",
    { p_payment_id: paymentId, p_registration_id: registrationId },
    "/admin/payments",
    "Payment assigned to the player's current sign-up. They're confirmed.",
  );
}

export async function setPaymentDismissed(paymentId: string, dismissed: boolean) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("payments").update({ dismissed }).eq("id", paymentId);
  if (error) fail("/admin/payments", error.message);
  revalidatePath("/admin/payments");
  await flash("success", dismissed ? "Payment dismissed" : "Payment restored");
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
  await flash("success", refunded ? "Marked as refunded" : "Moved back to To refund");
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
  await flash("success", waived ? "Refund waived" : "Moved back to To refund");
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
  await flash("success", role === "admin" ? "Now a host" : "Host access removed");
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
  await flash("success", "e-Transfer names saved");
}

/**
 * Deletes a player's account (e.g. an offensive name). Removes their sign-in,
 * profile and sign-ups (cascade); their payment records stay, unlinked. Hosts
 * must be demoted first, and you can't delete yourself.
 */
export async function deleteAccount(profileId: string) {
  const me = await requireAdmin();
  if (profileId === me.id) fail("/admin/players", "You can't delete your own account.");
  const admin = createAdminClient();
  const { data: target } = await admin.from("profiles").select("role").eq("id", profileId).maybeSingle();
  if (!target) fail("/admin/players", "That account no longer exists.");
  if (target.role === "admin") fail("/admin/players", "Remove their host access before deleting the account.");

  const { error } = await admin.auth.admin.deleteUser(profileId);
  if (error) fail("/admin/players", error.message);
  // Freed spots are filled from the waitlist by the every-minute job.
  revalidatePath("/", "layout");
  await flash("success", "Account deleted");
  redirect("/admin/players");
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
  await flash(
    "success",
    templateId
      ? "Weekly session saved. Changes apply to sessions created from now on."
      : "Weekly session created. The next one is posted.",
  );
  redirect("/admin/templates");
}

/** Pause or resume a weekly session (paused templates stop creating new sessions). */
export async function setTemplateActive(templateId: string, active: boolean) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("session_templates").update({ active }).eq("id", templateId);
  if (error) fail("/admin/templates", error.message);
  if (active) await createAdminClient().rpc("create_sessions_from_templates");
  revalidatePath("/", "layout");
  await flash("success", active ? "Weekly session resumed" : "Weekly session paused");
}

/** Deletes a weekly session. Sessions it already created stay (cancel those separately). */
export async function deleteTemplate(templateId: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("session_templates").delete().eq("id", templateId);
  if (error) fail("/admin/templates", error.message);
  revalidatePath("/", "layout");
  await flash("success", "Weekly session deleted. Sessions it already created are unchanged.");
  redirect("/admin/templates");
}

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

function revalidateTeams(sessionId: string) {
  revalidatePath(`/admin/sessions/${sessionId}`);
  revalidatePath(`/s/${sessionId}`);
}

/** (Re)builds teams, balancing drop-in players by skill. Re-balancing the same number of teams keeps the team rows. */
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

  const { data: existing } = await supabase
    .from("session_teams")
    .select("id, position")
    .eq("session_id", sessionId)
    .order("position");
  let teams: { id: string; position: number }[];
  if (existing && existing.length === count.data) {
    // Re-balance: keep the team rows (so the game schedule stays), reset names and empty them.
    teams = existing;
    for (const [i, t] of teams.entries()) {
      const { error } = await supabase.from("session_teams").update({ name: `Team ${i + 1}` }).eq("id", t.id);
      if (error) fail(path, error.message);
    }
    const { error: clearError } = await supabase
      .from("registrations")
      .update({ team_id: null })
      .eq("session_id", sessionId)
      .not("team_id", "is", null);
    if (clearError) fail(path, clearError.message);
  } else {
    // A different number of teams: start over (the schedule goes with the old teams).
    const { error: delError } = await supabase.from("session_teams").delete().eq("session_id", sessionId);
    if (delError) fail(path, delError.message);
    const { data: created, error: teamError } = await supabase
      .from("session_teams")
      .insert(Array.from({ length: count.data }, (_, i) => ({ session_id: sessionId, name: `Team ${i + 1}`, position: i })))
      .select("id, position")
      .order("position");
    if (teamError || !created) fail(path, teamError?.message ?? "Couldn't create teams");
    teams = created;
  }

  const players = ((regs ?? []) as unknown as { id: string; profile: { skill_level: SkillLevel | null } }[]).map((r) => ({
    id: r.id,
    skill: r.profile.skill_level,
  }));
  const { data: requestRows } = await supabase
    .from("team_requests")
    .select("registration_id, requested_id")
    .in(
      "registration_id",
      players.map((p) => p.id),
    );
  const requests = (requestRows ?? []).map((r) => ({ from: r.registration_id as string, to: r.requested_id as string }));
  const groups = balanceTeams(players, teams.length, Math.random, requests);
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
  await flash("success", `${teams.length} teams made, balanced by skill`);
}

export async function renameTeam(teamId: string, sessionId: string, formData: FormData) {
  await requireAdmin();
  const name = z.string().trim().min(1).max(40).safeParse(formData.get("name"));
  if (!name.success) fail(`/admin/sessions/${sessionId}`, "Team names need 1–40 characters");
  const supabase = await createClient();
  const { error } = await supabase.from("session_teams").update({ name: name.data }).eq("id", teamId);
  if (error) fail(`/admin/sessions/${sessionId}`, error.message);
  revalidateTeams(sessionId);
  await flash("success", `Team renamed to ${name.data}`);
}

export async function moveToTeam(registrationId: string, sessionId: string, formData: FormData) {
  await requireAdmin();
  const teamId = String(formData.get("team_id") ?? "") || null;
  const supabase = await createClient();
  const { error } = await supabase.from("registrations").update({ team_id: teamId }).eq("id", registrationId);
  if (error) fail(`/admin/sessions/${sessionId}`, error.message);
  revalidateTeams(sessionId);
  await flash("success", teamId ? "Player moved" : "Player taken off their team");
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
  await flash("success", published ? "Teams are now visible to players" : "Teams hidden from players");
}

export async function removeTeams(sessionId: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("session_teams").delete().eq("session_id", sessionId);
  if (!error) await supabase.from("sessions").update({ teams_published_at: null }).eq("id", sessionId);
  if (error) fail(`/admin/sessions/${sessionId}`, error.message);
  revalidateTeams(sessionId);
  await flash("success", "Teams removed");
}

// ---------------------------------------------------------------------------
// Game schedule
// ---------------------------------------------------------------------------

const GameMinutes = z.preprocess(
  (v) => (v === "" || v == null ? null : v),
  z.coerce.number().int().min(5, "Games need at least 5 minutes").max(120, "Games can be up to 120 minutes").nullable(),
);

/** Round robin for the session's teams: every team plays every other once, `courts` games at a time. */
export async function makeSchedule(sessionId: string, formData: FormData) {
  await requireAdmin();
  const path = `/admin/sessions/${sessionId}`;
  const courts = z.coerce.number().int().min(1).max(3).safeParse(formData.get("courts"));
  if (!courts.success) fail(path, "Pick 1 to 3 courts");
  const minutes = GameMinutes.safeParse(formData.get("minutes"));
  if (!minutes.success) fail(path, minutes.error.issues[0].message);

  const supabase = await createClient();
  const { data: teams } = await supabase.from("session_teams").select("id").eq("session_id", sessionId).order("position");
  if (!teams || teams.length < 2) fail(path, "Make at least 2 teams first");

  const games = roundRobin(
    teams.map((t) => t.id),
    courts.data,
  );
  const { error: delError } = await supabase.from("session_matches").delete().eq("session_id", sessionId);
  if (delError) fail(path, delError.message);
  const { error } = await supabase.from("session_matches").insert(
    games.map((g) => ({ session_id: sessionId, slot: g.slot, court: g.court, team_a_id: g.a, team_b_id: g.b })),
  );
  if (error) fail(path, error.message);
  await supabase.from("sessions").update({ schedule_game_minutes: minutes.data }).eq("id", sessionId);
  revalidateTeams(sessionId);
  await flash("success", `Schedule made: ${games.length} games`);
}

/** Swap who plays in one game. */
export async function editMatch(matchId: string, sessionId: string, formData: FormData) {
  await requireAdmin();
  const path = `/admin/sessions/${sessionId}`;
  const a = String(formData.get("team_a") ?? "");
  const b = String(formData.get("team_b") ?? "");
  if (!a || !b || a === b) fail(path, "Pick two different teams");

  const supabase = await createClient();
  const { data: teams } = await supabase.from("session_teams").select("id").eq("session_id", sessionId).in("id", [a, b]);
  if ((teams ?? []).length !== 2) fail(path, "Those teams aren't in this session");
  const { error } = await supabase
    .from("session_matches")
    .update({ team_a_id: a, team_b_id: b })
    .eq("id", matchId)
    .eq("session_id", sessionId);
  if (error) fail(path, error.message);
  revalidateTeams(sessionId);
  await flash("success", "Game updated");
}

/** Change the game length (times only; matchups stay). */
export async function setScheduleMinutes(sessionId: string, formData: FormData) {
  await requireAdmin();
  const path = `/admin/sessions/${sessionId}`;
  const minutes = GameMinutes.safeParse(formData.get("minutes"));
  if (!minutes.success) fail(path, minutes.error.issues[0].message);
  const supabase = await createClient();
  const { error } = await supabase.from("sessions").update({ schedule_game_minutes: minutes.data }).eq("id", sessionId);
  if (error) fail(path, error.message);
  revalidateTeams(sessionId);
  await flash("success", minutes.data ? `Games are ${minutes.data} minutes` : "Times removed from the schedule");
}

export async function removeSchedule(sessionId: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("session_matches").delete().eq("session_id", sessionId);
  if (error) fail(`/admin/sessions/${sessionId}`, error.message);
  revalidateTeams(sessionId);
  await flash("success", "Schedule removed");
}

// ---------------------------------------------------------------------------
// Updates board
// ---------------------------------------------------------------------------

const PostForm = z.object({
  title: z.string().trim().min(1, "Give the post a title").max(120, "Titles can be up to 120 characters"),
  body_html: z.string().max(50_000, "That post is too long").default(""),
  featured: z.literal("on").optional(),
  email: z.literal("on").optional(),
  intent: z.enum(["draft", "publish", "save"]).default("save"),
});

function revalidatePosts() {
  revalidatePath("/");
  revalidatePath("/updates");
  revalidatePath("/admin/updates");
}

/** Make `postId` the one featured post (or un-feature it). */
async function setFeatured(supabase: Awaited<ReturnType<typeof createClient>>, postId: string, featured: boolean) {
  if (featured) {
    await supabase.from("posts").update({ featured: false }).eq("featured", true).neq("id", postId);
  }
  return supabase.from("posts").update({ featured }).eq("id", postId);
}

export async function savePost(postId: string | null, formData: FormData) {
  const me = await requireAdmin();
  const formPath = postId ? `/admin/updates/${postId}` : "/admin/updates/new";
  const parsed = PostForm.safeParse(Object.fromEntries(formData));
  if (!parsed.success) fail(formPath, parsed.error.issues[0].message);
  const f = parsed.data;
  const body = sanitizePostHtml(f.body_html);
  if (f.intent === "publish" && isEmptyPost(body)) fail(formPath, "Write something before publishing");

  const supabase = await createClient();
  const existing = postId
    ? (await supabase.from("posts").select("published_at, emailed_at").eq("id", postId).maybeSingle()).data
    : null;
  if (postId && !existing) fail("/admin/updates", "That post no longer exists");

  const publishedAt = existing?.published_at ?? (f.intent === "publish" ? new Date().toISOString() : null);
  const row = { title: f.title, body_html: body, published_at: publishedAt, updated_at: new Date().toISOString() };
  const { data: saved, error } = postId
    ? await supabase.from("posts").update(row).eq("id", postId).select("id").single()
    : await supabase.from("posts").insert({ ...row, author_id: me.id }).select("id").single();
  if (error || !saved) fail(formPath, error?.message ?? "Couldn't save the post");

  const { error: featureError } = await setFeatured(supabase, saved.id, Boolean(publishedAt) && f.featured === "on");
  if (featureError) fail(formPath, featureError.message);

  // Email once: claim emailed_at first so a double submit can't send twice.
  let emailing = 0;
  if (publishedAt && f.email === "on" && !existing?.emailed_at) {
    const { data: claimed } = await supabase
      .from("posts")
      .update({ emailed_at: new Date().toISOString() })
      .eq("id", saved.id)
      .is("emailed_at", null)
      .select("id");
    if (claimed?.length) {
      emailing = await countAnnouncementRecipients();
      after(() => sendPostToPlayers(saved.id).catch((err) => console.error("Announcement send failed", err)));
    }
  }

  revalidatePosts();
  const verb = !publishedAt ? "Draft saved" : existing?.published_at ? "Post saved" : "Post published";
  await flash("success", emailing ? `${verb}. Emailing ${emailing} player${emailing === 1 ? "" : "s"}.` : verb);
  redirect("/admin/updates");
}

export async function setPostFeatured(postId: string, featured: boolean) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await setFeatured(supabase, postId, featured);
  if (error) fail("/admin/updates", error.message);
  revalidatePosts();
  await flash("success", featured ? "Now shown on the home page" : "Removed from the home page");
}

export async function deletePost(postId: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("posts").delete().eq("id", postId);
  if (error) fail("/admin/updates", error.message);
  revalidatePosts();
  await flash("success", "Post deleted");
  redirect("/admin/updates");
}
