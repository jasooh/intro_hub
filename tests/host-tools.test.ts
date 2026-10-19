import { beforeEach, describe, expect, it } from "vitest";
import { asService, asUser, createDb, createSession, createUser, type Db, type Event } from "./db-harness";

let db: Db;

beforeEach(async () => {
  db = await createDb();
});

async function register(userId: string, sessionId: string) {
  const res = await asUser<{ events: Event[] }>(db, userId, `select public.register_for_session($1) as events`, [sessionId]);
  return res.rows[0].events;
}

async function regId(userId: string, sessionId: string) {
  const res = await db.query<{ id: string }>(
    `select id from public.registrations where profile_id = $1 and session_id = $2`,
    [userId, sessionId],
  );
  return res.rows[0].id;
}

async function tick() {
  const res = await asService<{ events: (Event & { nudged_at?: string })[] }>(db, `select public.run_tick() as events`);
  return res.rows[0].events.filter((e) => e.event === "hold_reminder");
}

describe("payment reminders", () => {
  it("reminds once when a hold has 2 hours or less left", async () => {
    const sid = await createSession(db);
    const a = await createUser(db, "A");
    await register(a, sid);
    expect(await tick()).toEqual([]); // 12h hold, just signed up

    await db.query(`update public.registrations set hold_expires_at = now() + interval '90 minutes'`);
    const first = await tick();
    expect(first).toHaveLength(1);
    expect(first[0].registration_id).toBe(await regId(a, sid));
    expect(first[0].nudged_at).toBeTruthy();
    expect(await tick()).toEqual([]);
  });

  it("waits until half of a short hold has passed", async () => {
    const sid = await createSession(db);
    await db.query(`update public.sessions set hold_hours = 1 where id = $1`, [sid]);
    const a = await createUser(db, "A");
    await register(a, sid);
    await db.query(`update public.registrations set hold_expires_at = now() + interval '50 minutes'`);
    expect(await tick()).toEqual([]);
    await db.query(`update public.registrations set hold_expires_at = now() + interval '20 minutes'`);
    expect(await tick()).toHaveLength(1);
  });

  it("reminds again after the hold deadline moves", async () => {
    const sid = await createSession(db);
    const a = await createUser(db, "A");
    await register(a, sid);
    await db.query(`update public.registrations set hold_expires_at = now() + interval '1 hour'`);
    expect(await tick()).toHaveLength(1);
    await db.query(`update public.registrations set hold_expires_at = now() + interval '30 minutes'`);
    expect(await tick()).toHaveLength(1);
  });

  it("lets hosts remind everyone unpaid, but not twice in a row or as a player", async () => {
    const sid = await createSession(db);
    const host = await createUser(db, "Host", { admin: true });
    const a = await createUser(db, "A");
    const b = await createUser(db, "B");
    await register(a, sid);
    await register(b, sid);
    await db.query(`update public.registrations set status = 'confirmed', hold_expires_at = null where profile_id = $1`, [b]);

    const nudge = (user: string) =>
      asUser<{ events: Event[] }>(db, user, `select public.admin_nudge_unpaid($1) as events`, [sid]);
    await expect(nudge(a)).rejects.toThrow(/forbidden/);
    const sent = (await nudge(host)).rows[0].events;
    expect(sent.map((e) => [e.event, e.registration_id])).toEqual([["hold_reminder", await regId(a, sid)]]);
    expect((await nudge(host)).rows[0].events).toEqual([]);
  });
});

