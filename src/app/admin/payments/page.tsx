import { Suspense } from "react";
import { assignPayment, setPaymentDismissed } from "@/app/admin/actions";
import { SubmitButton } from "@/components/submit-button";
import { EmptyState, inputClass, Mark, Notice, PageSpinner, PageTitle, reveal, Sheet } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime, formatMoney } from "@/lib/format";
import { paymentWindowStart } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import type { Payment, Profile, Registration, Session } from "@/lib/types";

type Option = Registration & { profile: Pick<Profile, "display_name" | "full_name">; session: Pick<Session, "title" | "starts_at"> };
type MatchedPayment = Payment & {
  registration: (Registration & { profile: Pick<Profile, "display_name" | "full_name"> }) | null;
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
  const { error } = await searchParams;
  const supabase = await createClient();
  const since = await paymentWindowStart();

  const [{ data: unmatched }, { data: recent }, { data: options }] = await Promise.all([
    supabase
      .from("payments")
      .select("*")
      .is("registration_id", null)
      .eq("dismissed", false)
      .order("received_at", { ascending: false }),
    supabase
      .from("payments")
      .select("*, registration:registrations(*, profile:profiles(display_name, full_name))")
      .not("registration_id", "is", null)
      .order("received_at", { ascending: false })
      .limit(25),
    supabase
      .from("registrations")
      .select("*, profile:profiles(display_name, full_name), session:sessions!inner(title, starts_at)")
      .in("status", ["pending_payment", "waitlisted", "expired"])
      .gte("session.starts_at", since)
      .order("created_at", { ascending: false }),
  ]);

  return (
    <div className="space-y-12">
      <PageTitle sub="e-Transfers are matched automatically by ref code, or by sender name + exact amount. Anything that couldn't be matched lands here.">
        Payments
      </PageTitle>
      {typeof error === "string" && <Notice tone="bad">{error}</Notice>}

      <Sheet label={`Needs attention · ${unmatched?.length ?? 0}`} className="reveal" style={reveal(1)}>
        {!unmatched?.length && <EmptyState>All caught up</EmptyState>}
        <div className="divide-y divide-ink/25">
        {(unmatched as Payment[] | null)?.map((p) => (
          <div key={p.id} className="space-y-3 py-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-lg">
                  <span className="font-score font-black">{formatMoney(p.amount_cents)}</span> from{" "}
                  <b>{p.sender_name ?? "unknown sender"}</b>
                </p>
                <p className="text-sm text-ink-soft">
                  {formatDateTime(p.received_at)}
                  {p.memo && <> · message: &ldquo;{p.memo}&rdquo;</>}
                </p>
                {p.note && (
                  <Mark tone="warn" glyph="!" className="mt-1 whitespace-normal">
                    {p.note}
                  </Mark>
                )}
              </div>
              <form action={setPaymentDismissed.bind(null, p.id, true)}>
                <SubmitButton size="sm" variant="ghost">Not volleyball · dismiss</SubmitButton>
              </form>
            </div>
            <form action={assignPayment.bind(null, p.id)} className="flex flex-wrap items-end gap-4">
              <select name="registration_id" required defaultValue="" className={`${inputClass} flex-1`}>
                <option value="" disabled>
                  Assign to…
                </option>
                {(options as Option[] | null)?.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.profile.display_name ?? o.profile.full_name} · {o.session.title} {formatDateTime(o.session.starts_at)} ·{" "}
                    {o.status.replace("_", " ")} · {o.ref_code}
                  </option>
                ))}
              </select>
              <SubmitButton size="sm">Confirm player</SubmitButton>
            </form>
          </div>
        ))}
        </div>
      </Sheet>

      <Sheet label="Recently matched" className="reveal" style={reveal(2)}>
        <ul className="divide-y divide-ink/20">
          {(recent as MatchedPayment[] | null)?.map((p) => (
            <li key={p.id} className="flex flex-wrap justify-between gap-2 py-2">
              <span>
                <span className="font-score font-black">{formatMoney(p.amount_cents)}</span> · {p.sender_name} → {p.registration?.profile.display_name ?? p.registration?.profile.full_name}
              </span>
              <span className="text-sm text-ink-soft">
                {p.matched_by === "ref" ? "ref code" : p.matched_by === "name_amount" ? "name + amount" : "manual"} ·{" "}
                {formatDateTime(p.received_at)}
              </span>
            </li>
          ))}
          {!recent?.length && <li className="py-2 text-ink-soft">No payments yet.</li>}
        </ul>
      </Sheet>
    </div>
  );
}
