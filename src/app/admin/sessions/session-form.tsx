import { LocationInput } from "@/components/location-input";
import { SubmitButton } from "@/components/submit-button";
import { Field, FormGroup as Group, inputClass } from "@/components/ui";
import { formatDateTime, utcToZonedLocal } from "@/lib/format";
import type { Session } from "@/lib/types";

export function SessionForm({
  action,
  session,
  submitLabel,
}: {
  action: (formData: FormData) => Promise<void>;
  session?: Session;
  submitLabel: string;
}) {
  const duration = session
    ? Math.round((new Date(session.ends_at).getTime() - new Date(session.starts_at).getTime()) / 60_000)
    : 120;
  const cutoffHours = session
    ? Math.round((new Date(session.starts_at).getTime() - new Date(session.cancel_cutoff).getTime()) / 3_600_000)
    : 24;

  return (
    <form action={action} className="space-y-10">
      <Group title="Session">
        <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-[1fr_8rem]">
          <div className="sm:col-span-2">
            <Field label="Title">
              <input name="title" defaultValue={session?.title ?? "Intro 2 Volleyball"} required className={inputClass} />
            </Field>
          </div>
          <Field label="Location">
            <LocationInput name="location" defaultValue={session?.location} required />
          </Field>
          <Field label="Spots">
            <input type="number" name="capacity" defaultValue={session?.capacity ?? 12} min={1} required className={inputClass} />
          </Field>
        </div>
      </Group>

      <Group title="When">
        <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-[1fr_12rem]">
          <Field label="Starts at">
            <input
              type="datetime-local"
              name="starts_at"
              defaultValue={session ? utcToZonedLocal(session.starts_at) : undefined}
              required
              className={inputClass}
            />
          </Field>
          <Field label="Length (minutes)">
            <input type="number" name="duration_minutes" defaultValue={duration} min={15} required className={inputClass} />
          </Field>
        </div>
      </Group>

      <Group title="Price" hint="Free session? Set the price to 0 and add a refundable deposit to hold spots.">
        <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-3">
          <Field label="Instructional + drop-in ($)">
            <input
              type="number"
              name="price"
              step="0.01"
              min={0}
              defaultValue={session ? session.price_cents / 100 : 10}
              required
              className={inputClass}
            />
          </Field>
          <Field label="Refundable deposit ($)" hint="Optional. Owed back after the session.">
            <input
              type="number"
              name="deposit"
              step="0.01"
              min={0}
              defaultValue={session?.deposit_cents != null ? session.deposit_cents / 100 : ""}
              className={inputClass}
            />
          </Field>
        </div>
      </Group>

      <Group title="Instructional-only option" hint="Leave the price blank if you don't offer it.">
        <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-3">
          <Field label="Price ($)">
            <input
              type="number"
              name="instructional_price"
              step="0.01"
              min={0}
              defaultValue={session?.instructional_price_cents != null ? session.instructional_price_cents / 100 : ""}
              className={inputClass}
            />
          </Field>
          <Field label="Instructional ends">
            <input
              type="time"
              name="instructional_ends"
              defaultValue={session?.instructional_ends_at ? utcToZonedLocal(session.instructional_ends_at).slice(11, 16) : ""}
              className={inputClass}
            />
          </Field>
          <Field label="Drop-in starts">
            <input
              type="time"
              name="dropin_starts"
              defaultValue={session?.dropin_starts_at ? utcToZonedLocal(session.dropin_starts_at).slice(11, 16) : ""}
              className={inputClass}
            />
          </Field>
          <Field label="Instructional spots" hint="Blank = no limit. Past it, a separate waitlist.">
            <input
              type="number"
              name="instructional_capacity"
              min={1}
              max={200}
              defaultValue={session?.instructional_capacity ?? ""}
              className={inputClass}
            />
          </Field>
        </div>
      </Group>

      <Group title="Drop-in only option" hint="Games only, no lesson. Uses a drop-in spot. Leave blank if you don't offer it.">
        <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-3">
          <Field label="Price ($)">
            <input
              type="number"
              name="dropin_price"
              step="0.01"
              min={0}
              defaultValue={session?.dropin_price_cents != null ? session.dropin_price_cents / 100 : ""}
              className={inputClass}
            />
          </Field>
        </div>
      </Group>

      <Group title="Sign-ups & refunds">
        <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-3">
          <Field label="Sign-ups open at">
            <input
              type="datetime-local"
              name="opens_at"
              defaultValue={session ? utcToZonedLocal(session.opens_at) : undefined}
              required
              className={inputClass}
            />
          </Field>
          <Field label="Payment window (hours)" hint="How long a spot is held while unpaid">
            <input type="number" name="hold_hours" defaultValue={session?.hold_hours ?? 12} min={1} required className={inputClass} />
          </Field>
          <Field label="Refund cutoff (hours before)" hint="Cancel before this for a refund">
            <input type="number" name="cancel_cutoff_hours" defaultValue={cutoffHours} min={0} required className={inputClass} />
          </Field>
        </div>
        <label className="mt-5 flex items-start gap-3">
          <input
            type="checkbox"
            name="announce"
            defaultChecked={session?.announce ?? true}
            disabled={Boolean(session?.announced_at)}
            className="mt-1 size-5 shrink-0 accent-[var(--line)]"
          />
          <span>
            <b>Email players when sign-ups open</b>
            <span className="block text-sm text-ink-soft">
              {session?.announced_at
                ? `Sent ${formatDateTime(session.announced_at)}.`
                : "One email, with the notes below, to everyone who gets announcements."}
            </span>
          </span>
        </label>
      </Group>

      <Group title="Notes">
        <Field label="Shown to players">
          <textarea name="notes" defaultValue={session?.notes ?? ""} rows={3} className={inputClass} />
        </Field>
      </Group>

      <div className="border-t-2 border-ink pt-5">
        <SubmitButton requireChange={Boolean(session)}>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
