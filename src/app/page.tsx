import Link from "next/link";
import { Suspense } from "react";
import { LiveRefresh } from "@/components/live-refresh";
import { SessionCard } from "@/components/session-card";
import { buttonClass, Card, EmptyState, PageSpinner } from "@/components/ui";
import { getCounts, getUpcomingSessions } from "@/lib/queries";

const STEPS = [
  {
    title: "Sign in & grab a spot",
    body: "Sign in with Google and tap Sign up. If there's room, your spot is held while you pay.",
  },
  {
    title: "Send an e-Transfer",
    body: "Put your ref code (like VB-7K3Q) in the message. Payments are matched automatically.",
  },
  {
    title: "You're in",
    body: "You get a confirmation email. Session full? Join the waitlist and you're moved up automatically.",
  },
];

export default function Home() {
  return (
    <div className="space-y-12 py-4">
      <section className="space-y-5 text-center">
        <p className="text-sm font-medium tracking-wide text-orange-400 uppercase">Drop-in volleyball</p>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Intro 2 Volleyball</h1>
        <p className="mx-auto max-w-xl text-lg text-stone-400">
          Beginner-friendly drop-in sessions. Sign up in seconds, see who&apos;s playing, and skip the group-chat
          chaos.
        </p>
        <div className="flex justify-center gap-3">
          <Link href="/sessions" className={buttonClass("primary")}>
            See sessions
          </Link>
          <Link href="/me" className={buttonClass("secondary")}>
            My sign-ups
          </Link>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold tracking-wide text-stone-400 uppercase">Next session</h2>
        <Suspense fallback={<PageSpinner />}>
          <NextSession />
        </Suspense>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold tracking-wide text-stone-400 uppercase">How it works</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <Card key={step.title} className="space-y-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-orange-950 text-sm font-semibold text-orange-300">
                {i + 1}
              </span>
              <p className="font-semibold">{step.title}</p>
              <p className="text-sm text-stone-400">{step.body}</p>
            </Card>
          ))}
        </div>
      </section>
      <LiveRefresh />
    </div>
  );
}

async function NextSession() {
  const [next] = await getUpcomingSessions(1);
  if (!next) return <EmptyState>No sessions scheduled yet. Check back soon!</EmptyState>;
  const counts = await getCounts([next.id]);
  return (
    <div className="space-y-2">
      <SessionCard session={next} counts={counts.get(next.id)} href={`/s/${next.id}`} />
      <Link href="/sessions" className="block text-right text-sm text-orange-400 hover:text-orange-300">
        All upcoming sessions →
      </Link>
    </div>
  );
}
