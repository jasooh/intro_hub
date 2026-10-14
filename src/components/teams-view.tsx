import { AttendeeRow } from "@/components/signup-parts";
import { Mark, Sheet } from "@/components/ui";
import type { Attendee, Team } from "@/lib/types";

const pad = (n: number) => String(n).padStart(2, "0");

/** Published teams: one column per team, with the viewer's own team called out. */
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
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((t) => {
            const members = going.filter((a) => a.team_id === t.id);
            const mine = t.id === myTeam;
            return (
              <section key={t.id} className={`space-y-2 border-l-4 pl-4 ${mine ? "border-line" : "border-ink/15"}`}>
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="min-w-0 font-display text-3xl leading-none font-black uppercase [overflow-wrap:anywhere]">{t.name}</h3>
                  {mine && (
                    <Mark tone="line" glyph="★">
                      Your team
                    </Mark>
                  )}
                </div>
                <ol className="divide-y divide-ink/20">
                  {members.map((a, i) => (
                    <AttendeeRow key={a.registration_id} a={a} number={pad(i + 1)} />
                  ))}
                  {members.length === 0 && <li className="py-2 text-ink-soft">No players yet</li>}
                </ol>
              </section>
            );
          })}
        </div>
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
