import { makeTeams, moveToTeam, removeTeams, renameTeam, setTeamsPublished } from "@/app/admin/actions";
import { TeamBlocks } from "@/components/team-blocks";
import { SubmitButton } from "@/components/submit-button";
import { TeamSelect } from "@/components/team-select";
import { Avatar, inputClass, Mark, reveal, Sheet } from "@/components/ui";
import { SKILL_LABELS } from "@/lib/profile";
import { defaultTeamCount } from "@/lib/teams";
import type { Profile, Registration, Session, Team } from "@/lib/types";

export type TeamRow = Pick<Registration, "id" | "team_id"> & {
  profile: Pick<Profile, "display_name" | "full_name" | "email" | "avatar_url" | "skill_level">;
};

function nameOf(r: TeamRow) {
  return r.profile.display_name ?? r.profile.full_name ?? r.profile.email;
}

const SKILL_SHORT: Record<string, string> = {
  experienced: "Exp.",
  some: "Some",
  prefer_not: "—",
  never: "New",
};

/** Build, adjust and publish teams for the drop-in players. */
export function TeamsBoard({ session, players, teams }: { session: Session; players: TeamRow[]; teams: Team[] }) {
  const published = Boolean(session.teams_published_at);
  const unassigned = players.filter((p) => !p.team_id || !teams.some((t) => t.id === p.team_id));

  if (teams.length === 0) {
    return (
      <Sheet label="Teams" className="reveal" style={reveal(3)}>
        <form action={makeTeams.bind(null, session.id)} className="flex flex-wrap items-end gap-4">
          <p className="w-full max-w-xl text-ink-soft">
            Split the {players.length} drop-in player{players.length === 1 ? "" : "s"} into teams, balanced by skill level.
            You can move people around afterwards, then show the teams to players.
          </p>
          <label className="block space-y-1">
            <span className="font-display text-sm font-bold tracking-[0.15em] uppercase">Teams</span>
            <input
              type="number"
              name="count"
              min={2}
              max={12}
              defaultValue={defaultTeamCount(session.capacity)}
              className={`${inputClass} w-20`}
            />
          </label>
          {players.length > 0 ? (
            <span className="flex items-center gap-2">
              <SubmitButton>Make teams</SubmitButton>
              <BalanceHelp />
            </span>
          ) : (
            <span className="pb-2 text-ink-soft">Teams can be made once players sign up.</span>
          )}
        </form>
      </Sheet>
    );
  }

  return (
    <Sheet
      label={`Teams · ${teams.length}`}
      className="reveal"
      style={reveal(3)}
      action={
        published ? (
          <Mark tone="ok" glyph="●">
            Visible to players
          </Mark>
        ) : (
          <Mark tone="muted" glyph="○">
            Hidden from players
          </Mark>
        )
      }
    >
      <div className="space-y-6">
        <TeamBlocks
          host
          teams={teams.map((t) => ({
            id: t.id,
            name: t.name,
            title: <RenameTeam team={t} sessionId={session.id} />,
            members: players
              .filter((p) => p.team_id === t.id)
              .map((p) => ({
                id: p.id,
                name: nameOf(p),
                avatarUrl: p.profile.avatar_url,
                skill: p.profile.skill_level,
                control: (
                  <TeamSelect
                    mode="move"
                    action={moveToTeam.bind(null, p.id, session.id)}
                    teams={teams}
                    current={p.team_id}
                  />
                ),
              })),
          }))}
        />

        {unassigned.length > 0 && (
          <section className="space-y-2 border-l-4 border-warn pl-4">
            <p className="font-display text-sm font-bold tracking-[0.2em] text-warn uppercase">
              Not on a team · {unassigned.length}
            </p>
            <ul className="divide-y divide-ink/20">
              {unassigned.map((m) => (
                <TeamMember key={m.id} reg={m} sessionId={session.id} teams={teams} />
              ))}
            </ul>
          </section>
        )}

        <div className="flex flex-wrap items-center gap-4 border-t border-ink/25 pt-4">
          <form action={setTeamsPublished.bind(null, session.id, !published)}>
            <SubmitButton size="sm" variant={published ? "secondary" : "primary"}>
              {published ? "Hide from players" : "Show teams to players"}
            </SubmitButton>
          </form>
          <form action={makeTeams.bind(null, session.id)} className="flex items-center gap-2">
            <input type="hidden" name="count" value={teams.length} />
            <SubmitButton
              size="sm"
              variant="secondary"
              confirm={{
                title: "Re-balance the teams?",
                description: "Everyone is shuffled into new teams by skill level, and team names reset to Team 1, Team 2…",
                action: "Re-balance",
              }}
            >
              Re-balance
            </SubmitButton>
            <BalanceHelp />
          </form>
          <form action={removeTeams.bind(null, session.id)}>
            <SubmitButton
              size="sm"
              variant="danger"
              confirm={{ title: "Remove all teams?", description: "Players will no longer see a team for this session." }}
            >
              Remove teams
            </SubmitButton>
          </form>
        </div>
      </div>
    </Sheet>
  );
}

