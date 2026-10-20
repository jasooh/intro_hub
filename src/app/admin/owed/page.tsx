import type { Metadata } from "next";
import { Suspense } from "react";
import { ListFilters } from "@/components/list-filters";
import { OwedList } from "@/components/owed-list";
import { PageSpinner, PageTitle, reveal, Scoreboard, ScoreboardRow, Sheet } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { formatMoney, pad2 } from "@/lib/format";
import { groupByPlayer, owedOn, splitByStart } from "@/lib/owed";
import { getOwedSignups } from "@/lib/queries";

const TABS = [
  { key: "upcoming", label: "Upcoming" },
  { key: "past", label: "Past" },
] as const;

export const metadata: Metadata = {
  title: "Owed",
};

export default function OwedPage(props: PageProps<"/admin/owed">) {
  return (
    <Suspense fallback={<PageSpinner />}>
      <Owed searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Owed({ searchParams }: { searchParams: PageProps<"/admin/owed">["searchParams"] }) {
  await requireAdmin();
  const params = await searchParams;
  const view = params.view === "past" ? "past" : "upcoming";
  const q = typeof params.q === "string" ? params.q : "";

  const rows = await getOwedSignups();
  const byTime = splitByStart(rows);
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (r: (typeof rows)[number]) =>
    words.every((w) =>
      [r.profile.display_name, r.profile.full_name, r.profile.first_name, r.profile.last_name, r.profile.email, r.ref_code, r.session.title]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(w),
    );
  const inTab = (tab: "upcoming" | "past") => byTime[tab].filter(matches);
  const shown = inTab(view);
  const players = groupByPlayer(shown);
  const total = shown.reduce((sum, r) => sum + owedOn(r), 0);

  return (
    <div className="space-y-12">
      <PageTitle sub="Everyone holding a spot who hasn't paid in full yet, by player. Mark payments here, or send a reminder.">
        Owed
      </PageTitle>

      <ScoreboardRow className="reveal" style={reveal(1)}>
        <Scoreboard size="sm" className="w-full" value={formatMoney(total)} label="Owed" />
        <Scoreboard size="sm" className="w-full" value={pad2(players.length)} label="Players" />
        <Scoreboard size="sm" className="w-full" value={pad2(shown.length)} label="Sign-ups" />
      </ScoreboardRow>

      <Sheet label="By player" className="reveal" style={reveal(2)}>
        <ListFilters
          path="/admin/owed"
          tabs={{ param: "view", value: view, options: TABS.map((t) => ({ ...t, count: groupByPlayer(inTab(t.key)).length })) }}
          q={q}
          placeholder="Search player, email, session, ref"
        >
          <OwedList players={players} upcoming={view === "upcoming"} q={q} />
        </ListFilters>
      </Sheet>
    </div>
  );
}
