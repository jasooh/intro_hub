import { reverseCancelledPayment, setCancellationDismissed } from "@/app/admin/actions";
import { Dropdown } from "@/components/dropdown";
import { SubmitButton } from "@/components/submit-button";
import { Mark } from "@/components/ui";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { Payment, PaymentCancellation, Profile, Registration, Session } from "@/lib/types";

export type PaymentChoice = Pick<Payment, "id" | "sender_name" | "amount_cents" | "received_at"> & {
  registration:
    | (Pick<Registration, "ref_code"> & { profile: Pick<Profile, "display_name" | "full_name">; session: Pick<Session, "title"> })
    | null;
};

/** "2026-10-19" -> "Oct 19" */
const sentDay = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "UTC" });

/** A cancelled e-Transfer the site couldn't tie to one payment: the host picks it. */
export function CancellationRow({ c, payments }: { c: PaymentCancellation; payments: PaymentChoice[] }) {
  // Likeliest first: the same amount, then the most recent.
  const choices = [...payments].sort(
    (a, b) =>
      Number(b.amount_cents === c.amount_cents) - Number(a.amount_cents === c.amount_cents) ||
      b.received_at.localeCompare(a.received_at),
  );
  return (
    <li className="space-y-3 py-4">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="min-w-0 space-y-1">
          <p className="text-lg">
            <span className="font-score font-black">{c.amount_cents != null ? formatMoney(c.amount_cents) : "An e-Transfer"}</span>{" "}
            {c.sender_name ? (
              <>
                from <b className="[overflow-wrap:anywhere]">{c.sender_name}</b>{" "}
              </>
            ) : null}
            was cancelled
          </p>
          <p className="text-sm text-ink-soft">
            Email {formatDateTime(c.received_at)}
            {c.sent_on && <> · transfer sent {sentDay(c.sent_on)}</>}
          </p>
          {c.note && <p className="text-sm font-semibold text-warn">{c.note}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Mark tone="bad" glyph="↩">
            Cancelled
          </Mark>
          <form action={setCancellationDismissed.bind(null, c.id, true)}>
            <SubmitButton size="sm" variant="ghost">
              Not volleyball · dismiss
            </SubmitButton>
          </form>
        </div>
      </div>
      <form action={reverseCancelledPayment.bind(null, c.id)} className="flex flex-wrap items-end gap-4">
        <Dropdown
          name="payment_id"
          required
          placeholder="Which payment was it?"
          label="The payment this cancellation takes back"
          className="flex-1"
          searchAt={6}
          options={choices.map((p) => ({
            value: p.id,
            label: `${formatMoney(p.amount_cents)} from ${p.sender_name ?? "unknown sender"} · ${formatDateTime(p.received_at)}${
              p.registration
                ? ` · ${p.registration.profile.display_name ?? p.registration.profile.full_name} · ${p.registration.session.title} · ${p.registration.ref_code}`
                : " · not linked"
            }`,
          }))}
        />
        <SubmitButton
          size="sm"
          confirm={{
            title: "Take this payment back?",
            description:
              "It stops counting as paid. If the player is still within their time to pay, their spot is held again and they're asked to pay; otherwise the spot goes to the next person.",
            action: "Take it back",
          }}
        >
          Take it back
        </SubmitButton>
      </form>
    </li>
  );
}
