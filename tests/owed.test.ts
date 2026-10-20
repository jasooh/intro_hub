import { beforeEach, describe, expect, it } from "vitest";
import { groupByPlayer, owedTotals, splitByStart, stillOwing, type OwedSignup } from "@/lib/owed";
import { asService, asUser, createDb, createSession, createUser, type Db, type Event } from "./db-harness";

const row = (id: string, profile: string, cents: number, paid: number, startsAt: string, status: "scheduled" | "cancelled" = "scheduled"): OwedSignup => ({
  id,
  profile_id: profile,
  option: "full",
  amount_cents: cents,
  paid_cents: paid,
  hold_expires_at: null,
  ref_code: `VB-${id}`,
  friend_discount: false,
  profile: { id: profile, display_name: profile, full_name: null, first_name: null, last_name: null, email: `${profile}@x.test`, guest: false },
  session: { id: `s-${id}`, title: "Intro 2 Volleyball", starts_at: startsAt, status },
});

describe("owed helpers", () => {
  const rows = [
    row("1", "amy", 1500, 0, "2026-10-31T00:00:00Z"),
    row("2", "amy", 1500, 500, "2026-10-24T00:00:00Z"),
    row("3", "ben", 1500, 0, "2026-10-24T00:00:00Z"),
    row("4", "cal", 1500, 1500, "2026-10-24T00:00:00Z"), // paid in full
    row("5", "dee", 1500, 0, "2026-10-24T00:00:00Z", "cancelled"),
  ];

  it("keeps only sign-ups still owing in sessions going ahead", () => {
    expect(stillOwing(rows).map((r) => r.id)).toEqual(["1", "2", "3"]);
  });

  it("groups by player, biggest balance first, sessions soonest first", () => {
    const groups = groupByPlayer(stillOwing(rows));
    expect(groups.map((g) => [g.profile.id, g.total, g.signups.map((s) => s.id)])).toEqual([
      ["amy", 2500, ["2", "1"]],
      ["ben", 1500, ["3"]],
    ]);
    expect(owedTotals(stillOwing(rows)).get("amy")).toBe(2500);
  });

  it("splits upcoming from past by the session start", () => {
    const { upcoming, past } = splitByStart(stillOwing(rows), Date.parse("2026-10-28T00:00:00Z"));
    expect(upcoming.map((r) => r.id)).toEqual(["1"]);
    expect(past.map((r) => r.id).sort()).toEqual(["2", "3"]);
  });
});

describe("admin_nudge_player", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createDb();
  });

  const nudge = (user: string, profile: string) =>
    asUser<{ events: Event[] }>(db, user, `select public.admin_nudge_player($1) as events`, [profile]);

  it("reminds one player about each upcoming sign-up they owe on, once", async () => {
    const host = await createUser(db, "Host", { admin: true });
    const a = await createUser(db, "A");
    const s1 = await createSession(db);
    const s2 = await createSession(db, { startsInHours: 100 });
    for (const sid of [s1, s2]) await asUser(db, a, `select public.register_for_session($1)`, [sid]);

    expect((await nudge(host, a)).rows[0].events).toHaveLength(2);
    expect((await nudge(host, a)).rows[0].events).toEqual([]); // just reminded
  });

  it("skips guests and is hosts only", async () => {
    const host = await createUser(db, "Host", { admin: true });
    const a = await createUser(db, "A");
    const sid = await createSession(db);
    await asUser(db, host, `select public.admin_add_player($1, null, 'Walk In', null, 'full', false)`, [sid]);
    const guest = await asService<{ id: string }>(db, `select id from public.profiles where guest`);
    expect((await nudge(host, guest.rows[0].id)).rows[0].events).toEqual([]);
    await expect(nudge(a, a)).rejects.toThrow(/forbidden/);
  });
});
