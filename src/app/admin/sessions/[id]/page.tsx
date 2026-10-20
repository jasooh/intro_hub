import type { Metadata } from "next";
import { OptionMark } from "@/components/option-mark";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  addPlayer,
  cancelSession,
  emailRoster,
  markPaid,
  moveWaitlist,
  nudgeUnpaid,
  removeFriendDiscount,
  removeRegistration,
  updateSession,
} from "@/app/admin/actions";
import { LiveRefresh } from "@/components/live-refresh";
import { SubmitButton } from "@/components/submit-button";
import {
  Avatar,
  BackLink,
  buttonClass,
  inputClass,
  Mark,
  PageSpinner,
  reveal,
  Scoreboard,
  ScoreboardRow,
  Sheet,
  SpotDots,
  StatusMark,
} from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime, formatMoney, formatTime, pad2 } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { DateBlock } from "@/components/session-card";
import { PlayerDetails } from "@/components/player-details";
import type { Match, Payment, Profile, Registration, Session, SignupOption, Team } from "@/lib/types";
import { offeredOptions, optionPrice, usesSpot } from "@/lib/options";
import { AUDIENCE_LABELS, AUDIENCES, audienceOf, type Audience } from "@/lib/audiences";
import { SessionForm } from "../session-form";
import { AddPlayerForm, type AddablePlayer } from "./add-player-form";
import { RosterEmailForm } from "./roster-email-form";
import { TeamsBoard, type TeamRow } from "./teams-board";

type SentMessage = { id: string; subject: string; audiences: Audience[]; recipient_count: number; created_at: string };

type Row = Registration & { profile: Profile; payments: Pick<Payment, "matched_by" | "sender_name" | "amount_cents">[] };

export const metadata: Metadata = {
  title: "Session",
};

export default function AdminSessionPage(props: PageProps<"/admin/sessions/[id]">) {
  return (
    <Suspense fallback={<PageSpinner />}>
      <AdminSession params={props.params} />
    </Suspense>
  );
}

