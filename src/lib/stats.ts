// Shapes returned by admin_stats() (supabase/migrations/*_host_tools.sql) and the
// sums the stats page shows.

export const STAT_RANGES = [
  { key: "4w", label: "4 weeks", days: 28 },
  { key: "3m", label: "3 months", days: 91 },
  { key: "6m", label: "6 months", days: 182 },
  { key: "1y", label: "1 year", days: 365 },
  { key: "all", label: "All time", days: null },
] as const;
export type StatRange = (typeof STAT_RANGES)[number]["key"] | "custom";

/** A custom range from the date pickers: both YYYY-MM-DD, in order (swapped if backwards), or null. */
export function customDates(from: unknown, to: unknown): { from: string; to: string } | null {
  const ok = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
  if (!ok(from) || !ok(to)) return null;
  return from <= to ? { from, to } : { from: to, to: from };
}

/** The Stats page's sections. All of them come from the same query, so switching is instant. */
export const STAT_TABS = [
  { key: "overview", label: "Overview" },
  { key: "timing", label: "Timing" },
  { key: "reliability", label: "Reliability" },
  { key: "growth", label: "Growth" },
  { key: "money", label: "Money" },
] as const;
export type StatTab = (typeof STAT_TABS)[number]["key"];

const DAY = 86_400_000;

/** Sessions starting from the range's start through the next month (so money owed for upcoming ones shows). */
export function statWindow(range: Exclude<StatRange, "custom">, now = Date.now()) {
  const days = STAT_RANGES.find((r) => r.key === range)!.days;
  return {
    from: days == null ? new Date("2000-01-01T00:00:00Z") : new Date(now - days * DAY),
    to: new Date(now + 31 * DAY),
    now,
  };
}

export type SessionStat = {
  id: string;
  title: string;
  starts_at: string;
  status: "scheduled" | "cancelled";
  capacity: number;
  confirmed: number;
  holding: number;
  instructional: number;
  waitlisted: number;
  expired: number;
  collected: number;
  owed: number;
  /** From sign-ups opening until as many people signed up as there were spots; null if it never filled. */
  minutes_to_full: number | null;
  /** % of drop-in spots claimed in the first hour / first day of sign-ups. */
  first_hour_pct: number | null;
  first_day_pct: number | null;
};

export type LapsedPlayer = { id: string; name: string; last_played: string; times: number };

export type HeatCell = { dow: number; hour: number; count: number };

export type Stats = {
  sessions: SessionStat[];
  players: { new: number; returning: number; lapsed: LapsedPlayer[] };
  timing: { heatmap: HeatCell[]; median_days_ahead: number | null };
  reliability: {
    signups: number;
    cancelled: number;
    late_cancelled: number;
    expired: number;
    median_minutes_to_pay: number | null;
    matched: { ref: number; name_amount: number; admin: number } | null;
  };
  growth: {
    new_by_month: { month: string; count: number }[];
    came_back: { eligible: number; came_back: number } | null;
    regulars: { regular: number; occasional: number } | null;
    friends: { friends: number; came_back: number } | null;
    skill: Record<string, number>;
    heard_about: Record<string, number>;
  };
  demand: {
    waitlisted: number;
    promoted: number;
    options: { full: number; dropin: number; instructional: number } | null;
    money_by_month: { month: string; collected: number; refunded: number; owed: number }[];
  };
};

/** "45 min", "3 h 20 min", "2 days 4 h". */
export function formatDuration(minutes: number) {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  if (m < 48 * 60) {
    const h = Math.floor(m / 60);
    const rest = m % 60;
    return rest ? `${h} h ${rest} min` : `${h} h`;
  }
  const d = Math.floor(m / 1440);
  const h = Math.round((m % 1440) / 60);
  return h ? `${d} days ${h} h` : `${d} days`;
}

/** "42%", or "–" when there's nothing to divide by. */
export const percent = (part: number, whole: number) => (whole > 0 ? `${Math.round((100 * part) / whole)}%` : "–");

