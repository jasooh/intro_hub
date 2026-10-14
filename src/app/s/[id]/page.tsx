import Link from "next/link";
import { MapLink } from "@/components/map-link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { cancelRegistration, changeOption, registerForSession } from "@/app/actions";
import { LiveRefresh } from "@/components/live-refresh";
import { PaymentInstructions } from "@/components/payment-instructions";
import { DateBlock } from "@/components/session-card";
import { AttendeeRow, OptionRadio } from "@/components/signup-parts";
import { TeamsView } from "@/components/teams-view";
import { SubmitButton } from "@/components/submit-button";
import {
  BackLink,
  buttonClass,
  Field,
  inputClass,
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
import { formatDateTime, formatMoney, sessionTimes } from "@/lib/format";
import { OPTION_LABELS } from "@/lib/profile";
import { getCounts, getMySpot, spotsLeft } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import type { Attendee, Profile, Session, SessionCounts, Team } from "@/lib/types";

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
  const instructional = sessionCounts?.instructional ?? 0;
  const cancelled = session.status === "cancelled";
  const times = sessionTimes(session);

  return (
    <div className="space-y-10">
      <LiveRefresh sessionId={id} />
      <div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <BackLink href="/sessions">All sessions</BackLink>
          {/* Hosts only: jump to this session's admin page. */}
          {profile?.role === "admin" && (
            <Link href={`/admin/sessions/${id}`} className={buttonClass("secondary", "sm")}>
              Edit session
            </Link>
          )}
        </div>

        <header className="grid items-end gap-6 sm:grid-cols-[1fr_auto]">
          <div className="reveal flex gap-5" style={reveal(0)}>
            <DateBlock iso={session.starts_at} className="pt-1" />
            <div className="min-w-0 space-y-1">
              <h1
                className={`font-display text-5xl leading-[0.85] font-black tracking-tight uppercase sm:text-6xl ${cancelled ? "line-through" : ""}`}
              >
                {session.title}
              </h1>
              {times.instructional || times.dropin ? (
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-lg">
                  {times.instructional && (
                    <>
                      <dt className="font-display font-bold tracking-wide text-ink-soft uppercase">Instructional</dt>
                      <dd>{times.instructional}</dd>
                    </>
                  )}
                  {times.dropin && (
                    <>
                      <dt className="font-display font-bold tracking-wide text-ink-soft uppercase">Drop-in</dt>
                      <dd>{times.dropin}</dd>
                    </>
                  )}
                </dl>
              ) : (
                <p className="text-lg text-ink">{times.full}</p>
              )}
              <p className="text-ink-soft">
                <MapLink location={session.location} />
              </p>
              <p className="flex flex-wrap items-baseline gap-x-3">
                <span className="font-score text-2xl font-black text-line">{formatMoney(session.price_cents)}</span>
                {session.instructional_price_cents != null && (
                  <span className="text-ink-soft">
                    or <span className="font-score font-black text-ink">{formatMoney(session.instructional_price_cents)}</span>{" "}
                    instructional only
                  </span>
                )}
              </p>
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
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="font-display text-sm font-bold tracking-[0.2em] text-ink-soft uppercase">
              Drop-in spots
            </span>
            <SpotDots capacity={session.capacity} confirmed={confirmed} holding={holding} />
          </div>
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
            {instructional > 0 && (
              <Mark tone="mat" glyph="◇">
                +{instructional} instructional only
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
            {session.cancel_reason && (
              <p className="mt-3 border-l-4 border-bad py-1 pl-4 text-lg whitespace-pre-line">
                <span className="font-display text-sm font-bold tracking-[0.15em] text-ink-soft uppercase">
                  Message from the host
                </span>
                <br />
                {session.cancel_reason}
              </p>
            )}
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
  const path = `/s/${session.id}`;
  const times = sessionTimes(session);
  const hasInstructional = session.instructional_price_cents != null;

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
        <form action={registerForSession.bind(null, session.id)} className="space-y-6">
          <p className="max-w-xl text-lg">
            {full
              ? "Drop-in is full. Join the waitlist and we'll email you if a spot opens."
              : `${spotsLeft(session, counts)} drop-in spots left. Your spot is held while you send payment.`}
          </p>

          {hasInstructional ? (
            <fieldset className="space-y-3">
              <legend className="mb-2 font-display text-sm font-bold tracking-[0.15em] uppercase">I&apos;m coming for</legend>
              <OptionRadio
                value="full"
                defaultChecked
                title={OPTION_LABELS.full}
                price={formatMoney(session.price_cents)}
                detail={[times.full, full ? "joins the waitlist" : null]}
              />
              <OptionRadio
                value="instructional"
                title={OPTION_LABELS.instructional}
                price={formatMoney(session.instructional_price_cents!)}
                detail={[times.instructional, "doesn't use a drop-in spot"]}
              />
            </fieldset>
          ) : (
            <input type="hidden" name="option" value="full" />
          )}

          <Field label="Note to the host (optional)" hint="Questions, comments, or if you're bringing a team.">
            <textarea name="note" rows={2} maxLength={1000} className={inputClass} />
          </Field>

          <SubmitButton>{full && !hasInstructional ? "Join waitlist" : "Sign up"}</SubmitButton>
        </form>
      </Sheet>
    );
  }

  const switchable = hasInstructional && (reg.status === "pending_payment" || reg.status === "waitlisted");
  const other = reg.option === "full" ? "instructional" : "full";
  const otherPrice = other === "full" ? session.price_cents : session.instructional_price_cents!;

  return (
    <Sheet
      label="Your spot"
      action={
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {reg.option === "instructional" && (
            <Mark tone="mat" glyph="◇">
              Instructional only
            </Mark>
          )}
          <StatusMark status={reg.status} />
        </div>
      }
    >
      <div className="space-y-5">
        {reg.status === "pending_payment" && <PaymentInstructions registration={reg} />}
        {reg.status === "confirmed" && (
          <p className="font-display text-3xl font-black uppercase">
            You&apos;re in<span className="text-line">.</span>{" "}
            {reg.option === "instructional" ? "See you at the class." : "See you on court."}
          </p>
        )}
        {reg.status === "waitlisted" && (
          <p className="text-lg">
            You&apos;re on the waitlist. We&apos;ll email you payment instructions as soon as a spot opens. Please
            don&apos;t send money yet.
          </p>
        )}
        {reg.note && <p className="border-l-4 border-ink/20 pl-3 text-ink-soft">Your note: &ldquo;{reg.note}&rdquo;</p>}

        <div className="flex flex-wrap items-center gap-4">
          {switchable && (
            <form action={changeOption.bind(null, reg.id, other, path)}>
              <SubmitButton
                variant="secondary"
                size="sm"
                confirm={{
                  title: `Switch to ${OPTION_LABELS[other]}?`,
                  description:
                    other === "instructional"
                      ? `You'll pay ${formatMoney(otherPrice)} instead and give up your drop-in spot${reg.status === "waitlisted" ? " (and your place on the waitlist)" : ""}.`
                      : `You'll pay ${formatMoney(otherPrice)}. If drop-in is full you'll go on the waitlist, and your current payment hold is released.`,
                  action: "Switch",
                }}
              >
                Switch to {other === "instructional" ? "instructional only" : "instructional + drop-in"} · {formatMoney(otherPrice)}
              </SubmitButton>
            </form>
          )}
          <form action={cancelRegistration.bind(null, reg.id, path)} className="flex flex-wrap items-center gap-4">
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
        </div>
        {hasInstructional && reg.status === "confirmed" && (
          <p className="text-sm text-ink-soft">Want to change your option after paying? Contact the host.</p>
        )}
      </div>
    </Sheet>
  );
}

async function AttendeeList({ sessionId }: { sessionId: string }) {
  const supabase = await createClient();
  // Teams are only readable once the host publishes them (RLS), so an empty list means "not published".
  const [{ data }, { data: teamRows }] = await Promise.all([
    supabase.rpc("get_session_attendees", { p_session_id: sessionId }),
    supabase.from("session_teams").select("*").eq("session_id", sessionId).order("position"),
  ]);
  const attendees = (data ?? []) as Attendee[];
  const teams = (teamRows ?? []) as Team[];
  const active = attendees.filter((a) => a.status === "confirmed" || a.status === "pending_payment");
  const going = active.filter((a) => a.option === "full");
  const instructionalOnly = active.filter((a) => a.option === "instructional");
  const waiting = attendees
    .filter((a) => a.status === "waitlisted")
    .sort((a, b) => (a.waitlist_position ?? 0) - (b.waitlist_position ?? 0));

  const waitlistSheet = (
    <Sheet label={`Waitlist · ${waiting.length}`}>
      {waiting.length === 0 ? (
        <p className="text-ink-soft">No one waiting.</p>
      ) : (
        <ol className="divide-y divide-ink/20">
          {waiting.map((a) => (
            <AttendeeRow key={a.registration_id} a={a} number={pad(a.waitlist_position ?? 0)} numberClass="text-mat" />
          ))}
        </ol>
      )}
    </Sheet>
  );
  const instructionalSheet = instructionalOnly.length > 0 && (
    <Sheet label={`Instructional only · ${instructionalOnly.length}`}>
      <ul className="divide-y divide-ink/20">
        {instructionalOnly.map((a) => (
          <AttendeeRow key={a.registration_id} a={a} number="◇" numberClass="text-mat" />
        ))}
      </ul>
    </Sheet>
  );

  if (teams.length > 0) {
    return (
      <div className="space-y-10">
        <TeamsView teams={teams} going={going} />
        <div className="grid gap-10 sm:grid-cols-2">
          {waitlistSheet}
          {instructionalSheet}
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-10 sm:grid-cols-2">
      <Sheet label={`Team sheet · ${going.length}`}>
        {going.length === 0 ? (
          <p className="text-ink-soft">Nobody yet. Be the first!</p>
        ) : (
          <ol className="divide-y divide-ink/20">
            {going.map((a, i) => (
              <AttendeeRow key={a.registration_id} a={a} number={pad(i + 1)} />
            ))}
          </ol>
        )}
      </Sheet>
      <div className="space-y-10">
        {waitlistSheet}
        {instructionalSheet}
      </div>
    </div>
  );
}
