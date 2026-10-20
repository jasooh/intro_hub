import { editMatch, makeSchedule, removeSchedule, setScheduleMinutes } from "@/app/admin/actions";
import { Dropdown } from "@/components/dropdown";
import { MatchSchedule } from "@/components/match-schedule";
import { SubmitButton } from "@/components/submit-button";
import { inputClass } from "@/components/ui";
import type { Match, Session, Team } from "@/lib/types";

/** Host side of the game schedule: make a round robin, swap matchups, set the game length. */
export function ScheduleBoard({ session, teams, matches }: { session: Session; teams: Team[]; matches: Match[] }) {
  if (teams.length < 2) return null;
  const games = (teams.length * (teams.length - 1)) / 2;
  const courtsUsed = Math.max(1, ...matches.map((m) => m.court));
  // Each game takes two teams, so this many games can run at once.
  const maxCourts = Math.min(3, Math.floor(teams.length / 2));
  const courtsNote =
    maxCourts < 3 ? (
      <p className="basis-full text-sm text-ink-soft">
        {teams.length} teams can fill {maxCourts === 1 ? "one court" : `${maxCourts} courts`} at a time.
        {" "}To use more courts, make {2 * (maxCourts + 1)} or more teams first.
      </p>
    ) : null;
  const start = session.dropin_starts_at ?? session.starts_at;

  return (
    <section aria-label="Game schedule" className="space-y-4 border-t border-ink/25 pt-6">
      <p className="font-display text-lg font-bold tracking-[0.15em] uppercase">Game schedule</p>

      {matches.length === 0 ? (
        <form action={makeSchedule.bind(null, session.id)} className="flex flex-wrap items-end gap-x-6 gap-y-4">
          <p className="basis-full text-ink-soft">
            Every team plays every other team once ({games} games), then the rotation starts over. Teams without a game
            in a round sit out. Leave minutes blank when games go to a score; set it to show clock times. You can swap
            matchups afterwards; players see it with the teams.
          </p>
          <CourtsField defaultValue={Math.min(2, maxCourts)} max={maxCourts} />
          <MinutesField defaultValue={null} />
          <SubmitButton>Make schedule</SubmitButton>
          {courtsNote}
        </form>
      ) : (
        <>
          <MatchSchedule
            teams={teams}
            matches={matches}
            startIso={start}
            minutes={session.schedule_game_minutes}
            renderGame={(m, courtLabel) => (
              <form action={editMatch.bind(null, m.id, session.id)} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {courtLabel && (
                  <span className="w-full font-display text-sm font-bold tracking-[0.15em] text-ink-soft uppercase sm:w-auto">
                    {courtLabel}
                  </span>
                )}
                <TeamPick name="team_a" teams={teams} value={m.team_a_id} label="First team" />
                <span className="font-display text-sm font-bold text-ink-soft uppercase">vs</span>
                <TeamPick name="team_b" teams={teams} value={m.team_b_id} label="Second team" />
                <SubmitButton size="sm" variant="secondary" requireChange>
                  Save
                </SubmitButton>
              </form>
            )}
          />

          <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
            <form action={setScheduleMinutes.bind(null, session.id)} className="flex items-end gap-3">
              <MinutesField defaultValue={session.schedule_game_minutes} />
              <SubmitButton size="sm" variant="secondary" requireChange>
                Save
              </SubmitButton>
            </form>
            <form action={makeSchedule.bind(null, session.id)} className="flex items-end gap-3">
              <input type="hidden" name="minutes" value={session.schedule_game_minutes ?? ""} />
              <CourtsField defaultValue={Math.min(courtsUsed, maxCourts)} max={maxCourts} />
              <SubmitButton
                size="sm"
                variant="secondary"
                confirm={{
                  title: "Remake the schedule?",
                  description: "A fresh round robin replaces the current one, including any games you changed by hand.",
                  action: "Remake",
                }}
              >
                Remake
              </SubmitButton>
            </form>
            <form action={removeSchedule.bind(null, session.id)}>
              <SubmitButton
                size="sm"
                variant="danger"
                confirm={{ title: "Remove the schedule?", description: "The teams stay; only the game order goes." }}
              >
                Remove schedule
              </SubmitButton>
            </form>
          </div>
        </>
      )}
    </section>
  );
}

function CourtsField({ defaultValue, max }: { defaultValue: number; max: number }) {
  return (
    <label className="block space-y-1">
      <span className="font-display text-sm font-bold tracking-[0.15em] uppercase">Courts</span>
      <Dropdown
        name="courts"
        defaultValue={String(defaultValue)}
        options={[1, 2, 3].filter((n) => n <= max).map((n) => ({ value: String(n), label: String(n) }))}
        className="w-20"
      />
    </label>
  );
}

function MinutesField({ defaultValue }: { defaultValue: number | null }) {
  return (
    <label className="block space-y-1">
      <span className="font-display text-sm font-bold tracking-[0.15em] uppercase">
        Minutes per game <span className="font-sans text-xs font-normal tracking-normal normal-case text-ink-soft">(optional)</span>
      </span>
      <input
        type="number"
        name="minutes"
        min={5}
        max={120}
        defaultValue={defaultValue ?? ""}
        placeholder="No times"
        className={`${inputClass} w-32`}
      />
    </label>
  );
}

function TeamPick({ name, teams, value, label }: { name: string; teams: Team[]; value: string; label: string }) {
  return (
    <Dropdown
      name={name}
      defaultValue={value}
      label={label}
      look="compact"
      className="max-w-40"
      options={teams.map((t) => ({ value: t.id, label: t.name }))}
    />
  );
}
