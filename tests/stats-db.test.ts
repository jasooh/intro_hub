import { beforeEach, describe, expect, it } from "vitest";
import { asService, asUser, createDb, createSession, createUser, type Db } from "./db-harness";

let db: Db;

beforeEach(async () => {
  db = await createDb();
});

const signUp = (u: string, sid: string, option = "full") =>
  asUser(db, u, `select public.register_for_session($1, $2)`, [sid, option]);
const regId = async (u: string, sid: string) =>
  (await db.query<{ id: string }>(`select id from public.registrations where profile_id = $1 and session_id = $2`, [u, sid])).rows[0].id;

/** Move a session (and its sign-up times) into the past, as if it happened `daysAgo` days ago. */
async function happened(sid: string, daysAgo: number) {
  await db.query(
    `update public.sessions set starts_at = now() - make_interval(days => $2), ends_at = now() - make_interval(days => $2) + interval '2 hours',
            opens_at = now() - make_interval(days => $2 + 5), cancel_cutoff = now() - make_interval(days => $2 + 1)
      where id = $1`,
    [sid, daysAgo],
  );
}

describe("session summaries", () => {
  it("are written once when a session ends, with fill timing, cancellations and the waitlist", async () => {
    const host = await createUser(db, "Host", { admin: true });
    const [a, b, c, d] = await Promise.all(["A", "B", "C", "D"].map((n) => createUser(db, n)));
    const sid = await createSession(db, { capacity: 2 });
    await db.query(`update public.sessions set opens_at = now() - interval '2 hours' where id = $1`, [sid]);
    await signUp(a, sid);
    await signUp(b, sid); // full now
    await signUp(c, sid); // waitlisted
    await asUser(db, host, `select public.admin_mark_paid($1)`, [await regId(a, sid)]);
    await asUser(db, b, `select public.cancel_registration($1)`, [await regId(b, sid)]); // c promoted
    await signUp(d, sid, "full"); // waitlisted again? capacity 2: a + c
    await db.query(`update public.sessions set ends_at = now() - interval '1 minute', starts_at = now() - interval '2 hours' where id = $1`, [sid]);

    await asService(db, `select public.run_tick()`);
    const st = (await db.query(`select * from public.session_stats where session_id = $1`, [sid])).rows[0] as Record<string, unknown>;
    expect(st).toMatchObject({ capacity: 2, cancelled: 1, promoted: 1, signups: 4, matched_admin: 1 });
    expect(Number(st.waitlisted)).toBeGreaterThanOrEqual(1);
    expect(st.minutes_to_full).not.toBeNull();
    expect(st.first_day_pct).toBe(100);

    // Only once: a second tick doesn't recompute (stats_at is set).
    const before = st.computed_at;
    await asService(db, `select public.run_tick()`);
    const again = (await db.query(`select computed_at from public.session_stats where session_id = $1`, [sid])).rows[0] as Record<string, unknown>;
    expect(again.computed_at).toEqual(before);
  });

  it("are hosts only", async () => {
    const host = await createUser(db, "Host", { admin: true });
    const a = await createUser(db, "A");
    const sid = await createSession(db);
    await happened(sid, 3);
    await asService(db, `select public.run_tick()`);
    expect((await asUser(db, host, `select * from public.session_stats`)).rows).toHaveLength(1);
    expect((await asUser(db, a, `select * from public.session_stats`)).rows).toHaveLength(0);
  });
});

describe("clean-up", () => {
  it("only removes old log rows", async () => {
    await db.query(`insert into public.host_activity (kind, created_at, alerted_at) values
      ('joined', now() - interval '200 days', null), ('joined', now() - interval '10 days', null)`);
    await db.query(`insert into public.email_sends (to_email, subject, status, created_at) values
      ('a@b.c', 'old', 'sent', now() - interval '100 days'), ('a@b.c', 'new', 'sent', now()),
      ('a@b.c', 'stuck', 'queued', now() - interval '100 days')`);
    await db.query(`insert into public.email_log (dedupe_key, kind, sent_at) values
      ('old', 'x', now() - interval '500 days'), ('new', 'x', now())`);
    await asService(db, `select public.run_tick()`);
    expect((await db.query(`select count(*)::int as n from public.host_activity`)).rows[0]).toEqual({ n: 1 });
    expect((await db.query(`select subject from public.email_sends order by subject`)).rows).toEqual([
      { subject: "new" },
      { subject: "stuck" },
    ]);
    expect((await db.query(`select dedupe_key from public.email_log`)).rows).toEqual([{ dedupe_key: "new" }]);
  });
});

describe("admin_stats sections", () => {
  it("adds timing, reliability, growth and demand", async () => {
    const host = await createUser(db, "Host", { admin: true });
    const [a, b, c] = await Promise.all(["A", "B", "C"].map((n) => createUser(db, n)));
    await db.query(`update public.profiles set heard_about = 'instagram' where id = $1`, [a]);
    const s1 = await createSession(db, { capacity: 5 });
    for (const u of [a, b, c]) await signUp(u, s1);
    for (const u of [a, b]) await asUser(db, host, `select public.admin_mark_paid($1)`, [await regId(u, s1)]);
    await asUser(db, c, `select public.cancel_registration($1)`, [await regId(c, s1)]);
    await happened(s1, 40);
    const s2 = await createSession(db, { capacity: 5 });
    await signUp(a, s2);
    await asUser(db, host, `select public.admin_mark_paid($1)`, [await regId(a, s2)]);
    await happened(s2, 33); // a came back within 4 weeks
    await asService(db, `select public.run_tick()`);

    const res = await asUser<{ s: Record<string, Record<string, unknown>> }>(
      db,
      host,
      `select public.admin_stats(now() - interval '60 days', now() + interval '30 days', 'America/Toronto') as s`,
    );
    const s = res.rows[0].s;
    expect(Array.isArray(s.timing.heatmap)).toBe(true);
    expect(s.reliability).toMatchObject({ signups: 4, cancelled: 1, matched: { ref: 0, name_amount: 0, admin: 3 } });
    expect(s.growth.came_back).toEqual({ eligible: 2, came_back: 1 });
    expect(s.growth.heard_about).toEqual({ instagram: 1, unknown: 1 });
    expect(s.demand.options).toEqual({ full: 3, dropin: 0, instructional: 0 });
    expect((s.demand.money_by_month as unknown[]).length).toBeGreaterThan(0);
  });

  it("is hosts only", async () => {
    const a = await createUser(db, "A");
    await expect(asUser(db, a, `select public.admin_stats(now() - interval '1 day', now())`)).rejects.toThrow(/forbidden/);
  });
});
