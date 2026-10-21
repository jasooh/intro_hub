"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { countAnnouncementRecipients, sendPostToPlayers } from "@/lib/announcements";
import { AUDIENCES, audienceOf } from "@/lib/audiences";
import { requireAdmin } from "@/lib/auth";
import { env } from "@/lib/env";
import { flash } from "@/lib/flash";
import { formatDateTime, zonedLocalToUtc } from "@/lib/format";
import { dispatchEvents, parseEvents } from "@/lib/registrations";
import { isEmptyPost, sanitizePostHtml } from "@/lib/rich-text";
import { roundRobin } from "@/lib/schedule";
import { blockOffsets, type BlockClocks } from "@/lib/session-times";
import { sendSessionMessage } from "@/lib/session-messages";
import { balanceTeams } from "@/lib/teams";
import type { RegistrationEvent, SkillLevel } from "@/lib/types";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { expireCounts, expirePosts, expireSession } from "@/lib/public-cache";

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

/** Plain-English versions of the errors the admin_* functions raise. */
const RPC_ERRORS: Record<string, string> = {
  already_signed_up: "They're already signed up for this session.",
  option_unavailable: "That option isn't offered for this session.",
  session_unavailable: "This session isn't open (it may be cancelled).",
  guest_name_required: "Give the guest a name.",
  player_not_found: "That player doesn't exist anymore.",
  payment_unavailable: "That payment was already taken back.",
  cancellation_handled: "This cancellation was already sorted out.",
  merge_conflict: "They're both signed up for the same session. Remove one of those sign-ups first, then link them.",
  not_a_guest: "Only guests a host added can be linked to an account.",
  not_an_account: "Pick a player who signed in with Google.",
};

async function rpc(fn: string, args: Record<string, unknown>, path: string, success?: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) fail(path, Object.entries(RPC_ERRORS).find(([k]) => error.message.includes(k))?.[1] ?? error.message);
  const events = parseEvents(data);
  after(() => dispatchEvents(events));
  revalidatePath(path);
  expireCounts(); // every admin_* change here touches sign-ups
  if (success) await flash("success", success);
}

// ---------------------------------------------------------------------------
// Host notification settings (account page)
// ---------------------------------------------------------------------------

const HostNotificationsForm = z.object({
  host_emails: z.literal("on").optional(),
  host_digest: z.enum(["off", "3h", "daily"]),
  host_session_day: z.literal("on").optional(),
  host_alert_late_cancel: z.literal("on").optional(),
  host_alert_unmatched: z.literal("on").optional(),
});

export async function saveHostNotifications(formData: FormData) {
  const me = await requireAdmin();
  const parsed = HostNotificationsForm.safeParse(Object.fromEntries(formData));
  if (!parsed.success) fail("/me", "Pick how often to get the summary");
  const f = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      // The main switch; the choices below it are kept as picked even while it's off.
      host_emails: f.host_emails === "on",
      host_digest: f.host_digest,
      host_session_day: f.host_session_day === "on",
      host_alert_late_cancel: f.host_alert_late_cancel === "on",
      host_alert_unmatched: f.host_alert_unmatched === "on",
    })
    .eq("id", me.id);
  if (error) fail("/me", error.message);
  revalidatePath("/me");
  await flash("success", "Host emails saved");
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

const dollars = z.coerce.number().min(0).max(1000).transform((d) => Math.round(d * 100));
/** Blank = not offered. */
const optionalDollars = z.preprocess((v) => (v === "" || v == null ? null : v), dollars.nullable());
/** Blank = no limit. */
const optionalCount = z.preprocess(
  (v) => (v === "" || v == null ? null : v),
  z.coerce.number().int().min(1).max(200).nullable(),
);
/** The four block times (HH:MM): instructional start/end, then drop-in start/end. */
const clock = z.string().regex(/^\d{2}:\d{2}$/, "Times must be HH:MM");
const clockFields = {
  instructional_start: clock,
  instructional_end: clock,
  dropin_start: clock,
  dropin_end: clock,
};

