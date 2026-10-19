import { env } from "@/lib/env";

/** 2-digit number for scoreboards and lists: 7 -> "07". */
export const pad2 = (n: number) => String(n).padStart(2, "0");

export function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(cents / 100);
}

export function formatDateTime(iso: string, timeZone = env.timezone()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatTime(iso: string, timeZone = env.timezone()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

/**
 * Time ranges for a session's parts. `instructional`/`dropin` are null when the
 * host hasn't set the split times.
 */
export function sessionTimes(
  s: { starts_at: string; ends_at: string; instructional_ends_at: string | null; dropin_starts_at: string | null },
  timeZone = env.timezone(),
) {
  const t = (iso: string) => formatTime(iso, timeZone);
  return {
    full: `${t(s.starts_at)} – ${t(s.ends_at)}`,
    instructional: s.instructional_ends_at ? `${t(s.starts_at)} – ${t(s.instructional_ends_at)}` : null,
    dropin: s.dropin_starts_at ? `${t(s.dropin_starts_at)} – ${t(s.ends_at)}` : null,
  };
}

/** Calendar parts for a date block: { weekday: "SAT", day: "18", month: "OCT" }. */
export function dateParts(iso: string, timeZone = env.timezone()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, weekday: "short", day: "numeric", month: "short" }).formatToParts(
    new Date(iso),
  );
  const get = (type: string) => (parts.find((p) => p.type === type)?.value ?? "").replace(".", "").toUpperCase();
  return { weekday: get("weekday"), day: get("day"), month: get("month") };
}

/** Offset (ms) of `timeZone`'s wall clock from UTC at the given instant. */
function tzOffsetMs(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const wall = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return wall - Math.floor(instant.getTime() / 1000) * 1000;
}

/** Interpret a `<input type="datetime-local">` value as wall time in `timeZone`. */
export function zonedLocalToUtc(local: string, timeZone = env.timezone()): Date {
  const asUtc = new Date(`${local.length === 16 ? `${local}:00` : local}Z`);
  if (Number.isNaN(asUtc.getTime())) throw new Error(`Invalid date: ${local}`);
  const offset = tzOffsetMs(asUtc, timeZone);
  const guess = new Date(asUtc.getTime() - offset);
  const corrected = tzOffsetMs(guess, timeZone);
  return corrected === offset ? guess : new Date(asUtc.getTime() - corrected);
}

/** Inverse of zonedLocalToUtc, for pre-filling datetime-local inputs. */
export function utcToZonedLocal(iso: string, timeZone = env.timezone()): string {
  const instant = new Date(iso);
  const wall = new Date(instant.getTime() + tzOffsetMs(instant, timeZone));
  return wall.toISOString().slice(0, 16);
}

/** "YYYY-MM-DD" of an instant on the club's wall clock. */
export function zonedDayKey(iso: string, timeZone = env.timezone()) {
  return utcToZonedLocal(iso, timeZone).slice(0, 10);
}

const DAY_MS = 86_400_000;

/**
 * Calendar squares: `weeks` full Sun–Sat weeks starting with the week holding `today` ("YYYY-MM-DD").
 * Plain dates in UTC, so clock changes never skip or repeat a day.
 */
export function calendarDays(today: string, weeks: number) {
  const t = new Date(`${today}T00:00:00Z`);
  const start = t.getTime() - t.getUTCDay() * DAY_MS;
  return Array.from({ length: weeks * 7 }, (_, i) => {
    const d = new Date(start + i * DAY_MS);
    return { key: d.toISOString().slice(0, 10), day: d.getUTCDate(), month: d.getUTCMonth() };
  });
}