function TeamMember({ reg, sessionId, teams }: { reg: TeamRow; sessionId: string; teams: Team[] }) {
  const skill = reg.profile.skill_level;
  return (
    <li className="flex items-center gap-3 py-2">
      <Avatar name={nameOf(reg)} src={reg.profile.avatar_url} size={24} />
      <span className="min-w-0 flex-1 truncate">{nameOf(reg)}</span>
      {skill && (
        <span title={SKILL_LABELS[skill]} className="font-display text-sm font-bold tracking-wide text-ink-soft uppercase">
          {SKILL_SHORT[skill]}
        </span>
      )}
      <TeamSelect action={moveToTeam.bind(null, reg.id, sessionId)} teams={teams} current={reg.team_id} />
    </li>
  );
}

/** Team name, editable in the block's dark header. Save lights up once the name changes. */
function RenameTeam({ team, sessionId }: { team: Team; sessionId: string }) {
  return (
    <form action={renameTeam.bind(null, team.id, sessionId)} className="flex items-center gap-2">
      <input
        name="name"
        defaultValue={team.name}
        maxLength={40}
        aria-label="Team name"
        className="w-full min-w-0 border-0 border-b border-maple/30 bg-transparent p-0 font-display text-xl leading-tight font-black text-maple uppercase focus:border-line focus:ring-0 focus:outline-none"
      />
      <SubmitButton
        bare
        requireChange
        className="shrink-0 font-display text-sm font-bold tracking-wide text-led uppercase hover:text-maple"
      >
        Save
      </SubmitButton>
    </form>
  );
}

/** "?" that explains how auto-balancing works (hover, focus or tap). */
function BalanceHelp() {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label="How are teams balanced?"
        className="inline-flex size-6 items-center justify-center rounded-full border-2 border-ink font-display text-sm font-black text-ink hover:border-line hover:text-line focus:border-line focus:text-line focus:outline-none"
      >
        ?
      </button>
      <span
        role="tooltip"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-30 border-2 sm:absolute sm:inset-x-auto sm:bottom-full sm:left-1/2 sm:mb-3 sm:w-72 sm:-translate-x-1/2 border-ink bg-[#f7ecd6] p-3 text-left text-sm text-ink opacity-0 shadow-[4px_4px_0_var(--ink)] transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
      >
        <b className="mb-1 block font-display tracking-wide uppercase">How balancing works</b>
        Players are ranked by the skill level they picked (experienced → some → prefer not to say → never played),
        shuffled within each level, then dealt out snake-style (1-2-3, 3-2-1, …) so every team gets a similar mix and
        sizes differ by at most one. Instructional-only players aren&apos;t included. Re-balancing reshuffles, so you get a
        new mix each time.
      </span>
    </span>
  );
}
