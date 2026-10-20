import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CourtMode } from "@/components/court-mode";
import { LiveRefresh } from "@/components/live-refresh";
import { PageSpinner } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { Match, Session, Team } from "@/lib/types";

export const metadata: Metadata = {
  title: "Court mode",
};

export default function CourtModePage(props: PageProps<"/admin/sessions/[id]/court">) {
  return (
    <Suspense fallback={<PageSpinner />}>
      <Court params={props.params} />
    </Suspense>
  );
}

async function Court({ params }: { params: PageProps<"/admin/sessions/[id]/court">["params"] }) {
  await requireAdmin();
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: session }, { data: teamRows }, { data: matchRows }, { data: regs }] = await Promise.all([
    supabase.from("sessions").select("*").eq("id", id).maybeSingle<Session>(),
    supabase.from("session_teams").select("*").eq("session_id", id).order("position"),
    supabase.from("session_matches").select("*").eq("session_id", id).order("slot").order("court"),
    supabase
      .from("registrations")
      .select("team_id, profile:profiles(display_name, full_name, email)")
      .eq("session_id", id)
      .in("status", ["pending_payment", "confirmed"])
      .not("team_id", "is", null),
  ]);
  if (!session) notFound();

  type Reg = { team_id: string; profile: { display_name: string | null; full_name: string | null; email: string } };
  const players = (regs ?? []) as unknown as Reg[];
  const teams = ((teamRows ?? []) as Team[]).map((t) => ({
    id: t.id,
    name: t.name,
    players: players
      .filter((r) => r.team_id === t.id)
      .map((r) => r.profile.display_name ?? r.profile.full_name ?? r.profile.email)
      .sort((a, b) => a.localeCompare(b)),
  }));
  const games = ((matchRows ?? []) as Match[]).map((m) => ({ slot: m.slot, court: m.court, a: m.team_a_id, b: m.team_b_id }));

  return (
    <>
      <LiveRefresh sessionId={id} />
      <CourtMode
        sessionId={id}
        title={session.title}
        backHref={`/admin/sessions/${id}`}
        startIso={session.dropin_starts_at ?? session.starts_at}
        minutes={session.schedule_game_minutes}
        timeZone={env.timezone()}
        teams={teams}
        games={games}
      />
    </>
  );
}
