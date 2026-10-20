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
};

export type LapsedPlayer = { id: string; name: string; last_played: string; times: number };

export type Stats = {
  sessions: SessionStat[];
  players: { new: number; returning: number; lapsed: LapsedPlayer[] };
};

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
