import { LocationInput } from "@/components/location-input";
import { SubmitButton } from "@/components/submit-button";
import { Field, FormGroup as Group, inputClass } from "@/components/ui";
import { SessionTimes } from "@/components/session-times";
import { DEFAULT_LOCATION } from "@/lib/club";
import { TimingPreview } from "@/components/timing-preview";
import { formatDateTime, utcToZonedLocal } from "@/lib/format";
import { clockPlus, DEFAULT_CLOCKS, type BlockClocks } from "@/lib/session-times";
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
  const clocks: BlockClocks = session ? sessionClocks(session) : DEFAULT_CLOCKS;
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
            <LocationInput name="location" defaultValue={session?.location ?? DEFAULT_LOCATION} required />
          </Field>
          <Field label="Spots">
            <input type="number" name="capacity" defaultValue={session?.capacity ?? 12} min={1} required className={inputClass} />
          </Field>
        </div>
      </Group>

      <Group title="When" hint="Instructional first, then drop-in. The session's start and end come from these.">
        <div className="space-y-5">
          <Field label="Date">
            <input
              type="date"
              name="date"
              defaultValue={session ? utcToZonedLocal(session.starts_at).slice(0, 10) : undefined}
              required
              className={`${inputClass} sm:max-w-56`}
            />
          </Field>
          <SessionTimes defaultValue={clocks} />
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
          <Field
            label="Hours to pay after signing up"
            hint="Each player must pay within this many hours of signing up, or their spot goes to the next person."
          >
            <input type="number" name="hold_hours" defaultValue={session?.hold_hours ?? 12} min={1} required className={inputClass} />
          </Field>
          <Field label="Refund cutoff (hours before)" hint="Cancel before this for a refund">
            <input type="number" name="cancel_cutoff_hours" defaultValue={cutoffHours} min={0} required className={inputClass} />
          </Field>
        </div>
        <div className="mt-5">
          <TimingPreview kind="session" />
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

/** A saved session's four clock times (older sessions without the split get a 45-minute lesson). */
function sessionClocks(session: Session): BlockClocks {
  const clock = (iso: string) => utcToZonedLocal(iso).slice(11, 16);
  const start = clock(session.starts_at);
  const instructionalEnd = session.instructional_ends_at ? clock(session.instructional_ends_at) : clockPlus(start, 45);
  return {
    instructional_start: start,
    instructional_end: instructionalEnd,
    dropin_start: session.dropin_starts_at ? clock(session.dropin_starts_at) : instructionalEnd,
    dropin_end: clock(session.ends_at),
  };
}
