import type { ReactNode } from "react";
import { formatTime, pad2 } from "@/lib/format";
import { sittingOut, slotTimes } from "@/lib/schedule";
import type { Match, Team } from "@/lib/types";

/**
 * The game schedule as ruled rows, one per time slot: slot number (and clock
 * time when the host set a game length), each court's game, and who sits out.
 * `highlightTeamId` marks the viewer's games; `renderGame` swaps in the host's
 * edit form for each game.
 */
export function MatchSchedule({
  teams,
  matches,
  startIso,
  minutes,
  highlightTeamId,
  renderGame,
}: {
  teams: Team[];
  matches: Match[];
  startIso: string;
  minutes: number | null;
  highlightTeamId?: string | null;
  renderGame?: (match: Match, courtLabel: string | null) => ReactNode;
}) {
  const nameOf = new Map(teams.map((t) => [t.id, t.name]));
  const bySlot = new Map<number, Match[]>();
  for (const m of matches) bySlot.set(m.slot, [...(bySlot.get(m.slot) ?? []), m]);
  const slots = [...bySlot.entries()]
    .sort(([a], [b]) => a - b)
    .map(([slot, games]) => ({ slot, games: games.sort((a, b) => a.court - b.court) }));
  const times = slotTimes(startIso, minutes, slots.length);
  const multiCourt = matches.some((m) => m.court > 1);
  const teamIds = teams.map((t) => t.id);

  return (
    <ol className="divide-y divide-ink/20 border-y border-ink/20">
      {slots.map(({ slot, games }, i) => {
        const out = sittingOut(teamIds, games);
        // Only possible after hand edits: the same team in two games at once.
        const playing = games.flatMap((g) => [g.team_a_id, g.team_b_id]);
        const twice = [...new Set(playing.filter((id, j) => playing.indexOf(id) !== j))];
        return (
          <li key={slot} className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-x-4 py-3 sm:grid-cols-[4.5rem_minmax(0,1fr)]">
            <div className="leading-none">
              <span className="block font-score text-2xl font-black">{pad2(slot)}</span>
              {times && <span className="mt-1 block text-xs whitespace-nowrap text-ink-soft">{formatTime(times[i])}</span>}
            </div>
            <div className="min-w-0 space-y-1.5">
              {games.map((g) => {
                const courtLabel = multiCourt ? `Court ${g.court}` : null;
                if (renderGame) return <div key={g.id}>{renderGame(g, courtLabel)}</div>;
                const mine = Boolean(highlightTeamId) && (g.team_a_id === highlightTeamId || g.team_b_id === highlightTeamId);
                return (
                  <p key={g.id} className={`flex flex-wrap items-baseline gap-x-2 ${mine ? "font-bold text-line" : ""}`}>
                    {courtLabel && (
                      <span className="font-display text-sm font-bold tracking-[0.15em] text-ink-soft uppercase">{courtLabel}</span>
                    )}
                    {mine && <span aria-hidden className="inline-block size-2 translate-y-[-1px] rounded-full bg-line" />}
                    <span className="[overflow-wrap:anywhere]">
                      {nameOf.get(g.team_a_id)} <span className="font-display text-sm font-bold text-ink-soft uppercase">vs</span>{" "}
                      {nameOf.get(g.team_b_id)}
                    </span>
                    {mine && <span className="sr-only">(your game)</span>}
                  </p>
                );
              })}
              {twice.length > 0 && (
                <p className="text-sm font-bold text-bad [overflow-wrap:anywhere]">
                  ⚠ {twice.map((id) => nameOf.get(id)).join(", ")} {twice.length === 1 ? "is" : "are"} in two games at once
                </p>
              )}
              {/* With one court everyone else is waiting anyway; only list byes across courts. */}
              {multiCourt && out.length > 0 && (
                <p className="text-sm text-ink-soft [overflow-wrap:anywhere]">
                  Sits out: {out.map((id) => nameOf.get(id)).join(", ")}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
