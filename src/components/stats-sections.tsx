import type { ReactNode } from "react";
import { Scoreboard, ScoreboardRow, Sheet } from "@/components/ui";
import { formatMoney } from "@/lib/format";
import { HEARD_LABELS, OPTION_LABELS, SKILL_LABELS } from "@/lib/profile";
import {
  averageFillMinutes,
  busiestWindow,
  formatDuration,
  heatGrid,
  hourLabel,
  monthLabel,
  percent,
  WEEKDAYS_SHORT,
  type SessionStat,
  type Stats,
} from "@/lib/stats";

// The Stats page's sections. Every chart is a single series (one colour), with
// the number written next to each bar and a hover title, so nothing relies on
// colour alone; the heatmap is one orange from light to dark, with a scale.

/** A plain-language takeaway at the top of a section. */
function Takeaway({ children }: { children: ReactNode }) {
  return <p className="max-w-2xl border-l-4 border-line py-1 pl-3 text-lg">{children}</p>;
}

/** Small print under a chart: what the numbers mean. */
function Note({ children }: { children: ReactNode }) {
  return <p className="max-w-2xl text-sm text-ink-soft">{children}</p>;
}

/** Ruled rows with a horizontal bar each (one series): label, bar, value. */
export function BarList({
  rows,
  format = (n) => String(n),
  empty = "Nothing yet",
}: {
  rows: { label: string; value: number; detail?: string }[];
  format?: (n: number) => string;
  empty?: string;
}) {
  const max = Math.max(0, ...rows.map((r) => r.value));
  if (rows.length === 0 || max === 0) return <p className="text-ink-soft">{empty}</p>;
  return (
    <ul className="divide-y divide-ink/15">
      {rows.map((r) => (
        <li
          key={r.label}
          title={`${r.label}: ${format(r.value)}${r.detail ? ` · ${r.detail}` : ""}`}
          className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_auto] items-center gap-3 py-2 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto]"
        >
          <span className="truncate text-sm">{r.label}</span>
          <span className="h-3 min-w-0">
            <span
              className="block h-full rounded-r-[4px] bg-mat"
              style={{ width: `${Math.max((r.value / max) * 100, r.value > 0 ? 2 : 0)}%` }}
            />
          </span>
          <span className="text-right font-score text-sm font-black whitespace-nowrap">
            {format(r.value)}
            {r.detail && <span className="ml-1 font-sans text-xs font-normal text-ink-soft">{r.detail}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Sign-ups by weekday and hour: one orange, light to dark, with a scale and a title on every cell. */
function Heatmap({ cells }: { cells: Stats["timing"]["heatmap"] }) {
  const { rows, max, total } = heatGrid(cells);
  if (total === 0) return <p className="text-ink-soft">No sign-ups in this range yet.</p>;
  const shade = (n: number) => (n === 0 ? 0 : Math.ceil((n / max) * 4)); // 0 = none, 1-4 = light to dark
  const fill = ["transparent", "color-mix(in oklab, var(--line) 25%, var(--maple))", "color-mix(in oklab, var(--line) 50%, var(--maple))", "color-mix(in oklab, var(--line) 75%, var(--maple))", "var(--line)"];
  return (
    <figure className="space-y-2">
      <div className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-2 gap-y-[2px]">
        {rows.map((row) => (
          <div key={row.dow} className="contents">
            <span className="text-xs leading-[14px] text-ink-soft">{WEEKDAYS_SHORT[row.dow]}</span>
            <span className="grid grid-cols-[repeat(24,minmax(0,1fr))] gap-[2px]">
              {row.hours.map((n, h) => (
                <span
                  key={h}
                  title={`${WEEKDAYS_SHORT[row.dow]} ${hourLabel(h)}: ${n} sign-up${n === 1 ? "" : "s"}`}
                  className="h-[14px] border border-ink/10"
                  style={{ background: fill[shade(n)] }}
                />
              ))}
            </span>
          </div>
        ))}
        <span />
        <span className="flex justify-between text-[11px] text-ink-soft">
          <span>12 am</span>
          <span>6 am</span>
          <span>12 pm</span>
          <span>6 pm</span>
          <span>11 pm</span>
        </span>
      </div>
      <figcaption className="flex flex-wrap items-center gap-2 text-xs text-ink-soft">
        Fewer
        {fill.slice(1).map((f, i) => (
          <span key={i} className="size-3 border border-ink/10" style={{ background: f }} />
        ))}
        More sign-ups (busiest hour: {max})
      </figcaption>
    </figure>
  );
}

export function TimingSection({ stats }: { stats: Stats }) {
  const busiest = busiestWindow(stats.timing.heatmap);
  const fills = stats.sessions.filter((s) => s.status === "scheduled" && s.first_day_pct != null);
  const avg = averageFillMinutes(stats.sessions);
  return (
    <div className="space-y-10">
      <Takeaway>
        {avg != null ? (
          <>
            Sessions that filled took <b>{formatDuration(avg)}</b> on average after sign-ups opened.{" "}
          </>
        ) : (
          <>No session in this range filled up. </>
        )}
        {busiest && (
          <>
            Most sign-ups happen <b>{busiest.label}</b> ({percent(busiest.count, stats.timing.heatmap.reduce((a, c) => a + c.count, 0))}{" "}
            of them), so that&apos;s a good time to open sign-ups or post.
          </>
        )}
      </Takeaway>

      <Sheet label="When people sign up">
        <div className="space-y-3">
          <Heatmap cells={stats.timing.heatmap} />
          {stats.timing.median_days_ahead != null && (
            <Note>
              Half of all sign-ups come in at least <b>{stats.timing.median_days_ahead} days</b> before the session.
            </Note>
          )}
        </div>
      </Sheet>

      <Sheet label="How fast sessions fill">
        <BarList
          rows={fills.map((s) => ({
            label: new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric" }).format(new Date(s.starts_at)),
            value: s.first_day_pct ?? 0,
            detail: s.minutes_to_full != null ? `full in ${formatDuration(s.minutes_to_full)}` : "never filled",
          }))}
          format={(n) => `${n}%`}
          empty="No sessions with sign-ups in this range."
        />
        <Note>Bars: share of drop-in spots claimed in the first day of sign-ups.</Note>
      </Sheet>
    </div>
  );
}

export function ReliabilitySection({ stats }: { stats: Stats }) {
  const r = stats.reliability;
  const m = r.matched ?? { ref: 0, name_amount: 0, admin: 0 };
  const matchedTotal = m.ref + m.name_amount + m.admin;
  return (
    <div className="space-y-10">
      <Takeaway>
        Of {r.signups} sign-ups, <b>{percent(r.cancelled, r.signups)}</b> cancelled ({r.late_cancelled} within 24 hours of the
        start) and <b>{percent(r.expired, r.signups)}</b> let their hold run out without paying.
        {r.median_minutes_to_pay != null && (
          <>
            {" "}
            Half of payers pay within <b>{formatDuration(r.median_minutes_to_pay)}</b>.
          </>
        )}
      </Takeaway>
      <ScoreboardRow>
        <Scoreboard size="sm" className="w-full" value={percent(r.cancelled, r.signups)} label="Cancelled" />
        <Scoreboard size="sm" className="w-full" value={percent(r.late_cancelled, r.signups)} label="Late cancels" />
        <Scoreboard size="sm" className="w-full" value={percent(r.expired, r.signups)} label="Unpaid holds" />
        <Scoreboard
          size="sm"
          className="w-full"
          value={r.median_minutes_to_pay != null ? formatDuration(r.median_minutes_to_pay) : "–"}
          label="Time to pay"
        />
      </ScoreboardRow>
      <Sheet label="How payments were matched">
        <BarList
          rows={[
            { label: "By VB- code", value: m.ref, detail: percent(m.ref, matchedTotal) },
            { label: "By name + amount", value: m.name_amount, detail: percent(m.name_amount, matchedTotal) },
            { label: "By hand", value: m.admin, detail: percent(m.admin, matchedTotal) },
          ]}
          empty="No payments in this range."
        />
        <Note>&quot;By hand&quot; is a host pressing Mark paid (cash, or a transfer that didn&apos;t match on its own).</Note>
      </Sheet>
    </div>
  );
}

export function GrowthSection({ stats }: { stats: Stats }) {
  const g = stats.growth;
  const back = g.came_back ?? { eligible: 0, came_back: 0 };
  const reg = g.regulars ?? { regular: 0, occasional: 0 };
  const friends = g.friends ?? { friends: 0, came_back: 0 };
  const newTotal = g.new_by_month.reduce((a, b) => a + b.count, 0);
  const byCount = (o: Record<string, number>, labels: Record<string, string>) =>
    Object.entries(o)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => ({ label: labels[k] ?? (k === "unknown" ? "Didn't say" : k), value: v }));
  return (
    <div className="space-y-10">
      <Takeaway>
        <b>{newTotal}</b> new player{newTotal === 1 ? "" : "s"} in this range.{" "}
        {back.eligible > 0 && (
          <>
            <b>{percent(back.came_back, back.eligible)}</b> of new players came back within 4 weeks.{" "}
          </>
        )}
        Right now there are <b>{reg.regular}</b> regulars (3+ sessions in the last 8 weeks).
      </Takeaway>
      <ScoreboardRow>
        <Scoreboard size="sm" className="w-full" value={String(newTotal)} label="New players" />
        <Scoreboard size="sm" className="w-full" value={percent(back.came_back, back.eligible)} label="Came back" />
        <Scoreboard size="sm" className="w-full" value={String(reg.regular)} label="Regulars" />
        <Scoreboard size="sm" className="w-full" value={String(reg.occasional)} label="Occasional" />
      </ScoreboardRow>
      <Sheet label="New players by month">
        <BarList rows={g.new_by_month.map((x) => ({ label: monthLabel(x.month), value: x.count }))} empty="No new players in this range." />
        <Note>Counted in the month of their first session.</Note>
      </Sheet>
      <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
        <Sheet label="How they found us">
          <BarList rows={byCount(g.heard_about, HEARD_LABELS)} empty="No new players in this range." />
        </Sheet>
        <Sheet label="Skill levels">
          <BarList rows={byCount(g.skill, SKILL_LABELS)} empty="No one played in this range." />
        </Sheet>
      </div>
      <Sheet label="Bring a Friend">
        <p>
          <b>{friends.friends}</b> friend{friends.friends === 1 ? "" : "s"} came with a regular;{" "}
          <b>{friends.came_back}</b> ({percent(friends.came_back, friends.friends)}) played again after.
        </p>
      </Sheet>
    </div>
  );
}

export function MoneySection({ stats, sessions }: { stats: Stats; sessions: SessionStat[] }) {
  const d = stats.demand;
  const o = d.options ?? { full: 0, dropin: 0, instructional: 0 };
  const months = d.money_by_month;
  const total = months.reduce((a, m) => a + m.collected, 0);
  const waitlistedGotIn = percent(d.promoted, d.waitlisted);
  return (
    <div className="space-y-10">
      <Takeaway>
        <b>{formatMoney(total)}</b> came in over this range.{" "}
        {d.waitlisted > 0 && (
          <>
            <b>{d.waitlisted}</b> people joined a waitlist; {waitlistedGotIn} of them got a spot. There may be room for more
            sessions or spots.
          </>
        )}
      </Takeaway>
      <Sheet label="Money by month">
        <BarList
          rows={months.map((m) => ({
            label: monthLabel(m.month),
            value: m.collected,
            detail: [m.refunded ? `${formatMoney(m.refunded)} refunded` : null, m.owed ? `${formatMoney(m.owed)} owed` : null]
              .filter(Boolean)
              .join(" · "),
          }))}
          format={formatMoney}
          empty="No money in this range yet."
        />
        <Note>Bars: money in (after refunds), by the month of the session.</Note>
      </Sheet>
      <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
        <Sheet label="What people sign up for">
          <BarList
            rows={[
              { label: OPTION_LABELS.full, value: o.full },
              { label: OPTION_LABELS.dropin, value: o.dropin },
              { label: OPTION_LABELS.instructional, value: o.instructional },
            ].filter((r) => r.value > 0 || r.label === OPTION_LABELS.full)}
          />
        </Sheet>
        <Sheet label="Waitlists">
          <ScoreboardRow>
            <Scoreboard size="sm" className="w-full" value={String(d.waitlisted)} label="Joined" />
            <Scoreboard size="sm" className="w-full" value={String(d.promoted)} label="Got a spot" />
          </ScoreboardRow>
          <Note>{sessions.filter((s) => s.waitlisted > 0).length} sessions in this range still have people waiting.</Note>
        </Sheet>
      </div>
    </div>
  );
}