/** Minutes after the instructional start for each block edge, or a form error. */
function offsetsOf(f: BlockClocks, path: string) {
  const result = blockOffsets(f);
  if ("error" in result) fail(path, result.error);
  return result.offsets;
}

const SessionForm = z.object({
  title: z.string().trim().min(1).max(100),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  ...clockFields,
  location: z.string().trim().min(1).max(200),
  capacity: z.coerce.number().int().min(1).max(200),
  price: dollars,
  opens_at: z.string().min(1, "Sign-up open time is required"),
  hold_hours: z.coerce.number().int().min(1).max(168),
  cancel_cutoff_hours: z.coerce.number().int().min(0).max(336),
  notes: z.string().max(2000).optional(),
  instructional_price: optionalDollars,
  deposit: optionalDollars,
  dropin_price: optionalDollars,
  instructional_capacity: optionalCount,
  announce: z.literal("on").optional(),
});

function sessionRow(formData: FormData, path: string) {
  const parsed = SessionForm.safeParse(Object.fromEntries(formData));
  if (!parsed.success) fail(path, parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  const f = parsed.data;
  const o = offsetsOf(f, path);
  const startsAt = zonedLocalToUtc(`${f.date}T${f.instructional_start}`);
  const at = (minutes: number) => new Date(startsAt.getTime() + minutes * 60_000).toISOString();
  return {
    title: f.title,
    starts_at: startsAt.toISOString(),
    ends_at: at(o.end),
    location: f.location,
    capacity: f.capacity,
    price_cents: f.price,
    opens_at: zonedLocalToUtc(f.opens_at).toISOString(),
    hold_hours: f.hold_hours,
    cancel_cutoff: new Date(startsAt.getTime() - f.cancel_cutoff_hours * 3_600_000).toISOString(),
    notes: f.notes?.trim() || null,
    instructional_price_cents: f.instructional_price,
    instructional_ends_at: at(o.instructionalEnd),
    dropin_starts_at: at(o.dropinStart),
    deposit_cents: f.deposit,
    dropin_price_cents: f.dropin_price,
    instructional_capacity: f.instructional_price == null ? null : f.instructional_capacity,
    announce: f.announce === "on",
  };
}

export async function createSession(formData: FormData) {
  await requireAdmin();
  expireSession();
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
  expireSession(sessionId);
  const path = `/admin/sessions/${sessionId}`;
  const row = sessionRow(formData, path);
  const supabase = await createClient();
  const timeAndPlace = "schedule_revision, starts_at, location, status";
  const { data: before } = await supabase.from("sessions").select(timeAndPlace).eq("id", sessionId).maybeSingle();
  const { data: updated, error } = await supabase.from("sessions").update(row).eq("id", sessionId).select(timeAndPlace).single();
  if (error) fail(path, error.message);

  // Date, time or place changed (the DB bumps schedule_revision): tell everyone signed up or waiting.
  let notified = 0;
  if (
    before &&
    updated.schedule_revision > before.schedule_revision &&
    updated.status === "scheduled" &&
    new Date(updated.starts_at) > new Date()
  ) {
    const { data: signedUp } = await supabase
      .from("registrations")
      .select("id")
      .eq("session_id", sessionId)
      .in("status", ["confirmed", "pending_payment", "waitlisted"]);
    const changed: RegistrationEvent[] = (signedUp ?? []).map((r) => ({
      event: "session_changed",
      registration_id: r.id,
      revision: updated.schedule_revision,
      before: { when: formatDateTime(before.starts_at), location: before.location },
    }));
    notified = changed.length;
    if (changed.length) after(() => dispatchEvents(changed));
  }

  // Prices or the deposit may have changed: unpaid sign-ups owe the new amount.
  const { data: repriced, error: repriceError } = await supabase.rpc("admin_reprice_session", { p_session_id: sessionId });
  if (repriceError) fail(path, repriceError.message);
  const repricedEvents = parseEvents(repriced);
  after(() => dispatchEvents(repricedEvents));
  // Capacity may have gone up: pull people off the waitlist.
  const saved = notified
    ? `Session saved · ${notified} player${notified === 1 ? "" : "s"} emailed about the change`
    : "Session saved";
  await rpc("admin_promote", { p_session_id: sessionId }, path, saved);
  revalidatePath("/", "layout");
}

/** Undo a Bring a Friend pairing (on the friend) or one player's discount (on the regular). */
export async function removeFriendDiscount(registrationId: string, sessionId: string) {
  await requireAdmin();
  await rpc(
    "admin_remove_friend_discount",
    { p_registration_id: registrationId },
    `/admin/sessions/${sessionId}`,
    "Bring a Friend discount removed",
  );
}

export async function cancelSession(sessionId: string, formData: FormData) {
  await requireAdmin();
  expireSession(sessionId);
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 500);
  await rpc(
    "admin_cancel_session",
    { p_session_id: sessionId, p_reason: reason || null },
    `/admin/sessions/${sessionId}`,
    "Session cancelled. Everyone signed up is being emailed.",
  );
  revalidatePath("/", "layout");
}

