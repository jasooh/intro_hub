import "server-only";
import { createClient } from "@/lib/supabase/server";

export type EmailHealth = {
  /** Set while sending is paused. */
  paused: { until: string; reason: "quota" | "auth" | "transient"; detail: string | null } | null;
  waiting: number;
  sentToday: number;
  failedToday: number;
};

/** For the host panel: is email going out, and how much was sent in the last 24 hours. */
export async function getEmailHealth(): Promise<EmailHealth> {
  const supabase = await createClient();
  const now = Date.now();
  const since = new Date(now - 24 * 3_600_000).toISOString();
  const [{ data: health }, { count: queued }, { count: sent }, { count: failed }] = await Promise.all([
    supabase.from("email_health").select("paused_until, reason, detail").maybeSingle(),
    supabase.from("email_sends").select("id", { count: "exact", head: true }).in("status", ["queued", "sending"]),
    supabase.from("email_sends").select("id", { count: "exact", head: true }).eq("status", "sent").gte("sent_at", since),
    supabase.from("email_sends").select("id", { count: "exact", head: true }).eq("status", "failed").gte("created_at", since),
  ]);
  const paused =
    health?.paused_until && health.reason && Date.parse(health.paused_until) > now
      ? { until: health.paused_until as string, reason: health.reason as "quota" | "auth" | "transient", detail: health.detail as string | null }
      : null;
  return { paused, waiting: queued ?? 0, sentToday: sent ?? 0, failedToday: failed ?? 0 };
}
