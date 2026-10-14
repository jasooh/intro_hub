import Link from "next/link";
import { Suspense } from "react";
import { cancelRegistration } from "@/app/actions";
import { PaymentInstructions } from "@/components/payment-instructions";
import { ProfileForm } from "@/components/profile-form";
import { SubmitButton } from "@/components/submit-button";
import { Avatar, Card, EmptyState, PageSpinner, StatusBadge } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { formatDateTime, formatMoney } from "@/lib/format";
import { getMyRegistrations } from "@/lib/queries";
import type { Registration, Session } from "@/lib/types";

export default function MePage(props: PageProps<"/me">) {
  return (
    <Suspense fallback={<PageSpinner />}>
      <Account searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Account({ searchParams }: { searchParams: PageProps<"/me">["searchParams"] }) {
  const profile = await requireProfile("/me");
  const { error, saved } = await searchParams;
  const { upcoming, past } = await getMyRegistrations(profile.id);
  const name = profile.display_name ?? profile.full_name ?? profile.email;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Account</h1>
      {typeof error === "string" && <p className="rounded-lg bg-red-950/50 p-3 text-sm text-red-300">{error}</p>}

      <Card className="space-y-5">
        <div className="flex items-center gap-3">
          <Avatar name={name} src={profile.avatar_url} size={48} />
          <div className="min-w-0">
            <p className="truncate font-semibold">{name}</p>
            <p className="truncate text-sm text-stone-400">{profile.email}</p>
          </div>
        </div>
        {saved === "1" && <p className="rounded-lg bg-green-950 p-2 text-sm text-green-300">Profile saved.</p>}
        <ProfileForm profile={profile} next="/me?saved=1" returnTo="/me" submitLabel="Save changes" />
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">My sign-ups</h2>
        <h3 className="text-sm font-semibold tracking-wide text-stone-400 uppercase">Upcoming</h3>
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
          <h3 className="text-sm font-semibold tracking-wide text-stone-400 uppercase">Past</h3>
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