const RosterEmailForm = z.object({
  subject: z.string().trim().min(1, "Give the email a subject").max(150, "Subjects can be up to 150 characters"),
  body_html: z.string().max(50_000, "That message is too long").default(""),
  audiences: z.array(z.enum(AUDIENCES)).min(1, "Pick at least one group to email"),
});

/** Email this session's players (the ticked groups). Sends in the background after the redirect. */
export async function emailRoster(sessionId: string, formData: FormData) {
  const me = await requireAdmin();
  const path = `/admin/sessions/${sessionId}`;
  const parsed = RosterEmailForm.safeParse({
    subject: formData.get("subject"),
    body_html: formData.get("body_html") ?? "",
    audiences: formData.getAll("audiences"),
  });
  if (!parsed.success) fail(path, parsed.error.issues[0].message);
  const f = parsed.data;
  const body = sanitizePostHtml(f.body_html);
  if (isEmptyPost(body)) fail(path, "Write a message before sending");

  const supabase = await createClient();
  const { data: regs, error: regError } = await supabase
    .from("registrations")
    .select("status, option")
    .eq("session_id", sessionId);
  if (regError) fail(path, regError.message);
  const recipients = (regs ?? []).filter((r) => {
    const audience = audienceOf(r);
    return audience != null && f.audiences.includes(audience);
  }).length;
  if (recipients === 0) fail(path, "Nobody in those groups to email");

  const { data: message, error } = await supabase
    .from("session_messages")
    .insert({ session_id: sessionId, subject: f.subject, body_html: body, audiences: f.audiences, sent_by: me.id, recipient_count: recipients })
    .select("id")
    .single();
  if (error || !message) fail(path, error?.message ?? "Couldn't save the email");

  after(() => sendSessionMessage(message.id).catch((err) => console.error("Session message send failed", err)));
  revalidatePath(path);
  await flash("success", `Emailing ${recipients} player${recipients === 1 ? "" : "s"}`);
}

// ---------------------------------------------------------------------------
// Roster
// ---------------------------------------------------------------------------

const AddPlayerForm = z.object({
  mode: z.enum(["account", "guest"]),
  profile_id: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
  guest_name: z.string().trim().max(100).optional(),
  guest_email: z.union([z.literal(""), z.string().trim().email("That email doesn't look right")]).optional(),
  option: z.enum(["full", "instructional", "dropin"]),
  paid: z.literal("on").optional(),
});

/** Add someone by hand: an existing player, or a guest without an account. A full session gets another spot. */
export async function addPlayer(sessionId: string, formData: FormData) {
  await requireAdmin();
  const path = `/admin/sessions/${sessionId}`;
  const parsed = AddPlayerForm.safeParse(Object.fromEntries(formData));
  if (!parsed.success) fail(path, parsed.error.issues[0].message);
  const f = parsed.data;
  if (f.mode === "account" && !f.profile_id) fail(path, "Pick a player to add");
  if (f.mode === "guest" && !f.guest_name) fail(path, "Give the guest a name");
  await rpc(
    "admin_add_player",
    {
      p_session_id: sessionId,
      p_profile_id: f.mode === "account" ? f.profile_id : null,
      p_guest_name: f.mode === "guest" ? f.guest_name : null,
      p_guest_email: f.mode === "guest" ? f.guest_email || null : null,
      p_option: f.option,
      p_paid: f.paid === "on",
    },
    path,
    f.paid === "on" ? "Player added and marked paid" : "Player added",
  );
}

