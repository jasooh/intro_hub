import type { Metadata } from "next";
import { Suspense } from "react";
import { ListFilters } from "@/components/list-filters";
import { EmptyState, PageSpinner, PageTitle, reveal, Scoreboard, Sheet } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { paymentMatches } from "@/lib/payments";
import {
  REFUND_REASON_LABELS,
  REFUND_STATUS_LABELS,
  type RefundReason,
  refundAmount,
  refundReason,
  type RefundStatus,
  refundStatus,
} from "@/lib/refunds";
import { createClient } from "@/lib/supabase/server";
import { RefundRow, type RefundRowData } from "./refund-row";

const STATUS_TABS: { key: RefundStatus | "all"; label: string }[] = [
  { key: "to_refund", label: REFUND_STATUS_LABELS.to_refund },
  { key: "refunded", label: REFUND_STATUS_LABELS.refunded },
  { key: "waived", label: REFUND_STATUS_LABELS.waived },
  { key: "all", label: "All" },
];
const REASON_CHIPS: { key: RefundReason | "any"; label: string }[] = [
  { key: "any", label: "Any reason" },
  { key: "session_cancelled", label: REFUND_REASON_LABELS.session_cancelled },
  { key: "spot_cancelled", label: REFUND_REASON_LABELS.spot_cancelled },
  { key: "hold_expired", label: REFUND_REASON_LABELS.hold_expired },
  { key: "overpaid", label: REFUND_REASON_LABELS.overpaid },
];

export const metadata: Metadata = {
  title: "Refunds",
};

export default function RefundsPage(props: PageProps<"/admin/refunds">) {
  return (
    <Suspense fallback={<PageSpinner />}>
      <Refunds searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Refunds({ searchParams }: { searchParams: PageProps<"/admin/refunds">["searchParams"] }) {
  await requireAdmin();
  const params = await searchParams;
  const view = STATUS_TABS.some((t) => t.key === params.view) ? (params.view as RefundStatus | "all") : "to_refund";
  const reason = REASON_CHIPS.some((c) => c.key === params.reason) ? (params.reason as RefundReason | "any") : "any";
  const q = typeof params.q === "string" ? params.q : "";

  const supabase = await createClient();
  const { data } = await supabase
    .from("registrations")
    .select(
      "*, profile:profiles(display_name, full_name, first_name, last_name, email, phone, etransfer_names), session:sessions(id, title, starts_at, status)",
    )
    .eq("refund_owed", true)
    .order("cancelled_at", { ascending: false })
    .limit(1000);

  const rows = ((data ?? []) as RefundRowData[])
    .map((r) => ({ r, status: refundStatus(r), reason: refundReason(r, r.session) }))
    .filter(({ r }) =>
      paymentMatches({ sender_name: null, memo: null, amount_cents: refundAmount(r) }, [
        r.profile.display_name,
        r.profile.full_name,
        r.profile.first_name,
        r.profile.last_name,
        r.profile.email,
        r.ref_code,
        r.session.title,
        ...r.profile.etransfer_names,
      ], q),
    );
  const statusCount = (s: RefundStatus | "all") => rows.filter((x) => s === "all" || x.status === s).length;
  const inView = rows.filter((x) => view === "all" || x.status === view);
  const reasonCount = (c: RefundReason | "any") => inView.filter((x) => c === "any" || x.reason === c).length;
  const shown = inView.filter((x) => reason === "any" || x.reason === reason);
  const owedTotal = rows.filter((x) => x.status === "to_refund").reduce((sum, x) => sum + refundAmount(x.r), 0);

  return (
    <div className="space-y-12">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <PageTitle sub="Paid players who cancelled before the cutoff, were removed, or whose session was cancelled.">
          Refunds
        </PageTitle>
        <div className="reveal pr-1 pb-1" style={reveal(1)}>
          <Scoreboard value={formatMoney(owedTotal)} label={`To refund · ${statusCount("to_refund")}`} />
        </div>
      </div>

      <Sheet label="Refunds" className="reveal" style={reveal(2)}>
        <ListFilters
          path="/admin/refunds"
          tabs={{ param: "view", value: view, options: STATUS_TABS.map((t) => ({ ...t, count: statusCount(t.key) })) }}
          chips={{ param: "reason", value: reason, options: REASON_CHIPS.map((c) => ({ ...c, count: reasonCount(c.key) })) }}
          q={q}
          placeholder="Search player, email, session, ref, amount"
        >
          {shown.length === 0 ? (
            <EmptyState>
              {q ? <>No refunds match &ldquo;{q}&rdquo;.</> : view === "to_refund" ? "Nothing owed." : "No refunds here."}
            </EmptyState>
          ) : (
            <ul className="divide-y divide-ink/25">
              {shown.map((x) => (
                <RefundRow key={x.r.id} r={x.r} status={x.status} reason={x.reason} />
              ))}
            </ul>
          )}
        </ListFilters>
      </Sheet>
    </div>
  );
}
