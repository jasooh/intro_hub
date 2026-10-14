import Link from "next/link";
import { Mark, SpotDots } from "@/components/ui";
import { dateParts, formatMoney, formatTime } from "@/lib/format";
import { spotsLeft } from "@/lib/queries";
import type { Session, SessionCounts } from "@/lib/types";

/** Big condensed SAT / 18 / OCT block. */
export function DateBlock({ iso, className }: { iso: string; className?: string }) {
  const { weekday, day, month } = dateParts(iso);
  return (
    <div className={`flex w-14 shrink-0 flex-col items-center font-display leading-none uppercase ${className ?? ""}`}>
      <span className="text-sm font-bold tracking-[0.2em] text-line">{weekday}</span>
      <span className="text-5xl font-black tracking-tight">{day}</span>
      <span className="text-sm font-bold tracking-[0.2em] text-ink-soft">{month}</span>
    </div>
  );
}

/** A session as one row on the roster sheet. */
export function SessionCard({ session, counts, href }: { session: Session; counts?: SessionCounts; href: string }) {
  const left = spotsLeft(session, counts);
  const confirmed = counts?.confirmed ?? 0;
  const holding = counts?.holding ?? 0;
  const waitlisted = counts?.waitlisted ?? 0;
  const instructional = counts?.instructional ?? 0;
  const cancelled = session.status === "cancelled";

  return (
    <Link
      href={href}
      className="group grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-3 py-4 transition-colors hover:bg-maple-deep/50 sm:grid-cols-[auto_1fr_auto] sm:gap-x-6 sm:px-2"
    >
      <DateBlock iso={session.starts_at} />

      <div className="min-w-0 space-y-2">
        <div>
          <p className={`font-display text-2xl leading-tight font-extrabold uppercase ${cancelled ? "line-through" : ""}`}>
            {session.title}
          </p>
          <p className="text-ink-soft">
            {formatTime(session.starts_at)} – {formatTime(session.ends_at)} · {session.location}
            <span className="font-score font-black text-ink sm:hidden"> · {formatMoney(session.price_cents)}</span>
          </p>
        </div>
        {cancelled ? (
          <Mark tone="bad" glyph="✕">
            Cancelled
          </Mark>
        ) : (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <SpotDots capacity={session.capacity} confirmed={confirmed} holding={holding} size="sm" />
            {left > 0 ? (
              <Mark tone="ok" glyph="●">
                {left} open
              </Mark>
            ) : (
              <Mark tone="mat" glyph="○">
                Full · {waitlisted} waiting
              </Mark>
            )}
            {instructional > 0 && (
              <Mark tone="mat" glyph="◇">
                +{instructional} instr.
              </Mark>
            )}
          </div>
        )}
      </div>

      <div className="hidden flex-col items-end gap-1 sm:flex">
        <span className="font-score text-2xl font-black">{formatMoney(session.price_cents)}</span>
        <span aria-hidden className="font-display text-3xl font-black text-line transition-transform group-hover:translate-x-1.5">
          →
        </span>
      </div>
    </Link>
  );
}