/** Email everyone in the session who still owes money (skips anyone reminded in the last few minutes). */
export async function nudgeUnpaid(sessionId: string) {
  await requireAdmin();
  const path = `/admin/sessions/${sessionId}`;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_nudge_unpaid", { p_session_id: sessionId });
  if (error) fail(path, error.message);
  const events = parseEvents(data);
  after(() => dispatchEvents(events));
  revalidatePath(path);
  await flash(
    "success",
    events.length
      ? `Reminding ${events.length} player${events.length === 1 ? "" : "s"} to pay`
      : "Nobody to remind (everyone was just reminded)",
  );
}

export async function markPaid(registrationId: string, sessionId: string) {
  await requireAdmin();
  await rpc("admin_mark_paid", { p_registration_id: registrationId }, `/admin/sessions/${sessionId}`, "Marked as paid");
}

/** Mark paid from the Owed page: same as markPaid, but stays on (and refreshes) /admin/owed. */
export async function markPaidFromOwed(registrationId: string, sessionId: string) {
  await requireAdmin();
  await rpc("admin_mark_paid", { p_registration_id: registrationId }, "/admin/owed", "Marked as paid");
  revalidatePath(`/admin/sessions/${sessionId}`);
}

/** Owed page: email one player about everything they still owe on upcoming sessions. */
export async function remindPlayer(profileId: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_nudge_player", { p_profile_id: profileId });
  if (error) fail("/admin/owed", error.message);
  const events = parseEvents(data);
  after(() => dispatchEvents(events));
  revalidatePath("/admin/owed");
  await flash(
    "success",
    events.length
      ? `Reminder sent for ${events.length} sign-up${events.length === 1 ? "" : "s"}`
      : "Nothing to remind about (already reminded, or nothing upcoming)",
  );
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

/** A host picks which payment a cancelled e-Transfer took back. */
export async function reverseCancelledPayment(cancellationId: string, formData: FormData) {
  await requireAdmin();
  const paymentId = formData.get("payment_id");
  if (typeof paymentId !== "string" || !paymentId) fail("/admin/payments", "Pick the payment first");
  await rpc(
    "admin_reverse_payment",
    { p_cancellation_id: cancellationId, p_payment_id: paymentId },
    "/admin/payments",
    "Payment taken back. The player has been emailed.",
  );
}

export async function setCancellationDismissed(cancellationId: string, dismissed: boolean) {
  await requireAdmin();
  await rpc(
    "admin_dismiss_cancellation",
    { p_cancellation_id: cancellationId, p_dismissed: dismissed },
    "/admin/payments",
    dismissed ? "Cancellation dismissed" : "Cancellation restored",
  );
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
/** Stop a player signing up (they're told to contact the hosts). Existing sign-ups stay until removed. */
export async function blockPlayer(profileId: string, formData: FormData) {
  const me = await requireAdmin();
  if (profileId === me.id) fail("/admin/players", "You can't block yourself.");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 500) || null;
  const supabase = await createClient();
  const { error } = await supabase.from("player_blocks").upsert({ profile_id: profileId, reason, blocked_by: me.id });
  if (error) fail("/admin/players", error.message);
  revalidatePath("/admin", "layout");
  await flash("success", "Blocked from signing up");
}

export async function unblockPlayer(profileId: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("player_blocks").delete().eq("profile_id", profileId);
  if (error) fail("/admin/players", error.message);
  revalidatePath("/admin", "layout");
  await flash("success", "Unblocked: they can sign up again");
}

/** A guest a host added has since signed in: move their sign-ups (and history) onto that account. */
export async function mergeGuest(guestId: string, sessionId: string, formData: FormData) {
  await requireAdmin();
  const path = `/admin/sessions/${sessionId}`;
  const account = String(formData.get("account") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(account)) fail(path, "Pick their account first");
  await rpc("admin_merge_guest", { p_guest: guestId, p_account: account }, path, "Guest linked to their account");
  revalidatePath("/admin", "layout");
}

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
  ...clockFields,
  location: z.string().trim().min(1).max(200),
  capacity: z.coerce.number().int().min(1).max(200),
  price: dollars,
  open_hours_before: z.coerce.number().int().min(0).max(1000),
  hold_hours: z.coerce.number().int().min(1).max(168),
  cancel_cutoff_hours: z.coerce.number().int().min(0).max(336),
  active: z.literal("on").optional(),
  instructional_price: optionalDollars,
  dropin_price: optionalDollars,
  instructional_capacity: optionalCount,
});