export const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "8 pm", "12 am". */
export const hourLabel = (h: number) => `${h % 12 || 12} ${h < 12 ? "am" : "pm"}`;

/** Sign-ups by weekday (rows, Monday first) and hour (0-23), plus the busiest cell. */
export function heatGrid(cells: HeatCell[]) {
  const order = [1, 2, 3, 4, 5, 6, 0];
  const rows = order.map((dow) => ({
    dow,
    hours: Array.from({ length: 24 }, (_, hour) => cells.find((c) => c.dow === dow && c.hour === hour)?.count ?? 0),
  }));
  const max = Math.max(0, ...cells.map((c) => c.count));
  return { rows, max, total: cells.reduce((sum, c) => sum + c.count, 0) };
}

/**
 * The 3-hour stretch of the week when the most sign-ups happen (e.g. "Tue 8–11 pm"),
 * or null with too few sign-ups to say.
 */
export function busiestWindow(cells: HeatCell[], width = 3): { label: string; count: number; share: number } | null {
  const total = cells.reduce((sum, c) => sum + c.count, 0);
  if (total < 10) return null;
  const at = (dow: number, hour: number) => cells.find((c) => c.dow === dow && c.hour === hour)?.count ?? 0;
  let best = { dow: 0, hour: 0, count: -1 };
  for (let dow = 0; dow < 7; dow++) {
    for (let hour = 0; hour < 24; hour++) {
      let count = 0;
      for (let i = 0; i < width; i++) {
        const h = hour + i;
        count += at((dow + Math.floor(h / 24)) % 7, h % 24);
      }
      if (count > best.count) best = { dow, hour, count };
    }
  }
  const end = (best.hour + width) % 24;
  const label = `${WEEKDAYS_SHORT[best.dow]} ${hourLabel(best.hour).replace(/ (am|pm)$/, (m) => (hourLabel(end).endsWith(m.trim()) ? "" : m))}–${hourLabel(end)}`;
  return { label, count: best.count, share: best.count / total };
}

/** Average of the sessions' times to full (only ones that filled). */
export function averageFillMinutes(sessions: SessionStat[]) {
  const filled = sessions.filter((s) => s.minutes_to_full != null && s.status === "scheduled").map((s) => s.minutes_to_full!);
  return filled.length ? filled.reduce((a, b) => a + b, 0) / filled.length : null;
}

/** "2026-10" → "Oct 2026". */
export function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-CA", { month: "short", year: "numeric", timeZone: "UTC" }).format(Date.UTC(y, m - 1, 1));
}

/** "Oct 17": a session's date for a chart axis. */
export function shortDay(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", timeZone }).format(new Date(iso));
}

/** How full each played session was (paid ÷ drop-in spots), oldest first, for a trend chart. */
export function fillByDate(sessions: SessionStat[], now: number, timeZone: string) {
  return sessions
    .filter((s) => s.status === "scheduled" && s.capacity > 0 && Date.parse(s.starts_at) <= now)
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))
    .map((s) => ({
      label: shortDay(s.starts_at, timeZone),
      value: Math.min(Math.round((100 * s.confirmed) / s.capacity), 100),
      detail: `${s.confirmed}/${s.capacity} paid${s.waitlisted > 0 ? ` · ${s.waitlisted} waitlisted` : ""}`,
    }));
}

export function summarize(sessions: SessionStat[], now: number) {
  const past = sessions.filter((s) => s.status === "scheduled" && Date.parse(s.starts_at) <= now);
  const fill = past.filter((s) => s.capacity > 0).map((s) => s.confirmed / s.capacity);
  return {
    collected: sessions.reduce((sum, s) => sum + s.collected, 0),
    owed: sessions.filter((s) => s.status === "scheduled").reduce((sum, s) => sum + s.owed, 0),
    /** Average share of drop-in spots that were paid, over sessions that have happened. */
    averageFill: fill.length ? fill.reduce((a, b) => a + b, 0) / fill.length : null,
    played: past.length,
    /** Sessions that ended up with a waitlist (more demand than spots). */
    waitlisted: past.filter((s) => s.waitlisted > 0).length,
  };
}
