import { env } from "@/lib/env";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { Registration, Session } from "@/lib/types";

export function PaymentInstructions({ session, registration }: { session: Session; registration: Registration }) {
  return (
    <div className="space-y-2 rounded-lg bg-amber-50 p-4 text-stone-800">
      <p>
        Send <b>{formatMoney(session.price_cents)}</b> by Interac e-Transfer to <b>{env.etransferEmail()}</b> with this
        code in the message:
      </p>
      <p className="font-mono text-2xl font-bold tracking-wider">{registration.ref_code}</p>
      {registration.hold_expires_at && (
        <p className="text-sm">
          Your spot is held until <b>{formatDateTime(registration.hold_expires_at)}</b>. It&apos;s confirmed
          automatically when the payment arrives (usually within a few minutes).
        </p>
      )}
    </div>
  );
}
