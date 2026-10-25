import Link from "next/link";
import { deleteTemplate, setTemplateActive } from "@/app/admin/actions";
import { SubmitButton } from "@/components/submit-button";
import { buttonClass, Mark } from "@/components/ui";
import { formatDay, formatMoney } from "@/lib/format";
import { clockLabel } from "@/lib/session-times";
import type { SessionTemplate } from "@/lib/types";
import { clockAfter, WEEKDAYS } from "./template-form";

/** One weekly session in the schedule list. `today` is "YYYY-MM-DD" in the club's time zone. */
export function TemplateRow({ t, today }: { t: SessionTemplate; today: string }) {
  const start = t.start_time.slice(0, 5);
  const lessonEnds = clockAfter(start, t.instructional_minutes ?? 45);
  const dropinStarts = t.dropin_offset_minutes != null ? clockAfter(start, t.dropin_offset_minutes) : lessonEnds;
  const ends = clockAfter(start, t.duration_minutes);
  return (
    <li
      className={`grid grid-cols-[3.5rem_minmax(0,1fr)] items-start gap-x-4 gap-y-3 py-4 sm:grid-cols-[4rem_minmax(0,1fr)_auto] sm:items-center sm:gap-x-6 ${t.active ? "" : "opacity-60"}`}
    >
      <div className="flex flex-col items-center pt-1 font-display leading-none uppercase sm:pt-0">
        <span className="text-sm font-bold tracking-[0.2em] text-line">Every</span>
        <span className="text-3xl font-black">{WEEKDAYS[t.weekday].slice(0, 3)}</span>
      </div>
      <div className="min-w-0 space-y-1">
        <Link
          href={`/admin/templates/${t.id}`}
          className="font-display text-xl leading-tight font-extrabold [overflow-wrap:anywhere] uppercase decoration-line decoration-2 underline-offset-4 hover:underline sm:text-2xl"
        >
          {t.title}
        </Link>
        <p className="text-ink-soft">
          <span className="block sm:inline">
            <b className="text-ink">
              {clockLabel(start)} – {clockLabel(lessonEnds)}
            </b>{" "}
            lesson
          </span>
          <span className="hidden sm:inline"> · </span>
          <span className="block sm:inline">
            <b className="text-ink">
              {clockLabel(dropinStarts)} – {clockLabel(ends)}
            </b>{" "}
            drop-in
          </span>
        </p>
        <p className="text-ink-soft [overflow-wrap:anywhere]">
          {t.location} · {t.capacity} spots
        </p>
        {t.starts_on && (
          <p className="text-ink-soft">
            {t.starts_on > today ? "Starts" : "Started"} <b className="text-ink">{formatDay(t.starts_on)}</b>
          </p>
        )}
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
      <div className="col-start-2 flex flex-wrap items-center gap-3 sm:col-start-3 sm:justify-end">
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
