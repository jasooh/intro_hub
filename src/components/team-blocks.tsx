import type { ReactNode } from "react";
import { Avatar } from "@/components/ui";
import { pad2 } from "@/lib/format";

export type TeamMember = {
  id: string;
  name: string;
  avatarUrl: string | null;
  isMe?: boolean;
  /** Host view only: 1–5 level (host rating, else the player's pick), averaged per team. */
  level?: number;
  /** Host view: the rating picker shown in place of the level. */
  skillControl?: ReactNode;
  /** Host view: e.g. a "move to team" control. */
  control?: ReactNode;
  /** Host view: request group letter (same letter = asked to play together). */
  tag?: string;
};

export type TeamBlock = {
  id: string;
  name: string;
  /** Replaces the plain name in the header (host view: rename field). */
  title?: ReactNode;
  members: TeamMember[];
  mine?: boolean;
};


/** A request group's letter (A, B, C…): players with the same letter asked to play together. */
export function GroupTag({ letter }: { letter: string }) {
  return (
    <span
      title={`Request group ${letter}`}
      className="inline-flex size-6 shrink-0 items-center justify-center border-2 border-mat font-display text-xs font-black text-mat"
    >
      <span className="sr-only">Request group </span>
      {letter}
    </span>
  );
}

/**
 * Teams as stacked blocks: a dark header (name + LED count), then the roster in
 * one or two columns depending on the block's own width. Blocks sit side by
 * side on wide screens. Nothing scrolls sideways.
 */
export function TeamBlocks({
  teams,
  host = false,
  keyExtra,
}: {
  teams: TeamBlock[];
  host?: boolean;
  /** Host view: extra item at the end of the key (e.g. "How balancing works"). */
  keyExtra?: ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {teams.map((t) => (
          <section
            key={t.id}
            className={`@container min-w-0 border-2 ${
              t.mine ? "border-line shadow-[4px_4px_0_var(--line)]" : "border-ink shadow-[4px_4px_0_var(--ink)]"
            }`}
          >
            <header className="flex items-center gap-3 bg-board px-3 py-2.5 text-maple">
              <span aria-hidden className="size-2 shrink-0 bg-line" />
              <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3">
                {t.title ?? (
                  <h3 className="min-w-0 font-display text-xl leading-tight font-black uppercase [overflow-wrap:anywhere]">
                    {t.name}
                  </h3>
                )}
                {t.mine && (
                  <span className="font-display text-xs font-bold tracking-[0.2em] whitespace-nowrap text-line uppercase">
                    ★ Your team
                  </span>
                )}
              </div>
              <span
                className="led font-score text-2xl leading-none font-black tabular-nums"
                aria-label={`${t.members.length} players`}
              >
                {pad2(t.members.length)}
              </span>
            </header>

            {t.members.length === 0 ? (
              <p className="px-3 py-3 text-ink-soft">No players yet</p>
            ) : (
              <ol className={`gap-x-5 px-3 ${host ? "@[34rem]:columns-2" : "@[20rem]:columns-2"}`}>
                {t.members.map((m, i) => (
                  <li
                    key={m.id}
                    className={`flex min-h-10 break-inside-avoid flex-wrap items-center gap-x-2 gap-y-1 border-b border-ink/15 py-1.5 ${
                      m.isMe ? "-mx-1.5 bg-line/15 px-1.5" : ""
                    }`}
                  >
                    <span className="w-6 shrink-0 font-score text-sm font-black text-ink-soft">{pad2(i + 1)}</span>
                    <Avatar name={m.name} src={m.avatarUrl} size={22} />
                    <span className="flex min-w-[7.5rem] flex-1 items-baseline gap-1">
                      <span className={`truncate ${m.isMe ? "font-bold" : ""}`}>{m.name}</span>
                      {m.isMe && <span className="shrink-0 text-line">(you)</span>}
                    </span>
                    {(host || m.control) && (
                      <span className="ml-auto flex shrink-0 items-center gap-2">
                        {host && m.skillControl}
                        {host && m.tag && <GroupTag letter={m.tag} />}
                        {m.control}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            )}

            {host && (
              <footer className="px-3 py-1.5 font-display text-xs font-bold tracking-[0.12em] text-ink-soft uppercase">
                {averageLevel(t.members)}
              </footer>
            )}
          </section>
        ))}
      </div>
      {host && (
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-soft" aria-label="Skill level key">
          <span className="font-display text-xs font-bold tracking-[0.15em] uppercase">Skill 1–5</span>
          <span>
            <span className="font-bold">Grey</span> = the player&apos;s own pick, <span className="font-bold text-line">orange</span> = your
            rating. Tap a number to rate; players never see it.
          </span>
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <GroupTag letter="A" /> Same letter = asked to play together
          </span>
          {keyExtra}
        </p>
      )}
    </div>
  );
}

/** "Avg skill 3.2" for a team's footer. */
function averageLevel(members: TeamMember[]) {
  const levels = members.map((m) => m.level).filter((l): l is number => l != null);
  if (levels.length === 0) return "Avg skill —";
  return `Avg skill ${(levels.reduce((a, b) => a + b, 0) / levels.length).toFixed(1)}`;
}
