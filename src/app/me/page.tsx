import Link from "next/link";
import { Suspense } from "react";
import { cancelRegistration } from "@/app/actions";
import { PaymentInstructions } from "@/components/payment-instructions";
import { ProfileForm } from "@/components/profile-form";
import { DateBlock } from "@/components/session-card";
import { SubmitButton } from "@/components/submit-button";
import { Avatar, EmptyState, Notice, PageSpinner, reveal, Sheet, StatusMark } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { formatDateTime, formatMoney, formatTime } from "@/lib/format";
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
    <div className="space-y-12">
      <div className="reveal flex items-center gap-5" style={reveal(0)}>
        <Avatar name={name} src={profile.avatar_url} size={72} />
        <div className="min-w-0">
          <h1 className="truncate font-display text-5xl leading-[0.85] font-black tracking-tight uppercase sm:text-6xl">
            {name}
          </h1>
          <p className="truncate text-ink-soft">{profile.email}</p>
        </div>
      </div>
      {typeof error === "string" && <Notice tone="bad">{error}</Notice>}

      <Sheet label="Profile" className="reveal max-w-xl" style={reveal(1)}>
        <div className="space-y-5">
          {saved === "1" && <Notice tone="ok">Profile saved.</Notice>}
          <ProfileForm profile={profile} next="/me?saved=1" returnTo="/me" submitLabel="Save changes" />
        </div>
      </Sheet>

      <Sheet label="My sign-ups · upcoming" className="reveal" style={reveal(2)}>
        {upcoming.length === 0 ? (
          <EmptyState>
            Nothing yet.{" "}
            <Link href="/sessions" className="text-line underline decoration-2 underline-offset-4">
              Find a session
            </Link>
          </EmptyState>
        ) : (
          <div className="divide-y divide-ink/25">
            {upcoming.map((r) => (
              <RegistrationRow key={r.id} reg={r} />
            ))}
          </div>
        )}
      </Sheet>

      {past.length > 0 && (
        <Sheet label="Past" className="reveal" style={reveal(3)}>
          <ul className="divide-y divide-ink/20">
            {past.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-ink-soft">
                  {r.session.title} · {formatDateTime(r.session.starts_at)}
                </span>
                <StatusMark status={r.status} />
              </li>
            ))}
          </ul>
        </Sheet>
      )}
    </div>
  );
}

function RegistrationRow({ reg }: { reg: Registration & { session: Session } }) {
  const active = ["pending_payment", "confirmed", "waitlisted"].includes(reg.status);
  return (
    <div className="space-y-4 py-5">
      <div className="flex gap-4">
        <DateBlock iso={reg.session.starts_at} />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <Link
              href={`/s/${reg.session_id}`}
              className="font-display text-2xl leading-tight font-extrabold uppercase decoration-line decoration-2 underline-offset-4 hover:underline"
            >
              {reg.session.title}
            </Link>
            <StatusMark status={reg.status} />
          </div>
          <p className="text-ink-soft">
            {formatTime(reg.session.starts_at)} · {reg.session.location} ·{" "}
            <span className="font-score font-black text-ink">{formatMoney(reg.session.price_cents)}</span>
          </p>
        </div>
      </div>
      {reg.status === "pending_payment" && <PaymentInstructions session={reg.session} registration={reg} />}
      {reg.refund_owed && (
        <p className="text-sm text-ink-soft">
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
    </div>
  );
}
