import Link from "next/link";
import { DateBlock } from "@/components/session-card";
import { buttonClass, EmptyState, inputClass, Mark, PageTitle, reveal, Scoreboard, ScoreboardRow, Sheet } from "@/components/ui";
import { GrowthSection, MoneySection, ReliabilitySection, TimingSection } from "@/components/stats-sections";
import { formatMoney, pad2 } from "@/lib/format";
import { STAT_RANGES, summarize, type SessionStat, type StatRange, type Stats } from "@/lib/stats";

const shortDate = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", year: "numeric" }).format(new Date(iso));

/** The host stats page: money, how full sessions were, and who's coming (or not coming) back. */
export const STAT_TABS = [
  { key: "overview", label: "Overview" },
  { key: "timing", label: "Timing" },
  { key: "reliability", label: "Reliability" },
  { key: "growth", label: "Growth" },
  { key: "money", label: "Money" },
] as const;
export type StatTab = (typeof STAT_TABS)[number]["key"];

export function StatsView({
  stats,
  range,
  tab,
  custom,
  now,
}: {
  stats: Stats;
  range: StatRange;
  tab: StatTab;
  /** The picked dates when range is "custom". */
  custom: { from: string; to: string } | null;
  now: number;
}) {
  const totals = summarize(stats.sessions, now);
  const upcoming = stats.sessions.filter((s) => Date.parse(s.starts_at) > now);
  const past = stats.sessions.filter((s) => Date.parse(s.starts_at) <= now).reverse();
  const { lapsed } = stats.players;

  return (
    <div className="space-y-12">
      <PageTitle eyebrow="Host bench" sub="Money in, how full sessions were, and who's coming back.">
        Stats
      </PageTitle>

      <div className="reveal space-y-4" style={reveal(1)}>
        <nav className="flex flex-wrap gap-3" aria-label="Time range">
          {STAT_RANGES.map((r) => (
            <Link
              key={r.key}
              href={`/admin/stats?range=${r.key}${tab === "overview" ? "" : `&tab=${tab}`}`}
              aria-current={r.key === range ? "page" : undefined}
              className={buttonClass(r.key === range ? "primary" : "secondary", "sm")}
            >
              {r.label}
            </Link>
          ))}
        </nav>
        {/* A plain GET form: the dates land in the URL, so a custom range can be bookmarked or shared. */}
        <form
          action="/admin/stats"
          className={`flex flex-wrap items-end gap-x-4 gap-y-3 border-l-4 py-1 pl-3 ${range === "custom" ? "border-line" : "border-ink/20"}`}
        >
          <input type="hidden" name="range" value="custom" />
          {tab !== "overview" && <input type="hidden" name="tab" value={tab} />}
          <label className="block min-w-0 space-y-1">
            <span className="font-display text-sm font-bold tracking-[0.15em] uppercase">From</span>
            <input type="date" name="from" required defaultValue={custom?.from} className={`${inputClass} w-44`} />
          </label>
          <label className="block min-w-0 space-y-1">
            <span className="font-display text-sm font-bold tracking-[0.15em] uppercase">To</span>
            <input type="date" name="to" required defaultValue={custom?.to} className={`${inputClass} w-44`} />
          </label>
          <button type="submit" className={buttonClass(range === "custom" ? "primary" : "secondary", "sm")}>
            {range === "custom" ? "Update range" : "Custom range"}
          </button>
        </form>
      </div>

      <nav aria-label="Stats sections" className="reveal flex flex-wrap gap-x-5 border-b-2 border-ink" style={reveal(2)}>
        {STAT_TABS.map((t) => (
          <Link
            key={t.key}
            href={`/admin/stats?${range === "custom" && custom ? `range=custom&from=${custom.from}&to=${custom.to}` : `range=${range}`}${t.key === "overview" ? "" : `&tab=${t.key}`}`}
            aria-current={t.key === tab ? "page" : undefined}
            className={`-mb-[2px] border-b-4 py-2 font-display text-base font-bold tracking-wide whitespace-nowrap uppercase ${
              t.key === tab ? "border-line text-ink" : "border-transparent text-ink-soft hover:text-ink"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "timing" && <TimingSection stats={stats} />}
      {tab === "reliability" && <ReliabilitySection stats={stats} />}
      {tab === "growth" && <GrowthSection stats={stats} />}
      {tab === "money" && <MoneySection stats={stats} sessions={stats.sessions} />}
      {tab === "overview" && (
        <>
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
        </>
      )}
    </div>
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
