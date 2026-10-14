import { Suspense } from "react";
import { setRefunded, waiveRefund } from "@/app/admin/actions";
import { SubmitButton } from "@/components/submit-button";
import { EmptyState, PageSpinner, PageTitle, reveal, Sheet } from "@/components/ui";
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
    <div className="space-y-12">
      <PageTitle sub="Paid players who cancelled before the cutoff, were removed, or whose session was cancelled.">
        Refunds
      </PageTitle>

      <Sheet label={`To refund · ${owed.length}`} className="reveal" style={reveal(1)}>
        {owed.length === 0 && <EmptyState>Nothing owed.</EmptyState>}
        <div className="divide-y divide-ink/25">
        {owed.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div>
              <p className="text-lg">
                <span className="font-score font-black text-line">{formatMoney(r.session.price_cents)}</span> to{" "}
                <b>{r.profile.display_name ?? r.profile.full_name}</b>
              </p>
              <p className="text-sm text-ink-soft">
                {r.profile.email} · {r.session.title} {formatDateTime(r.session.starts_at)}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <form action={waiveRefund.bind(null, r.id)}>
                <SubmitButton size="sm" variant="ghost" confirm={{
                    title: "Skip this refund?",
                    description: "They'll be removed from the refund list without being refunded.",
                  }}>
                  No refund
                </SubmitButton>
              </form>
              <form action={setRefunded.bind(null, r.id, true)}>
                <SubmitButton size="sm">Mark refunded</SubmitButton>
              </form>
            </div>
          </div>
        ))}
        </div>
      </Sheet>

      {done.length > 0 && (
        <Sheet label="Refunded" className="reveal" style={reveal(2)}>
          <ul className="divide-y divide-ink/20">
            {done.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-ink-soft">
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
        </Sheet>
      )}
    </div>
  );
}
