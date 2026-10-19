import { MatchSchedule } from "@/components/match-schedule";
import { TeamBlocks } from "@/components/team-blocks";
import { AttendeeRow } from "@/components/signup-parts";
import { Mark, Sheet } from "@/components/ui";
import { formatTime, pad2 } from "@/lib/format";
import { slotTimes } from "@/lib/schedule";
import type { Attendee, Match, Team } from "@/lib/types";

/** Published teams as stacked team blocks, with the viewer's own team called out, then the game schedule. */
export function TeamsView({
  teams,
  going,
  matches = [],
  scheduleStart,
  gameMinutes = null,
}: {
  teams: Team[];
  going: Attendee[];
  matches?: Match[];
  scheduleStart?: string;
  gameMinutes?: number | null;
}) {
  const myTeam = going.find((a) => a.is_me)?.team_id ?? null;
  const myGames = myTeam ? matches.filter((m) => m.team_a_id === myTeam || m.team_b_id === myTeam).length : 0;
  const unplaced = going.filter((a) => !a.team_id || !teams.some((t) => t.id === a.team_id));
  const teamsSheet = (
    <Sheet
      label={`Teams · ${teams.length}`}
      action={
        myTeam ? (
          <Mark tone="line" glyph="●">
            You&apos;re on {teams.find((t) => t.id === myTeam)?.name}
          </Mark>
        ) : undefined
      }
    >
      <div className="space-y-8">
        <TeamBlocks
          teams={teams.map((t) => ({
            id: t.id,
            name: t.name,
            mine: t.id === myTeam,
            members: going
              .filter((a) => a.team_id === t.id)
              .map((a) => ({ id: a.registration_id, name: a.display_name, avatarUrl: a.avatar_url, isMe: a.is_me })),
          }))}
        />
        {unplaced.length > 0 && (
          <section className="space-y-2">
            <p className="font-display text-sm font-bold tracking-[0.2em] text-ink-soft uppercase">
              Not on a team yet · {unplaced.length}
            </p>
            <ul className="divide-y divide-ink/20">
              {unplaced.map((a) => (
                <AttendeeRow key={a.registration_id} a={a} number="·" />
              ))}
            </ul>
          </section>
        )}
      </div>
    </Sheet>
  );
  if (matches.length === 0 || !scheduleStart) return teamsSheet;

  return (
    <div className="space-y-10">
      {teamsSheet}
      <Sheet
        label="Game schedule"
        action={
          myGames > 0 ? (
            <Mark tone="line" glyph="●">
              You play {myGames} game{myGames === 1 ? "" : "s"}
            </Mark>
          ) : undefined
        }
      >
        <div className="space-y-6">
          {myTeam && myGames > 0 && (
            <YourGames teams={teams} matches={matches} myTeam={myTeam} startIso={scheduleStart} minutes={gameMinutes} />
          )}
          <MatchSchedule teams={teams} matches={matches} startIso={scheduleStart} minutes={gameMinutes} highlightTeamId={myTeam} />
        </div>
      </Sheet>
    </div>
  );
}

/** The viewer's own games, in order: when, which court, and who against. */
function YourGames({
  teams,
  matches,
  myTeam,
  startIso,
  minutes,
}: {
  teams: Team[];
  matches: Match[];
  myTeam: string;
  startIso: string;
  minutes: number | null;
}) {
  const nameOf = new Map(teams.map((t) => [t.id, t.name]));
  const slots = [...new Set(matches.map((m) => m.slot))].sort((a, b) => a - b);
  const times = slotTimes(startIso, minutes, slots.length);
  const timeOf = (slot: number) => (times ? formatTime(times[slots.indexOf(slot)]) : null);
  const multiCourt = matches.some((m) => m.court > 1);
  const mine = matches
    .filter((m) => m.team_a_id === myTeam || m.team_b_id === myTeam)
    .sort((a, b) => a.slot - b.slot);

  return (
    <section className="border-2 border-ink bg-maple-deep/40 p-4">
      <p className="mb-2 font-display text-sm font-bold tracking-[0.2em] uppercase">
        Your games · {nameOf.get(myTeam)}
      </p>
      <ol className="divide-y divide-ink/20">
        {mine.map((m) => {
          const opponent = m.team_a_id === myTeam ? m.team_b_id : m.team_a_id;
          return (
            <li key={m.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2">
              <span className="font-score text-lg font-black">{pad2(m.slot)}</span>
              {timeOf(m.slot) && <span className="text-sm text-ink-soft">{timeOf(m.slot)}</span>}
              {multiCourt && (
                <span className="bg-ink px-2 py-0.5 font-display text-sm font-bold tracking-[0.15em] text-maple uppercase">
                  Court {m.court}
                </span>
              )}
              <span className="min-w-0 font-display text-base font-bold tracking-wide uppercase [overflow-wrap:anywhere]">
                vs {nameOf.get(opponent)}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
