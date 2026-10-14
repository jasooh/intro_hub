import Link from "next/link";
import { assignPayment, setPaymentDismissed } from "@/app/admin/actions";
import { SubmitButton } from "@/components/submit-button";
import { inputClass, Mark, type Tone } from "@/components/ui";
import { formatDateTime, formatMoney } from "@/lib/format";
import { METHOD_LABELS, type PaymentMethod } from "@/lib/payments";
import type { Payment, Profile, Registration, Session } from "@/lib/types";

export type Option = Registration & { profile: Pick<Profile, "display_name" | "full_name">; session: Pick<Session, "title" | "starts_at"> };
export type Row = Payment & {
  registration:
    | (Registration & {
        profile: Pick<Profile, "display_name" | "full_name" | "first_name" | "last_name">;
        session: Pick<Session, "id" | "title" | "starts_at">;
      })
    | null;
};

const METHOD_MARK: Record<PaymentMethod, { tone: Tone; glyph: string }> = {
  ref: { tone: "ok", glyph: "●" },
  name_amount: { tone: "ok", glyph: "◐" },
  assigned: { tone: "mat", glyph: "★" },
  manual: { tone: "line", glyph: "✎" },
  unmatched: { tone: "warn", glyph: "!" },
  dismissed: { tone: "muted", glyph: "✕" },
};

export function PaymentRow({ p, method, options }: { p: Row; method: PaymentMethod; options: Option[] }) {
  const mark = METHOD_MARK[method];
  const r = p.registration;
  const player = r ? (r.profile.display_name ?? r.profile.full_name) : null;
  return (
    <li className="space-y-3 py-4">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="min-w-0 space-y-1">
          <p className="text-lg">
            <span className="font-score font-black">{formatMoney(p.amount_cents)}</span>{" "}
            {method === "manual" ? (
              <span className="text-ink-soft">recorded by the host</span>
            ) : (
              <>
                from <b>{p.sender_name ?? "unknown sender"}</b>
              </>
            )}
          </p>
          <p className="text-sm text-ink-soft">
            {formatDateTime(p.received_at)}
            {p.memo && <> · message: &ldquo;{p.memo}&rdquo;</>}
          </p>
          {r && (
            <p className="text-sm">
              → <b>{player}</b> · <span className="font-score font-black">{r.ref_code}</span> ·{" "}
              <Link href={`/admin/sessions/${r.session.id}`} className="text-mat underline underline-offset-2">
                {r.session.title} {formatDateTime(r.session.starts_at)}
              </Link>
            </p>
          )}
          {method === "unmatched" && p.note && <p className="text-sm font-semibold text-warn">{p.note}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Mark tone={mark.tone} glyph={mark.glyph}>
            {METHOD_LABELS[method]}
          </Mark>
          {method === "unmatched" && (
            <form action={setPaymentDismissed.bind(null, p.id, true)}>
              <SubmitButton size="sm" variant="ghost">
                Not volleyball · dismiss
              </SubmitButton>
            </form>
          )}
          {method === "dismissed" && (
            <form action={setPaymentDismissed.bind(null, p.id, false)}>
              <SubmitButton size="sm" variant="ghost">
                Restore
              </SubmitButton>
            </form>
          )}
        </div>
      </div>
      {method === "unmatched" && (
        <form action={assignPayment.bind(null, p.id)} className="flex flex-wrap items-end gap-4">
          <select name="registration_id" required defaultValue="" className={`${inputClass} flex-1`}>
            <option value="" disabled>
              Assign to…
            </option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.profile.display_name ?? o.profile.full_name} · {o.session.title} {formatDateTime(o.session.starts_at)} ·{" "}
                {o.status.replace("_", " ")} · owes {formatMoney(o.amount_cents)} · {o.ref_code}
              </option>
            ))}
          </select>
          <SubmitButton size="sm">Confirm player</SubmitButton>
        </form>
      )}
    </li>
  );
}
