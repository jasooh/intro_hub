import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SessionCard } from "@/components/session-card";
import { buttonClass, EmptyState, PageSpinner, PageTitle, reveal, Scoreboard, ScoreboardRow, Sheet } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { type AdminSessionView, getAdminSessions, getCounts } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import { ListFilters } from "@/components/list-filters";
import { pad2 } from "@/lib/format";

const VIEWS: { key: AdminSessionView; label: string }[] = [
  { key: "upcoming", label: "Upcoming" },
  { key: "past", label: "Past" },
  { key: "cancelled", label: "Cancelled" },
];

export const metadata: Metadata = {
  title: "Sessions",
};

export default function AdminSessionsPage(props: PageProps<"/admin">) {
  return (
    <Suspense fallback={<PageSpinner />}>
      <Sessions searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Sessions({ searchParams }: { searchParams: PageProps<"/admin">["searchParams"] }) {
  await requireAdmin();
  const params = await searchParams;
  const view: AdminSessionView = VIEWS.some((v) => v.key === params.view) ? (params.view as AdminSessionView) : "upcoming";
  const q = typeof params.q === "string" ? params.q : "";

  const supabase = await createClient();
  const [{ sessions, totals }, unmatched, refunds, cancelled] = await Promise.all([
    getAdminSessions(view, q),
    supabase
      .from("payments")
      .select("id", { count: "exact", head: true })
      .is("registration_id", null)
      .eq("dismissed", false),
    supabase
      .from("registrations")
      .select("id", { count: "exact", head: true })
      .eq("refund_owed", true)
      .is("refunded_at", null)
      .is("refund_waived_at", null),
    // Cancelled e-Transfers waiting for a host to pick the payment.
    supabase
      .from("payment_cancellations")
      .select("id", { count: "exact", head: true })
      .is("payment_id", null)
      .is("dismissed_at", null),
  ]);
  const counts = await getCounts(sessions.map((s) => s.id));

  return (
    <div className="space-y-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageTitle>Sessions</PageTitle>
        <Link href="/admin/sessions/new" className={buttonClass()}>
          + New session
        </Link>
      </div>

      <ScoreboardRow className="reveal" style={reveal(1)}>
        <Link href="/admin/payments" className="flex transition-transform hover:-translate-y-0.5">
          <Scoreboard className="w-full" value={pad2((unmatched.count ?? 0) + (cancelled.count ?? 0))} label="Payments to sort out" />
        </Link>
        <Link href="/admin/refunds" className="flex transition-transform hover:-translate-y-0.5">
          <Scoreboard className="w-full" value={pad2(refunds.count ?? 0)} label="Refunds owed" />
        </Link>
      </ScoreboardRow>

      <Sheet label="Sessions" className="reveal" style={reveal(2)}>
        <ListFilters
          path="/admin"
          tabs={{ param: "view", value: view, options: VIEWS.map((v) => ({ ...v, count: totals[v.key] })) }}
          q={q}
          placeholder="Search title, location, notes"
        >
          {sessions.length === 0 ? (
            <EmptyState>
              {q ? (
                <>No {view} sessions match &ldquo;{q}&rdquo;.</>
              ) : view === "upcoming" ? (
                <>
                  No upcoming sessions.{" "}
                  <Link href="/admin/templates" className="text-line underline decoration-2 underline-offset-4">
                    Set up a weekly schedule
                  </Link>{" "}
                  or create a one-off session.
                </>
              ) : (
                <>No {view} sessions.</>
              )}
            </EmptyState>
          ) : (
            <div className="divide-y divide-ink/25">
              {sessions.map((s) => (
                <SessionCard key={s.id} session={s} counts={counts.get(s.id)} href={`/admin/sessions/${s.id}`} />
              ))}
            </div>
          )}
          {sessions.length === 50 && <p className="text-sm text-ink-soft">Showing the 50 most relevant. Search to narrow down.</p>}
        </ListFilters>
      </Sheet>
    </div>
  );
}
