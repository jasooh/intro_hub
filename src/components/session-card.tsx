import Link from "next/link";
import { CountTag, OpensIn } from "@/components/countdown";
import { LinkPending } from "@/components/nav-pending";
import { Mark, SpotDots } from "@/components/ui";
import { dateParts, formatMoney, formatTime } from "@/lib/format";
import { spotsLeft } from "@/lib/queries";
import { offeredOptions, optionPrice } from "@/lib/options";
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

/** True while the session is on (started, not ended, not cancelled). */
export function isLive(session: Pick<Session, "starts_at" | "ends_at" | "status">, now = Date.now()) {
  return (
    session.status !== "cancelled" &&
    new Date(session.starts_at).getTime() <= now &&
    now < new Date(session.ends_at).getTime()
  );
}

/** True until the session starts. */
export function startsLater(session: Pick<Session, "starts_at">, now = Date.now()) {
  return new Date(session.starts_at).getTime() > now;
}

/** True while sign-ups haven't opened yet. */
function opensLater(session: Pick<Session, "opens_at">, now = Date.now()) {
  return new Date(session.opens_at).getTime() > now;
}

/** Small LED tag with a pulsing dot for a session that's on right now. */
export function LiveBadge({ label = "Live · on court now" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 bg-board px-2 pt-1 pb-0.5 font-display text-xs font-bold tracking-[0.2em] whitespace-nowrap text-led uppercase">
      <span aria-hidden className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-led opacity-75" />
        <span className="relative inline-flex size-2 rounded-full bg-led" />
      </span>
      {label}
    </span>
  );
}

/** A session as one row on the roster sheet. Sessions on right now get a live look. */
export function SessionCard({
  session,
  counts,
  href,
  countdown = false,
}: {
  session: Session;
  counts?: SessionCounts;
  href: string;
  /** Show a "Starts in …" countdown (the home page's Next session). */
  countdown?: boolean;
}) {
  const live = isLive(session);
  const left = spotsLeft(session, counts);
  const confirmed = counts?.confirmed ?? 0;
  const holding = counts?.holding ?? 0;
  const waitlisted = counts?.waitlisted ?? 0;
  const instructional = counts?.instructional ?? 0;
  const cancelled = session.status === "cancelled";
  const notOpenYet = !cancelled && !live && opensLater(session);

  return (
    <Link
      href={href}
      className={`group relative grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-4 py-5 transition-colors hover:bg-maple-deep/50 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-x-6 sm:gap-y-2 sm:px-2 sm:py-4 ${
        live ? "border-l-4 border-line bg-line/[0.06] pl-3 sm:pl-4" : ""
      }`}
    >
      <LinkPending />
      <DateBlock iso={session.starts_at} className="sm:row-span-2" />

      <div className="min-w-0 space-y-1">
        {live && <LiveBadge />}
        {countdown && !cancelled && !live && startsLater(session) && <CountTag to={session.starts_at} label="Starts in" />}
        <p className={`font-display text-2xl leading-tight font-extrabold uppercase ${cancelled ? "line-through" : ""}`}>
          {session.title}
        </p>
        <p className="font-semibold">
          {formatTime(session.starts_at)} – {formatTime(session.ends_at)}
        </p>
        <p className="text-sm leading-snug text-ink-soft">{session.location}</p>
      </div>

      {/* Desktop: price and arrow on the right (no price once it's on: sign-ups are closed). */}
      <div className="hidden flex-col items-end gap-1 sm:row-span-2 sm:flex">
        {!live && <CardPrice session={session} />}
        <span aria-hidden className="font-display text-3xl font-black text-line transition-transform group-hover:translate-x-1.5">
          →
        </span>
      </div>

      {/* Spots: full width under the date on phones, under the title on desktop. */}
      <div className="col-span-2 space-y-1.5 sm:col-span-1 sm:col-start-2 sm:row-start-2">
        {!cancelled && <SpotDots capacity={session.capacity} confirmed={confirmed} holding={holding} size="sm" />}
        <div className="flex items-center justify-between gap-4">
          {cancelled ? (
            <Mark tone="bad" glyph="✕">
              Cancelled
            </Mark>
          ) : (
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              {live ? (
                <Mark tone="line" glyph="●">
                  {confirmed} on court · until {formatTime(session.ends_at)}
                </Mark>
              ) : notOpenYet ? (
                <OpensIn to={session.opens_at} />
              ) : left > 0 ? (
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
          <span className="flex shrink-0 items-baseline gap-2 sm:hidden">
            {!live && <span className="font-score text-xl font-black">{formatMoney(session.price_cents)}</span>}
            <span aria-hidden className="font-display text-2xl font-black text-line">
              →
            </span>
          </span>
        </div>
      </div>
    </Link>
  );
}

/** Price on a session row: FREE for deposit sessions, "from" when a cheaper option exists. */
function CardPrice({ session }: { session: Session }) {
  if (session.deposit_cents != null) {
    return <span className="font-display text-2xl font-black text-line uppercase">Free</span>;
  }
  const lowest = Math.min(...offeredOptions(session).map((o) => optionPrice(session, o)));
  return (
    <span className="flex items-baseline gap-1.5">
      {lowest < session.price_cents && <span className="text-sm text-ink-soft">from</span>}
      <span className="font-score text-2xl font-black">{formatMoney(lowest)}</span>
    </span>
  );
}
