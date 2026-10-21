import "server-only";
import { DEV_TOOLS_EMAIL } from "@/lib/auth";
import { sendEmail } from "@/lib/email/send";
import { env } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { createAdminClient, createClient } from "@/lib/supabase/server";

/** The every-minute job counts as stopped after this long without running. */
export const TICK_STALE_MINUTES = 10;

export type TickHealth = { lastTick: string | null; minutesAgo: number | null; stale: boolean };

/** When run_tick last ran (it writes app_settings.last_tick each time). */
export async function getTickHealth(): Promise<TickHealth> {
  const supabase = await createClient();
  const { data } = await supabase.from("app_settings").select("value").eq("key", "last_tick").maybeSingle();
  const lastTick = typeof data?.value === "string" ? data.value : null;
  if (!lastTick) return { lastTick: null, minutesAgo: null, stale: true };
  const minutesAgo = Math.floor((Date.now() - Date.parse(lastTick)) / 60_000);
  return { lastTick, minutesAgo, stale: minutesAgo >= TICK_STALE_MINUTES };
}

/** Email the developer once per outage (claimed in email_log by the last run time). */
export async function alertDevTickStale(health: TickHealth) {
  if (!health.stale || !health.lastTick) return;
  const admin = createAdminClient();
  const { error } = await admin.from("email_log").insert({ dedupe_key: `tick_stale:${health.lastTick}`, kind: "tick_stale" });
  if (error) return; // already sent for this outage (or the claim failed)
  const since = formatDateTime(health.lastTick);
  const text = `The every-minute job (run_tick) hasn't run since ${since}. Holds won't expire, the waitlist won't move and queued emails won't retry until it does.\n\nCheck pg_cron and /api/cron/tick: ${env.appUrl()}/dev-tools`;
  await sendEmail({
    to: DEV_TOOLS_EMAIL,
    subject: "Intro Hub: the every-minute job has stopped",
    html: `<p>${text.replace(/\n\n/g, "</p><p>")}</p>`,
    text,
  });
}
