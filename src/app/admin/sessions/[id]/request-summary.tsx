import { GroupTag } from "@/components/team-blocks";
import { Avatar, Mark } from "@/components/ui";
import type { TeamRequest } from "@/lib/teams";
import type { Team } from "@/lib/types";

/** The bits of a drop-in player the summary needs. */
export type RequestPlayer = {
  id: string;
  name: string;
  avatarUrl: string | null;
  teamId: string | null;
};

export const groupLetter = (i: number) => (i < 26 ? String.fromCharCode(65 + i) : `G${i + 1}`);

/**
 * Each request group as a small block: one row per request, "who → whom", with
 * "⇄" when two people asked for each other. Once teams exist, each name shows its
 * team and the header says whether the group is together or split.
 */
export function RequestSummary({
  groups,
  players,
  teams,
  requests,
}: {
  groups: string[][];
  players: RequestPlayer[];
  teams: Pick<Team, "id" | "name">[];
  requests: TeamRequest[];
}) {
  const byId = new Map(players.map((p) => [p.id, p]));
  const teamName = (teamId: string | null) => teams.find((t) => t.id === teamId)?.name ?? null;

  return (
    <section aria-label="Team requests" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-display text-sm font-bold tracking-[0.15em] uppercase">Requests · {groups.length}</p>
        <p className="text-sm text-ink-soft">
          <span className="font-bold text-ok">⇄</span> asked for each other ·{" "}
          <span className="font-bold text-mat">→</span> asked to play with
        </p>
      </div>
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {groups.map((g, i) => {
          const inGroup = new Set(g);
          const edges = requests.filter((r) => inGroup.has(r.from) && inGroup.has(r.to) && byId.has(r.from) && byId.has(r.to));
          const asked = (a: string, b: string) => edges.some((r) => r.from === a && r.to === b);
          // One row per pair: mutual pairs once (first), then one-way requests.
          const pairs: { from: string; to: string; mutual: boolean }[] = [];
          const seen = new Set<string>();
          for (const r of edges) {
            const mutual = asked(r.to, r.from);
            const key = mutual ? [r.from, r.to].sort().join("|") : `${r.from}>${r.to}`;
            if (seen.has(key)) continue;
            seen.add(key);
            pairs.push({ from: r.from, to: r.to, mutual });
          }
          pairs.sort((a, b) => Number(b.mutual) - Number(a.mutual));

          const placed = g.map((id) => teamName(byId.get(id)?.teamId ?? null));
          const onTeams = [...new Set(placed.filter((n): n is string => Boolean(n)))];
          const hasTeams = teams.length > 0;
          const status = !hasTeams ? null : placed.some((n) => !n) ? (
            <Mark tone="warn" glyph="●">
              Not all on a team
            </Mark>
          ) : onTeams.length === 1 ? (
            <Mark tone="ok" glyph="✓">
              Together · {onTeams[0]}
            </Mark>
          ) : (
            <Mark tone="bad" glyph="⚠">
              Split
            </Mark>
          );
          const split = hasTeams && onTeams.length !== 1;

          const person = (id: string, align: "start" | "end") => {
            const p = byId.get(id)!;
            const team = teamName(p.teamId);
            return (
              <span className={`flex min-w-0 items-center gap-2 ${align === "end" ? "flex-row-reverse text-right" : ""}`}>
                <Avatar name={p.name} src={p.avatarUrl} size={22} />
                <span className="min-w-0">
                  <span className="block truncate" title={p.name}>
                    {p.name}
                  </span>
                  {hasTeams && (
                    <span className={`block truncate text-xs ${split ? "font-bold text-bad" : "text-ink-soft"}`}>
                      {team ?? "No team"}
                    </span>
                  )}
                </span>
              </span>
            );
          };

          return (
            <li key={g.join("|")} className="min-w-0 border-2 border-ink/80">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b-2 border-ink/80 bg-maple-deep/50 px-3 py-2">
                <GroupTag letter={groupLetter(i)} />
                <span className="font-display text-sm font-bold tracking-[0.15em] uppercase">
                  {g.length} players
                </span>
                {status && <span className="ml-auto">{status}</span>}
              </div>
              <ul className="divide-y divide-ink/15 px-3">
                {pairs.map((pair) => (
                  <li
                    key={`${pair.from}>${pair.to}`}
                    className="grid grid-cols-[minmax(0,1fr)_2rem_minmax(0,1fr)] items-center gap-x-2 py-2"
                  >
                    {person(pair.from, "end")}
                    <span
                      className={`text-center text-xl leading-none font-bold ${pair.mutual ? "text-ok" : "text-mat"}`}
                      title={pair.mutual ? "Asked for each other" : "Asked to play with"}
                    >
                      <span aria-hidden>{pair.mutual ? "⇄" : "→"}</span>
                      <span className="sr-only">{pair.mutual ? "and each other" : "asked for"}</span>
                    </span>
                    {person(pair.to, "start")}
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
