import Link from "next/link";
import { connection } from "next/server";
import { cache, Suspense } from "react";
import { FeaturedPost } from "@/components/featured-post";
import { LiveRefresh } from "@/components/live-refresh";
import { SessionCalendar } from "@/components/session-calendar";
import { isLive, SessionCard } from "@/components/session-card";
import { buttonClass, EmptyState, PageSpinner, reveal, Scoreboard, Sheet } from "@/components/ui";
import { env } from "@/lib/env";
import { calendarDays, dateParts, pad2, zonedDayKey } from "@/lib/format";
import { getPublicCounts, getPublicFeaturedPost, getPublicSessions } from "@/lib/public-data";

// Shared by the hero scoreboard and the "Next session" row within one request.
const getNext = cache(async () => {
  const [next] = await getPublicSessions(1);
  if (!next) return null;
  const counts = await getPublicCounts([next.id]);
  return { session: next, counts: counts.get(next.id) };
});

export default function Home() {
  return (
    <div className="space-y-14">
      <section className="grid grid-cols-1 items-end gap-8 sm:grid-cols-[1fr_auto]">
        <div className="space-y-5">
          <p className="reveal font-display text-base font-bold tracking-[0.3em] text-line uppercase" style={reveal(0)}>
            Drop-in volleyball · beginners welcome
          </p>
          <h1
            className="reveal font-display text-[clamp(3rem,20vw,9rem)] leading-[0.8] font-black tracking-tight uppercase"
            style={reveal(1)}
          >
            Intro 2
            <br />
            Volley<span className="text-line">ball</span>
          </h1>
          <p className="reveal max-w-md text-lg text-ink-soft" style={reveal(2)}>
            Just a few people spreading the love of volleyball. Never played? Perfect! Everyone&apos;s welcome on this
            court.
          </p>
          <div className="reveal flex flex-wrap gap-4 pt-1" style={reveal(3)}>
            <Link href="/sessions" className={buttonClass("primary")}>
              See sessions
            </Link>
            <Link href="/me" className={buttonClass("secondary")}>
              My account
            </Link>
          </div>
        </div>
        <div className="reveal pr-1 pb-1" style={reveal(4)}>
          <Suspense fallback={<Scoreboard value="--/--" label="Taken" />}>
            <NextScoreboard />
          </Suspense>
        </div>
      </section>

      <Suspense fallback={null}>
        <Featured />
      </Suspense>

      <Sheet
        label="Next session"
        action={
          <Link href="/sessions" className={buttonClass("ghost", "sm")}>
            All sessions →
          </Link>
        }
        className="reveal"
        style={reveal(5)}
      >
        <Suspense fallback={<PageSpinner />}>
          <NextSession />
        </Suspense>
      </Sheet>

      <Sheet label="Calendar" className="reveal" style={reveal(6)}>
        <Suspense fallback={<PageSpinner />}>
          <Calendar />
        </Suspense>
      </Sheet>

      <Playlist />
      <LiveRefresh />
    </div>
  );
}

async function NextScoreboard() {
  await connection(); // "live now" depends on the time, not just the cached data
  const next = await getNext();
  if (!next) return <Scoreboard value="--/--" label="No session yet" />;
  const taken = (next.counts?.confirmed ?? 0) + (next.counts?.holding ?? 0);
  const { weekday, day, month } = dateParts(next.session.starts_at);
  const live = isLive(next.session);
  return (
    <Scoreboard
      value={`${pad2(taken)}/${pad2(next.session.capacity)}`}
      label={live ? "● Live now · on court" : `Taken · ${weekday} ${month} ${day}`}
    />
  );
}

/** The host's featured post, if any: an announcement panel with no section divider. */
async function Featured() {
  const post = await getPublicFeaturedPost();
  if (!post) return null;
  return (
    <div className="reveal" style={reveal(5)}>
      <FeaturedPost post={post} />
    </div>
  );
}

async function NextSession() {
  // Per request: the card shows when sign-ups open until they do, then when it starts.
  await connection();
  const next = await getNext();
  if (!next) return <EmptyState>No sessions scheduled yet. Check back soon!</EmptyState>;
  return <SessionCard session={next.session} counts={next.counts} href={`/s/${next.session.id}`} countdown />;
}

const CALENDAR_WEEKS = 5;

/** The next few weeks at a glance; session days link to their sign-up page. */
async function Calendar() {
  const upcoming = await getPublicSessions(20);
  await connection(); // "today" is per request; the session list itself is cached
  const today = zonedDayKey(new Date().toISOString());
  const lastDay = calendarDays(today, CALENDAR_WEEKS).at(-1)!.key;
  const sessions = upcoming.filter((s) => zonedDayKey(s.starts_at) <= lastDay);
  const counts = await getPublicCounts(sessions.map((s) => s.id));
  return <SessionCalendar sessions={sessions} counts={counts} today={today} weeks={CALENDAR_WEEKS} />;
}

/** The host's Spotify playlist, embedded when SPOTIFY_PLAYLIST_URL is set. */
function Playlist() {
  const url = env.spotifyPlaylistUrl();
  const id = url?.match(/playlist\/([A-Za-z0-9]+)/)?.[1];
  if (!id) return null;
  return (
    <Sheet label="Hype song playlist" className="reveal" style={reveal(7)}>
      <div className="grid grid-cols-1 gap-5 bg-board p-4 shadow-[inset_0_0_0_2px_#2a241f,6px_6px_0_var(--line)] sm:grid-cols-[14rem_1fr] sm:p-5">
        <div className="flex flex-col justify-between gap-5">
          <div className="space-y-3">
            <p className="led animate-flicker font-score text-xl font-black tracking-widest">● ON AIR</p>
            <h3 className="font-display text-4xl leading-[0.85] font-black text-[#f2e3c6] uppercase">
              Community
              <br />
              play<span className="text-line">list</span>
            </h3>
            <p className="text-sm text-[#f2e3c6]/60">Share your favourite hype song with us so everyone can jam during our next session!</p>
          </div>
          <Link
            href="/me"
            className="group inline-flex items-center gap-2 font-display text-lg font-bold tracking-wide text-line uppercase hover:text-[#f2e3c6]"
          >
            Add your hype song
            <span aria-hidden className="transition-transform group-hover:translate-x-1">
              →
            </span>
          </Link>
        </div>
        <iframe
          title="Intro 2 Volleyball playlist on Spotify"
          src={`https://open.spotify.com/embed/playlist/${id}?utm_source=generator&theme=0`}
          width="100%"
          height="352"
          loading="lazy"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          className="rounded-xl"
        />
      </div>
    </Sheet>
  );
}
