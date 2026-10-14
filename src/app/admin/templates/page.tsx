import { Suspense } from "react";
import { saveTemplate } from "@/app/admin/actions";
import { SubmitButton } from "@/components/submit-button";
import { Field, inputClass, Mark, Notice, PageSpinner, PageTitle, reveal, Sheet } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { env } from "@/lib/env";
import { formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { SessionTemplate } from "@/lib/types";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function TemplatesPage(props: PageProps<"/admin/templates">) {
  return (
    <Suspense fallback={<PageSpinner />}>
      <Templates searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Templates({ searchParams }: { searchParams: PageProps<"/admin/templates">["searchParams"] }) {
  await requireAdmin();
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("session_templates").select("*").order("created_at");
  const templates = (data ?? []) as SessionTemplate[];

  return (
    <div className="space-y-12">
      <PageTitle
        sub={`Each active template creates its next session automatically, about a week ahead. Times are in ${env.timezone()}. Changes apply to sessions created from now on; edit existing sessions from the dashboard.`}
      >
        Weekly schedule
      </PageTitle>
      {typeof error === "string" && <Notice tone="bad">{error}</Notice>}

      {templates.map((t, i) => (
        <Sheet
          key={t.id}
          className="reveal"
          style={reveal(i + 1)}
          label={`${t.title} · ${WEEKDAYS[t.weekday]}s ${t.start_time.slice(0, 5)} · ${formatMoney(t.price_cents)}`}
          action={
            t.active ? (
              <Mark tone="ok" glyph="●">
                Active
              </Mark>
            ) : (
              <Mark tone="muted" glyph="‖">
                Paused
              </Mark>
            )
          }
        >
          <TemplateForm template={t} />
        </Sheet>
      ))}

      <Sheet
        label={templates.length ? "Add another weekly session" : "Set up your weekly session"}
        className="reveal"
        style={reveal(templates.length + 1)}
      >
        <TemplateForm />
      </Sheet>
    </div>
  );
}

function TemplateForm({ template }: { template?: SessionTemplate }) {
  return (
    <form action={saveTemplate.bind(null, template?.id ?? null)} className="grid gap-x-6 gap-y-5 sm:grid-cols-3">
      <Field label="Title">
        <input name="title" defaultValue={template?.title ?? "Intro 2 Volleyball"} required className={inputClass} />
      </Field>
      <Field label="Day">
        <select name="weekday" defaultValue={template?.weekday ?? 6} className={inputClass}>
          {WEEKDAYS.map((d, i) => (
            <option key={d} value={i}>
              {d}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Start time">
        <input type="time" name="start_time" defaultValue={template?.start_time.slice(0, 5) ?? "20:00"} required className={inputClass} />
      </Field>
      <Field label="Location">
        <input name="location" defaultValue={template?.location} required className={inputClass} />
      </Field>
      <Field label="Length (minutes)">
        <input type="number" name="duration_minutes" defaultValue={template?.duration_minutes ?? 225} min={15} required className={inputClass} />
      </Field>
      <Field label="Spots">
        <input type="number" name="capacity" defaultValue={template?.capacity ?? 12} min={1} required className={inputClass} />
      </Field>
      <Field label="Price ($)">
        <input
          type="number"
          name="price"
          step="0.01"
          min={0}
          defaultValue={template ? template.price_cents / 100 : 15}
          required
          className={inputClass}
        />
      </Field>
      <Field label="Sign-ups open (hours before)" hint="120 = 5 days before">
        <input type="number" name="open_hours_before" defaultValue={template?.open_hours_before ?? 120} min={0} required className={inputClass} />
      </Field>
      <Field label="Payment window (hours)">
        <input type="number" name="hold_hours" defaultValue={template?.hold_hours ?? 12} min={1} required className={inputClass} />
      </Field>
      <Field label="Refund cutoff (hours before)">
        <input type="number" name="cancel_cutoff_hours" defaultValue={template?.cancel_cutoff_hours ?? 24} min={0} required className={inputClass} />
      </Field>
      <Field label="Instructional-only price ($)" hint="Blank = not offered">
        <input
          type="number"
          name="instructional_price"
          step="0.01"
          min={0}
          defaultValue={template ? (template.instructional_price_cents != null ? template.instructional_price_cents / 100 : "") : 10}
          className={inputClass}
        />
      </Field>
      <Field label="Instructional ends">
        <input
          type="time"
          name="instructional_ends"
          defaultValue={template ? clockAfter(template.start_time, template.instructional_minutes) : "20:45"}
          className={inputClass}
        />
      </Field>
      <Field label="Drop-in starts">
        <input
          type="time"
          name="dropin_starts"
          defaultValue={template ? clockAfter(template.start_time, template.dropin_offset_minutes) : "21:00"}
          className={inputClass}
        />
      </Field>
      <label className="flex items-center gap-2 self-end pb-2 font-display text-sm font-bold tracking-[0.15em] uppercase">
        <input type="checkbox" name="active" defaultChecked={template?.active ?? true} className="size-5 accent-[var(--line)]" />
        Active
      </label>
      <div className="self-end">
        <SubmitButton>{template ? "Save" : "Add"}</SubmitButton>
      </div>
    </form>
  );
}

/** HH:MM that is `minutes` after `start` (HH:MM[:SS]), or "" when unset. */
function clockAfter(start: string, minutes: number | null) {
  if (minutes == null) return "";
  const total = (Number(start.slice(0, 2)) * 60 + Number(start.slice(3, 5)) + minutes) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
