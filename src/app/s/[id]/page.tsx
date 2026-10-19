import type { Metadata } from "next";
import Link from "next/link";
import { MapLink } from "@/components/map-link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { cancelRegistration, changeOption, registerForSession, setBroughtBy, setTeammates } from "@/app/actions";
import { AddToCalendar } from "@/components/add-to-calendar";
import { BringAFriendField } from "@/components/bring-a-friend-field";
import { LiveRefresh } from "@/components/live-refresh";
import { PaymentInstructions } from "@/components/payment-instructions";
import { DateBlock } from "@/components/session-card";
import { AttendeeRow, OptionRadio } from "@/components/signup-parts";
import { TeammatePicker, type TeammateOption } from "@/components/teammate-picker";
import { TeamsView } from "@/components/teams-view";
import { SubmitButton } from "@/components/submit-button";
import {
  BackLink,
  buttonClass,
  Field,
  inputClass,
  Mark,
  PageSpinner,
  reveal,
  Scoreboard,
  Sheet,
  SpotDots,
  StatusMark,
} from "@/components/ui";
import { getProfile } from "@/lib/auth";
import { formatDateTime, formatMoney, pad2, sessionTimes } from "@/lib/format";
import { OPTION_LABELS } from "@/lib/profile";
import { getAttendees, getCounts, getMySpot, getTeamRequests, isFirstTimer, spotsLeft } from "@/lib/queries";
import { MAX_TEAMMATES } from "@/lib/teams";
import { createClient } from "@/lib/supabase/server";
import type { Match, Profile, Session, SessionCounts, Team } from "@/lib/types";


export async function generateMetadata({ params }: PageProps<"/s/[id]">): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data: session } = await supabase
    .from("sessions")
    .select("title, starts_at, location, price_cents, status")
    .eq("id", id)
    .maybeSingle<Pick<Session, "title" | "starts_at" | "location" | "price_cents" | "status">>();
  if (!session) return { title: "Session not found" };

  const when = formatDateTime(session.starts_at);
  const title = `${session.status === "cancelled" ? "Cancelled: " : ""}${session.title} · ${when}`;
  const description = `${when} at ${session.location}. ${formatMoney(session.price_cents)} drop-in, beginners welcome.`;
  return { title, description, openGraph: { title, description } };
}

export default function SessionPage(props: PageProps<"/s/[id]">) {
  return (
    <Suspense fallback={<PageSpinner />}>
      <SessionView params={props.params} />
    </Suspense>
  );
}

async function SessionView({
  params,
}: {
  params: PageProps<"/s/[id]">["params"];
}) {
  const { id } = await params;
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

        <header className="grid grid-cols-1 items-end gap-6 sm:grid-cols-[1fr_auto]">
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
                {session.deposit_cents != null ? (
                  <>
                    <span className="font-display text-2xl font-black text-line uppercase">Free</span>
                    <span className="text-ink-soft">
                      · <span className="font-score font-black text-ink">{formatMoney(session.deposit_cents)}</span> refundable
                      deposit to hold your spot
                    </span>
                  </>
                ) : (
                  <span className="font-score text-2xl font-black text-line">{formatMoney(session.price_cents)}</span>
                )}
                {session.deposit_cents == null && session.instructional_price_cents != null && (
                  <span className="text-ink-soft">
                    or <span className="font-score font-black text-ink">{formatMoney(session.instructional_price_cents)}</span>{" "}
                    instructional only
                  </span>
                )}
              </p>
              {!cancelled && (
                <p className="max-w-xl text-sm text-ink-soft">
                  Please note that refunds can only be issued if notification of absence is received before 4:00PM on
                  the day of the session.
                </p>
              )}
            </div>
          </div>
          {!cancelled && (
            <div className="reveal" style={reveal(1)}>
              <Scoreboard value={`${pad2(confirmed + holding)}/${pad2(session.capacity)}`} label="Signed up" />
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
          <AttendeeList session={session} />
        </div>
      )}
    </div>
  );
}

