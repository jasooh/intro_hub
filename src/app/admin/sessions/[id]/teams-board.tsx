import { makeTeams, moveToTeam, removeTeams, renameTeam, setPlayerRating, setTeamsPublished } from "@/app/admin/actions";
import { SkillRating } from "@/components/skill-rating";
import { InfoTip } from "@/components/info-tip";
import { GroupTag, TeamBlocks } from "@/components/team-blocks";
import { SubmitButton } from "@/components/submit-button";
import { TeamSelect } from "@/components/team-select";
import { Avatar, inputClass, Mark, reveal, Sheet } from "@/components/ui";
import { defaultTeamCount, requestGroups, skillLevel, type TeamRequest } from "@/lib/teams";
import type { Match, Profile, Registration, Session, Team } from "@/lib/types";
import { ScheduleBoard } from "./schedule-board";

export type TeamRow = Pick<Registration, "id" | "team_id" | "profile_id"> & {
  profile: Pick<Profile, "display_name" | "full_name" | "email" | "avatar_url" | "skill_level">;
};

function nameOf(r: TeamRow) {
  return r.profile.display_name ?? r.profile.full_name ?? r.profile.email;
}

/** Build, adjust and publish teams for the drop-in players. */
export function TeamsBoard({
  session,
  players,
  teams,
  requests = [],
  matches = [],
  ratings = {},
}: {
  session: Session;
  players: TeamRow[];
  teams: Team[];
  /** Who asked to play with whom (registration ids). */
  requests?: TeamRequest[];
  /** The game schedule, if one was made. */
  matches?: Match[];
  /** Host 1–5 skill ratings by profile id. */
  ratings?: Record<string, number>;
}) {
  const path = `/admin/sessions/${session.id}`;
  const ratingPick = (p: TeamRow) => (
    <SkillRating
      compact
      action={setPlayerRating.bind(null, p.profile_id, path)}
      rating={ratings[p.profile_id] ?? null}
      skill={p.profile.skill_level}
    />
  );
  // Request groups, lettered A, B, C… in team order so the letters read top to bottom.
  const teamOrder = (p: TeamRow) => {
    const i = teams.findIndex((t) => t.id === p.team_id);
    return i === -1 ? teams.length : i; // players not on a team come last
  };
  const ordered = [...players].sort((a, b) => teamOrder(a) - teamOrder(b));
  const groups = requestGroups(
    ordered.map((p) => p.id),
    requests,
  );
  const letterOf = new Map(groups.flatMap((g, i) => g.map((id) => [id, groupLetter(i)] as const)));
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
          <p className="w-full max-w-xl text-sm text-ink-soft">
            Playing on more than one court? Each game needs two teams, so make at least 4 teams for 2 courts, or 6 for
            3, to keep every court busy.
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
            <SubmitButton>Make teams</SubmitButton>
          ) : (
            <span className="pb-2 text-ink-soft">Teams can be made once players sign up.</span>
          )}
        </form>
        {groups.length > 0 && (
          <div className="mt-6">
            <RequestSummary groups={groups} players={players} teams={teams} requests={requests} />
          </div>
        )}
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
        {groups.length > 0 && <RequestSummary groups={groups} players={players} teams={teams} requests={requests} />}

        <TeamBlocks
          host
          keyExtra={<BalanceHelp label />}
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
                level: skillLevel(p.profile.skill_level, ratings[p.profile_id]),
                skillControl: ratingPick(p),
                tag: letterOf.get(p.id),
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
                <TeamMember key={m.id} reg={m} sessionId={session.id} teams={teams} tag={letterOf.get(m.id)} skill={ratingPick(m)} />
              ))}
            </ul>
          </section>
        )}

        <ScheduleBoard session={session} teams={teams} matches={matches} />

        <div className="flex flex-wrap items-center gap-4 border-t border-ink/25 pt-4">
          <form action={setTeamsPublished.bind(null, session.id, !published)}>
            <SubmitButton size="sm" variant={published ? "secondary" : "primary"}>
              {published ? "Hide from players" : matches.length ? "Show teams + schedule to players" : "Show teams to players"}
            </SubmitButton>
          </form>
          <form action={makeTeams.bind(null, session.id)} className="flex items-center gap-2">
            <input type="hidden" name="count" value={teams.length} />
            <SubmitButton
              size="sm"
              variant="secondary"
              confirm={{
                title: "Re-balance the teams?",
                description:
                  "Everyone is shuffled into new teams by skill level, keeping requested teammates together. Team names reset to Team 1, Team 2…; the game schedule stays.",
                action: "Re-balance",
              }}
            >
              Re-balance
            </SubmitButton>
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

