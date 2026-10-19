import { SITE } from "@/lib/site";
import type { Session } from "@/lib/types";

// "Add to calendar" for a session: an .ics file (Apple Calendar, Outlook) and a
// Google Calendar link. Times are UTC, so calendars show them in local time.

type CalendarSession = Pick<Session, "id" | "title" | "starts_at" | "ends_at" | "location" | "instructional_ends_at">;

/** Instructional-only players leave when the lesson ends. */
function endOf(session: CalendarSession, instructionalOnly: boolean) {
  return instructionalOnly && session.instructional_ends_at ? session.instructional_ends_at : session.ends_at;
}

/** 20261024T230000Z */
function utcStamp(iso: string) {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** RFC 5545 text: escape backslashes, commas, semicolons and newlines. */
export function escapeIcsText(text: string) {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** RFC 5545 lines are at most 75 octets; longer ones continue on lines starting with a space. */
export function foldIcsLine(line: string) {
  const bytes = new TextEncoder();
  const out: string[] = [];
  let current = "";
  for (const ch of line) {
    const limit = out.length === 0 ? 75 : 74; // continuation lines lose one octet to the leading space
    if (bytes.encode(current + ch).length > limit) {
      out.push(current);
      current = ch;
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out.join("\r\n ");
}

/** "Intro 2 Volleyball (Instructional only)"; adds the club name when the title doesn't already say it. */
function eventTitle(session: CalendarSession, instructionalOnly: boolean) {
  const title = `${session.title}${instructionalOnly ? " (Instructional only)" : ""}`;
  return session.title.toLowerCase().includes(SITE.club.toLowerCase()) ? title : `${title} · ${SITE.club}`;
}

export function sessionIcs(
  session: CalendarSession,
  sessionUrl: string,
  { instructionalOnly = false, now = new Date() }: { instructionalOnly?: boolean; now?: Date } = {},
) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${SITE.club}//${SITE.name}//EN`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:session-${session.id}@intro-hub`,
    `DTSTAMP:${utcStamp(now.toISOString())}`,
    `DTSTART:${utcStamp(session.starts_at)}`,
    `DTEND:${utcStamp(endOf(session, instructionalOnly))}`,
    `SUMMARY:${escapeIcsText(eventTitle(session, instructionalOnly))}`,
    `LOCATION:${escapeIcsText(session.location)}`,
    `DESCRIPTION:${escapeIcsText(`Your sign-up: ${sessionUrl}`)}`,
    `URL:${sessionUrl}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}

export function googleCalendarUrl(
  session: CalendarSession,
  sessionUrl: string,
  { instructionalOnly = false }: { instructionalOnly?: boolean } = {},
) {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: eventTitle(session, instructionalOnly),
    dates: `${utcStamp(session.starts_at)}/${utcStamp(endOf(session, instructionalOnly))}`,
    location: session.location,
    details: `Your sign-up: ${sessionUrl}`,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

/** Path of the .ics route for a session (relative; prefix with the app URL in emails). */
export function icsPath(sessionId: string, instructionalOnly = false) {
  return `/s/${sessionId}/calendar.ics${instructionalOnly ? "?option=instructional" : ""}`;
}
