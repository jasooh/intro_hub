import { cache } from "react";
import { DateBlock } from "@/components/session-card";
import { OpensIn } from "@/components/countdown";
import { dateParts, formatTime, pad2 } from "@/lib/format";
import { getPublicCounts, getPublicSessions } from "@/lib/public-data";
import { createClient } from "@/lib/supabase/server";
import type { Session, SessionCounts } from "@/lib/types";

const SESSION_PATH = /^\/s\/([0-9a-f-]{36})$/i;

/** The session the pass shows: the one the player was heading to (`next=/s/<id>`), else the next one up. */
const getPassSession = cache(async (next: string) => {
  const id = SESSION_PATH.exec(next)?.[1];
  let session: Session | null = null;
  if (id) {
    const supabase = await createClient();
    const { data } = await supabase.from("sessions").select("*").eq("id", id).neq("status", "cancelled").maybeSingle();
    session = (data as Session | null) ?? null;
  }
  session ??= (await getPublicSessions(1))[0] ?? null;
  if (!session) return null;
  const counts: SessionCounts | undefined = (await getPublicCounts([session.id])).get(session.id);
  return { session, counts, notOpenYet: new Date(session.opens_at).getTime() > Date.now() };
});

/** The sign-in screen's dark "player pass": the next session, with the player's name still blank. */
export function PlayerPassFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-board p-5 text-maple shadow-[inset_0_0_0_2px_#2a241f,6px_6px_0_var(--line)] sm:w-80">
      <div className="flex items-center gap-3 border-b-2 border-maple/20 pb-3">
        <span aria-hidden className="size-3 shrink-0 bg-line" />
        <div className="leading-none">
          <p className="font-display text-sm font-bold tracking-[0.3em] text-led uppercase">Player pass</p>
          <p className="mt-1 font-display text-xl font-black tracking-wide uppercase">Intro 2 Volleyball</p>
        </div>
      </div>
      <div className="space-y-1 py-5">
        <p className="font-display text-[11px] font-bold tracking-[0.3em] text-maple/60 uppercase">Name</p>
        <p className="flex h-9 items-end border-b-2 border-dashed border-maple/40 pb-1">
          <span aria-hidden className="inline-block h-6 w-2.5 animate-[cursor_1s_steps(1,end)_infinite] bg-led" />
        </p>
      </div>
      {children}
    </div>
  );
}

export async function PlayerPass({ next }: { next: string }) {
  const found = await getPassSession(next);
  if (!found) {
    return (
      <PlayerPassFrame>
        <p className="font-display text-lg font-bold tracking-[0.15em] text-maple/70 uppercase">Next session: TBA</p>
      </PlayerPassFrame>
    );
  }
  const { session, counts, notOpenYet } = found;
  const taken = (counts?.confirmed ?? 0) + (counts?.holding ?? 0);
  return (
    <PlayerPassFrame>
      <div className="flex items-center gap-4">
        <DateBlock iso={session.starts_at} className="text-maple [&_span]:!text-maple/70 [&_span:first-child]:!text-led" />
        <div className="min-w-0 space-y-1">
          <p className="font-display text-xl leading-tight font-extrabold uppercase">{session.title}</p>
          <p className="text-sm text-maple/80">{formatTime(session.starts_at)} – {formatTime(session.ends_at)}</p>
        </div>
      </div>
      <div className="mt-5 flex items-end justify-between gap-3 border-t-2 border-maple/20 pt-4">
        {notOpenYet ? (
          <OpensIn to={session.opens_at} />
        ) : (
          <>
            <p className="led animate-flicker font-score text-4xl leading-none font-black tabular-nums">
              {pad2(taken)}/{pad2(session.capacity)}
            </p>
            <p className="font-display text-[11px] font-bold tracking-[0.3em] text-maple/60 uppercase">Taken</p>
          </>
        )}
      </div>
    </PlayerPassFrame>
  );
}

/** "Sign in to grab your spot for SAT 18 OCT" when the player came from a session page. */
export async function LoginSubline({ next }: { next: string }) {
  const found = SESSION_PATH.test(next) ? await getPassSession(next) : null;
  if (!found) return <>Sign up for sessions, see who&apos;s coming, and manage your spot.</>;
  const { weekday, day, month } = dateParts(found.session.starts_at);
  return (
    <>
      Sign in to grab your spot for <b className="text-ink">{weekday} {month} {day}</b> · {found.session.title}.
    </>
  );
}
