import type { Metadata } from "next";
import { Suspense } from "react";
import { LiveRefresh } from "@/components/live-refresh";
import { SessionCard } from "@/components/session-card";
import { EmptyState, PageSpinner, reveal, Sheet } from "@/components/ui";
import { getPublicCounts, getPublicSessions } from "@/lib/public-data";

export const metadata: Metadata = {
  title: "Sessions",
  description: "Upcoming Intro 2 Volleyball drop-ins at Aaniin Community Centre. Grab a spot, pay by e-Transfer, and you're in.",
};

export default function SessionsPage() {
  return (
    <div className="space-y-8">
      <div className="reveal space-y-2" style={reveal(0)}>
        <h1 className="font-display text-6xl leading-[0.85] font-black tracking-tight uppercase sm:text-7xl">
          Upcoming<span className="text-line">.</span>
        </h1>
        <p className="text-lg text-ink-soft">Come join us for our weekly drop-ins!</p>
      </div>
      <Sheet label="Roster" className="reveal" style={reveal(1)}>
        <Suspense fallback={<PageSpinner />}>
          <SessionList />
        </Suspense>
      </Sheet>
      <LiveRefresh />
    </div>
  );
}

async function SessionList() {
  const sessions = await getPublicSessions(10);
  const counts = await getPublicCounts(sessions.map((s) => s.id));
  if (sessions.length === 0) return <EmptyState>No sessions scheduled yet. Check back soon!</EmptyState>;
  return (
    <div className="divide-y divide-ink/25">
      {sessions.map((s, i) => (
        <div key={s.id} className="reveal" style={reveal(i + 2)}>
          <SessionCard session={s} counts={counts.get(s.id)} href={`/s/${s.id}`} />
        </div>
      ))}
    </div>
  );
}
