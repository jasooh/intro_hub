import { CopyButton } from "@/components/copy-button";
import { env } from "@/lib/env";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { Registration } from "@/lib/types";

export function PaymentInstructions({ registration }: { registration: Registration }) {
  const email = env.etransferEmail();
  const paid = registration.paid_cents ?? 0;
  const due = Math.max(registration.amount_cents - paid, 0);
  return (
    <div className="space-y-4">
      {paid > 0 && (
        <p className="border-l-4 border-warn pl-3">
          We got <b>{formatMoney(paid)}</b> of <b>{formatMoney(registration.amount_cents)}</b>. Send the remaining{" "}
          <b>{formatMoney(due)}</b> with the same code and your spot is confirmed.
        </p>
      )}
      <ol className="space-y-2 text-ink">
        <li className="flex gap-3">
          <span className="font-score font-black text-line">01</span>
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span>
              Send <b>{formatMoney(due)}</b> by Interac e-Transfer to{" "}
              <b className="[overflow-wrap:anywhere]">{email}</b>
            </span>
            <CopyButton value={email} label="Email" />
          </span>
        </li>
        <li className="flex gap-3">
          <span className="font-score font-black text-line">02</span>
          <span>Put this code in the message:</span>
        </li>
      </ol>
      <div className="inline-flex flex-wrap items-center gap-4 bg-board px-5 py-3 shadow-[4px_4px_0_var(--line)]">
        <span className="led animate-flicker font-score text-4xl font-black tracking-widest select-all">
          {registration.ref_code}
        </span>
        <CopyButton value={registration.ref_code} label="Code" tone="dark" />
      </div>
      {registration.hold_expires_at && (
        <p className="text-sm text-ink-soft">
          Your spot is held until <b className="text-ink">{formatDateTime(registration.hold_expires_at)}</b>. It&apos;s
          confirmed automatically when the payment arrives (usually within a few minutes).
        </p>
      )}
    </div>
  );
}
