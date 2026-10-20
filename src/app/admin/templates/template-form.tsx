import { LocationInput } from "@/components/location-input";
import { SubmitButton } from "@/components/submit-button";
import { Field, FormGroup as Group, inputClass } from "@/components/ui";
import { Dropdown } from "@/components/dropdown";
import { SessionTimes } from "@/components/session-times";
import { DEFAULT_LOCATION } from "@/lib/club";
import { TimingPreview } from "@/components/timing-preview";
import { clockPlus, DEFAULT_CLOCKS, type BlockClocks } from "@/lib/session-times";
import type { SessionTemplate } from "@/lib/types";
import { pad2 } from "@/lib/format";

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** HH:MM that is `minutes` after `start` (HH:MM[:SS]), or "" when unset. */
export function clockAfter(start: string, minutes: number | null) {
  if (minutes == null) return "";
  const total = (Number(start.slice(0, 2)) * 60 + Number(start.slice(3, 5)) + minutes) % 1440;
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
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
        <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-[1fr_8rem]">
          <div className="sm:col-span-2">
            <Field label="Title">
              <input name="title" defaultValue={t?.title ?? "Intro 2 Volleyball"} required className={inputClass} />
            </Field>
          </div>
          <Field label="Location">
            <LocationInput name="location" defaultValue={t?.location ?? DEFAULT_LOCATION} required />
          </Field>
          <Field label="Spots">
            <input type="number" name="capacity" defaultValue={t?.capacity ?? 18} min={1} required className={inputClass} />
          </Field>
        </div>
      </Group>

      <Group title="When" hint="Instructional first, then drop-in.">
        <div className="space-y-5">
          <Field label="Day">
            <Dropdown
              name="weekday"
              defaultValue={String(t?.weekday ?? 6)}
              options={WEEKDAYS.map((d, i) => ({ value: String(i), label: d }))}
              className="sm:max-w-56"
            />
          </Field>
          <SessionTimes defaultValue={t ? templateClocks(t) : DEFAULT_CLOCKS} />
        </div>
      </Group>

      <Group title="Price">
        <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-3">
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
        <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-3">
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
          <Field label="Instructional spots" hint="Blank = no limit. Past it, a separate waitlist.">
            <input
              type="number"
              name="instructional_capacity"
              min={1}
              max={200}
              defaultValue={t?.instructional_capacity ?? ""}
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
              defaultValue={t?.dropin_price_cents != null ? t.dropin_price_cents / 100 : ""}
              className={inputClass}
            />
          </Field>
        </div>
      </Group>

      <details className="group space-y-5">
        <summary className="flex cursor-pointer list-none flex-wrap items-end gap-x-3 gap-y-1 border-b-2 border-ink">
          <span className="inline-flex items-center gap-2.5 bg-ink px-3 pt-1.5 pb-1 font-display text-sm font-bold tracking-[0.2em] whitespace-nowrap text-maple uppercase">
            <span aria-hidden className="text-line transition-transform group-open:rotate-90">▸</span>
            Advanced
          </span>
          <span className="pb-1 text-sm text-ink-soft">Sign-up timing &amp; refunds</span>
        </summary>
        <div className="grid grid-cols-1 gap-x-6 gap-y-5 pt-5 sm:grid-cols-3">
          <Field label="Sign-ups open (hours before)" hint="120 = 5 days before">
            <input type="number" name="open_hours_before" defaultValue={t?.open_hours_before ?? 120} min={0} required className={inputClass} />
          </Field>
          <Field
            label="Hours to pay after signing up"
            hint="Each player must pay within this many hours of signing up, or their spot goes to the next person."
          >
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

      <TimingPreview kind="template" />

      <div className="flex flex-wrap items-center gap-6 border-t-2 border-ink pt-5">
        <label className="flex items-center gap-2 font-display text-sm font-bold tracking-[0.15em] uppercase">
          <input type="checkbox" name="active" defaultChecked={t?.active ?? true} className="size-5 accent-[var(--line)]" />
          Active (creates sessions automatically)
        </label>
        <SubmitButton requireChange={Boolean(template)}>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}

/** A weekly session's four clock times (older ones without the split get a 45-minute lesson). */
function templateClocks(t: SessionTemplate): BlockClocks {
  const start = t.start_time.slice(0, 5);
  const instructionalEnd = clockPlus(start, t.instructional_minutes ?? 45);
  return {
    instructional_start: start,
    instructional_end: instructionalEnd,
    dropin_start: t.dropin_offset_minutes != null ? clockPlus(start, t.dropin_offset_minutes) : instructionalEnd,
    dropin_end: clockPlus(start, t.duration_minutes),
  };
}
