import Link from "next/link";
import { markPaidFromOwed, remindPlayer } from "@/app/admin/actions";
import { OptionMark } from "@/components/option-mark";
import { SubmitButton } from "@/components/submit-button";
import { EmptyState, Mark } from "@/components/ui";
import { formatDateTime, formatMoney } from "@/lib/format";
import { owedOn, type OwedPlayer } from "@/lib/owed";

const name = (p: OwedPlayer["profile"]) => p.display_name ?? p.full_name ?? p.email;

/** Players who owe money, each with their unpaid sign-ups (ruled rows, biggest balance first). */
export function OwedList({ players, upcoming, q }: { players: OwedPlayer[]; upcoming: boolean; q: string }) {
  if (players.length === 0) {
    return (
      <EmptyState>
        {q ? <>Nobody owing matches &ldquo;{q}&rdquo;.</> : upcoming ? "Nobody owes anything." : "Nothing left unpaid."}
      </EmptyState>
    );
  }
  return (
    <ul className="divide-y divide-ink/25">
      {players.map((p) => (
        <li key={p.profile.id} className="space-y-2 py-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <div className="min-w-0">
              <p className="font-display text-xl leading-tight font-extrabold uppercase [overflow-wrap:anywhere]">
                {name(p.profile)}
              </p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {p.profile.guest ? (
                  <Mark tone="muted" glyph="○">
                    Guest · added by host
                  </Mark>
                ) : (
                  <span className="text-sm text-ink-soft [overflow-wrap:anywhere]">{p.profile.email}</span>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-score text-2xl font-black text-warn">{formatMoney(p.total)}</span>
              {upcoming && !p.profile.guest && (
                <form action={remindPlayer.bind(null, p.profile.id)}>
                  <SubmitButton
                    size="sm"
                    variant="secondary"
                    confirm={{
                      title: `Remind ${name(p.profile)}?`,
                      description: `They get an email for each sign-up they still owe on (${p.signups.length}), with the ref code and amount.`,
                      action: "Send reminder",
                    }}
                  >
                    Remind
                  </SubmitButton>
                </form>
              )}
            </div>
          </div>

          <ul className="divide-y divide-ink/10 border-l-4 border-ink/15 pl-3">
            {p.signups.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2">
                <div className="min-w-0 space-y-0.5">
                  <Link
                    href={`/admin/sessions/${s.session.id}`}
                    className="font-semibold underline decoration-line decoration-2 underline-offset-4 [overflow-wrap:anywhere] hover:text-line"
                  >
                    {formatDateTime(s.session.starts_at)} · {s.session.title}
                  </Link>
                  <p className="text-sm text-ink-soft">
                    owes <b className="font-score text-ink">{formatMoney(owedOn(s))}</b>
                    {s.paid_cents > 0 && <b className="text-warn"> · partly paid {formatMoney(s.paid_cents)}</b>}
                    {" · "}
                    {s.hold_expires_at ? `hold until ${formatDateTime(s.hold_expires_at)}` : "no hold (added by host)"}
                    {" · "}
                    <span className="font-score font-black text-ink">{s.ref_code}</span>
                  </p>
                  <div className="flex flex-wrap gap-x-3">
                    <OptionMark option={s.option} />
                    {s.friend_discount && (
                      <Mark tone="line" glyph="+">
                        Bring a Friend · half price
                      </Mark>
                    )}
                  </div>
                </div>
                <form action={markPaidFromOwed.bind(null, s.id, s.session.id)}>
                  <SubmitButton
                    size="sm"
                    confirm={{
                      title: `Mark ${name(p.profile)} as paid?`,
                      description: `Records ${formatMoney(owedOn(s))} for ${s.session.title} (${formatDateTime(s.session.starts_at)}) and confirms their spot.`,
                      action: "Mark paid",
                    }}
                  >
                    Mark paid
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
