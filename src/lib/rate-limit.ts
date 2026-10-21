import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";

/** What players see when they hit a limit. */
export const SLOW_DOWN = "That's a lot of requests in a short time. Please wait a minute and try again.";

/** The caller's IP (Vercel sets x-forwarded-for; the first entry is the client). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

/** The key one limit counts against, e.g. "feedback:1.2.3.4". */
export const limitKey = (name: string, who: string) => `${name}:${who}`;

/**
 * Counts one request against `name` for `who` (a user id or IP) and says
 * whether it's allowed: at most `limit` per `windowSec` seconds (rate_limit_hit
 * in supabase/migrations/20261122000000_rate_limits.sql). Fails open, so a
 * database hiccup never locks people out.
 */
export async function allowed(name: string, who: string, limit: number, windowSec: number): Promise<boolean> {
  try {
    const { data, error } = await createAdminClient().rpc("rate_limit_hit", {
      p_key: limitKey(name, who),
      p_limit: limit,
      p_window_seconds: windowSec,
    });
    if (error) throw error;
    return data !== false;
  } catch (err) {
    console.error(`Rate limit check failed for ${name}`, err);
    return true;
  }
}
