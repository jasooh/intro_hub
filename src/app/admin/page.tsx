import Link from "next/link";
import { Suspense } from "react";
import { SessionCard } from "@/components/session-card";
import { buttonClass, EmptyState, inputClass, PageSpinner, PageTitle, reveal, Scoreboard, Sheet } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { type AdminSessionView, getAdminSessions, getCounts } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";

const VIEWS: { key: AdminSessionView; label: string }[] = [
  { key: "upcoming", label: "Upcoming" },
  { key: "past", label: "Past" },
  { key: "cancelled", label: "Cancelled" },
];

export default function AdminDashboard(props: PageProps<"/admin">) {
  return (
    <Suspense fallback={<PageSpinner />}>
      <Dashboard searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Dashboard({ searchParams }: { searchParams: PageProps<"/admin">["searchParams"] }) {
  await requireAdmin();
  const params = await searchParams;
  const view: AdminSessionView = VIEWS.some((v) => v.key === params.view) ? (params.view as AdminSessionView) : "upcoming";
  const q = typeof params.q === "string" ? params.q : "";

  const supabase = await createClient();
  const [{ sessions, totals }, unmatched, refunds] = await Promise.all([
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
      .is("refunded_at", null),
  ]);
  const counts = await getCounts(sessions.map((s) => s.id));
  const pad = (n: number) => String(n).padStart(2, "0");
  const href = (v: AdminSessionView) => `/admin?${new URLSearchParams({ view: v, ...(q ? { q } : {}) })}`;

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

      <Sheet label="Sessions" className="reveal" style={reveal(2)}>
        <div className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
            <nav className="flex gap-6" aria-label="Session views">
              {VIEWS.map((v) => (
                <Link
                  key={v.key}
                  href={href(v.key)}
                  aria-current={v.key === view ? "page" : undefined}
                  className={`border-b-4 pb-1 font-display text-lg font-bold tracking-wide uppercase transition-colors ${
                    v.key === view ? "border-line text-ink" : "border-transparent text-ink-soft hover:text-ink"
                  }`}
                >
                  {v.label} <span className="font-score font-black">{totals[v.key]}</span>
                </Link>
              ))}
            </nav>
            <form action="/admin" className="flex items-end gap-3">
              <input type="hidden" name="view" value={view} />
              <input
                type="search"
                name="q"
                defaultValue={q}
                placeholder="Search title, location, notes"
                aria-label="Search sessions"
                className={`${inputClass} w-64 text-base`}
              />
              <button type="submit" className={buttonClass("secondary", "sm")}>
                Search
              </button>
              {q && (
                <Link href={`/admin?view=${view}`} className={buttonClass("ghost", "sm")}>
                  Clear
                </Link>
              )}
            </form>
          </div>

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
        </div>
      </Sheet>
    </div>
  );
}
