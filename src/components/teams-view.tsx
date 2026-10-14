import { TeamBlocks } from "@/components/team-blocks";
import { AttendeeRow } from "@/components/signup-parts";
import { Mark, Sheet } from "@/components/ui";
import type { Attendee, Team } from "@/lib/types";

/** Published teams as stacked team blocks, with the viewer's own team called out. */
export function TeamsView({ teams, going }: { teams: Team[]; going: Attendee[] }) {
  const myTeam = going.find((a) => a.is_me)?.team_id ?? null;
  const unplaced = going.filter((a) => !a.team_id || !teams.some((t) => t.id === a.team_id));
  return (
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
}