function TeamMember({
  reg,
  sessionId,
  teams,
  tag,
  skill,
}: {
  reg: TeamRow;
  sessionId: string;
  teams: Team[];
  tag?: string;
  skill: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 py-2">
      <Avatar name={nameOf(reg)} src={reg.profile.avatar_url} size={24} />
      <span className="min-w-0 flex-1 truncate">{nameOf(reg)}</span>
      {tag && <GroupTag letter={tag} />}
      {skill}
      <TeamSelect action={moveToTeam.bind(null, reg.id, sessionId)} teams={teams} current={reg.team_id} />
    </li>
  );
}

const groupLetter = (i: number) => (i < 26 ? String.fromCharCode(65 + i) : `G${i + 1}`);

/**
 * Spells out each request group (who asked for whom) and whether it's
 * currently together on one team or split, e.g. after a manual move.
 */
function RequestSummary({
  groups,
  players,
  teams,
  requests,
}: {
  groups: string[][];
  players: TeamRow[];
  teams: Team[];
  requests: TeamRequest[];
}) {
  const byId = new Map(players.map((p) => [p.id, p]));
  const teamName = (teamId: string | null) => teams.find((t) => t.id === teamId)?.name ?? null;

  return (
    <section aria-label="Team requests" className="space-y-2">
      <p className="font-display text-sm font-bold tracking-[0.15em] uppercase">Requests</p>
      <ul className="divide-y divide-ink/15 border-y border-ink/15">
        {groups.map((g, i) => {
          const inGroup = new Set(g);
          const edges = requests.filter((r) => inGroup.has(r.from) && inGroup.has(r.to));
          const mutual = (a: string, b: string) => edges.some((r) => r.from === b && r.to === a);
          // "Jane → Sam, Priya", with "Dev ↔ Mia" when two people asked for each other.
          const lines: string[] = [];
          const shown = new Set<string>();
          for (const from of g) {
            const targets = edges.filter((r) => r.from === from).map((r) => r.to);
            const oneWay = targets.filter((to) => !mutual(from, to));
            for (const to of targets.filter((to) => mutual(from, to))) {
              const key = [from, to].sort().join("|");
              if (!shown.has(key)) {
                shown.add(key);
                lines.push(`${nameOf(byId.get(from)!)} ↔ ${nameOf(byId.get(to)!)}`);
              }
            }
            if (oneWay.length) lines.push(`${nameOf(byId.get(from)!)} → ${oneWay.map((to) => nameOf(byId.get(to)!)).join(", ")}`);
          }

          const placed = g.map((id) => byId.get(id)!.team_id).map(teamName);
          const onTeams = [...new Set(placed.filter((n): n is string => Boolean(n)))];
          const status =
            teams.length === 0 ? null : placed.some((n) => !n) ? (
              <span className="text-warn">● not everyone is on a team</span>
            ) : onTeams.length === 1 ? (
              <span className="text-ok">✓ together on {onTeams[0]}</span>
            ) : (
              <span className="text-bad">
                ⚠ split:{" "}
                {onTeams
                  .map((t) => `${t} (${g.filter((id) => teamName(byId.get(id)!.team_id) === t).map((id) => nameOf(byId.get(id)!)).join(", ")})`)
                  .join(" / ")}
              </span>
            );

          return (
            <li key={g.join("|")} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2">
              <GroupTag letter={groupLetter(i)} />
              <span className="min-w-0 flex-1">{lines.join(" · ")}</span>
              {status && <span className="font-display text-sm font-bold tracking-wide uppercase">{status}</span>}
            </li>
          );
        })}
      </ul>
    </section>
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

/** "How balancing works ?" (hover, focus or tap). With `label`, it shows the words too. */
function BalanceHelp({ label = false }: { label?: boolean }) {
  return (
    <InfoTip title="How balancing works" label={label ? "How balancing works" : undefined}>
      <span className="block">
        <b>Requests first:</b> players who asked to play together (same letter) are always placed together. Groups
        are never split.
      </span>
      <span className="mt-1.5 block">
        <b>Then everyone else:</b> players who didn&apos;t ask for teammates are ranked by skill, 1–5: your rating if you gave one, otherwise
        the level they picked (experienced = 5, some = 3, prefer not to say = 2, never played = 1), shuffled within each level, and added to the team with the fewest players, then the
        lowest skill. Instructional-only players aren&apos;t included. Re-balancing reshuffles, so you get a new mix each
        time.
      </span>
    </InfoTip>
  );
}