describe("session messages", () => {
  it("are only visible to and written by hosts", async () => {
    const sid = await createSession(db);
    const host = await createUser(db, "Host", { admin: true });
    const a = await createUser(db, "A");
    await asUser(
      db,
      host,
      `insert into public.session_messages (session_id, subject, body_html, audiences, sent_by, recipient_count)
       values ($1, 'Gym 2', '<p>Hi</p>', array['confirmed'], $2, 3)`,
      [sid, host],
    );
    expect((await asUser(db, host, `select id from public.session_messages`)).rows).toHaveLength(1);
    expect((await asUser(db, a, `select id from public.session_messages`)).rows).toHaveLength(0);
    await expect(
      asUser(
        db,
        a,
        `insert into public.session_messages (session_id, subject, body_html, audiences) values ($1, 'x', 'x', array['confirmed'])`,
        [sid],
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("only allow known audiences", async () => {
    const sid = await createSession(db);
    await expect(
      db.query(
        `insert into public.session_messages (session_id, subject, body_html, audiences) values ($1, 'x', 'x', array['everyone'])`,
        [sid],
      ),
    ).rejects.toThrow(/check constraint/);
  });
});

describe("admin_stats", () => {
  type StatsResult = {
    sessions: { id: string; confirmed: number; holding: number; instructional: number; collected: number; owed: number }[];
    players: { new: number; returning: number; lapsed: { id: string; times: number }[] };
  };

  async function pastSession(daysAgo: number) {
    const sid = await createSession(db, { instructionalPriceCents: 500 });
    await db.query(
      `update public.sessions set starts_at = now() - make_interval(days => $2), ends_at = now() - make_interval(days => $2) + interval '2 hours'
        where id = $1`,
      [sid, daysAgo],
    );
    return sid;
  }

  async function addReg(sid: string, user: string, status: string, fields: { option?: string; amount?: number; paid?: number; refunded?: boolean } = {}) {
    await db.query(
      `insert into public.registrations (session_id, profile_id, status, option, amount_cents, paid_cents, refunded_at, ref_code)
       values ($1, $2, $3::public.registration_status, $4, $5, $6, case when $7 then now() end, public.gen_ref_code())`,
      [sid, user, status, fields.option ?? "full", fields.amount ?? 1000, fields.paid ?? 0, fields.refunded ?? false],
    );
  }

  const stats = async (user: string, fromDaysAgo: number) =>
    (
      await asUser<{ s: StatsResult }>(
        db,
        user,
        `select public.admin_stats(now() - make_interval(days => $1), now() + interval '30 days') as s`,
        [fromDaysAgo],
      )
    ).rows[0].s;

  it("adds up money and spots, net of refunds", async () => {
    const host = await createUser(db, "Host", { admin: true });
    const [a, b, c, d, e] = await Promise.all(["A", "B", "C", "D", "E"].map((n) => createUser(db, n)));
    const sid = await pastSession(3);
    await addReg(sid, a, "confirmed", { paid: 1000 });
    await addReg(sid, b, "confirmed", { paid: 1500, refunded: true }); // overpaid by 500, refunded the extra
    await addReg(sid, c, "cancelled", { paid: 1000, refunded: true }); // fully refunded
    await addReg(sid, d, "pending_payment", { paid: 400 });
    await addReg(sid, e, "confirmed", { option: "instructional", amount: 500, paid: 500 });

    const s = (await stats(host, 28)).sessions.find((x) => x.id === sid)!;
    expect(s).toMatchObject({ confirmed: 2, holding: 1, instructional: 1, collected: 1000 + 1000 + 400 + 500, owed: 600 });
  });

  it("counts new and returning players, and lists regulars who stopped coming", async () => {
    const host = await createUser(db, "Host", { admin: true });
    const [fresh, regular, lapsed, lapsedButBooked] = await Promise.all(
      ["Fresh", "Regular", "Lapsed", "Booked"].map((n) => createUser(db, n)),
    );
    const old1 = await pastSession(60);
    const old2 = await pastSession(45);
    const recent = await pastSession(5);
    const upcoming = await createSession(db);
    for (const sid of [old1, old2]) {
      await addReg(sid, lapsed, "confirmed");
      await addReg(sid, lapsedButBooked, "confirmed");
    }
    await addReg(old1, regular, "confirmed");
    await addReg(recent, regular, "confirmed");
    await addReg(recent, fresh, "confirmed");
    await addReg(upcoming, lapsedButBooked, "pending_payment");

    const { players } = await stats(host, 28);
    expect(players.new).toBe(1);
    expect(players.returning).toBe(1);
    expect(players.lapsed.map((p) => [p.id, p.times])).toEqual([[lapsed, 2]]);
  });

  it("is hosts only", async () => {
    const a = await createUser(db, "A");
    await expect(stats(a, 28)).rejects.toThrow(/forbidden/);
  });
});
