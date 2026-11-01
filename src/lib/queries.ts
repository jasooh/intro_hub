import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cache } from "react";
import { stillOwing, type OwedSignup } from "@/lib/owed";
import { isActive, signupView } from "@/lib/signups";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Attendee, Post, Profile, Registration, Session, SessionCounts } from "@/lib/types";

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
  // Still listed while it's on: until it ends, not just until it starts.
  let query = supabase.from("sessions").select("*").gt("ends_at", new Date().toISOString());
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
    ended: now >= new Date(session.ends_at).getTime(),
    notOpenYet: now < new Date(session.opens_at).getTime(),
    beforeCutoff: now < new Date(session.cancel_cutoff).getTime(),
  };
}

/** Every sign-up the player has made, newest session first, each tagged upcoming / past / cancelled. */
export async function getMySignups(profileId: string) {
  await connection();
  const supabase = await createClient();
  const { data } = await supabase
    .from("registrations")
    .select("*, session:sessions(*)")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(500);
  const now = Date.now();
  // Every cancel + re-join leaves a dead row behind. Show one entry per session: the live sign-up if
  // there is one, else the latest (rows are newest first).
  const seen = new Map<string, boolean>();
  const rows = ((data ?? []) as (Registration & { session: Session })[]).filter((r) => {
    const live = isActive(r.status);
    const hasLive = seen.get(r.session_id);
    if (hasLive !== undefined && (!live || hasLive)) return false;
    seen.set(r.session_id, live);
    return true;
  });
  return rows
    .map((r) => ({ ...r, view: signupView(r, now), ended: new Date(r.session.ends_at).getTime() <= now }))
    .sort((a, b) => {
      // Upcoming soonest first; everything else most recent first.
      const ta = new Date(a.session.starts_at).getTime();
      const tb = new Date(b.session.starts_at).getTime();
      return a.view === "upcoming" && b.view === "upcoming" ? ta - tb : tb - ta;
    });
}

/** Everyone signed up for a session (public names only), memoized per request. */
export const getAttendees = cache(async (sessionId: string) => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_session_attendees", { p_session_id: sessionId });
  return (data ?? []) as Attendee[];
});

/** Registration ids this sign-up asked to be teamed with (own rows only, via RLS). */
export async function getTeamRequests(registrationId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("team_requests").select("requested_id").eq("registration_id", registrationId);
  return (data ?? []).map((r) => r.requested_id as string);
}

/** Published host posts, newest first (public). */
export async function getPublishedPosts(limit = 50) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("posts")
    .select("*")
    .not("published_at", "is", null)
    .order("published_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as Post[];
}

/** One published post (drafts are hidden by RLS unless you're a host). Memoized per request. */
export const getPost = cache(async (id: string) => {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("posts").select("*").eq("id", id).not("published_at", "is", null).maybeSingle<Post>();
  return data;
});

/** The one post featured on the home page, if any. */
export async function getFeaturedPost() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("posts")
    .select("*")
    .eq("featured", true)
    .not("published_at", "is", null)
    .maybeSingle<Post>();
  return data;
}

/** Start of the window used for payment matching and assignment (one week back). */
export async function paymentWindowStart() {
  await connection();
  return new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
}

export type AdminSessionView = "upcoming" | "past" | "cancelled";

/**
 * Sessions for the host Sessions page, split into upcoming / past / cancelled and
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

/** Every sign-up still owing money (Owed page, Players list). Hosts only, by RLS. */
export async function getOwedSignups(): Promise<OwedSignup[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("registrations")
    .select(
      "id, profile_id, option, amount_cents, paid_cents, hold_expires_at, ref_code, friend_discount, profile:profiles(id, display_name, full_name, first_name, last_name, email, guest), session:sessions(id, title, starts_at, status)",
    )
    .eq("status", "pending_payment")
    .limit(5000);
  return stillOwing((data ?? []) as unknown as OwedSignup[]);
}