const TEMPLATE_FIELD_LABELS: Record<string, string> = {
  title: "Title",
  weekday: "Day",
  instructional_start: "Instructional starts",
  instructional_end: "Instructional ends",
  dropin_start: "Drop-in starts",
  dropin_end: "Drop-in ends",
  location: "Location",
  capacity: "Spots",
  price: "Price",
  open_hours_before: "Sign-ups open",
  hold_hours: "Hours to pay after signing up",
  cancel_cutoff_hours: "Refund cutoff",
  instructional_price: "Instructional-only price",
  dropin_price: "Drop-in only price",
  instructional_capacity: "Instructional spots",
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
  const {
    price,
    active,
    instructional_price,
    dropin_price,
    instructional_capacity,
    instructional_start,
    instructional_end,
    dropin_start,
    dropin_end,
    ...rest
  } = parsed.data;
  const o = offsetsOf({ instructional_start, instructional_end, dropin_start, dropin_end }, formPath);
  const row = {
    ...rest,
    start_time: instructional_start,
    duration_minutes: o.end,
    price_cents: price,
    active: active === "on",
    timezone: env.timezone(),
    instructional_price_cents: instructional_price,
    instructional_minutes: o.instructionalEnd,
    dropin_offset_minutes: o.dropinStart,
    dropin_price_cents: dropin_price,
    instructional_capacity: instructional_price == null ? null : instructional_capacity,
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
    .select("id, profile_id, profile:profiles(skill_level)")
    .eq("session_id", sessionId)
    .in("option", ["full", "dropin"])
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

  const regList = (regs ?? []) as unknown as { id: string; profile_id: string; profile: { skill_level: SkillLevel | null } }[];
  const { data: ratingRows } = regList.length
    ? await supabase
        .from("player_ratings")
        .select("profile_id, rating")
        .in(
          "profile_id",
          regList.map((r) => r.profile_id),
        )
    : { data: [] };
  const ratings = new Map((ratingRows ?? []).map((r) => [r.profile_id as string, r.rating as number]));
  const players = regList.map((r) => ({
    id: r.id,
    skill: r.profile.skill_level,
    rating: ratings.get(r.profile_id) ?? null,
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

/** A host's 1–5 rating for a player (blank clears it, back to what they picked). Players never see it. */
export async function setPlayerRating(profileId: string, path: string, formData: FormData) {
  const me = await requireAdmin();
  const raw = String(formData.get("rating") ?? "");
  const supabase = await createClient();
  if (raw === "") {
    const { error } = await supabase.from("player_ratings").delete().eq("profile_id", profileId);
    if (error) fail(path, error.message);
    await flash("success", "Rating cleared");
  } else {
    const rating = z.coerce.number().int().min(1).max(5).safeParse(raw);
    if (!rating.success) fail(path, "Pick a rating from 1 to 5");
    const { error } = await supabase
      .from("player_ratings")
      .upsert({ profile_id: profileId, rating: rating.data, updated_by: me.id, updated_at: new Date().toISOString() });
    if (error) fail(path, error.message);
    await flash("success", "Rating saved");
  }
  revalidatePath("/admin", "layout");
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
  const picked = String(formData.get("team_id") ?? "");
  // "" = no team; anything else must be a team id (never the picker's "Move" placeholder).
  if (picked && !z.string().uuid().safeParse(picked).success) return;
  const teamId = picked || null;
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
  expirePosts();
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
