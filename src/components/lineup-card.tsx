import type { ReactNode } from "react";
import { Avatar } from "@/components/ui";
import { SKILL_LABELS } from "@/lib/profile";
import type { SkillLevel } from "@/lib/types";

export type LineupMember = {
  id: string;
  name: string;
  avatarUrl: string | null;
  isMe?: boolean;
  /** Host view only: shown as dots and tallied per team. */
  skill?: SkillLevel | null;
  /** Host view: e.g. a "move to team" control. */
  control?: ReactNode;
};

export type LineupTeam = {
  id: string;
  name: string;
  /** Replaces the plain name in the header (host view: rename field). */
  title?: ReactNode;
  members: LineupMember[];
  mine?: boolean;
};

const pad = (n: number) => String(n).padStart(2, "0");

const SKILL_DOTS: Record<SkillLevel, string> = { experienced: "●●", some: "●", never: "○", prefer_not: "–" };
const SKILL_TALLY: [SkillLevel, string][] = [
  ["experienced", "exp"],
  ["some", "some"],
  ["never", "new"],
];

/**
 * A coach's lineup card: one column per team, one row per slot, so team sizes
 * and mixes compare at a glance. Scrolls sideways inside the card on phones.
 */
export function LineupCard({
  teams,
  showSkill = false,
  columnMin = "11rem",
}: {
  teams: LineupTeam[];
  showSkill?: boolean;
  columnMin?: string;
}) {
  const rows = Math.max(1, ...teams.map((t) => t.members.length));
  return (
    <div className="overflow-x-auto border-2 border-ink shadow-[4px_4px_0_var(--ink)] [scrollbar-width:thin]">
      <div
        className="grid divide-x-2 divide-ink"
        style={{ gridTemplateColumns: `repeat(${teams.length}, minmax(${columnMin}, 1fr))` }}
      >
        {teams.map((t) => (
          <section key={t.id} className={`flex min-w-0 flex-col ${t.mine ? "bg-line/10" : "bg-maple"}`}>
            <header className="flex items-center gap-3 bg-board px-3 py-2.5 text-maple">
              <span aria-hidden className="size-2 shrink-0 bg-line" />
              <div className="min-w-0 flex-1">
                {t.title ?? (
                  <h3 className="truncate font-display text-xl leading-none font-black uppercase">{t.name}</h3>
                )}
                <p className="mt-1 font-display text-[11px] font-bold tracking-[0.2em] uppercase">
                  {t.mine ? <span className="text-line">★ Your team</span> : "\u00a0"}
                </p>
              </div>
              <span className="led font-score text-2xl leading-none font-black tabular-nums" aria-label={`${t.members.length} players`}>
                {pad(t.members.length)}
              </span>
            </header>

            <ol className="flex-1 divide-y divide-ink/15">
              {Array.from({ length: rows }, (_, i) => {
                const m = t.members[i];
                if (!m) {
                  return (
                    <li key={`empty-${i}`} className="flex h-11 items-center gap-2 px-3 text-ink-soft/40" aria-hidden>
                      <span className="w-6 font-score text-sm font-black">{pad(i + 1)}</span>
                      <span>—</span>
                    </li>
                  );
                }
                return (
                  <li key={m.id} className={`flex h-11 items-center gap-2 px-3 ${m.isMe ? "bg-line/15" : ""}`}>
                    <span className="w-6 font-score text-sm font-black text-ink-soft">{pad(i + 1)}</span>
                    <Avatar name={m.name} src={m.avatarUrl} size={22} />
                    <span className={`min-w-0 flex-1 truncate ${m.isMe ? "font-bold" : ""}`}>
                      {m.name}
                      {m.isMe && <span className="text-line"> (you)</span>}
                    </span>
                    {showSkill && m.skill && (
                      <span title={SKILL_LABELS[m.skill]} className="font-score text-xs font-black tracking-tighter text-ink-soft">
                        {SKILL_DOTS[m.skill]}
                      </span>
                    )}
                    {m.control}
                  </li>
                );
              })}
            </ol>

            {showSkill && (
              <footer className="border-t-2 border-ink px-3 py-1.5 font-display text-xs font-bold tracking-[0.12em] text-ink-soft uppercase">
                {SKILL_TALLY.map(([level, label]) => `${t.members.filter((m) => m.skill === level).length} ${label}`).join(" · ")}
              </footer>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
