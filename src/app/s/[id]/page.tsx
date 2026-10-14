import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { cancelRegistration, registerForSession } from "@/app/actions";
import { LiveRefresh } from "@/components/live-refresh";
import { PaymentInstructions } from "@/components/payment-instructions";
import { DateBlock } from "@/components/session-card";
import { SubmitButton } from "@/components/submit-button";
import {
  Avatar,
  BackLink,
  buttonClass,
  Mark,
  Notice,
  PageSpinner,
  reveal,
  Scoreboard,
  Sheet,
  SpotDots,
  StatusMark,
} from "@/components/ui";
import { getProfile } from "@/lib/auth";
import { formatDateTime, formatMoney, formatTime } from "@/lib/format";
import { getCounts, getMySpot, spotsLeft } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import type { Attendee, Profile, Session, SessionCounts } from "@/lib/types";

const pad = (n: number) => String(n).padStart(2, "0");

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
  const confirmed = sessionCounts?.confirmed ?? 0;
  const holding = sessionCounts?.holding ?? 0;
  const waitlisted = sessionCounts?.waitlisted ?? 0;
  const cancelled = session.status === "cancelled";

  return (
    <div className="space-y-10">
      <LiveRefresh sessionId={id} />
      <div>
        <BackLink href="/sessions">All sessions</BackLink>

        <header className="grid items-end gap-6 sm:grid-cols-[1fr_auto]">
          <div className="reveal flex gap-5" style={reveal(0)}>
            <DateBlock iso={session.starts_at} className="pt-1" />
            <div className="min-w-0 space-y-1">
              <h1
                className={`font-display text-5xl leading-[0.85] font-black tracking-tight uppercase sm:text-6xl ${cancelled ? "line-through" : ""}`}
              >
                {session.title}
              </h1>
              <p className="text-lg text-ink">
                {formatTime(session.starts_at)} – {formatTime(session.ends_at)}
              </p>
              <p className="text-ink-soft">{session.location}</p>
              <p className="font-score text-2xl font-black text-line">{formatMoney(session.price_cents)}</p>
            </div>
          </div>
          {!cancelled && (
            <div className="reveal" style={reveal(1)}>
              <Scoreboard value={`${pad(confirmed + holding)}/${pad(session.capacity)}`} label="Signed up" />
            </div>
          )}
        </header>
      </div>

      {!cancelled && (
        <div className="reveal space-y-2" style={reveal(2)}>
          <SpotDots capacity={session.capacity} confirmed={confirmed} holding={holding} />
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            <Mark tone="ok" glyph="●">
              {confirmed} confirmed
            </Mark>
            <Mark tone="warn" glyph="◐">
              {holding} holding
            </Mark>
            <Mark tone="muted" glyph="○">
              {spotsLeft(session, sessionCounts)} open
            </Mark>
            {waitlisted > 0 && (
              <Mark tone="mat" glyph="○">
                {waitlisted} on waitlist
              </Mark>
            )}
          </div>
        </div>
      )}

      {session.notes && (
        <p className="reveal border-l-4 border-mat py-1 pl-4 whitespace-pre-line text-ink" style={reveal(3)}>
          {session.notes}
        </p>
      )}

      {typeof error === "string" && <Notice tone="bad">{error}</Notice>}

      <div className="reveal" style={reveal(4)}>
        {cancelled ? (
          <Sheet label="Status">
            <p className="font-display text-3xl font-black text-bad uppercase">This session has been cancelled.</p>
          </Sheet>
        ) : profile ? (
          <MySpot session={session} profile={profile} counts={sessionCounts} />
        ) : (
          <Sheet label="Your spot">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="text-lg">Sign in to grab a spot and see who&apos;s coming.</p>
              <Link href={`/login?next=/s/${id}`} className={buttonClass()}>
                Sign in with Google
              </Link>
            </div>
          </Sheet>
        )}
      </div>

      {profile && (
        <div className="reveal" style={reveal(5)}>
          <AttendeeList sessionId={id} />
        </div>
      )}
    </div>
  );
}

