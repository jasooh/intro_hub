import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { dispatchEvents, parseEvents } from "@/lib/registrations";
import { createAdminClient } from "@/lib/supabase/server";

function authorized(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${env.cronSecret()}`;
  return header.length === expected.length && timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

// Called every minute by pg_cron (see supabase/setup/cron.sql):
// creates weekly sessions, expires unpaid holds, promotes waitlists, sends reminders.
async function handle(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await createAdminClient().rpc("run_tick");
  if (error) {
    console.error("run_tick failed", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const events = parseEvents(data);
  await dispatchEvents(events);
  return NextResponse.json({ ok: true, events: events.length });
}

export const GET = handle;
export const POST = handle;
