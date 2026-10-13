import { Suspense } from "react";
import { setRefunded, waiveRefund } from "@/app/admin/actions";
import { SubmitButton } from "@/components/submit-button";
import { Card, EmptyState, PageSpinner } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime, formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { Profile, Registration, Session } from "@/lib/types";

type Row = Registration & { profile: Profile; session: Session };

export default function RefundsPage() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <Refunds />
    </Suspense>
  );
}

async function Refunds() {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase
    .from("registrations")
    .select("*, profile:profiles(*), session:sessions(*)")
    .eq("refund_owed", true)
    .order("cancelled_at", { ascending: false })
    .limit(100);
  const rows = (data ?? []) as Row[];
  const owed = rows.filter((r) => !r.refunded_at);
  const done = rows.filter((r) => r.refunded_at);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Refunds</h1>
        <p className="text-sm text-stone-600">
          Paid players who cancelled before the cutoff, were removed, or whose session was cancelled.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="font-semibold text-stone-700">To refund ({owed.length})</h2>
        {owed.length === 0 && <EmptyState>Nothing owed.</EmptyState>}
        {owed.map((r) => (
          <Card key={r.id} className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold">
                {formatMoney(r.session.price_cents)} to {r.profile.display_name ?? r.profile.full_name}
              </p>
              <p className="text-sm text-stone-600">
                {r.profile.email} · {r.session.title} {formatDateTime(r.session.starts_at)}
              </p>
            </div>
            <div className="flex gap-2">
              <form action={waiveRefund.bind(null, r.id)}>
                <SubmitButton size="sm" variant="ghost" confirm="Remove from the refund list without refunding?">
                  No refund
                </SubmitButton>
              </form>
              <form action={setRefunded.bind(null, r.id, true)}>
                <SubmitButton size="sm">Mark refunded</SubmitButton>
              </form>
            </div>
          </Card>
        ))}
      </section>

      {done.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold text-stone-700">Refunded</h2>
          <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white text-sm">
            {done.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                <span>
                  {r.profile.display_name ?? r.profile.full_name} · {formatMoney(r.session.price_cents)} ·{" "}
                  {formatDateTime(r.refunded_at!)}
                </span>
                <form action={setRefunded.bind(null, r.id, false)}>
                  <SubmitButton size="sm" variant="ghost">Undo</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
