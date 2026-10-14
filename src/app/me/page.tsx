import Link from "next/link";
import { Suspense } from "react";
import { cancelRegistration } from "@/app/actions";
import { PaymentInstructions } from "@/components/payment-instructions";
import { SubmitButton } from "@/components/submit-button";
import { buttonClass, Card, EmptyState, PageSpinner, StatusBadge } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { formatDateTime, formatMoney } from "@/lib/format";
import { getMyRegistrations } from "@/lib/queries";
import type { Registration, Session } from "@/lib/types";

export default function MePage(props: PageProps<"/me">) {
  return (
    <Suspense fallback={<PageSpinner />}>
      <MyRegistrations searchParams={props.searchParams} />
    </Suspense>
  );
}

async function MyRegistrations({ searchParams }: { searchParams: PageProps<"/me">["searchParams"] }) {
  const profile = await requireProfile("/me");
  const { error } = await searchParams;
  const { upcoming, past } = await getMyRegistrations(profile.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">My sign-ups</h1>
        <Link href="/onboarding?next=/me" className={buttonClass("secondary", "sm")}>
          Edit profile
        </Link>
      </div>
      {typeof error === "string" && <p className="rounded-lg bg-red-950/50 p-3 text-sm text-red-300">{error}</p>}

      <section className="space-y-3">
        <h2 className="font-semibold text-stone-300">Upcoming</h2>
        {upcoming.length === 0 ? (
          <EmptyState>
            Nothing yet. <Link href="/sessions" className="text-orange-400 underline">Find a session</Link>
          </EmptyState>
        ) : (
          upcoming.map((r) => <RegistrationCard key={r.id} reg={r} />)
        )}
      </section>

      {past.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold text-stone-300">Past</h2>
          <ul className="divide-y divide-stone-800 rounded-xl border border-stone-800 bg-stone-900">
            {past.map((r) => (
              <li key={r.id} className="flex items-center justify-between px-4 py-2 text-sm">
                <span>
                  {r.session.title} · {formatDateTime(r.session.starts_at)}
                </span>
                <StatusBadge status={r.status} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function RegistrationCard({ reg }: { reg: Registration & { session: Session } }) {
  const active = ["pending_payment", "confirmed", "waitlisted"].includes(reg.status);
  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link href={`/s/${reg.session_id}`} className="font-semibold hover:underline">
            {reg.session.title}
          </Link>
          <p className="text-sm text-stone-400">
            {formatDateTime(reg.session.starts_at)} · {reg.session.location} · {formatMoney(reg.session.price_cents)}
          </p>
        </div>
        <StatusBadge status={reg.status} />
      </div>
      {reg.status === "pending_payment" && <PaymentInstructions session={reg.session} registration={reg} />}
      {reg.refund_owed && (
        <p className="text-sm text-stone-400">
          {reg.refunded_at ? "Refunded." : "Refund owed. The host will e-Transfer it back."}
        </p>
      )}
      {active && (
        <form action={cancelRegistration.bind(null, reg.id, "/me")}>
          <SubmitButton
            variant="danger"
            size="sm"
            confirm={{
              title: reg.status === "waitlisted" ? "Leave the waitlist?" : "Cancel your spot?",
              description:
                reg.status === "waitlisted"
                  ? "You'll lose your place in line."
                  : "Your spot goes to the next person on the waitlist. Refunds only apply before the cancellation cutoff.",
              action: reg.status === "waitlisted" ? "Leave waitlist" : "Cancel spot",
            }}
          >
            {reg.status === "waitlisted" ? "Leave waitlist" : "Cancel my spot"}
          </SubmitButton>
        </form>
      )}
    </Card>
  );
}
