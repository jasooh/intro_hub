import { Suspense } from "react";
import { saveTemplate } from "@/app/admin/actions";
import { SubmitButton } from "@/components/submit-button";
import { Card, Field, inputClass, PageSpinner } from "@/components/ui";
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Weekly schedule</h1>
        <p className="text-sm text-stone-400">
          Each active template creates its next session automatically, about a week ahead. Times are in{" "}
          {env.timezone()}. Changes apply to sessions created from now on; edit existing sessions from the dashboard.
        </p>
      </div>
      {typeof error === "string" && <p className="rounded-lg bg-red-950/50 p-3 text-sm text-red-300">{error}</p>}

      {templates.map((t) => (
        <Card key={t.id} className="space-y-3">
          <h2 className="font-semibold">
            {t.title}: {WEEKDAYS[t.weekday]}s at {t.start_time.slice(0, 5)} · {formatMoney(t.price_cents)}{" "}
            {!t.active && <span className="text-sm font-normal text-stone-400">(paused)</span>}
          </h2>
          <TemplateForm template={t} />
        </Card>
      ))}

      <Card className="space-y-3">
        <h2 className="font-semibold">{templates.length ? "Add another weekly session" : "Set up your weekly session"}</h2>
        <TemplateForm />
      </Card>
    </div>
  );
}

function TemplateForm({ template }: { template?: SessionTemplate }) {
  return (
    <form action={saveTemplate.bind(null, template?.id ?? null)} className="grid gap-4 sm:grid-cols-3">
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
        <input type="time" name="start_time" defaultValue={template?.start_time.slice(0, 5) ?? "18:00"} required className={inputClass} />
      </Field>
      <Field label="Location">
        <input name="location" defaultValue={template?.location} required className={inputClass} />
      </Field>
      <Field label="Length (minutes)">
        <input type="number" name="duration_minutes" defaultValue={template?.duration_minutes ?? 120} min={15} required className={inputClass} />
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
          defaultValue={template ? template.price_cents / 100 : 10}
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
      <label className="flex items-center gap-2 self-end pb-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={template?.active ?? true} className="h-4 w-4 accent-orange-600" />
        Active
      </label>
      <div className="self-end">
        <SubmitButton>{template ? "Save" : "Add"}</SubmitButton>
      </div>
    </form>
  );
}
