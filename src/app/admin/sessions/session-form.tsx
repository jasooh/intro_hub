import { SubmitButton } from "@/components/submit-button";
import { Field, inputClass } from "@/components/ui";
import { utcToZonedLocal } from "@/lib/format";
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
    <form action={action} className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
      <Field label="Title">
        <input name="title" defaultValue={session?.title ?? "Intro 2 Volleyball"} required className={inputClass} />
      </Field>
      <Field label="Location">
        <input name="location" defaultValue={session?.location} required className={inputClass} />
      </Field>
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
      <Field label="Spots">
        <input type="number" name="capacity" defaultValue={session?.capacity ?? 12} min={1} required className={inputClass} />
      </Field>
      <Field label="Price ($)">
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
      <Field label="Sign-ups open at">
        <input
          type="datetime-local"
          name="opens_at"
          defaultValue={session ? utcToZonedLocal(session.opens_at) : undefined}
          required
          className={inputClass}
        />
      </Field>
      <Field label="Payment window (hours)" hint="How long a spot is held before it goes to the waitlist.">
        <input type="number" name="hold_hours" defaultValue={session?.hold_hours ?? 12} min={1} required className={inputClass} />
      </Field>
      <Field label="Refund cutoff (hours before start)">
        <input type="number" name="cancel_cutoff_hours" defaultValue={cutoffHours} min={0} required className={inputClass} />
      </Field>
      <Field label="Instructional-only price ($)" hint="Leave blank if there's no instructional-only option.">
        <input
          type="number"
          name="instructional_price"
          step="0.01"
          min={0}
          defaultValue={session?.instructional_price_cents != null ? session.instructional_price_cents / 100 : ""}
          className={inputClass}
        />
      </Field>
      <div className="grid grid-cols-2 gap-x-6">
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
      </div>
      <div className="sm:col-span-2">
        <Field label="Notes (shown to players)">
          <textarea name="notes" defaultValue={session?.notes ?? ""} rows={3} className={inputClass} />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
