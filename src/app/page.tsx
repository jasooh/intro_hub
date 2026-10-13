import { Suspense } from "react";
import { LiveRefresh } from "@/components/live-refresh";
import { SessionCard } from "@/components/session-card";
import { EmptyState, PageSpinner } from "@/components/ui";
import { getCounts, getUpcomingSessions } from "@/lib/queries";

export default function Home() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Upcoming sessions</h1>
        <p className="text-stone-600">Grab a spot, pay by e-Transfer, and you&apos;re in.</p>
      </div>
      <Suspense fallback={<PageSpinner />}>
        <SessionList />
      </Suspense>
      <LiveRefresh />
    </div>
  );
}

async function SessionList() {
  const sessions = await getUpcomingSessions();
  const counts = await getCounts(sessions.map((s) => s.id));
  if (sessions.length === 0) return <EmptyState>No sessions scheduled yet. Check back soon!</EmptyState>;
  return (
    <div className="space-y-3">
      {sessions.map((s) => (
        <SessionCard key={s.id} session={s} counts={counts.get(s.id)} href={`/s/${s.id}`} />
      ))}
    </div>
  );
}
