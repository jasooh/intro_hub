import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { cancelRegistration, registerForSession } from "@/app/actions";
import { LiveRefresh } from "@/components/live-refresh";
import { PaymentInstructions } from "@/components/payment-instructions";
import { SubmitButton } from "@/components/submit-button";
import { Avatar, Badge, buttonClass, Card, PageSpinner, StatusBadge } from "@/components/ui";
import { getProfile } from "@/lib/auth";
import { formatDateTime, formatMoney, formatTime } from "@/lib/format";
import { getCounts, getMySpot, spotsLeft } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import type { Attendee, Profile, Session, SessionCounts } from "@/lib/types";

export default function SessionPage(props: PageProps<"/s/[id]">) {
  return (
    <Suspense fallback={<PageSpinner />}>
      <SessionView params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

async function SessionView({
  params,
  searchParams,
}: {
  params: PageProps<"/s/[id]">["params"];
  searchParams: PageProps<"/s/[id]">["searchParams"];
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();

  const { data: session } = await supabase.from("sessions").select("*").eq("id", id).maybeSingle<Session>();
  if (!session) notFound();

  const [profile, counts] = await Promise.all([getProfile(), getCounts([id])]);
  const sessionCounts = counts.get(id);

  return (
    <div className="space-y-5">
      <LiveRefresh sessionId={id} />
      <Link href="/" className="text-sm text-stone-500 hover:text-stone-800">
        ← All sessions
      </Link>

      <Card className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold">{session.title}</h1>
            <p className="text-stone-700">
              {formatDateTime(session.starts_at)} – {formatTime(session.ends_at)}
            </p>
            <p className="text-stone-600">{session.location}</p>
          </div>
          <p className="text-xl font-semibold">{formatMoney(session.price_cents)}</p>
        </div>
        {session.notes && <p className="whitespace-pre-line text-sm text-stone-600">{session.notes}</p>}
        <CountsBar session={session} counts={sessionCounts} />
      </Card>

      {typeof error === "string" && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {session.status === "cancelled" ? (
        <Card className="border-red-200 bg-red-50 text-red-800">This session has been cancelled.</Card>
      ) : profile ? (
        <MySpot session={session} profile={profile} counts={sessionCounts} />
      ) : (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-stone-700">Sign in to grab a spot and see who&apos;s coming.</p>
          <Link href={`/login?next=/s/${id}`} className={buttonClass()}>
            Sign in with Google
          </Link>
        </Card>
      )}

      {profile && <AttendeeList sessionId={id} />}
    </div>
  );
}

function CountsBar({ session, counts }: { session: Session; counts?: SessionCounts }) {
  const confirmed = counts?.confirmed ?? 0;
  const holding = counts?.holding ?? 0;
  const pct = (n: number) => `${Math.min((n / session.capacity) * 100, 100)}%`;
  return (
    <div className="space-y-1">
      <div className="flex h-2 overflow-hidden rounded-full bg-stone-200">
        <div className="bg-green-500" style={{ width: pct(confirmed) }} />
        <div className="bg-amber-400" style={{ width: pct(holding) }} />
      </div>
      <p className="text-sm text-stone-600">
        {confirmed} confirmed · {holding} holding · {spotsLeft(session, counts)} open of {session.capacity}
        {(counts?.waitlisted ?? 0) > 0 && ` · ${counts?.waitlisted} on waitlist`}
      </p>
    </div>
  );
}

async function MySpot({ session, profile, counts }: { session: Session; profile: Profile; counts?: SessionCounts }) {
  const { reg, started, notOpenYet, beforeCutoff } = await getMySpot(session, profile.id);
  const cancel = reg ? cancelRegistration.bind(null, reg.id, `/s/${session.id}`) : null;

  if (!reg) {
    if (started) {
      return <Card className="text-stone-600">This session has started.</Card>;
    }
    if (notOpenYet) {
      return (
        <Card className="text-stone-700">
          Sign-ups open <b>{formatDateTime(session.opens_at)}</b>. Come back then!
        </Card>
      );
    }
    const full = spotsLeft(session, counts) === 0 || (counts?.waitlisted ?? 0) > 0;
    return (
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-stone-700">
          {full
            ? "This session is full. Join the waitlist and we'll email you if a spot opens."
            : `${spotsLeft(session, counts)} spots left. Your spot is held while you send payment.`}
        </p>
        <form action={registerForSession.bind(null, session.id)}>
          <SubmitButton>{full ? "Join waitlist" : "Sign up"}</SubmitButton>
        </form>
      </Card>
    );
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Your spot</h2>
        <StatusBadge status={reg.status} />
      </div>

      {reg.status === "pending_payment" && <PaymentInstructions session={session} registration={reg} />}
      {reg.status === "confirmed" && <p className="text-stone-700">You&apos;re in. See you there! 🏐</p>}
      {reg.status === "waitlisted" && (
        <p className="text-stone-700">
          You&apos;re on the waitlist. We&apos;ll email you payment instructions as soon as a spot opens. Please
          don&apos;t send money yet.
        </p>
      )}

      {cancel && (
        <form action={cancel} className="flex flex-wrap items-center gap-3">
          <SubmitButton
            variant="danger"
            size="sm"
            confirm={
              reg.status === "confirmed" && !beforeCutoff
                ? "It's past the cancellation cutoff, so this won't be refunded. Cancel anyway?"
                : "Give up your spot?"
            }
          >
            {reg.status === "waitlisted" ? "Leave waitlist" : "Cancel my spot"}
          </SubmitButton>
          {reg.status === "confirmed" && (
            <span className="text-xs text-stone-500">
              {beforeCutoff
                ? `Cancel before ${formatDateTime(session.cancel_cutoff)} for a refund.`
                : "Past the refund cutoff. Cancelling still frees the spot for someone else."}
            </span>
          )}
        </form>
      )}
    </Card>
  );
}

async function AttendeeList({ sessionId }: { sessionId: string }) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_session_attendees", { p_session_id: sessionId });
  const attendees = (data ?? []) as Attendee[];
  const going = attendees.filter((a) => a.status === "confirmed" || a.status === "pending_payment");
  const waiting = attendees
    .filter((a) => a.status === "waitlisted")
    .sort((a, b) => (a.waitlist_position ?? 0) - (b.waitlist_position ?? 0));

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card>
        <h2 className="mb-3 font-semibold">Who&apos;s coming ({going.length})</h2>
        {going.length === 0 ? (
          <p className="text-sm text-stone-500">Nobody yet. Be the first!</p>
        ) : (
          <ul className="space-y-2">
            {going.map((a) => (
              <li key={a.registration_id} className="flex items-center gap-2">
                <Avatar name={a.display_name} src={a.avatar_url} />
                <span className={a.is_me ? "font-semibold" : ""}>{a.display_name}</span>
                {a.status === "pending_payment" && <Badge className="bg-amber-100 text-amber-800">holding</Badge>}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <h2 className="mb-3 font-semibold">Waitlist ({waiting.length})</h2>
        {waiting.length === 0 ? (
          <p className="text-sm text-stone-500">No one waiting.</p>
        ) : (
          <ol className="space-y-2">
            {waiting.map((a) => (
              <li key={a.registration_id} className="flex items-center gap-2">
                <span className="w-5 text-right text-sm text-stone-500">{a.waitlist_position}.</span>
                <Avatar name={a.display_name} src={a.avatar_url} />
                <span className={a.is_me ? "font-semibold" : ""}>{a.display_name}</span>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
