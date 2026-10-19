import Link from "next/link";
import { isLive } from "@/components/session-card";
import { cn } from "@/components/ui";
import { calendarDays, formatTime, zonedDayKey } from "@/lib/format";
import { spotsLeft } from "@/lib/queries";
import type { Session, SessionCounts } from "@/lib/types";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * A few weeks of the court calendar: every day as a square, session days as
 * linked blocks with their open spots. Days are on the club's wall clock.
 */
export function SessionCalendar({
  sessions,
  counts,
  today,
  weeks = 5,
}: {
  sessions: Session[];
  counts: Map<string, SessionCounts>;
  /** "YYYY-MM-DD" in the club's timezone. */
  today: string;
  weeks?: number;
}) {
  const days = calendarDays(today, weeks);
  const byDay = new Map<string, Session[]>();
  for (const s of sessions) {
    const key = zonedDayKey(s.starts_at);
    byDay.set(key, [...(byDay.get(key) ?? []), s]);
  }
  const first = days[0];
  const last = days[days.length - 1];
  const range =
    first.month === last.month ? MONTHS[first.month] : `${MONTHS[first.month]} – ${MONTHS[last.month]}`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-display text-2xl font-black tracking-tight uppercase">{range}</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 font-display text-xs font-bold tracking-[0.12em] uppercase">
          <span className="inline-flex items-center gap-1.5 text-ok">
            <span aria-hidden className="size-2 rounded-full bg-current" /> Spots open
          </span>
          <span className="inline-flex items-center gap-1.5 text-mat">
            <span aria-hidden className="size-2 rounded-full border-[1.5px] border-current" /> Full · waitlist
          </span>
        </div>
      </div>

      <div className="grid grid-cols-7 border-t-2 border-l-2 border-ink">
        {WEEKDAYS.map((w) => (
          <div
            key={w}
            aria-hidden
            className="border-r-2 border-b-2 border-ink bg-ink py-1 text-center font-display text-xs font-bold tracking-[0.2em] text-maple uppercase sm:text-sm"
          >
            <span className="sm:hidden">{w[0]}</span>
            <span className="hidden sm:inline">{w}</span>
          </div>
        ))}
        {days.map((d, i) => (
          <DayCell
            key={d.key}
            day={d.day}
            // Month on the first square and on each 1st, so the dates read without a header per month.
            month={i === 0 || d.day === 1 ? MONTHS[d.month] : null}
            isToday={d.key === today}
            past={d.key < today}
            sessions={byDay.get(d.key) ?? []}
            counts={counts}
          />
        ))}
      </div>
    </div>
  );
}

function DayCell({
  day,
  month,
  isToday,
  past,
  sessions,
  counts,
}: {
  day: number;
  month: string | null;
  isToday: boolean;
  past: boolean;
  sessions: Session[];
  counts: Map<string, SessionCounts>;
}) {
  const number = (
    <span className="flex items-baseline gap-1">
      <span className={cn("font-score text-base font-black sm:text-xl", isToday && "text-line")}>{day}</span>
      {month && (
        <span className="hidden font-display text-xs font-bold tracking-[0.15em] text-ink-soft uppercase sm:inline">
          {month}
        </span>
      )}
    </span>
  );
  const base = "relative flex min-h-14 min-w-0 flex-col gap-1 border-r-2 border-b-2 border-ink p-1 sm:min-h-24 sm:p-2";
  const todayRule = isToday && <span aria-hidden className="absolute inset-x-0 top-0 h-1 bg-line" />;

  if (sessions.length === 0) {
    return (
      <div className={cn(base, past ? "bg-maple-deep/40 text-ink/35" : "bg-maple text-ink/70")}>
        {todayRule}
        {number}
      </div>
    );
  }

  return (
    <div className={cn(base, "bg-maple-deep")}>
      {todayRule}
      {number}
      {sessions.map((s) => (
        <SessionLink key={s.id} session={s} counts={counts.get(s.id)} />
      ))}
    </div>
  );
}

function SessionLink({ session, counts }: { session: Session; counts?: SessionCounts }) {
  const live = isLive(session);
  const left = spotsLeft(session, counts);
  const full = left === 0;
  const status = live ? "On now" : full ? "Full" : `${left} open`;
  return (
    <Link
      href={`/s/${session.id}`}
      aria-label={`${session.title}, ${formatTime(session.starts_at)}: ${status}`}
      className={cn(
        "group -mx-1 -mb-1 flex flex-1 flex-col justify-end gap-0.5 px-1 pb-1 transition-colors sm:-mx-2 sm:-mb-2 sm:px-2 sm:pb-2",
        live ? "bg-line text-maple hover:bg-ink" : "hover:bg-ink hover:text-maple",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-3 rounded-full sm:hidden",
          live ? "bg-maple" : full ? "border-2 border-mat" : "bg-ok",
        )}
      />
      <span className="hidden font-display text-sm leading-tight font-extrabold uppercase [overflow-wrap:anywhere] sm:block">
        {formatTime(session.starts_at)}
      </span>
      <span
        className={cn(
          "hidden items-center gap-1.5 font-display text-xs font-bold tracking-[0.1em] uppercase sm:inline-flex",
          !live && (full ? "text-mat group-hover:text-maple" : "text-ok group-hover:text-maple"),
        )}
      >
        <span
          aria-hidden
          className={cn("size-2 shrink-0 rounded-full", full && !live ? "border-[1.5px] border-current" : "bg-current")}
        />
        {status}
      </span>
    </Link>
  );
}