async function MySpot({ session, profile, counts }: { session: Session; profile: Profile; counts?: SessionCounts }) {
  const { reg, started, notOpenYet, beforeCutoff } = await getMySpot(session, profile.id);
  const path = `/s/${session.id}`;
  // Teammate picks: other drop-in players who are signed up (incl. the waitlist).
  const attendees = (await getAttendees(session.id)).filter(
    (a) => !a.is_me && ["pending_payment", "confirmed", "waitlisted"].includes(a.status),
  );
  const teammateOptions: TeammateOption[] = attendees
    .filter((a) => a.option === "full")
    .map((a) => ({ id: a.registration_id, name: a.display_name }));
  // Bring a Friend: first-timers pick the player who brought them (any signed-up player).
  const buddyOptions = attendees.map((a) => ({ id: a.registration_id, name: a.display_name }));
  const deposit = session.deposit_cents;
  const friendRate = deposit == null && !started && (await isFirstTimer(profile));
  const times = sessionTimes(session);
  const hasInstructional = session.instructional_price_cents != null;
  // What each option costs this player (deposit sessions: the deposit for everyone).
  const priceOf = (option: "full" | "instructional", discounted = false) => {
    if (deposit != null) return deposit;
    const base = option === "full" ? session.price_cents : session.instructional_price_cents!;
    return discounted ? Math.round(base / 2) : base;
  };

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
        <form
          action={registerForSession.bind(null, session.id)}
          className="space-y-6 [&:has(input[name=option][value=instructional]:checked)_.teammates]:hidden"
        >
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
                price={formatMoney(priceOf("full"))}
                detail={[times.full, full ? "joins the waitlist" : null]}
              />
              <OptionRadio
                value="instructional"
                title={OPTION_LABELS.instructional}
                price={formatMoney(priceOf("instructional"))}
                detail={[times.instructional, "doesn't use a drop-in spot"]}
              />
            </fieldset>
          ) : (
            <input type="hidden" name="option" value="full" />
          )}

          <div className="teammates space-y-2">
            <p className="font-display text-sm font-bold tracking-[0.15em] uppercase">
              Play on the same team as (optional, up to {MAX_TEAMMATES})
            </p>
            <TeammatePicker options={teammateOptions} />
          </div>

          {friendRate && buddyOptions.length > 0 && (
            <BringAFriendField
              id="signup-brought-by"
              optional
              options={buddyOptions}
              hint="First time here? Pick the player who brought you and you both pay half."
            />
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
  const otherPrice = priceOf(other, reg.friend_discount);
  const active = ["pending_payment", "confirmed", "waitlisted"].includes(reg.status);
  const broughtByName = reg.brought_by ? buddyOptions.find((o) => o.id === reg.brought_by)?.name : null;

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
          {reg.friend_discount && (
            <Mark tone="line" glyph="+">
              Bring a Friend · half price
            </Mark>
          )}
          <StatusMark status={reg.status} />
        </div>
      }
    >
      <div className="space-y-5">
        {reg.status === "pending_payment" && <PaymentInstructions registration={reg} deposit={deposit != null} />}
        {reg.status === "confirmed" && (
          <p className="font-display text-3xl font-black uppercase">
            You&apos;re in<span className="text-line">.</span>{" "}
            {reg.option === "instructional" ? "See you at the class" : "See you on court"}
            <span className="text-line">.</span>
          </p>
        )}
        {(reg.status === "pending_payment" || reg.status === "confirmed") && !started && (
          <AddToCalendar session={session} instructionalOnly={reg.option === "instructional"} />
        )}
        {reg.status === "waitlisted" && (
          <p className="text-lg">
            You&apos;re on the waitlist. We&apos;ll email you payment instructions as soon as a spot opens. Please
            don&apos;t send money yet.
          </p>
        )}
        {reg.note && <p className="border-l-4 border-ink/20 pl-3 text-ink-soft">Your note: &ldquo;{reg.note}&rdquo;</p>}

        {reg.friend_discount && !reg.brought_by && (
          <p className="text-ink-soft">A friend you brought signed up, so you both pay half (Bring a Friend).</p>
        )}
        {active && deposit == null && !started && (reg.brought_by || friendRate) && buddyOptions.length > 0 && (
          <form action={setBroughtBy.bind(null, reg.id, session.id)} className="space-y-2 border-t border-ink/20 pt-4">
            <BringAFriendField
              id="spot-brought-by"
              options={buddyOptions}
              defaultValue={reg.brought_by ?? ""}
              hint={
                broughtByName
                  ? `You came with ${broughtByName}, so you both pay half.`
                  : "First time here? Pick the player who brought you and you both pay half."
              }
            />
            <SubmitButton size="sm" variant="secondary" requireChange>
              Save
            </SubmitButton>
          </form>
        )}

        {reg.option === "full" && !started && ["pending_payment", "confirmed", "waitlisted"].includes(reg.status) && (
          <form action={setTeammates.bind(null, reg.id, session.id)} className="space-y-2 border-t border-ink/20 pt-4">
            <p className="font-display text-sm font-bold tracking-[0.15em] uppercase">
              Teammates you asked for <span className="font-normal tracking-normal normal-case text-ink-soft">(up to {MAX_TEAMMATES})</span>
            </p>
            <TeammatePicker options={teammateOptions} defaultSelected={await getTeamRequests(reg.id)} />
            {teammateOptions.length > 0 && (
              <SubmitButton size="sm" variant="secondary" requireChange>
                Save teammates
              </SubmitButton>
            )}
          </form>
        )}

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

async function AttendeeList({ session }: { session: Session }) {
  const sessionId = session.id;
  const supabase = await createClient();
  // Teams and the game schedule are only readable once the host publishes them (RLS),
  // so empty lists mean "not published".
  const [attendees, { data: teamRows }, { data: matchRows }] = await Promise.all([
    getAttendees(sessionId),
    supabase.from("session_teams").select("*").eq("session_id", sessionId).order("position"),
    supabase.from("session_matches").select("*").eq("session_id", sessionId).order("slot").order("court"),
  ]);
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
            <AttendeeRow key={a.registration_id} a={a} number={pad2(a.waitlist_position ?? 0)} numberClass="text-mat" />
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
        <TeamsView
          teams={teams}
          going={going}
          matches={(matchRows ?? []) as Match[]}
          scheduleStart={session.dropin_starts_at ?? session.starts_at}
          gameMinutes={session.schedule_game_minutes}
        />
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2">
          {waitlistSheet}
          {instructionalSheet}
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-10 sm:grid-cols-2">
      <Sheet label={`Team sheet · ${going.length}`}>
        {going.length === 0 ? (
          <p className="text-ink-soft">Nobody yet. Be the first!</p>
        ) : (
          <ol className="divide-y divide-ink/20">
            {going.map((a, i) => (
              <AttendeeRow key={a.registration_id} a={a} number={pad2(i + 1)} />
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
