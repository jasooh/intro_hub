import { CopyButton } from "@/components/copy-button";
import { HoldTimer } from "@/components/countdown";
import { env } from "@/lib/env";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { Registration } from "@/lib/types";

export type CoveredFriend = { name: string; dueCents: number };

export function PaymentInstructions({
  registration,
  deposit = false,
  covering = [],
  coveredBy = null,
}: {
  registration: Registration;
  deposit?: boolean;
  /** Friends this player is paying for (pay for friends). */
  covering?: CoveredFriend[];
  /** Name of the player paying for this one, when someone is. */
  coveredBy?: string | null;
}) {
  const email = env.etransferEmail();
  const pending = registration.status === "pending_payment";
  const paid = registration.paid_cents ?? 0;
  const ownDue = pending ? Math.max(registration.amount_cents - paid, 0) : 0;
  const due = ownDue + covering.reduce((sum, f) => sum + f.dueCents, 0);
  const breakdown = [...(ownDue > 0 ? [`you ${formatMoney(ownDue)}`] : []), ...covering.map((f) => `${f.name} ${formatMoney(f.dueCents)}`)];
  return (
    <div className="space-y-4">
      {coveredBy && (
        <p className="border-l-4 border-ok pl-3 text-lg">
          <b className="[overflow-wrap:anywhere]">{coveredBy}</b> is paying for your spot. Nothing to send. Paying yourself
          instead? Use the steps below.
        </p>
      )}
      {pending && registration.hold_expires_at && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <HoldTimer to={registration.hold_expires_at} />
          <span className="text-sm text-ink-soft">
            Your spot is held until <b className="text-ink">{formatDateTime(registration.hold_expires_at)}</b>, then it goes to
            the next person.
          </span>
        </div>
      )}
      {pending && paid > 0 && (
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
              Send <b>{formatMoney(due)}</b>
              {covering.length > 0 && (
                <span className="[overflow-wrap:anywhere] text-ink-soft"> ({breakdown.join(" · ")})</span>
              )}{" "}
              by Interac e-Transfer to <b className="[overflow-wrap:anywhere]">{email}</b>
            </span>
            <CopyButton value={email} label="Email" />
          </span>
        </li>
        <li className="flex gap-3">
          <span className="font-score font-black text-line">02</span>
          <span>Put this code in the message{covering.length > 0 ? " (one code covers everyone)" : ""}:</span>
        </li>
      </ol>
      <div className="inline-flex flex-wrap items-center gap-4 bg-board px-5 py-3 shadow-[4px_4px_0_var(--line)]">
        <span className="led animate-flicker font-score text-4xl font-black tracking-widest select-all">
          {registration.ref_code}
        </span>
        <CopyButton value={registration.ref_code} label="Code" tone="dark" />
      </div>
      {deposit && (
        <p className="text-sm text-ink-soft">
          This is a <b className="text-ink">refundable deposit</b>: the session is free, and you&apos;ll get it back after it.
        </p>
      )}
      <p className="text-sm text-ink-soft">
        It&apos;s confirmed automatically when the payment arrives (usually within a few minutes).
      </p>
    </div>
  );
}
