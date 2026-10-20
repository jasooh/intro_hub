// When host notification emails are due. Pure functions (time zone passed in)
// so they can be tested; src/lib/host-notifications.ts does the sending.

export type HostDigest = "off" | "3h" | "daily";

export const DIGEST_LABELS: Record<HostDigest, string> = {
  off: "Off",
  "3h": "Every 3 hours",
  daily: "Once a day (8am)",
};

const HOUR = 3_600_000;
/** 3-hourly digests wait overnight: nothing between 10pm and 7am. */
const QUIET_FROM = 22;
const QUIET_UNTIL = 7;
const DAILY_AT = 8;
/** The session-day email goes out from 9am on the day. */
const SESSION_DAY_AT = 9;

/** Local calendar day ("2026-10-24") and hour (0-23) of an instant. */
export function localParts(at: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return { day: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

/** Whether a host's digest should go out now (it's only sent if something happened since `lastSent`). */
export function digestDue(setting: HostDigest, lastSent: Date | null, now: Date, timeZone: string) {
  if (setting === "off") return false;
  const { day, hour } = localParts(now, timeZone);
  if (setting === "daily") {
    if (hour < DAILY_AT) return false;
    return !lastSent || localParts(lastSent, timeZone).day < day;
  }
  if (hour >= QUIET_FROM || hour < QUIET_UNTIL) return false;
  return !lastSent || now.getTime() - lastSent.getTime() >= 3 * HOUR;
}

/** The first digest covers the last period; later ones everything since the previous one. */
export function digestSince(setting: HostDigest, lastSent: Date | null, now: Date) {
  if (lastSent) return lastSent;
  return new Date(now.getTime() - (setting === "daily" ? 24 : 3) * HOUR);
}

/** The session-day email: from 9am on the session's day, until it starts. */
export function sessionDayDue(startsAt: Date, now: Date, timeZone: string) {
  if (now >= startsAt) return false;
  const today = localParts(now, timeZone);
  return localParts(startsAt, timeZone).day === today.day && today.hour >= SESSION_DAY_AT;
}
