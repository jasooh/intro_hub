import Link from "next/link";
import { setRefunded, setRefundWaived } from "@/app/admin/actions";
import { SubmitButton } from "@/components/submit-button";
import { Mark } from "@/components/ui";
import { formatDateTime, formatMoney } from "@/lib/format";
import { REFUND_REASON_LABELS, type RefundReason, type RefundStatus } from "@/lib/refunds";
import type { Profile, Registration, Session } from "@/lib/types";

export type RefundRowData = Registration & {
  profile: Pick<Profile, "display_name" | "full_name" | "first_name" | "last_name" | "email" | "phone" | "etransfer_names">;
  session: Pick<Session, "id" | "title" | "starts_at" | "status">;
};

/** One refund: who, how much, why, and the next action for its status. */
export function RefundRow({ r, status, reason }: { r: RefundRowData; status: RefundStatus; reason: RefundReason }) {
  const name = r.profile.display_name ?? r.profile.full_name ?? r.profile.email;
  const fullName = [r.profile.first_name, r.profile.last_name].filter(Boolean).join(" ");
  return (
    <li className={`flex flex-wrap items-start justify-between gap-x-6 gap-y-3 py-4 ${status === "waived" ? "opacity-70" : ""}`}>
      <div className="min-w-0 space-y-1">
        <p className="text-lg">
          <span className={`font-score font-black ${status === "to_refund" ? "text-line" : ""}`}>
            {formatMoney(r.amount_cents)}
          </span>{" "}
          to <b>{name}</b>
          {fullName && fullName !== name && <span className="text-ink-soft"> · {fullName}</span>}
        </p>
        <p className="text-sm text-ink-soft">
          e-Transfer to <span className="text-ink [overflow-wrap:anywhere]">{r.profile.email}</span>
          {r.profile.phone && ` · ${r.profile.phone}`} · <span className="font-score font-black text-ink">{r.ref_code}</span>
        </p>
        <p className="text-sm">
          <Link href={`/admin/sessions/${r.session.id}`} className="text-mat underline underline-offset-2">
            {r.session.title} {formatDateTime(r.session.starts_at)}
          </Link>
          {r.cancelled_at && <span className="text-ink-soft"> · cancelled {formatDateTime(r.cancelled_at)}</span>}
          {status === "refunded" && r.refunded_at && <span className="text-ink-soft"> · refunded {formatDateTime(r.refunded_at)}</span>}
          {status === "waived" && r.refund_waived_at && (
            <span className="text-ink-soft"> · waived {formatDateTime(r.refund_waived_at)}</span>
          )}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Mark tone={reason === "session_cancelled" ? "bad" : "mat"} glyph={reason === "session_cancelled" ? "✕" : "○"}>
          {REFUND_REASON_LABELS[reason]}
        </Mark>
        {status === "to_refund" && (
          <>
            <form action={setRefundWaived.bind(null, r.id, true)}>
              <SubmitButton
                size="sm"
                variant="ghost"
                confirm={{
                  title: "Skip this refund?",
                  description: "It moves to the Waived tab without being refunded. You can undo this later.",
                  action: "No refund",
                }}
              >
                No refund
              </SubmitButton>
            </form>
            <form action={setRefunded.bind(null, r.id, true)}>
              <SubmitButton size="sm">Mark refunded</SubmitButton>
            </form>
          </>
        )}
        {status === "refunded" && (
          <form action={setRefunded.bind(null, r.id, false)}>
            <SubmitButton size="sm" variant="ghost">
              Undo
            </SubmitButton>
          </form>
        )}
        {status === "waived" && (
          <form action={setRefundWaived.bind(null, r.id, false)}>
            <SubmitButton size="sm" variant="ghost">
              Restore
            </SubmitButton>
          </form>
        )}
      </div>
    </li>
  );
}
