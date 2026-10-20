import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { retryQueuedEmails } from "@/lib/email/send";
import { env } from "@/lib/env";
import { sendHostNotifications } from "@/lib/host-notifications";
import { dispatchEvents, parseEvents } from "@/lib/registrations";
import { createAdminClient } from "@/lib/supabase/server";

function authorized(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${env.cronSecret()}`;
  return header.length === expected.length && timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

// Called every minute by pg_cron (see supabase/setup/cron.sql):
// creates weekly sessions, expires unpaid holds, promotes waitlists, sends reminders,
// then the hosts' notification emails. Queued emails are retried first.
async function handle(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await createAdminClient().rpc("run_tick");
  if (error) {
    console.error("run_tick failed", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  // Emails Gmail couldn't take earlier (daily limit, outage) go first, oldest first.
  try {
    await retryQueuedEmails();
  } catch (err) {
    console.error("Retrying queued emails failed", err);
  }
  const events = parseEvents(data);
  await dispatchEvents(events);
  // Host emails: instant alerts, digests and the session-day email (each sent at most once).
  try {
    await sendHostNotifications();
  } catch (err) {
    console.error("Host notifications failed", err);
  }
  return NextResponse.json({ ok: true, events: events.length });
}

export const GET = handle;
export const POST = handle;
