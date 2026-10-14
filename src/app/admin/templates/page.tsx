import Link from "next/link";
import { Suspense } from "react";
import { deleteTemplate, setTemplateActive } from "@/app/admin/actions";
import { SubmitButton } from "@/components/submit-button";
import { buttonClass, EmptyState, Mark, Notice, PageSpinner, PageTitle, reveal, Sheet } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { env } from "@/lib/env";
import { formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { SessionTemplate } from "@/lib/types";
import { clockAfter, WEEKDAYS } from "./template-form";

const SAVED: Record<string, string> = {
  created: "Weekly session created. Its next session has been added.",
  updated: "Weekly session saved. Changes apply to sessions created from now on.",
  deleted: "Weekly session deleted. Sessions it already created are unchanged.",
};

export default function TemplatesPage(props: PageProps<"/admin/templates">) {
  return (
    <Suspense fallback={<PageSpinner />}>
      <Templates searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Templates({ searchParams }: { searchParams: PageProps<"/admin/templates">["searchParams"] }) {
  await requireAdmin();
  const { error, saved } = await searchParams;
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
      {typeof error === "string" && <Notice tone="bad">{error}</Notice>}
      {typeof saved === "string" && SAVED[saved] && <Notice tone="ok">{SAVED[saved]}</Notice>}

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
  const ends = clockAfter(t.start_time, t.duration_minutes);
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
          {t.start_time.slice(0, 5)} – {ends} · {t.location} · {t.capacity} spots
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="font-score font-black">{formatMoney(t.price_cents)}</span>
          {t.instructional_price_cents != null && (
            <Mark tone="mat" glyph="◇">
              {formatMoney(t.instructional_price_cents)} instructional only
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
                "No new sessions will be created from it. Sessions it already created stay on the schedule; cancel those from the dashboard if needed. To stop it temporarily, use Pause instead.",
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
