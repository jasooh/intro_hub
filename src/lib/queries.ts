import "server-only";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Registration, Session, SessionCounts } from "@/lib/types";

export async function getCounts(sessionIds: string[]): Promise<Map<string, SessionCounts>> {
  if (sessionIds.length === 0) return new Map();
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_session_counts", { p_session_ids: sessionIds });
  return new Map(((data ?? []) as SessionCounts[]).map((c) => [c.session_id, c]));
}

/**
 * Sessions from 3 hours ago onwards. Players' lists pass `includeCancelled: false`;
 * hosts keep cancelled ones visible so they can still reach rosters and refunds.
 */
export async function getUpcomingSessions(limit = 10, { includeCancelled = true } = {}): Promise<Session[]> {
  await connection(); // "now" must be read per request, not at prerender time
  const supabase = await createClient();
  const since = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
  let query = supabase.from("sessions").select("*").gte("starts_at", since);
  if (!includeCancelled) query = query.neq("status", "cancelled");
  const { data } = await query.order("starts_at").limit(limit);
  return (data ?? []) as Session[];
}

export function spotsLeft(session: Session, counts?: SessionCounts) {
  const taken = (counts?.confirmed ?? 0) + (counts?.holding ?? 0);
  return Math.max(session.capacity - taken, 0);
}

/** The user's live registration for a session, plus time-based flags for the UI. */
export async function getMySpot(session: Session, profileId: string) {
  await connection();
  const supabase = await createClient();
  const { data } = await supabase
    .from("registrations")
    .select("*")
    .eq("session_id", session.id)
    .eq("profile_id", profileId)
    .in("status", ["pending_payment", "confirmed", "waitlisted"])
    .maybeSingle<Registration>();
  const now = Date.now();
  return {
    reg: data,
    started: now >= new Date(session.starts_at).getTime(),
    notOpenYet: now < new Date(session.opens_at).getTime(),
    beforeCutoff: now < new Date(session.cancel_cutoff).getTime(),
  };
}

export async function getMyRegistrations(profileId: string) {
  await connection();
  const supabase = await createClient();
  const { data } = await supabase
    .from("registrations")
    .select("*, session:sessions(*)")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(30);
  const regs = (data ?? []) as (Registration & { session: Session })[];
  const cutoff = Date.now() - 3 * 3600 * 1000;
  return {
    upcoming: regs.filter((r) => new Date(r.session.starts_at).getTime() > cutoff),
    past: regs.filter((r) => new Date(r.session.starts_at).getTime() <= cutoff),
  };
}

/** Start of the window used for payment matching and assignment (one week back). */
export async function paymentWindowStart() {
  await connection();
  return new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
}

export type AdminSessionView = "upcoming" | "past" | "cancelled";

/**
 * Sessions for the host dashboard, split into upcoming / past / cancelled and
 * optionally filtered by a search over title, location and notes. Also returns
 * how many sessions match the search in each view, for the tab counts.
 */
export async function getAdminSessions(view: AdminSessionView, search: string) {
  await connection();
  const supabase = await createClient();
  const cutoff = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
  // Commas, parentheses and wildcards would break PostgREST's or() filter syntax.
  const term = search.replace(/[,()%*\\]/g, " ").trim().slice(0, 80);

  const base = (head = false) => {
    let q = supabase.from("sessions").select("*", head ? { count: "exact", head: true } : undefined);
    if (term) q = q.or(`title.ilike.%${term}%,location.ilike.%${term}%,notes.ilike.%${term}%`);
    return q;
  };
  const scope = (q: ReturnType<typeof base>, v: AdminSessionView) =>
    v === "cancelled"
      ? q.eq("status", "cancelled")
      : v === "past"
        ? q.eq("status", "scheduled").lt("starts_at", cutoff)
        : q.eq("status", "scheduled").gte("starts_at", cutoff);

  const listQuery = scope(base(), view)
    .order("starts_at", { ascending: view === "upcoming" })
    .limit(50);
  const [list, upcoming, past, cancelled] = await Promise.all([
    listQuery,
    scope(base(true), "upcoming"),
    scope(base(true), "past"),
    scope(base(true), "cancelled"),
  ]);
  return {
    sessions: (list.data ?? []) as Session[],
    totals: { upcoming: upcoming.count ?? 0, past: past.count ?? 0, cancelled: cancelled.count ?? 0 },
  };
}

/** Per-player history for the Players page: confirmed sessions already played, upcoming sign-ups, last played. */
export async function getPlayerHistory() {
  await connection();
  const supabase = await createClient();
  const { data } = await supabase.from("registrations").select("profile_id, status, session:sessions(starts_at)").limit(10000);
  const now = Date.now();
  const history = new Map<string, { played: number; upcoming: number; last: string | null }>();
  type Row = { profile_id: string; status: Registration["status"]; session: { starts_at: string } | null };
  for (const r of (data ?? []) as unknown as Row[]) {
    if (!r.session) continue;
    const h = history.get(r.profile_id) ?? { played: 0, upcoming: 0, last: null };
    const started = new Date(r.session.starts_at).getTime() <= now;
    if (started && r.status === "confirmed") {
      h.played += 1;
      if (!h.last || r.session.starts_at > h.last) h.last = r.session.starts_at;
    } else if (!started && ["pending_payment", "confirmed", "waitlisted"].includes(r.status)) {
      h.upcoming += 1;
    }
    history.set(r.profile_id, h);
  }
  return history;
}
