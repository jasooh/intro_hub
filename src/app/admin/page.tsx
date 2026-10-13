import Link from "next/link";
import { Suspense } from "react";
import { SessionCard } from "@/components/session-card";
import { buttonClass, Card, EmptyState, PageSpinner } from "@/components/ui";
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Host dashboard</h1>
        <Link href="/admin/sessions/new" className={buttonClass()}>
          + New session
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard href="/admin/payments" label="Unmatched payments" value={unmatched.count ?? 0} />
        <StatCard href="/admin/refunds" label="Refunds owed" value={refunds.count ?? 0} />
      </div>

      <section className="space-y-3">
        <h2 className="font-semibold text-stone-700">Upcoming sessions</h2>
        {sessions.length === 0 ? (
          <EmptyState>
            No sessions yet. <Link href="/admin/templates" className="text-orange-700 underline">Set up a weekly schedule</Link>{" "}
            or create a one-off session.
          </EmptyState>
        ) : (
          sessions.map((s) => (
            <SessionCard key={s.id} session={s} counts={counts.get(s.id)} href={`/admin/sessions/${s.id}`} />
          ))
        )}
      </section>
    </div>
  );
}

function StatCard({ href, label, value }: { href: string; label: string; value: number }) {
  return (
    <Link href={href}>
      <Card className={value > 0 ? "border-amber-300 bg-amber-50" : ""}>
        <p className="text-sm text-stone-600">{label}</p>
        <p className="text-3xl font-semibold">{value}</p>
      </Card>
    </Link>
  );
}
