import type { Metadata } from "next";
import { Suspense } from "react";
import { ListFilters } from "@/components/list-filters";
import { EmptyState, PageSpinner, PageTitle, reveal, Sheet } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { profileComplete } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { owedTotals } from "@/lib/owed";
import { getOwedSignups, getPlayerHistory } from "@/lib/queries";
import type { Profile } from "@/lib/types";
import { PlayerRow, type PlayerStats } from "./player-row";

type Segment = "all" | "hosts" | "new" | "incomplete";
type Sort = "recent" | "name" | "played";

const SEGMENTS: { key: Segment; label: string }[] = [
  { key: "all", label: "All" },
  { key: "hosts", label: "Hosts" },
  { key: "new", label: "New" },
  { key: "incomplete", label: "Profile incomplete" },
];
const SORTS: { key: Sort; label: string }[] = [
  { key: "recent", label: "Recently joined" },
  { key: "name", label: "Name" },
  { key: "played", label: "Most played" },
];

const shortDate = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", year: "numeric" }).format(new Date(iso));

export const metadata: Metadata = {
  title: "Players",
};

export default function PlayersPage(props: PageProps<"/admin/players">) {
  return (
    <Suspense fallback={<PageSpinner />}>
      <Players searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Players({ searchParams }: { searchParams: PageProps<"/admin/players">["searchParams"] }) {
  const me = await requireAdmin();
  const params = await searchParams;
  const segment = SEGMENTS.some((s) => s.key === params.view) ? (params.view as Segment) : "all";
  const sort = SORTS.some((s) => s.key === params.sort) ? (params.sort as Sort) : "recent";
  const q = (typeof params.q === "string" ? params.q : "").trim().toLowerCase();

  const supabase = await createClient();
  const [{ data: profileRows }, stats, owing, { data: ratingRows }, { data: blockRows }] = await Promise.all([
    // Guests a host added to one session aren't accounts: they stay on that session's roster only.
    supabase.from("profiles").select("*").eq("guest", false).limit(2000),
    getPlayerHistory(),
    getOwedSignups(),
    supabase.from("player_ratings").select("profile_id, rating"),
    supabase.from("player_blocks").select("profile_id, reason, created_at"),
  ]);
  const owed = owedTotals(owing);
  const blocks = new Map((blockRows ?? []).map((b) => [b.profile_id as string, { reason: b.reason as string | null, at: b.created_at as string }]));
  const ratings = new Map((ratingRows ?? []).map((r) => [r.profile_id as string, r.rating as number]));

  const players = ((profileRows ?? []) as Profile[]).map((p) => {
    const s = stats.get(p.id) ?? { played: 0, upcoming: 0, last: null };
    const playerStats: PlayerStats = {
      played: s.played,
      upcoming: s.upcoming,
      lastPlayed: s.last ? shortDate(s.last) : null,
      memberSince: shortDate(p.created_at),
      owedCents: owed.get(p.id) ?? 0,
    };
    return { p, stats: playerStats, complete: profileComplete(p) };
  });

  const matches = (x: (typeof players)[number]) => {
    if (!q) return true;
    const hay = [x.p.display_name, x.p.full_name, x.p.first_name, x.p.last_name, x.p.email, x.p.phone, ...x.p.etransfer_names]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return q.split(/\s+/).every((w) => hay.includes(w));
  };
  const inSegment = (x: (typeof players)[number], seg: Segment) =>
    seg === "all" ||
    (seg === "hosts" && x.p.role === "admin") ||
    (seg === "new" && x.stats.played === 0) ||
    (seg === "incomplete" && !x.complete);

  const searched = players.filter(matches);
  const count = (seg: Segment) => searched.filter((x) => inSegment(x, seg)).length;
  const nameOf = (x: (typeof players)[number]) => (x.p.display_name ?? x.p.full_name ?? x.p.email).toLowerCase();
  const shown = searched
    .filter((x) => inSegment(x, segment))
    .sort((a, b) =>
      sort === "name"
        ? nameOf(a).localeCompare(nameOf(b))
        : sort === "played"
          ? b.stats.played - a.stats.played || nameOf(a).localeCompare(nameOf(b))
          : b.p.created_at.localeCompare(a.p.created_at),
    );

  return (
    <div className="space-y-12">
      <PageTitle sub="Everyone who has signed in with Google, whether or not they've played yet. Click a name for their details, e-Transfer names and host access.">
        Players
      </PageTitle>

      <Sheet label={`Players · ${players.length}`} className="reveal" style={reveal(1)}>
        <ListFilters
          path="/admin/players"
          tabs={{ param: "view", value: segment, options: SEGMENTS.map((s) => ({ ...s, count: count(s.key) })) }}
          chips={{ param: "sort", value: sort, options: SORTS }}
          q={typeof params.q === "string" ? params.q : ""}
          placeholder="Search name, email, phone, e-Transfer name"
        >
          {shown.length === 0 ? (
            <EmptyState>{q ? <>No players match &ldquo;{params.q}&rdquo;.</> : "No players here."}</EmptyState>
          ) : (
            <ul className="divide-y divide-ink/20">
              {shown.map((x) => (
                <PlayerRow
                  key={x.p.id}
                  p={x.p}
                  stats={x.stats}
                  complete={x.complete}
                  isMe={x.p.id === me.id}
                  rating={ratings.get(x.p.id) ?? null}
                  block={blocks.get(x.p.id) ?? null}
                />
              ))}
            </ul>
          )}
        </ListFilters>
      </Sheet>
    </div>
  );
}
