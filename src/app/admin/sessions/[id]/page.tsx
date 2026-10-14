import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { cancelSession, markPaid, moveWaitlist, removeRegistration, updateSession } from "@/app/admin/actions";
import { LiveRefresh } from "@/components/live-refresh";
import { SubmitButton } from "@/components/submit-button";
import { Avatar, BackLink, buttonClass, Mark, Notice, PageSpinner, reveal, Scoreboard, Sheet, SpotDots, StatusMark } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime, formatMoney, formatTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { DateBlock } from "@/components/session-card";
import { SKILL_LABELS } from "@/lib/profile";
import type { Payment, Profile, Registration, Session } from "@/lib/types";
import { SessionForm } from "../session-form";

type Row = Registration & { profile: Profile; payments: Pick<Payment, "matched_by" | "sender_name" | "amount_cents">[] };

export default function AdminSessionPage(props: PageProps<"/admin/sessions/[id]">) {
  return (
    <Suspense fallback={<PageSpinner />}>
      <AdminSession params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

async function AdminSession({
  params,
  searchParams,
}: {
  params: PageProps<"/admin/sessions/[id]">["params"];
  searchParams: PageProps<"/admin/sessions/[id]">["searchParams"];
}) {
  await requireAdmin();
  const { id } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();

  const [{ data: session }, { data: regs }] = await Promise.all([
    supabase.from("sessions").select("*").eq("id", id).maybeSingle<Session>(),
    supabase
      .from("registrations")
      .select("*, profile:profiles(*), payments(matched_by, sender_name, amount_cents)")
      .eq("session_id", id)
      .order("created_at"),
  ]);
  if (!session) notFound();

  const rows = (regs ?? []) as Row[];
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
  const dropIn = going.filter((r) => r.option === "full");
  const confirmedCount = dropIn.filter((r) => r.status === "confirmed").length;
  const holdingCount = dropIn.length - confirmedCount;
  const instructionalCount = going.length - dropIn.length;
  const cancelled = session.status === "cancelled";

  return (
    <div className="space-y-12">
      <LiveRefresh sessionId={id} />
      <div>
        <BackLink href="/admin">Dashboard</BackLink>
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

      {typeof error === "string" && <Notice tone="bad">{error}</Notice>}

      <div className="reveal space-y-4" style={reveal(1)}>
        <div className="flex flex-wrap gap-4">
          <Scoreboard size="sm" value={`${pad(confirmedCount)}/${pad(session.capacity)}`} label="Confirmed" />
          <Scoreboard size="sm" value={pad(holdingCount)} label="Awaiting pay" />
          <Scoreboard size="sm" value={pad(waiting.length)} label="Waitlist" />
          {instructionalCount > 0 && <Scoreboard size="sm" value={pad(instructionalCount)} label="Instr. only" />}
          <Scoreboard size="sm" value={formatMoney(collected)} label="e-Transfers in" />
        </div>
        <SpotDots capacity={session.capacity} confirmed={confirmedCount} holding={holdingCount} />
      </div>

      <Sheet label={`Roster · ${going.length}`} className="reveal" style={reveal(2)}>
        {going.length === 0 && <p className="text-ink-soft">No sign-ups yet.</p>}
        <ul className="divide-y divide-ink/20">
          {going.map((r) => (
            <PlayerRow key={r.id} reg={r} sessionId={id}>
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

      <Sheet label={`Waitlist · ${waiting.length}`} className="reveal" style={reveal(3)}>
        {waiting.length === 0 && <p className="text-ink-soft">Nobody waiting.</p>}
        <ol className="divide-y divide-ink/20">
          {waiting.map((r, i) => (
            <PlayerRow key={r.id} reg={r} sessionId={id} prefix={pad(i + 1)}>
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
                    description: "They'll be confirmed straight from the waitlist, even if the session is already full.",
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
      </Sheet>

      {inactive.length > 0 && (
        <details className="group border-t-2 border-ink pt-3">
          <summary className="flex cursor-pointer list-none items-center gap-2 font-display text-sm font-bold tracking-[0.2em] text-ink-soft uppercase">
            <span className="transition-transform group-open:rotate-90">▸</span> Cancelled / expired · {inactive.length}
          </summary>
          <ul className="mt-3 divide-y divide-ink/20">
            {inactive.map((r) => (
              <PlayerRow key={r.id} reg={r} sessionId={id}>
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

      <Sheet label="Edit session">
        <SessionForm action={updateSession.bind(null, id)} session={session} submitLabel="Save changes" />
      </Sheet>

      {session.status === "scheduled" && (
        <section className="flex flex-wrap items-center justify-between gap-4 border-t-2 border-bad pt-4">
          <p className="text-ink-soft">Cancelling emails everyone and adds paid players to the refunds list.</p>
          <form action={cancelSession.bind(null, id)}>
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

const pad = (n: number) => String(n).padStart(2, "0");

function PlayerRow({
  reg,
  prefix,
  children,
}: {
  reg: Row;
  sessionId: string;
  prefix?: string;
  children?: React.ReactNode;
}) {
  const payment = reg.payments[0];
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      {prefix && <span className="w-7 font-score text-lg font-black text-mat">{prefix}</span>}
      <Avatar name={name(reg)} src={reg.profile.avatar_url} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">
          {name(reg)}
          {fullName(reg) && fullName(reg) !== name(reg) && <span className="font-normal text-ink-soft"> · {fullName(reg)}</span>}
        </p>
        <p className="truncate text-sm text-ink-soft">
          {reg.profile.email}
          {reg.profile.phone && ` · ${reg.profile.phone}`} · <span className="font-score font-black text-ink">{reg.ref_code}</span>
          {` · owes ${formatMoney(reg.amount_cents)}`}
          {reg.status === "pending_payment" && reg.hold_expires_at && ` · hold until ${formatDateTime(reg.hold_expires_at)}`}
          {payment &&
            ` · paid ${formatMoney(payment.amount_cents)} (${
              payment.matched_by === "admin" ? "manual" : `${payment.sender_name ?? "?"}, by ${payment.matched_by}`
            })`}
        </p>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
          {reg.option === "instructional" && (
            <Mark tone="mat" glyph="◇">
              Instructional only
            </Mark>
          )}
          {reg.profile.skill_level && (
            <Mark tone="muted" glyph="·">
              {SKILL_LABELS[reg.profile.skill_level]}
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
        </div>
        {reg.note && <p className="mt-1 border-l-4 border-ink/20 pl-3 text-sm">&ldquo;{reg.note}&rdquo;</p>}
      </div>
      <StatusMark status={reg.status} />
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </li>
  );
}
