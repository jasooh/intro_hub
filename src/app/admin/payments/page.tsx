import type { Metadata } from "next";
import { Suspense } from "react";
import { ListFilters } from "@/components/list-filters";
import { EmptyState, PageSpinner, PageTitle, reveal, Sheet } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { METHOD_LABELS, type PaymentMethod, paymentMatches, paymentMethod, paymentStatus, type PaymentStatus } from "@/lib/payments";
import { paymentWindowStart } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import type { PaymentCancellation } from "@/lib/types";

import { CancellationRow, type PaymentChoice } from "./cancellation-row";
import { type Option, PaymentRow, type Row } from "./payment-row";

const STATUS_TABS: { key: PaymentStatus | "all"; label: string }[] = [
  { key: "attention", label: "Needs attention" },
  { key: "matched", label: "Matched" },
  { key: "cancelled", label: "Cancelled" },
  { key: "dismissed", label: "Dismissed" },
  { key: "all", label: "All" },
];
const METHOD_CHIPS: { key: PaymentMethod | "any"; label: string }[] = [
  { key: "any", label: "Any method" },
  { key: "ref", label: METHOD_LABELS.ref },
  { key: "name_amount", label: METHOD_LABELS.name_amount },
  { key: "assigned", label: METHOD_LABELS.assigned },
  { key: "manual", label: METHOD_LABELS.manual },
];

export const metadata: Metadata = {
  title: "Payments",
};

export default function PaymentsPage(props: PageProps<"/admin/payments">) {
  return (
    <Suspense fallback={<PageSpinner />}>
      <Payments searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Payments({ searchParams }: { searchParams: PageProps<"/admin/payments">["searchParams"] }) {
  await requireAdmin();
  const params = await searchParams;
  const view = STATUS_TABS.some((t) => t.key === params.view) ? (params.view as PaymentStatus | "all") : "attention";
  const method = METHOD_CHIPS.some((c) => c.key === params.method) ? (params.method as PaymentMethod | "any") : "any";
  const q = typeof params.q === "string" ? params.q : "";

  const supabase = await createClient();
  const since = await paymentWindowStart();
  const [{ data: payments }, { data: options }, { data: cancellations }] = await Promise.all([
    supabase
      .from("payments")
      .select(
        "*, registration:registrations(*, profile:profiles(display_name, full_name, first_name, last_name), session:sessions(id, title, starts_at))",
      )
      .order("received_at", { ascending: false })
      .limit(1000),
    supabase
      .from("registrations")
      .select("*, profile:profiles(display_name, full_name), session:sessions!inner(title, starts_at)")
      .in("status", ["pending_payment", "waitlisted", "expired"])
      .gte("session.starts_at", since)
      .order("created_at", { ascending: false }),
    // Cancelled e-Transfers the site couldn't tie to one payment.
    supabase
      .from("payment_cancellations")
      .select("*")
      .is("payment_id", null)
      .is("dismissed_at", null)
      .order("received_at", { ascending: false }),
  ]);
  const openCancels = (cancellations ?? []) as PaymentCancellation[];
  // What a cancellation can take back: real e-Transfers that still count.
  const reversible = ((payments ?? []) as Row[]).filter((p) => p.gmail_message_id && !p.reversed_at) as PaymentChoice[];

  // An expired sign-up is only worth offering if the player hasn't signed up again for that
  // session (the database would put the money on their current sign-up anyway).
  const active = new Set(
    ((options ?? []) as Option[])
      .filter((o) => o.status === "pending_payment" || o.status === "waitlisted")
      .map((o) => `${o.session_id}:${o.profile_id}`),
  );
  const { data: confirmedRows } = await supabase
    .from("registrations")
    .select("session_id, profile_id, session:sessions!inner(starts_at)")
    .eq("status", "confirmed")
    .gte("session.starts_at", since);
  for (const c of confirmedRows ?? []) active.add(`${c.session_id}:${c.profile_id}`);
  const assignable = ((options ?? []) as Option[]).filter(
    (o) => o.status !== "expired" || !active.has(`${o.session_id}:${o.profile_id}`),
  );

  // Small data set: classify and search in memory, counting what the search leaves in each tab.
  const rows = ((payments ?? []) as Row[])
    .map((p) => ({ p, method: paymentMethod(p) }))
    .filter(({ p }) => {
      const r = p.registration;
      return paymentMatches(p, [r?.ref_code, r?.profile.display_name, r?.profile.full_name, r?.profile.first_name, r?.profile.last_name], q);
    });
  const statusCount = (s: PaymentStatus | "all") => rows.filter((r) => s === "all" || paymentStatus(r.method) === s).length;
  const inView = rows.filter((r) => view === "all" || paymentStatus(r.method) === view);
  const methodCount = (m: PaymentMethod | "any") => inView.filter((r) => m === "any" || r.method === m).length;
  const shown = inView.filter((r) => method === "any" || r.method === method);
  const showChips = view === "matched" || view === "all";

  return (
    <div className="space-y-12">
      {openCancels.length > 0 && (
        <Sheet label="Cancelled e-Transfers" className="reveal" style={reveal(1)}>
          <p className="mb-2 text-ink-soft">
            The sender cancelled these before they were deposited (or they expired), and the site couldn&apos;t tell
            which payment they were. Pick the payment so it stops counting as paid.
          </p>
          <ul className="divide-y divide-ink/25">
            {openCancels.map((c) => (
              <CancellationRow key={c.id} c={c} payments={reversible} />
            ))}
          </ul>
        </Sheet>
      )}

      <PageTitle sub="Every e-Transfer that reaches your Gmail shows up here within minutes. It's linked to a sign-up by the code in its message (or, with no code, the sender's name and the exact amount owed), and that player is marked paid. Anything that couldn't be linked is left for you to sort out.">
        Payments
      </PageTitle>

      <Sheet label="Payments" className="reveal" style={reveal(2)}>
        <ListFilters
          path="/admin/payments"
          tabs={{ param: "view", value: view, options: STATUS_TABS.map((t) => ({ ...t, count: statusCount(t.key) })) }}
          chips={
            showChips
              ? { param: "method", value: method, options: METHOD_CHIPS.map((c) => ({ ...c, count: methodCount(c.key) })) }
              : undefined
          }
          q={q}
          placeholder="Search sender, player, ref code, amount"
        >
          {shown.length === 0 ? (
            <EmptyState>
              {q ? <>No payments match &ldquo;{q}&rdquo;.</> : view === "attention" ? "All caught up!" : "No payments here."}
            </EmptyState>
          ) : (
            <ul className="divide-y divide-ink/25">
              {shown.map(({ p, method: m }) => (
                <PaymentRow key={p.id} p={p} method={m} options={assignable} />
              ))}
            </ul>
          )}
        </ListFilters>
      </Sheet>
    </div>
  );
}
