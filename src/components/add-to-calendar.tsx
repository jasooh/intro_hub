import { CalendarPlus } from "lucide-react";
import { env } from "@/lib/env";
import { googleCalendarUrl, icsPath } from "@/lib/ics";
import type { Session } from "@/lib/types";

const linkClass = "underline decoration-line decoration-2 underline-offset-4 hover:text-ink";

/** "Add to calendar: Apple / Outlook · Google" under the player's spot. */
export function AddToCalendar({ session, instructionalOnly }: { session: Session; instructionalOnly: boolean }) {
  const sessionUrl = `${env.appUrl()}/s/${session.id}`;
  return (
    <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-ink-soft">
      <span className="inline-flex items-baseline gap-1.5 font-display text-sm font-bold tracking-[0.15em] text-ink uppercase">
        <CalendarPlus className="size-4 shrink-0 translate-y-0.5 text-line" aria-hidden />
        Add to calendar
      </span>
      <a href={icsPath(session.id, instructionalOnly)} className={linkClass}>
        Apple / Outlook
      </a>
      <span aria-hidden>·</span>
      <a
        href={googleCalendarUrl(session, sessionUrl, { instructionalOnly })}
        target="_blank"
        rel="noreferrer"
        className={linkClass}
      >
        Google
      </a>
    </p>
  );
}
