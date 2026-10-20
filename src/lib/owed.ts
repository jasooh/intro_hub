import type { Profile, Registration, Session } from "@/lib/types";

// Money still owed: sign-ups holding a spot (pending_payment) that haven't been
// paid in full, in sessions that weren't cancelled. Grouped by player for the
// host's Owed page and the Players list.

export type OwedSignup = Pick<
  Registration,
  "id" | "profile_id" | "option" | "amount_cents" | "paid_cents" | "hold_expires_at" | "ref_code" | "friend_discount"
> & {
  profile: Pick<Profile, "id" | "display_name" | "full_name" | "first_name" | "last_name" | "email" | "guest">;
  session: Pick<Session, "id" | "title" | "starts_at" | "status">;
};

export type OwedPlayer = {
  profile: OwedSignup["profile"];
  total: number;
  signups: OwedSignup[];
};

export const owedOn = (s: Pick<Registration, "amount_cents" | "paid_cents">) => Math.max(s.amount_cents - s.paid_cents, 0);

/** Only sign-ups that still owe something, in sessions that are going ahead. */
export function stillOwing(rows: OwedSignup[]) {
  return rows.filter((r) => r.session.status === "scheduled" && owedOn(r) > 0);
}

/** One entry per player, biggest balance first; each player's sign-ups soonest first. */
export function groupByPlayer(rows: OwedSignup[]): OwedPlayer[] {
  const byPlayer = new Map<string, OwedPlayer>();
  for (const r of rows) {
    const p = byPlayer.get(r.profile_id) ?? { profile: r.profile, total: 0, signups: [] };
    p.total += owedOn(r);
    p.signups.push(r);
    byPlayer.set(r.profile_id, p);
  }
  const name = (p: OwedPlayer) => (p.profile.display_name ?? p.profile.full_name ?? p.profile.email).toLowerCase();
  return [...byPlayer.values()]
    .map((p) => ({ ...p, signups: p.signups.sort((a, b) => a.session.starts_at.localeCompare(b.session.starts_at)) }))
    .sort((a, b) => b.total - a.total || name(a).localeCompare(name(b)));
}

/** Total owed per player id (for the Players list). */
export function owedTotals(rows: OwedSignup[]) {
  const totals = new Map<string, number>();
  for (const r of rows) totals.set(r.profile_id, (totals.get(r.profile_id) ?? 0) + owedOn(r));
  return totals;
}

/** Sessions still to come vs. ones that have started (unpaid there: e.g. guests a host added). */
export function splitByStart(rows: OwedSignup[], now = Date.now()) {
  return {
    upcoming: rows.filter((r) => Date.parse(r.session.starts_at) > now),
    past: rows.filter((r) => Date.parse(r.session.starts_at) <= now),
  };
}
