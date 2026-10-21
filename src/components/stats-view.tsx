import Link from "next/link";
import { DateBlock } from "@/components/session-card";
import { TrendChart } from "@/components/stat-charts";
import { StatsPanelSwitch } from "@/components/stats-shell";
import { EmptyState, Mark, reveal, Scoreboard, ScoreboardRow, Sheet } from "@/components/ui";
import { GrowthSection, MoneySection, ReliabilitySection, TimingSection } from "@/components/stats-sections";
import { env } from "@/lib/env";
import { formatMoney, pad2 } from "@/lib/format";
import { fillByDate, summarize, type SessionStat, type Stats } from "@/lib/stats";

const shortDate = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", year: "numeric" }).format(new Date(iso));

/**
 * The five sections, rendered on the server and handed to the shell, which shows the picked one.
 * They all come from the same query, so changing tab never goes back to the database.
 */
export function StatsView({ stats, now }: { stats: Stats; now: number }) {
  const totals = summarize(stats.sessions, now);
  const upcoming = stats.sessions.filter((s) => Date.parse(s.starts_at) > now);
  const past = stats.sessions.filter((s) => Date.parse(s.starts_at) <= now).reverse();
  const { lapsed } = stats.players;
  const fillRows = fillByDate(stats.sessions, now, env.timezone());

  const overview = (
    <div className="space-y-12">
        <ScoreboardRow className="reveal" style={reveal(2)}>
          <Scoreboard size="sm" className="w-full" value={formatMoney(totals.collected)} label="Collected" />
          <Scoreboard size="sm" className="w-full" value={formatMoney(totals.owed)} label="Still owed" />
          <Scoreboard
            size="sm"
            className="w-full"
            value={totals.averageFill == null ? "--" : `${Math.round(totals.averageFill * 100)}%`}
            label="Avg. full"
          />
          <Scoreboard size="sm" className="w-full" value={pad2(stats.players.new)} label="New players" />
          <Scoreboard size="sm" className="w-full" value={pad2(stats.players.returning)} label="Came back" />
        </ScoreboardRow>
        {totals.played > 0 && (
          <p className="-mt-8 text-sm text-ink-soft">
            {totals.played} session{totals.played === 1 ? "" : "s"} played
            {totals.waitlisted > 0 && `, ${totals.waitlisted} with a waitlist (more people wanted in than there were spots)`}
            . &ldquo;Avg. full&rdquo; counts paid drop-in spots.
          </p>
        )}

        {fillRows.length > 1 && (
          <Sheet label="Drop-in fill by session" className="reveal" style={reveal(3)}>
            <TrendChart label="Share of drop-in spots paid, by session" format="percent" max={100} rows={fillRows} />
            <p className="mt-2 max-w-2xl text-sm text-ink-soft">Each point is one session: how much of the drop-in was paid for.</p>
          </Sheet>
        )}

        {upcoming.length > 0 && (
          <Sheet label={`Coming up · ${upcoming.length}`} className="reveal" style={reveal(3)}>
            <SessionList sessions={upcoming} />
          </Sheet>
        )}

        <Sheet label={`Played · ${past.length}`} className="reveal" style={reveal(4)}>
          {past.length === 0 ? <EmptyState>No sessions in this range</EmptyState> : <SessionList sessions={past} />}
        </Sheet>

        <Sheet label={`Haven't been back · ${lapsed.length}`} className="reveal" style={reveal(5)}>
          <p className="mb-3 text-ink-soft">
            Played at least twice, nothing in the last 4 weeks, and not signed up for anything. Worth a message.
          </p>
          {lapsed.length === 0 ? (
            <EmptyState>Everyone&apos;s still coming</EmptyState>
          ) : (
            <ul className="divide-y divide-ink/20">
              {lapsed.map((p) => (
                <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
                  <Link
                    href={`/admin/players?q=${encodeURIComponent(p.name)}`}
                    className="min-w-0 font-bold underline decoration-line decoration-2 underline-offset-4 [overflow-wrap:anywhere]"
                  >
                    {p.name}
                  </Link>
                  <span className="text-sm text-ink-soft">
                    Last played {shortDate(p.last_played)} ·{" "}
                    <span className="font-score font-black text-ink">{pad2(p.times)}</span> sessions
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Sheet>
    </div>
  );

  return (
    <StatsPanelSwitch
      panels={{
        overview,
        timing: <TimingSection stats={stats} />,
        reliability: <ReliabilitySection stats={stats} />,
        growth: <GrowthSection stats={stats} />,
        money: <MoneySection stats={stats} sessions={stats.sessions} />,
      }}
    />
  );
}

function SessionList({ sessions }: { sessions: SessionStat[] }) {
  return (
    <ul className="divide-y divide-ink/20">
      {sessions.map((s) => (
        <li key={s.id} className="flex gap-4 py-4">
          <DateBlock iso={s.starts_at} />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <Link
                href={`/admin/sessions/${s.id}`}
                className={`min-w-0 font-display text-xl font-black uppercase [overflow-wrap:anywhere] hover:text-line ${
                  s.status === "cancelled" ? "line-through" : ""
                }`}
              >
                {s.title}
              </Link>
              <span className="font-score text-lg font-black">
                {formatMoney(s.collected)}
                {s.owed > 0 && s.status === "scheduled" && (
                  <span className="font-sans text-sm font-normal text-warn"> +{formatMoney(s.owed)} owed</span>
                )}
              </span>
            </div>
            {s.status === "cancelled" ? (
              <Mark tone="bad" glyph="✕">
                Cancelled
              </Mark>
            ) : (
              <>
                <FillBar session={s} />
                <p className="text-sm text-ink-soft">
                  <span className="font-score font-black text-ink">
                    {pad2(s.confirmed)}/{pad2(s.capacity)}
                  </span>{" "}
                  paid
                  {s.holding > 0 && ` · ${s.holding} awaiting pay`}
                  {s.instructional > 0 && ` · ${s.instructional} instructional only`}
                  {s.waitlisted > 0 && (
                    <span className="text-mat"> · {s.waitlisted} on the waitlist</span>
                  )}
                  {s.expired > 0 && ` · ${s.expired} hold${s.expired === 1 ? "" : "s"} expired`}
                </p>
              </>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Drop-in spots: paid (ink), held (hatched), empty (maple). */
function FillBar({ session: s }: { session: SessionStat }) {
  const total = Math.max(s.capacity, s.confirmed + s.holding, 1);
  const pct = (n: number) => `${(n / total) * 100}%`;
  return (
    <div className="flex h-3 w-full border-2 border-ink bg-maple" aria-hidden>
      <div className="h-full bg-ink" style={{ width: pct(s.confirmed) }} />
      <div
        className="h-full bg-[repeating-linear-gradient(135deg,var(--ink)_0_2px,transparent_2px_6px)]"
        style={{ width: pct(s.holding) }}
      />
    </div>
  );
}
