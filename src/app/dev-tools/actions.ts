"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sendHostNotifications } from "@/lib/host-notifications";
import { requireDevTools } from "@/lib/auth";
import { flash } from "@/lib/flash";
import { BACKUP_COOKIE, buildPatch, databaseName, isEditableTable, type ColumnInfo } from "@/lib/dev-tools";
import { dispatchEvents, parseEvents } from "@/lib/registrations";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import type { RegistrationEvent, RegistrationStatus } from "@/lib/types";

// Every write goes through a devtools_* database function with the dev tools user's own
// session: the database re-checks is_devtools_user() and records it in devtools_audit.

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

const STATUSES: RegistrationStatus[] = ["pending_payment", "confirmed", "waitlisted", "expired", "cancelled"];
const EMAIL_EVENTS = new Set<string>(["signed_up", "waitlisted", "promoted", "confirmed", "expired", "reminder", "hold_reminder", "session_cancelled"]);

// ---------------------------------------------------------------------------
// Table editor
// ---------------------------------------------------------------------------

export async function saveRow(table: string, id: string, formData: FormData) {
  await requireDevTools();
  const path = `/dev-tools/data/${table}/${id}`;
  if (!isEditableTable(table)) fail("/dev-tools/data", "Unknown table");

  const supabase = await createClient();
  const [{ data: columns, error: colError }, { data: row, error: rowError }] = await Promise.all([
    supabase.rpc("devtools_table_columns", { p_table: table }),
    supabase.rpc("devtools_get_row", { p_table: table, p_id: id }),
  ]);
  if (colError || rowError) fail(path, (colError ?? rowError)!.message);
  if (!row) fail("/dev-tools/data", "That row doesn't exist any more");

  let patch: Record<string, unknown>;
  try {
    patch = buildPatch(columns as ColumnInfo[], row as Record<string, unknown>, formData);
  } catch (err) {
    fail(path, (err as Error).message);
  }
  if (Object.keys(patch).length === 0) {
    await flash("success", "Nothing changed");
    return;
  }

  const { error } = await supabase.rpc("devtools_update_row", { p_table: table, p_id: id, p_patch: patch });
  if (error) fail(path, error.message);
  revalidatePath("/", "layout");
  await flash("success", `Saved ${Object.keys(patch).join(", ")}`);
}

export async function deleteRow(table: string, id: string) {
  await requireDevTools();
  if (!isEditableTable(table)) fail("/dev-tools/data", "Unknown table");
  const supabase = await createClient();
  const { error } = await supabase.rpc("devtools_delete_row", { p_table: table, p_id: id });
  if (error) fail(`/dev-tools/data/${table}/${id}`, error.message);
  revalidatePath("/", "layout");
  await flash("success", table === "profiles" ? "Account deleted" : "Row deleted");
  redirect(`/dev-tools/data?table=${table}`);
}

export async function forceStatus(registrationId: string, formData: FormData) {
  await requireDevTools();
  const path = `/dev-tools/data/registrations/${registrationId}`;
  const status = String(formData.get("status"));
  if (!STATUSES.includes(status as RegistrationStatus)) fail(path, "Pick a status");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("devtools_force_status", {
    p_registration_id: registrationId,
    p_status: status,
  });
  if (error) fail(path, error.message);
  const events = parseEvents(data);
  await dispatchEvents(events);
  revalidatePath("/", "layout");
  await flash(
    "success",
    events.length ? `Status set. ${events.length} waitlisted player(s) moved up and were emailed.` : "Status set",
  );
}

// ---------------------------------------------------------------------------
// Repairs
// ---------------------------------------------------------------------------

/** Runs the every-minute job now (expire holds, promote, reminders, weekly sessions, host emails). */
export async function runTickNow() {
  await requireDevTools();
  const { data, error } = await createAdminClient().rpc("run_tick");
  if (error) fail("/dev-tools", error.message);
  const events = parseEvents(data);
  await dispatchEvents(events);
  await sendHostNotifications().catch((err) => console.error("Host notifications failed", err));
  revalidatePath("/", "layout");
  await flash("success", `Tick ran: ${events.length} event(s)`);
}

export async function createFromTemplates() {
  await requireDevTools();
  const { data, error } = await createAdminClient().rpc("create_sessions_from_templates");
  if (error) fail("/dev-tools", error.message);
  revalidatePath("/", "layout");
  await flash("success", `${data ?? 0} new session(s) created`);
}

/** Drops an email's de-dupe record and sends it again (sign-up emails only). */
export async function resendEmail(emailId: number) {
  await requireDevTools();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("devtools_release_email", { p_email_id: emailId });
  if (error) fail("/dev-tools", error.message);
  const row = data as { kind: string; registration_id: string | null };
  if (!row.registration_id || !EMAIL_EVENTS.has(row.kind)) fail("/dev-tools", "Only sign-up emails can be re-sent here");
  await dispatchEvents([{ event: row.kind as RegistrationEvent["event"], registration_id: row.registration_id }]);
  revalidatePath("/dev-tools");
  await flash("success", `Re-sent the ${row.kind.replace(/_/g, " ")} email`);
}

export async function setMaintenance(formData: FormData) {
  await requireDevTools();
  const supabase = await createClient();
  const { error } = await supabase.rpc("devtools_set_maintenance", {
    p_on: formData.get("on") === "on",
    p_message: String(formData.get("message") ?? ""),
  });
  if (error) fail("/dev-tools", error.message);
  revalidatePath("/", "layout");
  await flash("success", formData.get("on") === "on" ? "Maintenance mode is on" : "Maintenance mode is off");
}

// ---------------------------------------------------------------------------
// Danger zone
// ---------------------------------------------------------------------------

const CLEAR_LABELS: Record<string, string> = {
  email_log: "email log",
  past_sessions: "past sessions",
  unmatched_payments: "unmatched payments",
  audit: "audit entries older than 30 days",
};

export async function clearData(formData: FormData) {
  await requireDevTools();
  const scope = String(formData.get("scope"));
  if (!(scope in CLEAR_LABELS)) fail("/dev-tools/danger", "Unknown clean-up");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("devtools_clear", { p_scope: scope });
  if (error) fail("/dev-tools/danger", error.message);
  revalidatePath("/", "layout");
  await flash("success", `Cleared ${CLEAR_LABELS[scope]} (${data ?? 0} rows)`);
}

export async function resetDatabase(formData: FormData) {
  await requireDevTools();
  const db = databaseName();
  if (String(formData.get("confirm") ?? "").trim() !== `RESET ${db}`) {
    fail("/dev-tools/danger", `Type RESET ${db} exactly to reset`);
  }
  if (!(await cookies()).get(BACKUP_COOKIE)) fail("/dev-tools/danger", "Download a backup first (it unlocks Reset for an hour)");

  const supabase = await createClient();
  const { error } = await supabase.rpc("devtools_reset", {
    p_confirm: "RESET",
    p_wipe_players: formData.get("wipe_players") === "on",
  });
  if (error) fail("/dev-tools/danger", error.message);
  (await cookies()).delete(BACKUP_COOKIE);
  revalidatePath("/", "layout");
  await flash("success", `${db} database reset`);
}
