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
                return (
                  <div key={g.id} className="max-w-lg space-y-1">
                    {/* Centred over the "vs" so it lines up with the matchup, which is centred too. */}
                    {courtLabel && (
                      <p className="text-center font-display text-xs font-bold tracking-[0.2em] text-ink-soft uppercase">
                        {courtLabel}
                      </p>
                    )}
                    <p className="grid max-w-lg grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-3">
                      <TeamPlate name={nameOf.get(g.team_a_id)} mine={g.team_a_id === highlightTeamId} align="end" />
                      <span className="font-display text-sm font-black tracking-wide text-ink-soft uppercase">vs</span>
                      <TeamPlate name={nameOf.get(g.team_b_id)} mine={g.team_b_id === highlightTeamId} align="start" />
                    </p>
                  </div>
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
      {/* Without set times, games go to a score: the order just repeats until time's up. */}
      {!times && slots.length > 1 && (
        <li className="grid grid-cols-[3.25rem_minmax(0,1fr)] items-center gap-x-4 py-3 sm:grid-cols-[4.5rem_minmax(0,1fr)]">
          <span aria-hidden className="font-sans text-2xl leading-none font-bold text-line">↻</span>
          <p className="text-ink-soft">
            Then back to <span className="font-score font-black text-ink">01</span>. Keep rotating until time&apos;s up.
          </p>
        </li>
      )}
    </ol>
  );
}

/** One side of a matchup; the viewer's own team is an orange block (like the active nav tab). */
function TeamPlate({ name, mine, align }: { name?: string; mine: boolean; align: "start" | "end" }) {
  return (
    <span className={`flex min-w-0 ${align === "end" ? "justify-end text-right" : "justify-start text-left"}`}>
      <span
        className={`font-display text-base leading-tight font-bold tracking-wide uppercase [overflow-wrap:break-word] sm:text-lg ${
          mine ? "bg-line px-2 py-0.5 text-board" : "py-0.5"
        }`}
      >
        {name}
        {mine && <span className="sr-only"> (your team)</span>}
      </span>
    </span>
  );
}
