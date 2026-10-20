import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { deleteTemplate, setTemplateActive } from "@/app/admin/actions";
import { SubmitButton } from "@/components/submit-button";
import { buttonClass, EmptyState, Mark, PageSpinner, PageTitle, reveal, Sheet } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { env } from "@/lib/env";
import { formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { SessionTemplate } from "@/lib/types";
import { clockAfter, WEEKDAYS } from "./template-form";


export const metadata: Metadata = {
  title: "Weekly schedule",
};

export default function TemplatesPage() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <Templates />
    </Suspense>
  );
}

async function Templates() {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase.from("session_templates").select("*").order("weekday").order("start_time");
  const templates = (data ?? []) as SessionTemplate[];

  return (
    <div className="space-y-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageTitle
          sub={`Each active weekly session creates its next session automatically, about a week ahead. Times are in ${env.timezone()}.`}
        >
          Weekly schedule
        </PageTitle>
        <Link href="/admin/templates/new" className={buttonClass()}>
          + New weekly session
        </Link>
      </div>

      <Sheet label={`Weekly sessions · ${templates.length}`} className="reveal" style={reveal(1)}>
        {templates.length === 0 ? (
          <EmptyState>
            No weekly sessions yet.{" "}
            <Link href="/admin/templates/new" className="text-line underline decoration-2 underline-offset-4">
              Set one up
            </Link>
          </EmptyState>
        ) : (
          <ul className="divide-y divide-ink/25">
            {templates.map((t) => (
              <TemplateRow key={t.id} t={t} />
            ))}
          </ul>
        )}
      </Sheet>
    </div>
  );
}

function TemplateRow({ t }: { t: SessionTemplate }) {
  const start = t.start_time.slice(0, 5);
  const lessonEnds = clockAfter(start, t.instructional_minutes ?? 45);
  const dropinStarts = t.dropin_offset_minutes != null ? clockAfter(start, t.dropin_offset_minutes) : lessonEnds;
  const ends = clockAfter(start, t.duration_minutes);
  return (
    <li className={`flex flex-wrap items-center gap-x-6 gap-y-3 py-4 ${t.active ? "" : "opacity-60"}`}>
      <div className="flex w-16 shrink-0 flex-col items-center font-display leading-none uppercase">
        <span className="text-sm font-bold tracking-[0.2em] text-line">Every</span>
        <span className="text-3xl font-black">{WEEKDAYS[t.weekday].slice(0, 3)}</span>
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <Link
          href={`/admin/templates/${t.id}`}
          className="font-display text-2xl leading-tight font-extrabold uppercase decoration-line decoration-2 underline-offset-4 hover:underline"
        >
          {t.title}
        </Link>
        <p className="text-ink-soft">
          <b className="text-ink">{start}–{lessonEnds}</b> lesson · <b className="text-ink">{dropinStarts}–{ends}</b> drop-in
          <br />
          {t.location} · {t.capacity} spots
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="font-score font-black">{formatMoney(t.price_cents)}</span>
          {t.instructional_price_cents != null && (
            <Mark tone="mat" glyph="◇">
              {formatMoney(t.instructional_price_cents)} instructional only
              {t.instructional_capacity != null && ` · ${t.instructional_capacity} spots`}
            </Mark>
          )}
          {t.dropin_price_cents != null && (
            <Mark tone="line" glyph="▸">
              {formatMoney(t.dropin_price_cents)} drop-in only
            </Mark>
          )}
          {t.active ? (
            <Mark tone="ok" glyph="●">
              Active
            </Mark>
          ) : (
            <Mark tone="muted" glyph="‖">
              Paused
            </Mark>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/admin/templates/${t.id}`} className={buttonClass("secondary", "sm")}>
          Edit
        </Link>
        <form action={setTemplateActive.bind(null, t.id, !t.active)}>
          <SubmitButton size="sm" variant="ghost">
            {t.active ? "Pause" : "Resume"}
          </SubmitButton>
        </form>
        <form action={deleteTemplate.bind(null, t.id)}>
          <SubmitButton
            size="sm"
            variant="danger"
            confirm={{
              title: `Delete ${WEEKDAYS[t.weekday]} ${t.title}?`,
              description:
                "No new sessions will be created from it. Sessions it already created stay on the schedule; cancel those from the Sessions page if needed. To stop it temporarily, use Pause instead.",
              action: "Delete",
            }}
          >
            Delete
          </SubmitButton>
        </form>
      </div>
    </li>
  );
}