async function MySpot({ session, profile, counts }: { session: Session; profile: Profile; counts?: SessionCounts }) {
  const { reg, started, notOpenYet, beforeCutoff } = await getMySpot(session, profile.id);
  const cancel = reg ? cancelRegistration.bind(null, reg.id, `/s/${session.id}`) : null;

  if (!reg) {
    if (started) {
      return (
        <Sheet label="Your spot">
          <p className="text-lg text-ink-soft">This session has started.</p>
        </Sheet>
      );
    }
    if (notOpenYet) {
      return (
        <Sheet label="Your spot">
          <p className="text-lg">
            Sign-ups open <b>{formatDateTime(session.opens_at)}</b>. Come back then!
          </p>
        </Sheet>
      );
    }
    const full = spotsLeft(session, counts) === 0 || (counts?.waitlisted ?? 0) > 0;
    return (
      <Sheet label="Your spot">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="max-w-md text-lg">
            {full
              ? "This session is full. Join the waitlist and we'll email you if a spot opens."
              : `${spotsLeft(session, counts)} spots left. Your spot is held while you send payment.`}
          </p>
          <form action={registerForSession.bind(null, session.id)}>
            <SubmitButton>{full ? "Join waitlist" : "Sign up"}</SubmitButton>
          </form>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet label="Your spot" action={<StatusMark status={reg.status} />}>
      <div className="space-y-5">
        {reg.status === "pending_payment" && <PaymentInstructions session={session} registration={reg} />}
        {reg.status === "confirmed" && (
          <p className="font-display text-3xl font-black uppercase">
            You&apos;re in<span className="text-line">.</span> See you on court.
          </p>
        )}
        {reg.status === "waitlisted" && (
          <p className="text-lg">
            You&apos;re on the waitlist. We&apos;ll email you payment instructions as soon as a spot opens. Please
            don&apos;t send money yet.
          </p>
        )}

        {cancel && (
          <form action={cancel} className="flex flex-wrap items-center gap-4">
            <SubmitButton
              variant="danger"
              size="sm"
              confirm={{
                title: reg.status === "waitlisted" ? "Leave the waitlist?" : "Cancel your spot?",
                description:
                  reg.status === "waitlisted"
                    ? "You'll lose your place in line."
                    : reg.status === "pending_payment"
                      ? "Your held spot goes to the next person on the waitlist. Don't send payment."
                      : beforeCutoff
                        ? "Your spot goes to the next person on the waitlist, and you'll be added to the refund list."
                        : "It's past the cancellation cutoff, so you won't be refunded. Your spot goes to the next person on the waitlist.",
                action: reg.status === "waitlisted" ? "Leave waitlist" : "Cancel spot",
              }}
            >
              {reg.status === "waitlisted" ? "Leave waitlist" : "Cancel my spot"}
            </SubmitButton>
            {reg.status === "confirmed" && (
              <span className="text-sm text-ink-soft">
                {beforeCutoff
                  ? `Cancel before ${formatDateTime(session.cancel_cutoff)} for a refund.`
                  : "Past the refund cutoff. Cancelling still frees the spot for someone else."}
              </span>
            )}
          </form>
        )}
      </div>
    </Sheet>
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
    <div className="grid gap-10 sm:grid-cols-2">
      <Sheet label={`Team sheet · ${going.length}`}>
        {going.length === 0 ? (
          <p className="text-ink-soft">Nobody yet. Be the first!</p>
        ) : (
          <ol className="divide-y divide-ink/20">
            {going.map((a, i) => (
              <li key={a.registration_id} className="flex items-center gap-3 py-2">
                <span className="w-7 font-score text-lg font-black text-ink-soft">{pad(i + 1)}</span>
                <Avatar name={a.display_name} src={a.avatar_url} size={28} />
                <span className={`min-w-0 flex-1 truncate ${a.is_me ? "font-bold" : ""}`}>
                  {a.display_name}
                  {a.is_me && <span className="text-line"> (you)</span>}
                </span>
                {a.status === "pending_payment" && (
                  <Mark tone="warn" glyph="◐">
                    Holding
                  </Mark>
                )}
              </li>
            ))}
          </ol>
        )}
      </Sheet>
      <Sheet label={`Waitlist · ${waiting.length}`}>
        {waiting.length === 0 ? (
          <p className="text-ink-soft">No one waiting.</p>
        ) : (
          <ol className="divide-y divide-ink/20">
            {waiting.map((a) => (
              <li key={a.registration_id} className="flex items-center gap-3 py-2">
                <span className="w-7 font-score text-lg font-black text-mat">{pad(a.waitlist_position ?? 0)}</span>
                <Avatar name={a.display_name} src={a.avatar_url} size={28} />
                <span className={`min-w-0 flex-1 truncate ${a.is_me ? "font-bold" : ""}`}>
                  {a.display_name}
                  {a.is_me && <span className="text-line"> (you)</span>}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Sheet>
    </div>
  );
}
