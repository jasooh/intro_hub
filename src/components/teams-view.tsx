import { MatchSchedule } from "@/components/match-schedule";
import { TeamBlocks } from "@/components/team-blocks";
import { AttendeeRow } from "@/components/signup-parts";
import { Mark, Sheet } from "@/components/ui";
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
        <MatchSchedule teams={teams} matches={matches} startIso={scheduleStart} minutes={gameMinutes} highlightTeamId={myTeam} />
      </Sheet>
    </div>
  );
}
