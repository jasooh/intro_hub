import { env } from "@/lib/env";

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