/** Per-player history for the Players page: confirmed sessions already played, upcoming sign-ups, last played. */
export async function getPlayerHistory() {
  await connection();
  const supabase = await createClient();
  const [{ data }, { data: hostRows }] = await Promise.all([
    supabase.from("registrations").select("profile_id, session_id, status, session:sessions(starts_at)").limit(10000),
    supabase.from("session_hosts").select("profile_id, session_id, session:sessions(starts_at, status)").limit(10000),
  ]);
  const now = Date.now();
  const history = new Map<string, { played: number; upcoming: number; last: string | null }>();
  const played = new Set<string>(); // `${profile}:${session}`, so playing and hosting the same session counts once
  const countPlayed = (h: { played: number; last: string | null }, startsAt: string) => {
    h.played += 1;
    if (!h.last || startsAt > h.last) h.last = startsAt;
  };
  type Row = { profile_id: string; session_id: string; status: Registration["status"]; session: { starts_at: string } | null };
  for (const r of (data ?? []) as unknown as Row[]) {
    if (!r.session) continue;
    const h = history.get(r.profile_id) ?? { played: 0, upcoming: 0, last: null };
    const started = new Date(r.session.starts_at).getTime() <= now;
    if (started && r.status === "confirmed") {
      played.add(`${r.profile_id}:${r.session_id}`);
      countPlayed(h, r.session.starts_at);
    } else if (!started && ["pending_payment", "confirmed", "waitlisted"].includes(r.status)) {
      h.upcoming += 1;
    }
    history.set(r.profile_id, h);
  }
  // Hosting a session that ran counts as a session played.
  type HostRow = { profile_id: string; session_id: string; session: { starts_at: string; status: string } | null };
  for (const r of (hostRows ?? []) as unknown as HostRow[]) {
    if (!r.session || r.session.status !== "scheduled" || new Date(r.session.starts_at).getTime() > now) continue;
    if (played.has(`${r.profile_id}:${r.session_id}`)) continue;
    const h = history.get(r.profile_id) ?? { played: 0, upcoming: 0, last: null };
    countPlayed(h, r.session.starts_at);
    history.set(r.profile_id, h);
  }
  return history;
}

/** Hosts who can be picked as a session's host, and who is picked now (host pages only). */
export async function getHostChoices(sessionId?: string) {
  const supabase = await createClient();
  const [{ data: admins }, { data: picked }] = await Promise.all([
    supabase.from("profiles").select("id, display_name, full_name, email").eq("role", "admin").order("display_name"),
    sessionId
      ? supabase.from("session_hosts").select("profile_id").eq("session_id", sessionId)
      : Promise.resolve({ data: [] as { profile_id: string }[] }),
  ]);
  return {
    options: (admins ?? []).map((a) => ({ id: a.id as string, name: (a.display_name ?? a.full_name ?? a.email) as string })),
    selected: (picked ?? []).map((p) => p.profile_id as string),
  };
}

/**
 * Bring a Friend: new here means they answered "No, I'm new" on their profile
 * and have never had a confirmed spot at a session that has ended. The
 * database checks the same thing (public._is_first_timer).
 */
export async function isFirstTimer(profile: Pick<Profile, "id" | "attended_before">) {
  if (profile.attended_before !== false) return false;
  const supabase = await createClient();
  const { count } = await supabase
    .from("registrations")
    .select("id, session:sessions!inner(ends_at)", { count: "exact", head: true })
    .eq("profile_id", profile.id)
    .eq("status", "confirmed")
    .lt("session.ends_at", new Date().toISOString());
  return (count ?? 0) === 0;
}

/**
 * Of these profiles, the ones still new here: they said "No, I'm new" and have never had a
 * confirmed spot at a session that has ended (the same test as public._is_first_timer, so hosts
 * see the same people the Bring a Friend rate does).
 */
export async function getFirstTimerIds(
  supabase: SupabaseClient,
  profiles: { id: string; attended_before: boolean | null }[],
) {
  const claimed = [...new Set(profiles.filter((p) => p.attended_before === false).map((p) => p.id))];
  if (claimed.length === 0) return new Set<string>();
  const { data } = await supabase
    .from("registrations")
    .select("profile_id, session:sessions!inner(ends_at)")
    .in("profile_id", claimed)
    .eq("status", "confirmed")
    .lt("session.ends_at", new Date().toISOString());
  const played = new Set((data ?? []).map((r) => r.profile_id as string));
  return new Set(claimed.filter((id) => !played.has(id)));
}
