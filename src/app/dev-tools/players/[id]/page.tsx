import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SignupRow } from "@/components/signup-row";
import { Avatar, BackLink, EmptyState, Mark, PageSpinner, reveal, Sheet } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import { formatDateTime, formatMoney } from "@/lib/format";
import { HEARD_LABELS, profileComplete, SKILL_LABELS } from "@/lib/profile";
import { signupView } from "@/lib/signups";
import { createAdminClient } from "@/lib/supabase/server";
import type { Payment, Profile, Registration, Session } from "@/lib/types";

export const metadata: Metadata = {
  title: "View as player",
};

function splitUpcoming<T extends Registration & { session: Session }>(regs: T[]) {
  const now = Date.now();
  return {
    upcoming: regs.filter((r) => signupView(r, now) === "upcoming"),
    history: regs.filter((r) => signupView(r, now) !== "upcoming"),
  };
}

export default function DevToolsPlayerPage(props: PageProps<"/dev-tools/players/[id]">) {
  return (
    <Suspense fallback={<PageSpinner />}>
      <PlayerView params={props.params} />
    </Suspense>
  );
}

async function PlayerView({ params }: { params: PageProps<"/dev-tools/players/[id]">["params"] }) {
  await requireOwner();
  const { id } = await params;

  // Read-only, after the owner check: the service client sees past RLS, like the player's own view would.
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("*").eq("id", id).maybeSingle();
  if (!profile) notFound();
  const p = profile as Profile;

  const { data: regRows } = await admin
    .from("registrations")
    .select("*, session:sessions(*)")
    .eq("profile_id", id)
    .order("created_at", { ascending: false })
    .limit(200);
  const regs = (regRows ?? []) as (Registration & { session: Session })[];
  const regIds = regs.map((r) => r.id);

  const [{ data: emailRows }, { data: paymentRows }] = await Promise.all([
    regIds.length
      ? admin.from("email_log").select("id, kind, sent_at, registration_id").in("registration_id", regIds).order("sent_at", { ascending: false }).limit(50)
      : Promise.resolve({ data: [] }),
    regIds.length
      ? admin.from("payments").select("*").in("registration_id", regIds).order("received_at", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);
  const emails = (emailRows ?? []) as { id: number; kind: string; sent_at: string; registration_id: string }[];
  const payments = (paymentRows ?? []) as Payment[];
  const refOf = new Map(regs.map((r) => [r.id, r.ref_code]));

  const { upcoming, history } = splitUpcoming(regs);
  const name = p.display_name ?? p.full_name ?? p.email;
  const complete = profileComplete(p);

  const facts: [string, string][] = [
    ["Full name", [p.first_name, p.last_name].filter(Boolean).join(" ") || "—"],
    ["Email", p.email],
    ["Phone", p.phone ?? "—"],
    ["Skill", p.skill_level ? SKILL_LABELS[p.skill_level] : "—"],
    ["e-Transfer names", p.etransfer_names.join(", ") || "—"],
    ["Heard about us", p.heard_about ? (p.heard_about === "other" ? `Other: ${p.heard_about_other ?? ""}` : HEARD_LABELS[p.heard_about]) : "—"],
    ["Waiver", p.waiver_accepted_at ? `Signed ${formatDateTime(p.waiver_accepted_at)} (${p.waiver_version})` : "Not signed"],
    ["Media release", p.media_consent == null ? "—" : p.media_consent ? "Yes" : "No"],
    ["Announcement emails", p.announcement_emails ? "On" : "Opted out"],
    ["Joined", formatDateTime(p.created_at)],
  ];

  return (
    <div className="space-y-10">
      <div className="space-y-5">
        <BackLink href="/dev-tools/players">All players</BackLink>
        <div className="reveal flex items-center gap-4" style={reveal(0)}>
          <Avatar name={name} src={p.avatar_url} size={64} />
          <div className="min-w-0">
            <p className="font-display text-sm font-bold tracking-[0.3em] text-line uppercase">Viewing as</p>
            <h1 className="truncate font-display text-5xl leading-[0.9] font-black uppercase">{name}</h1>
          </div>
        </div>
        <p className="flex flex-wrap items-center gap-x-5 gap-y-1">
          {p.role === "admin" && (
            <Mark tone="line" glyph="●">
              Host
            </Mark>
          )}
          {complete ? (
            <Mark tone="ok" glyph="●">
              Profile complete
            </Mark>
          ) : (
            <Mark tone="warn" glyph="◐">
              Profile incomplete: can&apos;t sign up
            </Mark>
          )}
          <Link href={`/dev-tools/data/profiles/${p.id}`} className="underline decoration-line decoration-2 underline-offset-4">
            Edit profile row
          </Link>
        </p>
      </div>

      <Sheet label="Profile" className="reveal" style={reveal(1)}>
        <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
          {facts.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 border-b border-ink/15 py-2">
              <dt className="shrink-0 font-display text-sm font-bold tracking-[0.12em] text-ink-soft uppercase">{k}</dt>
              <dd className="min-w-0 text-right break-words">{v}</dd>
            </div>
          ))}
        </dl>
      </Sheet>

      <Sheet label={`Upcoming · ${upcoming.length}`} className="reveal" style={reveal(2)}>
        {upcoming.length === 0 ? (
          <EmptyState>Nothing coming up</EmptyState>
        ) : (
          <div className="divide-y divide-ink/20">
            {upcoming.map((r) => (
              <div key={r.id}>
                <ul><SignupRow reg={r} actionable preview returnTo={`/dev-tools/players/${id}`} /></ul>
                <DevToolsLine reg={r} />
              </div>
            ))}
          </div>
        )}
      </Sheet>

      <Sheet label={`History · ${history.length}`} className="reveal" style={reveal(3)}>
        {history.length === 0 ? (
          <EmptyState>No past sign-ups</EmptyState>
        ) : (
          <div className="divide-y divide-ink/20">
            {history.map((r) => (
              <div key={r.id}>
                <ul><SignupRow reg={r} actionable={false} returnTo={`/dev-tools/players/${id}`} /></ul>
                <DevToolsLine reg={r} />
              </div>
            ))}
          </div>
        )}
      </Sheet>

      <div className="grid grid-cols-1 gap-12 sm:grid-cols-2">
        <Sheet label={`Payments · ${payments.length}`} className="reveal" style={reveal(4)}>
          {payments.length === 0 ? (
            <p className="text-ink-soft">No payments linked to their sign-ups.</p>
          ) : (
            <ul className="divide-y divide-ink/20 border-b border-ink/20">
              {payments.map((pay) => (
                <li key={pay.id} className="flex flex-wrap items-baseline justify-between gap-x-3 py-2">
                  <span className="font-score font-black">{formatMoney(pay.amount_cents)}</span>
                  <span className="text-sm text-ink-soft">
                    {refOf.get(pay.registration_id ?? "")} · {pay.matched_by ?? "unmatched"} · {formatDateTime(pay.received_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Sheet>

        <Sheet label={`Emails · ${emails.length}`} className="reveal" style={reveal(5)}>
          {emails.length === 0 ? (
            <p className="text-ink-soft">No sign-up emails sent to them.</p>
          ) : (
            <ul className="divide-y divide-ink/20 border-b border-ink/20">
              {emails.map((e) => (
                <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-x-3 py-2">
                  <span className="font-display font-bold tracking-wide uppercase">{e.kind.replace(/_/g, " ")}</span>
                  <span className="text-sm text-ink-soft">
                    {refOf.get(e.registration_id)} · {formatDateTime(e.sent_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Sheet>
      </div>
    </div>
  );
}

/** The bits only dev tools show under each sign-up: hold deadline and a jump to the raw row. */
function DevToolsLine({ reg }: { reg: Registration }) {
  return (
    <p className="-mt-3 flex flex-wrap gap-x-4 pb-4 text-sm text-ink-soft">
      {reg.status === "pending_payment" && reg.hold_expires_at && <span>Hold ends {formatDateTime(reg.hold_expires_at)}</span>}
      {reg.status === "waitlisted" && reg.queued_at && <span>Queued {formatDateTime(reg.queued_at)}</span>}
      <Link href={`/dev-tools/data/registrations/${reg.id}`} className="underline decoration-line decoration-2 underline-offset-4">
        Edit sign-up row
      </Link>
    </p>
  );
}
