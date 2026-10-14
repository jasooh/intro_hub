import Link from "next/link";
import { cache, Suspense } from "react";
import { LiveRefresh } from "@/components/live-refresh";
import { SessionCard } from "@/components/session-card";
import { buttonClass, EmptyState, PageSpinner, reveal, Scoreboard, Sheet } from "@/components/ui";
import { env } from "@/lib/env";
import { dateParts } from "@/lib/format";
import { getCounts, getUpcomingSessions, spotsLeft } from "@/lib/queries";

const STEPS = [
  { title: "Grab a spot", body: "Sign in with Google and tap Sign up. If there's room, your spot is held while you pay." },
  { title: "e-Transfer", body: "Put your ref code (like VB-7K3Q) in the message. Payments are matched automatically." },
  { title: "Play", body: "You get a confirmation email. Session full? Join the waitlist and you move up automatically." },
];

// Shared by the hero scoreboard and the "Next session" row within one request.
const getNext = cache(async () => {
  const [next] = await getUpcomingSessions(1, { includeCancelled: false });
  if (!next) return null;
  const counts = await getCounts([next.id]);
  return { session: next, counts: counts.get(next.id) };
});

export default function Home() {
  return (
    <div className="space-y-14">
      <section className="grid items-end gap-8 sm:grid-cols-[1fr_auto]">
        <div className="space-y-5">
          <p className="reveal font-display text-base font-bold tracking-[0.3em] text-line uppercase" style={reveal(0)}>
            Drop-in volleyball · beginners welcome
          </p>
          <h1
            className="reveal font-display text-[clamp(4.5rem,17vw,9rem)] leading-[0.8] font-black tracking-tight uppercase"
            style={reveal(1)}
          >
            Intro 2
            <br />
            Volley<span className="text-line">ball</span>
          </h1>
          <p className="reveal max-w-md text-lg text-ink-soft" style={reveal(2)}>
            Sign up in seconds, see who&apos;s playing, and skip the group-chat chaos.
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
        <div className="reveal" style={reveal(4)}>
          <Suspense fallback={<Scoreboard value="--/--" label="Signed up" size="lg" />}>
            <NextScoreboard />
          </Suspense>
        </div>
      </section>

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

      <Sheet label="How it works" className="reveal" style={reveal(6)}>
        <ol className="grid gap-6 sm:grid-cols-3 sm:gap-0 sm:divide-x-2 sm:divide-ink">
          {STEPS.map((step, i) => (
            <li key={step.title} className="space-y-2 sm:px-5 sm:first:pl-0 sm:last:pr-0">
              <div className="flex items-baseline gap-3">
                <span className="font-score text-4xl font-black text-line">{String(i + 1).padStart(2, "0")}</span>
                <span className="font-display text-2xl font-extrabold uppercase">{step.title}</span>
              </div>
              <p className="text-ink-soft">{step.body}</p>
            </li>
          ))}
        </ol>
      </Sheet>

      <Playlist />
      <LiveRefresh />
    </div>
  );
}

async function NextScoreboard() {
  const next = await getNext();
  if (!next) return <Scoreboard value="--" label="No session yet" size="lg" />;
  const left = spotsLeft(next.session, next.counts);
  const { weekday, day, month } = dateParts(next.session.starts_at);
  const when = `Spots · ${weekday} ${month} ${day}`;
  if (left > 0) return <Scoreboard value={`${String(left).padStart(2, "0")} LEFT`} label={when} size="lg" />;
  return <Scoreboard value={(next.counts?.waitlisted ?? 0) > 0 ? "WAITLIST" : "FULL"} label={when} size="lg" />;
}

async function NextSession() {
  const next = await getNext();
  if (!next) return <EmptyState>No sessions scheduled yet. Check back soon!</EmptyState>;
  return <SessionCard session={next.session} counts={next.counts} href={`/s/${next.session.id}`} />;
}

/** The host's Spotify playlist, embedded when SPOTIFY_PLAYLIST_URL is set. */
function Playlist() {
  const url = env.spotifyPlaylistUrl();
  const id = url?.match(/playlist\/([A-Za-z0-9]+)/)?.[1];
  if (!id) return null;
  return (
    <Sheet
      label="Warm-up playlist"
      action={
        <Link href="/me" className={buttonClass("ghost", "sm")}>
          Add your hype song →
        </Link>
      }
      className="reveal"
      style={reveal(7)}
    >
      <iframe
        title="Intro 2 Volleyball playlist on Spotify"
        src={`https://open.spotify.com/embed/playlist/${id}?utm_source=generator`}
        width="100%"
        height="352"
        loading="lazy"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        className="border-2 border-ink"
      />
    </Sheet>
  );
}
