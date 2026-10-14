import Link from "next/link";
import { Suspense } from "react";
import { SessionCard } from "@/components/session-card";
import { buttonClass, EmptyState, PageSpinner, PageTitle, reveal, Scoreboard, Sheet } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { getCounts, getUpcomingSessions } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";

export default function AdminDashboard() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <Dashboard />
    </Suspense>
  );
}

async function Dashboard() {
  await requireAdmin();
  const supabase = await createClient();
  const [sessions, unmatched, refunds] = await Promise.all([
    getUpcomingSessions(20),
    supabase
      .from("payments")
      .select("id", { count: "exact", head: true })
      .is("registration_id", null)
      .eq("dismissed", false),
    supabase
      .from("registrations")
      .select("id", { count: "exact", head: true })
      .eq("refund_owed", true)
      .is("refunded_at", null),
  ]);
  const counts = await getCounts(sessions.map((s) => s.id));
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="space-y-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageTitle>Dashboard</PageTitle>
        <Link href="/admin/sessions/new" className={buttonClass()}>
          + New session
        </Link>
      </div>

      <div className="reveal flex flex-wrap gap-6" style={reveal(1)}>
        <Link href="/admin/payments" className="transition-transform hover:-translate-y-0.5">
          <Scoreboard value={pad(unmatched.count ?? 0)} label="Unmatched payments" />
        </Link>
        <Link href="/admin/refunds" className="transition-transform hover:-translate-y-0.5">
          <Scoreboard value={pad(refunds.count ?? 0)} label="Refunds owed" />
        </Link>
      </div>

      <Sheet label="Upcoming sessions" className="reveal" style={reveal(2)}>
        {sessions.length === 0 ? (
          <EmptyState>
            No sessions yet.{" "}
            <Link href="/admin/templates" className="text-line underline decoration-2 underline-offset-4">
              Set up a weekly schedule
            </Link>{" "}
            or create a one-off session.
          </EmptyState>
        ) : (
          <div className="divide-y divide-ink/25">
            {sessions.map((s) => (
              <SessionCard key={s.id} session={s} counts={counts.get(s.id)} href={`/admin/sessions/${s.id}`} />
            ))}
          </div>
        )}
      </Sheet>
    </div>
  );
}
