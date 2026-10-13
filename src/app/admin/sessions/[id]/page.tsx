import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { cancelSession, markPaid, moveWaitlist, removeRegistration, updateSession } from "@/app/admin/actions";
import { LiveRefresh } from "@/components/live-refresh";
import { SubmitButton } from "@/components/submit-button";
import { Avatar, buttonClass, Card, PageSpinner, StatusBadge } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime, formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
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

  return (
    <div className="space-y-6">
      <LiveRefresh sessionId={id} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/admin" className="text-sm text-stone-400 hover:text-stone-100">
            ← Dashboard
          </Link>
          <h1 className="text-2xl font-semibold">{session.title}</h1>
          <p className="text-stone-400">
            {formatDateTime(session.starts_at)} · {session.location}
            {session.status === "cancelled" && <span className="ml-2 font-semibold text-red-300">CANCELLED</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/s/${id}`} className={buttonClass("secondary", "sm")}>
            Player view
          </Link>
          <a href={`/admin/sessions/${id}/roster.csv`} className={buttonClass("secondary", "sm")}>
            Export CSV
          </a>
        </div>
      </div>

      {typeof error === "string" && <p className="rounded-lg bg-red-950/50 p-3 text-sm text-red-300">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Confirmed" value={`${going.filter((r) => r.status === "confirmed").length}/${session.capacity}`} />
        <Stat label="Awaiting payment" value={going.filter((r) => r.status === "pending_payment").length} />
        <Stat label="Waitlist" value={waiting.length} />
        <Stat label="e-Transfers in" value={formatMoney(collected)} />
      </div>

      <Card className="space-y-3">
        <h2 className="font-semibold">Roster</h2>
        {going.length === 0 && <p className="text-sm text-stone-400">No sign-ups yet.</p>}
        <ul className="divide-y divide-stone-800">
          {going.map((r) => (
            <PlayerRow key={r.id} reg={r} sessionId={id}>
              {r.status === "pending_payment" && (
                <form action={markPaid.bind(null, r.id, id)}>
                  <SubmitButton size="sm">Mark paid</SubmitButton>
                </form>
              )}
              <form action={removeRegistration.bind(null, r.id, id)}>
                <SubmitButton size="sm" variant="danger" confirm={`Remove ${name(r)}? The next waitlister gets the spot.`}>
                  Remove
                </SubmitButton>
              </form>
            </PlayerRow>
          ))}
        </ul>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">Waitlist</h2>
        {waiting.length === 0 && <p className="text-sm text-stone-400">Nobody waiting.</p>}
        <ol className="divide-y divide-stone-800">
          {waiting.map((r, i) => (
            <PlayerRow key={r.id} reg={r} sessionId={id} prefix={`${i + 1}.`}>
              <form action={moveWaitlist.bind(null, r.id, -1, id)}>
                <SubmitButton size="sm" variant="ghost">↑</SubmitButton>
              </form>
              <form action={moveWaitlist.bind(null, r.id, 1, id)}>
                <SubmitButton size="sm" variant="ghost">↓</SubmitButton>
              </form>
              <form action={markPaid.bind(null, r.id, id)}>
                <SubmitButton size="sm" variant="secondary" confirm={`Confirm ${name(r)} even though the session may be full?`}>
                  Add as paid
                </SubmitButton>
              </form>
              <form action={removeRegistration.bind(null, r.id, id)}>
                <SubmitButton size="sm" variant="danger">Remove</SubmitButton>
              </form>
            </PlayerRow>
          ))}
        </ol>
      </Card>

      {inactive.length > 0 && (
        <details className="rounded-xl border border-stone-800 bg-stone-900 p-5">
          <summary className="cursor-pointer font-semibold">Cancelled / expired ({inactive.length})</summary>
          <ul className="mt-3 divide-y divide-stone-800">
            {inactive.map((r) => (
              <PlayerRow key={r.id} reg={r} sessionId={id}>
                {r.status === "expired" && (
                  <form action={markPaid.bind(null, r.id, id)}>
                    <SubmitButton size="sm" variant="secondary" confirm={`Re-add ${name(r)} as paid?`}>
                      Paid late? Re-add
                    </SubmitButton>
                  </form>
                )}
              </PlayerRow>
            ))}
          </ul>
        </details>
      )}

      <Card className="space-y-3">
        <h2 className="font-semibold">Edit session</h2>
        <SessionForm action={updateSession.bind(null, id)} session={session} submitLabel="Save changes" />
      </Card>

      {session.status === "scheduled" && (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-red-900">
          <p className="text-sm text-stone-400">
            Cancelling emails everyone and adds paid players to the refunds list.
          </p>
          <form action={cancelSession.bind(null, id)}>
            <SubmitButton variant="danger" confirm="Cancel this session for everyone?">
              Cancel session
            </SubmitButton>
          </form>
        </Card>
      )}
    </div>
  );
}

function name(r: Row) {
  return r.profile.display_name ?? r.profile.full_name ?? r.profile.email;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-stone-400">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
    </Card>
  );
}

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
    <li className="flex flex-wrap items-center gap-3 py-2">
      {prefix && <span className="w-5 text-right text-sm text-stone-400">{prefix}</span>}
      <Avatar name={name(reg)} src={reg.profile.avatar_url} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{name(reg)}</p>
        <p className="truncate text-xs text-stone-400">
          {reg.profile.email} · <span className="font-mono">{reg.ref_code}</span>
          {reg.status === "pending_payment" && reg.hold_expires_at && ` · hold until ${formatDateTime(reg.hold_expires_at)}`}
          {payment &&
            ` · paid ${formatMoney(payment.amount_cents)} (${
              payment.matched_by === "admin" ? "manual" : `${payment.sender_name ?? "?"}, by ${payment.matched_by}`
            })`}
        </p>
      </div>
      <StatusBadge status={reg.status} />
      <div className="flex gap-1">{children}</div>
    </li>
  );
}
