import Link from "next/link";
import { OptionMark } from "@/components/option-mark";
import { cancelRegistration } from "@/app/actions";
import { PaymentInstructions } from "@/components/payment-instructions";
import { DateBlock } from "@/components/session-card";
import { SubmitButton } from "@/components/submit-button";
import { Mark, StatusMark } from "@/components/ui";
import { formatMoney, formatTime } from "@/lib/format";
import { isActive } from "@/lib/signups";
import type { Registration, Session } from "@/lib/types";

/**
 * One of the player's sign-ups. `actionable` (upcoming sessions) adds payment
 * instructions and the cancel button; past/cancelled ones are just a record.
 * `preview` (dev tools' view-as-player) shows what the player sees, minus the cancel button.
 */
export function SignupRow({
  reg,
  actionable,
  returnTo,
  preview = false,
}: {
  reg: Registration & { session: Session };
  actionable: boolean;
  returnTo: string;
  preview?: boolean;
}) {
  const sessionCancelled = reg.session.status === "cancelled";
  return (
    <li className="space-y-4 py-5">
      <div className="flex gap-4">
        <DateBlock iso={reg.session.starts_at} />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <Link
              href={`/s/${reg.session_id}`}
              className={`font-display text-2xl leading-tight font-extrabold uppercase decoration-line decoration-2 underline-offset-4 hover:underline ${
                actionable ? "" : "text-ink-soft"
              }`}
            >
              {reg.session.title}
            </Link>
            <span className="flex flex-wrap items-center gap-x-4">
              <OptionMark option={reg.option} />
              {sessionCancelled ? (
                <Mark tone="bad" glyph="✕">
                  Session cancelled
                </Mark>
              ) : (
                <StatusMark status={reg.status} />
              )}
            </span>
          </div>
          <p className="font-semibold">{formatTime(reg.session.starts_at)}</p>
          <p className="text-sm leading-snug text-ink-soft">{reg.session.location}</p>
          <p className="text-ink-soft">
            <span className="font-score font-black text-ink">{formatMoney(reg.amount_cents)}</span> ·{" "}
            <span className="font-score">{reg.ref_code}</span>
          </p>
        </div>
      </div>

      {actionable && reg.status === "pending_payment" && <PaymentInstructions registration={reg} deposit={reg.session.deposit_cents != null} />}

      {reg.refund_owed && (
        <p className="text-sm text-ink-soft">
          {reg.refunded_at
            ? "Refunded."
            : reg.refund_waived_at
              ? "No refund for this one. Contact the host if you have questions."
              : "Refund owed. The host will e-Transfer it back."}
        </p>
      )}

      {actionable && !preview && isActive(reg.status) && (
        <form action={cancelRegistration.bind(null, reg.id, returnTo)}>
          <SubmitButton
            variant="danger"
            size="sm"
            confirm={{
              title: reg.status === "waitlisted" ? "Leave the waitlist?" : "Cancel your spot?",
              description:
                reg.status === "waitlisted"
                  ? "You'll lose your place in line."
                  : "Your spot goes to the next person on the waitlist. Refunds only apply before the cancellation cutoff.",
              action: reg.status === "waitlisted" ? "Leave waitlist" : "Cancel spot",
            }}
          >
            {reg.status === "waitlisted" ? "Leave waitlist" : "Cancel my spot"}
          </SubmitButton>
        </form>
      )}
    </li>
  );
}