async function AdminSession({
  params,
}: {
  params: PageProps<"/admin/sessions/[id]">["params"];
}) {
  await requireAdmin();
  const { id } = await params;
  const supabase = await createClient();

  const [
    { data: session },
    { data: regs },
    { data: teamRows },
    { data: matchRows },
    { data: messageRows },
    { data: playerRows },
  ] = await Promise.all([
    supabase.from("sessions").select("*").eq("id", id).maybeSingle<Session>(),
    supabase
      .from("registrations")
      .select("*, profile:profiles(*), payments(matched_by, sender_name, amount_cents)")
      .eq("session_id", id)
      .order("created_at"),
    supabase.from("session_teams").select("*").eq("session_id", id).order("position"),
    supabase.from("session_matches").select("*").eq("session_id", id).order("slot").order("court"),
    supabase
      .from("session_messages")
      .select("id, subject, audiences, recipient_count, created_at")
      .eq("session_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, display_name, full_name, email").eq("guest", false).order("display_name").limit(2000),
  ]);
  if (!session) notFound();
  const teams = (teamRows ?? []) as Team[];
  const teamNames = new Map(teams.map((t) => [t.id, t.name]));

  const rows = (regs ?? []) as Row[];
  const { data: requestRows } = rows.length
    ? await supabase
        .from("team_requests")
        .select("registration_id, requested_id")
        .in(
          "registration_id",
          rows.map((r) => r.id),
        )
    : { data: [] };
  const teamRequests = (requestRows ?? []).map((r) => ({ from: r.registration_id as string, to: r.requested_id as string }));
  const nameById = new Map(rows.map((r) => [r.id, name(r)]));
  // Bring a Friend: "Friend of Sam" on the friend, "Brought Jess" on the regular.
  const friendNoteOf = (r: Row) => {
    if (!r.friend_discount) return undefined;
    if (r.brought_by) return `Friend of ${nameById.get(r.brought_by) ?? "someone"}`;
    const friends = rows.filter(
      (x) => x.brought_by === r.id && ["pending_payment", "confirmed", "waitlisted"].includes(x.status),
    );
    return friends.length ? `Brought ${friends.map(name).join(", ")}` : "Bring a Friend";
  };
  const wantsWith = (regId: string) =>
    teamRequests.filter((t) => t.from === regId).map((t) => nameById.get(t.to) ?? "someone");
  const going = rows
    .filter((r) => r.status === "confirmed" || r.status === "pending_payment")
    .sort((a, b) => (a.status === b.status ? 0 : a.status === "confirmed" ? -1 : 1));
  const waiting = rows
    .filter((r) => r.status === "waitlisted")
    .sort((a, b) => (a.queued_at ?? "").localeCompare(b.queued_at ?? ""));
  const inactive = rows.filter((r) => r.status === "expired" || r.status === "cancelled");
  const collected = rows
    .flatMap((r) => r.payments)
    .filter((p) => p.matched_by !== "admin")
    .reduce((sum, p) => sum + p.amount_cents, 0);
  const dropIn = going.filter((r) => usesSpot(r.option));
  const waitingSpots = waiting.filter((r) => usesSpot(r.option));
  const waitingInstructional = waiting.filter((r) => !usesSpot(r.option));
  const confirmedCount = dropIn.filter((r) => r.status === "confirmed").length;
  const holdingCount = dropIn.length - confirmedCount;
  const instructionalCount = going.length - dropIn.length;
  const cancelled = session.status === "cancelled";
  const unpaidCount = going.filter((r) => r.status === "pending_payment").length;
  const audienceCounts = Object.fromEntries(AUDIENCES.map((a) => [a, 0])) as Record<Audience, number>;
  for (const r of rows) {
    const a = audienceOf(r);
    if (a) audienceCounts[a] += 1;
  }
  const messages = (messageRows ?? []) as SentMessage[];
  const activeIds = new Set(rows.filter((r) => r.status !== "expired" && r.status !== "cancelled").map((r) => r.profile_id));
  const addable: AddablePlayer[] = (playerRows ?? [])
    .filter((p) => !activeIds.has(p.id))
    .map((p) => ({ id: p.id, name: p.display_name ?? p.full_name ?? p.email, email: p.email }));
  const offered = offeredOptions(session);
  const addFull = {
    full: dropIn.length >= session.capacity,
    dropin: dropIn.length >= session.capacity,
    instructional: session.instructional_capacity != null && instructionalCount >= session.instructional_capacity,
  };
  const addPrices = Object.fromEntries(offered.map((o) => [o, formatMoney(optionPrice(session, o))])) as Record<
    SignupOption,
    string
  >;

  return (
    <div className="space-y-12">
      <LiveRefresh sessionId={id} />
      <div>
        <BackLink href="/admin">Sessions</BackLink>
      <div className="reveal flex flex-wrap items-end justify-between gap-4" style={reveal(0)}>
        <div className="flex gap-5">
          <DateBlock iso={session.starts_at} className="pt-1" />
          <div className="space-y-1">
            <h1 className={`font-display text-5xl leading-[0.85] font-black tracking-tight uppercase ${cancelled ? "line-through" : ""}`}>
              {session.title}
            </h1>
            <p className="text-ink-soft">
              {formatTime(session.starts_at)} – {formatTime(session.ends_at)} · {session.location}
            </p>
            {cancelled && (
              <Mark tone="bad" glyph="✕">
                Cancelled
              </Mark>
            )}
          </div>
        </div>
        <div className="flex gap-3">
          <Link href={`/s/${id}`} className={buttonClass("secondary", "sm")}>
            Player view
          </Link>
          <a href={`/admin/sessions/${id}/roster.csv`} className={buttonClass("secondary", "sm")}>
            Export CSV
          </a>
        </div>
      </div>
      </div>

      <div className="reveal space-y-4" style={reveal(1)}>
        <ScoreboardRow>
          <Scoreboard size="sm" className="w-full" value={`${pad2(confirmedCount)}/${pad2(session.capacity)}`} label="Confirmed" />
          <Scoreboard size="sm" className="w-full" value={pad2(holdingCount)} label="Awaiting pay" />
          <Scoreboard size="sm" className="w-full" value={pad2(waiting.length)} label="Waitlist" />
          {(instructionalCount > 0 || session.instructional_price_cents != null) && (
            <Scoreboard
              size="sm"
              className="w-full"
              value={
                session.instructional_capacity != null
                  ? `${pad2(instructionalCount)}/${pad2(session.instructional_capacity)}`
                  : pad2(instructionalCount)
              }
              label="Instr. only"
            />
          )}
          <Scoreboard size="sm" className="w-full" value={formatMoney(collected)} label="e-Transfers in" />
        </ScoreboardRow>
        <SpotDots capacity={session.capacity} confirmed={confirmedCount} holding={holdingCount} />
        {(dropIn.length > session.capacity ||
          (session.instructional_capacity != null && instructionalCount > session.instructional_capacity)) && (
          <p className="border-l-4 border-warn py-1 pl-3 text-sm">
            <b>Over the limit.</b> Lowering a limit moves the newest unpaid sign-ups to the waitlist, but paid players
            are never bumped: {dropIn.length}/{session.capacity} drop-in
            {session.instructional_capacity != null && `, ${instructionalCount}/${session.instructional_capacity} instructional`}.
            Remove someone by hand, or raise the limit.
          </p>
        )}
        {!cancelled && unpaidCount > 0 && new Date(session.starts_at) > new Date() && (
          <form action={nudgeUnpaid.bind(null, id)} className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <SubmitButton
              size="sm"
              variant="secondary"
              confirm={{
                title: `Remind ${unpaidCount} unpaid player${unpaidCount === 1 ? "" : "s"}?`,
                description:
                  "Each one gets an email with their ref code, what they still owe and when their hold ends. Players are also reminded automatically about 2 hours before their hold runs out.",
                action: "Send reminders",
              }}
            >
              Remind unpaid ({unpaidCount})
            </SubmitButton>
            <span className="text-sm text-ink-soft">Emails everyone still holding a spot without paying.</span>
          </form>
        )}
      </div>

      <Sheet label={`Roster · ${going.length}`} className="reveal" style={reveal(2)}>
        {going.length === 0 && <p className="text-ink-soft">No sign-ups yet.</p>}
        <ul className="divide-y divide-ink/20">
          {going.map((r) => (
            <PlayerRow
              key={r.id}
              reg={r}
              sessionId={id} friendNote={friendNoteOf(r)}
              teamName={r.team_id ? teamNames.get(r.team_id) : null}
              teammates={wantsWith(r.id)}
            >
              {r.status === "pending_payment" && (
                <form action={markPaid.bind(null, r.id, id)}>
                  <SubmitButton size="sm">Mark paid</SubmitButton>
                </form>
              )}
              <form action={removeRegistration.bind(null, r.id, id)}>
                <SubmitButton
                  size="sm"
                  variant="danger"
                  confirm={{
                    title: `Remove ${name(r)}?`,
                    description:
                      "Their spot goes to the next person on the waitlist. If they've paid, they're added to the refund list.",
                  }}
                >
                  Remove
                </SubmitButton>
              </form>
            </PlayerRow>
          ))}
        </ul>
      </Sheet>

      {!cancelled && (
        <details className="group space-y-6">
          <summary className="flex cursor-pointer list-none flex-wrap items-end gap-x-3 gap-y-1 border-b-2 border-ink">
            <span className="inline-flex items-center gap-2.5 bg-ink px-3 pt-1.5 pb-1 font-display text-sm font-bold tracking-[0.2em] whitespace-nowrap text-maple uppercase">
              <span aria-hidden className="text-line transition-transform group-open:rotate-90">▸</span>
              Add player
            </span>
            <span className="pb-1 text-sm text-ink-soft">Walk-ins, people who messaged you, guests without an account</span>
          </summary>
          <AddPlayerForm
            action={addPlayer.bind(null, id)}
            players={addable}
            options={offered}
            prices={addPrices}
            full={addFull}
          />
        </details>
      )}

      {!cancelled && <TeamsBoard
          session={session}
          players={dropIn as TeamRow[]}
          teams={teams}
          requests={teamRequests}
          matches={(matchRows ?? []) as Match[]}
        />}

      <Sheet label={`Waitlist · ${waiting.length}`} className="reveal" style={reveal(3)}>
        {waiting.length === 0 && <p className="text-ink-soft">Nobody waiting.</p>}
        {[
          { label: null, list: waitingSpots },
          { label: "Instructional only", list: waitingInstructional },
        ]
          .filter((q) => q.list.length > 0)
          .map((q) => (
            <div key={q.label ?? "spots"} className="space-y-1">
              {q.label && waitingSpots.length > 0 && (
                <p className="pt-4 font-display text-sm font-bold tracking-[0.2em] text-ink-soft uppercase">{q.label} queue</p>
              )}
              <ol className="divide-y divide-ink/20">
                {q.list.map((r, i) => (
                <PlayerRow key={r.id} reg={r} sessionId={id} friendNote={friendNoteOf(r)} prefix={pad2(i + 1)}>
                  <form action={moveWaitlist.bind(null, r.id, -1, id)}>
                    <SubmitButton size="sm" variant="ghost">↑</SubmitButton>
                  </form>
                  <form action={moveWaitlist.bind(null, r.id, 1, id)}>
                    <SubmitButton size="sm" variant="ghost">↓</SubmitButton>
                  </form>
                  <form action={markPaid.bind(null, r.id, id)}>
                    <SubmitButton
                      size="sm"
                      variant="secondary"
                      confirm={{
                        title: `Add ${name(r)} as paid?`,
                        description:
                      "They'll be confirmed straight from the waitlist. If the session is full, it gets one more spot for them.",
                      }}
                    >
                      Add as paid
                    </SubmitButton>
                  </form>
                  <form action={removeRegistration.bind(null, r.id, id)}>
                    <SubmitButton
                      size="sm"
                      variant="danger"
                      confirm={{ title: `Remove ${name(r)} from the waitlist?`, description: "They'll lose their place in line." }}
                    >
                      Remove
                    </SubmitButton>
                  </form>
                </PlayerRow>
                ))}
              </ol>
            </div>
          ))}
      </Sheet>

      {inactive.length > 0 && (
        <details className="group border-t-2 border-ink pt-3">
          <summary className="flex cursor-pointer list-none items-center gap-2 font-display text-sm font-bold tracking-[0.2em] text-ink-soft uppercase">
            <span className="transition-transform group-open:rotate-90">▸</span> Cancelled / expired · {inactive.length}
          </summary>
          <ul className="mt-3 divide-y divide-ink/20">
            {inactive.map((r) => (
              <PlayerRow key={r.id} reg={r} sessionId={id} friendNote={friendNoteOf(r)}>
                {r.status === "expired" && (
                  <form action={markPaid.bind(null, r.id, id)}>
                    <SubmitButton
                      size="sm"
                      variant="secondary"
                      confirm={{
                        title: `Re-add ${name(r)} as paid?`,
                        description:
                          "Use this when their payment arrived after the hold expired. They'll be confirmed even if the session is full.",
                        action: "Re-add as paid",
                      }}
                    >
                      Paid late? Re-add
                    </SubmitButton>
                  </form>
                )}
              </PlayerRow>
            ))}
          </ul>
        </details>
      )}

      <details className="group space-y-8">
        <summary className="flex cursor-pointer list-none flex-wrap items-end gap-x-3 gap-y-1 border-b-2 border-ink">
          <span className="inline-flex items-center gap-2.5 bg-ink px-3 pt-1.5 pb-1 font-display text-sm font-bold tracking-[0.2em] whitespace-nowrap text-maple uppercase">
            <span aria-hidden className="text-line transition-transform group-open:rotate-90">▸</span>
            Email players
          </span>
          <span className="pb-1 text-sm text-ink-soft">
            Gym changes, what to bring{messages.length > 0 && ` · ${messages.length} sent`}
          </span>
        </summary>
        {!cancelled && <RosterEmailForm action={emailRoster.bind(null, id)} counts={audienceCounts} />}
        {messages.length > 0 && (
          <div className="space-y-2">
            <p className="font-display text-sm font-bold tracking-[0.15em] uppercase">Sent</p>
            <ul className="divide-y divide-ink/20">
              {messages.map((m) => (
                <li key={m.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
                  <div className="min-w-0">
                    <p className="font-bold [overflow-wrap:anywhere]">{m.subject}</p>
                    <p className="text-sm text-ink-soft">
                      {formatDateTime(m.created_at)} · {m.audiences.map((a) => AUDIENCE_LABELS[a]).join(", ")}
                    </p>
                  </div>
                  <span className="font-score font-black">
                    {pad2(m.recipient_count)} <span className="font-sans text-sm font-normal text-ink-soft">sent</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </details>

      {/* Collapsible so the form's own section tabs don't sit under another tab. */}
      <details className="group space-y-8">
        <summary className="flex cursor-pointer list-none flex-wrap items-end gap-x-3 gap-y-1 border-b-2 border-ink">
          <span className="inline-flex items-center gap-2.5 bg-ink px-3 pt-1.5 pb-1 font-display text-sm font-bold tracking-[0.2em] whitespace-nowrap text-maple uppercase">
            <span aria-hidden className="text-line transition-transform group-open:rotate-90">▸</span>
            Edit session
          </span>
          <span className="pb-1 text-sm text-ink-soft">Time, prices, deposit, sign-up rules</span>
        </summary>
        <SessionForm action={updateSession.bind(null, id)} session={session} submitLabel="Save changes" />
      </details>

      {session.status === "scheduled" && (
        <section className="space-y-4 border-t-2 border-bad pt-4">
          <p className="text-ink-soft">Cancelling emails everyone and adds paid players to the refunds list.</p>
          <form action={cancelSession.bind(null, id)} className="flex flex-wrap items-end gap-4">
            <label className="block min-w-64 flex-1 space-y-1">
              <span className="font-display text-sm font-bold tracking-[0.15em] uppercase">
                Message to players (optional)
              </span>
              <textarea
                name="reason"
                rows={2}
                maxLength={500}
                placeholder="e.g. The gym was double-booked. Sorry, see you next week!"
                className={`${inputClass} text-base`}
              />
              <span className="block text-sm text-ink-soft">Shown on the session page and in the cancellation email.</span>
            </label>
            <SubmitButton
              variant="danger"
              confirm={{
                title: "Cancel this session for everyone?",
                description:
                  "Everyone signed up or waitlisted is emailed, and paid players are added to the refund list. This can't be undone.",
              }}
            >
              Cancel session
            </SubmitButton>
          </form>
        </section>
      )}
    </div>
  );
}

function fullName(r: Row) {
  return [r.profile.first_name, r.profile.last_name].filter(Boolean).join(" ");
}

function name(r: Row) {
  return r.profile.display_name ?? r.profile.full_name ?? r.profile.email;
}


function PlayerRow({
  reg,
  sessionId,
  teamName,
  teammates,
  friendNote,
  prefix,
  children,
}: {
  reg: Row;
  sessionId: string;
  /** Bring a Friend: who they came with, or who they brought. */
  friendNote?: string;
  teamName?: string | null;
  /** Names this player asked to be teamed with. */
  teammates?: string[];
  prefix?: string;
  children?: React.ReactNode;
}) {
  const payment = reg.payments[0];
  const paid = payment
    ? `${formatMoney(payment.amount_cents)} · ${
        payment.matched_by === "admin" ? "marked paid by host" : `from ${payment.sender_name ?? "?"} (matched by ${payment.matched_by})`
      }`
    : null;
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      {prefix && <span className="w-7 font-score text-lg font-black text-mat">{prefix}</span>}
      <Avatar name={name(reg)} src={reg.profile.avatar_url} />
      <div className="min-w-0 flex-1">
        <p className="truncate">
          <PlayerDetails data={{ profile: reg.profile, registration: reg, paid, teamName: teamName ?? null, teammates }}>
            {name(reg)}
          </PlayerDetails>
          {fullName(reg) && fullName(reg) !== name(reg) && <span className="text-ink-soft"> · {fullName(reg)}</span>}
        </p>
        <p className="truncate text-sm text-ink-soft">
          <span className="font-score font-black text-ink">{reg.ref_code}</span> · owes {formatMoney(reg.amount_cents)}
          {reg.status === "pending_payment" && reg.hold_expires_at && ` · hold until ${formatDateTime(reg.hold_expires_at)}`}
          {reg.paid_cents > 0 &&
            (reg.status === "pending_payment" && reg.paid_cents < reg.amount_cents ? (
              <b className="text-warn"> · partly paid {formatMoney(reg.paid_cents)}</b>
            ) : (
              ` · paid ${formatMoney(reg.paid_cents)}`
            ))}
        </p>
        <div className="mt-1 flex min-w-0 flex-wrap gap-x-3 gap-y-1 sm:gap-x-4">
          <OptionMark option={reg.option} />
          {reg.profile.guest && (
            <Mark tone="muted" glyph="○">
              Guest · added by host
            </Mark>
          )}
          {reg.profile.attended_before === false && (
            <Mark tone="line" glyph="★">
              First time
            </Mark>
          )}
          {reg.profile.media_consent === false && (
            <Mark tone="bad" glyph="✕">
              No photos
            </Mark>
          )}
          {reg.note && (
            <Mark tone="line" glyph="✎">
              Note
            </Mark>
          )}
          {teamName && (
            <Mark tone="ok" glyph="●">
              {teamName}
            </Mark>
          )}
          {friendNote && (
            <Mark tone="line" glyph="+">
              {friendNote} · half price
            </Mark>
          )}
        </div>
        {friendNote && (
          <form action={removeFriendDiscount.bind(null, reg.id, sessionId)} className="mt-1">
            <SubmitButton
              size="sm"
              variant="ghost"
              confirm={{
                title: "Remove the Bring a Friend discount?",
                description: reg.brought_by
                  ? "They go back to full price, and so does the player who brought them (unless another friend came with them). Anyone already confirmed keeps what they paid."
                  : "They go back to full price if they haven't paid yet. The friends they brought keep theirs.",
                action: "Remove discount",
              }}
            >
              Remove discount
            </SubmitButton>
          </form>
        )}
      </div>
      {/* Phones: status and actions get their own line under the player, so the tags keep the full width. */}
      <div className="flex w-full flex-wrap items-center gap-3 pl-12 sm:w-auto sm:pl-0">
        <StatusMark status={reg.status} />
        {children}
      </div>
    </li>
  );
}
