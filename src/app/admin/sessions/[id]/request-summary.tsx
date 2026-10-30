import { GroupTag } from "@/components/team-blocks";
import { Mark } from "@/components/ui";
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
 * Each request group as a small block, one cluster per requester: a "⇄" line for
 * each pair that asked for each other, then "→" with everyone else they asked
 * for. The header says whether the group is together; split groups show teams.
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
  // Groups that are split across teams or not all placed (only once teams exist).
  const needsLook =
    teams.length === 0
      ? 0
      : groups.filter((g) => {
          const placed = g.map((id) => teamName(byId.get(id)?.teamId ?? null));
          return placed.some((n) => !n) || new Set(placed).size > 1;
        }).length;

  return (
    // Collapsible like the Cancelled / expired list; open by default.
    <details open aria-label="Team requests" className="group">
      <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-x-3 gap-y-1 font-display text-sm font-bold tracking-[0.15em] uppercase">
        <span aria-hidden className="transition-transform group-open:rotate-90">
          ▸
        </span>
        Requests · {groups.length}
        {/* Still visible when collapsed, so a split group isn't missed. */}
        {needsLook > 0 && (
          <span className="text-bad">
            · {needsLook} {needsLook === 1 ? "needs" : "need"} a look
          </span>
        )}
      </summary>
      <p className="mt-2 text-sm text-ink-soft">
        <span className="font-bold text-ok">⇄</span> asked for each other ·{" "}
        <span className="font-bold text-mat">→</span> asked to play with
      </p>
      <ul className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
        {groups.map((g, i) => {
          const inGroup = new Set(g);
          const edges = requests.filter((r) => inGroup.has(r.from) && inGroup.has(r.to) && byId.has(r.from) && byId.has(r.to));
          const asked = (a: string, b: string) => edges.some((r) => r.from === a && r.to === b);
          // One cluster per requester: their mutual pairs (each pair once), then everyone
          // else they asked for on a single "→" line.
          const shownPairs = new Set<string>();
          const clusters = g
            .map((id) => {
              const lines: { mutual: boolean; to: string[] }[] = [];
              const targets = edges.filter((r) => r.from === id).map((r) => r.to);
              for (const to of targets.filter((to) => asked(to, id))) {
                const key = [id, to].sort().join("|");
                if (shownPairs.has(key)) continue;
                shownPairs.add(key);
                lines.push({ mutual: true, to: [to] });
              }
              const oneWay = targets.filter((to) => !asked(to, id));
              if (oneWay.length) lines.push({ mutual: false, to: oneWay });
              return { id, lines };
            })
            .filter((c) => c.lines.length > 0);

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

          // Team names only matter when the group isn't together.
          const label = (id: string) => {
            const p = byId.get(id)!;
            return (
              <>
                {p.name}
                {split && (
                  <span className="ml-1 text-xs font-bold whitespace-nowrap text-bad">({teamName(p.teamId) ?? "no team"})</span>
                )}
              </>
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
                {clusters.map((c) => (
                  <li key={c.id} className="py-1.5">
                    {c.lines.map((line, j) => (
                      <p
                        key={j}
                        className="grid grid-cols-[minmax(0,7.5rem)_1.5rem_minmax(0,1fr)] items-baseline gap-x-1.5 py-0.5"
                      >
                        {/* The requester's name once per cluster, so their lines read as one block. */}
                        <span className="flex min-w-0 items-baseline justify-end" title={byId.get(c.id)!.name}>
                          {j === 0 && (
                            <>
                              <span className="truncate">{byId.get(c.id)!.name}</span>
                              {split && (
                                <span className="ml-1 shrink-0 text-xs font-bold text-bad">
                                  ({teamName(byId.get(c.id)!.teamId) ?? "no team"})
                                </span>
                              )}
                            </>
                          )}
                        </span>
                        <span
                          className={`text-center font-bold ${line.mutual ? "text-ok" : "text-mat"}`}
                          title={line.mutual ? "Asked for each other" : "Asked to play with"}
                        >
                          <span aria-hidden>{line.mutual ? "⇄" : "→"}</span>
                          <span className="sr-only">{line.mutual ? "and each other:" : "asked for"}</span>
                        </span>
                        <span className="min-w-0 [overflow-wrap:anywhere]">
                          {line.to.map((to, k) => (
                            <span key={to}>
                              {k > 0 && ", "}
                              {label(to)}
                            </span>
                          ))}
                        </span>
                      </p>
                    ))}
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
