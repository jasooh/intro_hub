import { LocationInput } from "@/components/location-input";
import type { ReactNode } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Field, inputClass } from "@/components/ui";
import type { SessionTemplate } from "@/lib/types";

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** HH:MM that is `minutes` after `start` (HH:MM[:SS]), or "" when unset. */
export function clockAfter(start: string, minutes: number | null) {
  if (minutes == null) return "";
  const total = (Number(start.slice(0, 2)) * 60 + Number(start.slice(3, 5)) + minutes) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Create / edit a weekly session, in a few short sections; rarely-changed rules sit under "Advanced". */
export function TemplateForm({
  action,
  template,
  submitLabel,
}: {
  action: (formData: FormData) => Promise<void>;
  template?: SessionTemplate;
  submitLabel: string;
}) {
  const t = template;
  return (
    <form action={action} className="space-y-10">
      <Group title="Session">
        <div className="grid gap-x-6 gap-y-5 sm:grid-cols-[1fr_8rem]">
          <div className="sm:col-span-2">
            <Field label="Title">
              <input name="title" defaultValue={t?.title ?? "Intro 2 Volleyball"} required className={inputClass} />
            </Field>
          </div>
          <Field label="Location">
            <LocationInput name="location" defaultValue={t?.location ?? "Aaniin Community Centre, Gym 2, 5665 14th Avenue, Markham"} required />
          </Field>
          <Field label="Spots">
            <input type="number" name="capacity" defaultValue={t?.capacity ?? 18} min={1} required className={inputClass} />
          </Field>
        </div>
      </Group>

      <Group title="When">
        <div className="grid gap-x-6 gap-y-5 sm:grid-cols-3">
          <Field label="Day">
            <select name="weekday" defaultValue={t?.weekday ?? 6} className={inputClass}>
              {WEEKDAYS.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Starts">
            <input type="time" name="start_time" defaultValue={t?.start_time.slice(0, 5) ?? "20:00"} required className={inputClass} />
          </Field>
          <Field label="Length (minutes)">
            <input type="number" name="duration_minutes" defaultValue={t?.duration_minutes ?? 225} min={15} required className={inputClass} />
          </Field>
        </div>
      </Group>

      <Group title="Price">
        <div className="grid gap-x-6 gap-y-5 sm:grid-cols-3">
          <Field label="Instructional + drop-in ($)">
            <input
              type="number"
              name="price"
              step="0.01"
              min={0}
              defaultValue={t ? t.price_cents / 100 : 15}
              required
              className={inputClass}
            />
          </Field>
        </div>
      </Group>

      <Group title="Instructional-only option" hint="Leave the price blank if you don't offer it.">
        <div className="grid gap-x-6 gap-y-5 sm:grid-cols-3">
          <Field label="Price ($)">
            <input
              type="number"
              name="instructional_price"
              step="0.01"
              min={0}
              defaultValue={t ? (t.instructional_price_cents != null ? t.instructional_price_cents / 100 : "") : 10}
              className={inputClass}
            />
          </Field>
          <Field label="Instructional ends">
            <input
              type="time"
              name="instructional_ends"
              defaultValue={t ? clockAfter(t.start_time, t.instructional_minutes) : "20:45"}
              className={inputClass}
            />
          </Field>
          <Field label="Drop-in starts">
            <input
              type="time"
              name="dropin_starts"
              defaultValue={t ? clockAfter(t.start_time, t.dropin_offset_minutes) : "21:00"}
              className={inputClass}
            />
          </Field>
        </div>
      </Group>

      <details className="group space-y-5">
        <summary className="flex cursor-pointer list-none items-center gap-2 font-display text-2xl font-black uppercase">
          <span className="text-line transition-transform group-open:rotate-90">▸</span> Advanced
          <span className="font-sans text-sm font-normal tracking-normal text-ink-soft normal-case">sign-up timing & refunds</span>
        </summary>
        <div className="grid gap-x-6 gap-y-5 pt-5 sm:grid-cols-3">
          <Field label="Sign-ups open (hours before)" hint="120 = 5 days before">
            <input type="number" name="open_hours_before" defaultValue={t?.open_hours_before ?? 120} min={0} required className={inputClass} />
          </Field>
          <Field label="Payment window (hours)" hint="How long a spot is held while unpaid">
            <input type="number" name="hold_hours" defaultValue={t?.hold_hours ?? 12} min={1} required className={inputClass} />
          </Field>
          <Field label="Refund cutoff (hours before)" hint="Cancel before this for a refund">
            <input
              type="number"
              name="cancel_cutoff_hours"
              defaultValue={t?.cancel_cutoff_hours ?? 24}
              min={0}
              required
              className={inputClass}
            />
          </Field>
        </div>
      </details>

      <div className="flex flex-wrap items-center gap-6 border-t-2 border-ink pt-5">
        <label className="flex items-center gap-2 font-display text-sm font-bold tracking-[0.15em] uppercase">
          <input type="checkbox" name="active" defaultChecked={t?.active ?? true} className="size-5 accent-[var(--line)]" />
          Active (creates sessions automatically)
        </label>
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}

function Group({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-4">
      <legend className="mb-3 flex flex-wrap items-baseline gap-x-3 font-display text-2xl font-black uppercase">
        <span>
          {title}
          <span className="text-line">.</span>
        </span>
        {hint && <span className="font-sans text-sm font-normal tracking-normal text-ink-soft normal-case">{hint}</span>}
      </legend>
      {children}
    </fieldset>
  );
}
