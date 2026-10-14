import { env } from "@/lib/env";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { Registration, Session } from "@/lib/types";

export function PaymentInstructions({ session, registration }: { session: Session; registration: Registration }) {
  return (
    <div className="space-y-4">
      <ol className="space-y-2 text-ink">
        <li className="flex gap-3">
          <span className="font-score font-black text-line">01</span>
          <span>
            Send <b>{formatMoney(session.price_cents)}</b> by Interac e-Transfer to <b>{env.etransferEmail()}</b>
          </span>
        </li>
        <li className="flex gap-3">
          <span className="font-score font-black text-line">02</span>
          <span>Put this code in the message:</span>
        </li>
      </ol>
      <div className="inline-flex items-center gap-4 bg-board px-5 py-3 shadow-[4px_4px_0_var(--line)]">
        <span className="led animate-flicker font-score text-4xl font-black tracking-widest">{registration.ref_code}</span>
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
