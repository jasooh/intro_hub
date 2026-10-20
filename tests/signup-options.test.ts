import { beforeEach, describe, expect, it } from "vitest";
import { asService, asUser, createDb, createSession, createUser, type Db, type Event } from "./db-harness";

let db: Db;

beforeEach(async () => {
  db = await createDb();
});

async function signUp(userId: string, sessionId: string, option = "full") {
  const res = await asUser<{ events: Event[] }>(db, userId, `select public.register_for_session($1, $2) as events`, [
    sessionId,
    option,
  ]);
  return res.rows[0].events;
}

async function reg(userId: string, sessionId: string) {
  const res = await db.query<{ id: string; status: string; option: string; amount_cents: number; friend_discount: boolean; hold_expires_at: Date | null }>(
    `select id, status::text, option, amount_cents, friend_discount, hold_expires_at from public.registrations
      where profile_id = $1 and session_id = $2 order by created_at desc limit 1`,
    [userId, sessionId],
  );
  return res.rows[0];
}

const setSession = (sid: string, sql: string, params: unknown[] = []) =>
  db.query(`update public.sessions set ${sql} where id = $1`, [sid, ...params]);

const users = (n: number, prefix = "P") => Promise.all(Array.from({ length: n }, (_, i) => createUser(db, `${prefix}${i + 1}`)));

describe("drop-in only", () => {
  it("has its own price, uses a drop-in spot, and waits when drop-in is full", async () => {
    const sid = await createSession(db, { capacity: 2, priceCents: 1500, instructionalPriceCents: 1000 });
    await setSession(sid, `dropin_price_cents = 800`);
    const [a, b, c] = await users(3);

    await signUp(a, sid, "dropin");
    expect(await reg(a, sid)).toMatchObject({ status: "pending_payment", option: "dropin", amount_cents: 800 });
    await signUp(b, sid, "full");
    await signUp(c, sid, "dropin");
    expect((await reg(c, sid)).status).toBe("waitlisted");

    const counts = await db.query(`select * from public.get_session_counts(array[$1::uuid])`, [sid]);
    expect(counts.rows[0]).toMatchObject({ holding: 2, waitlisted: 1, dropin: 1 });
  });

  it("isn't available unless the session offers it", async () => {
    const sid = await createSession(db);
    const [a] = await users(1);
    await expect(signUp(a, sid, "dropin")).rejects.toThrow(/option_unavailable/);
  });

  it("switching between Instructional + Drop-in and Drop-in only keeps the spot", async () => {
    const sid = await createSession(db, { capacity: 1, priceCents: 1500 });
    await setSession(sid, `dropin_price_cents = 800`);
    const [a, b] = await users(2);
    await signUp(a, sid, "full");
    await signUp(b, sid, "full");
    const before = await reg(a, sid);
    await asUser(db, a, `select public.change_registration_option($1, 'dropin')`, [before.id]);
    expect(await reg(a, sid)).toMatchObject({ status: "pending_payment", option: "dropin", amount_cents: 800 });
    expect((await reg(b, sid)).status).toBe("waitlisted"); // a didn't give up the spot
  });
});

describe("instructional limit", () => {
  it("waitlists past the cap and promotes in order when a place frees up", async () => {
    const sid = await createSession(db, { capacity: 10, instructionalPriceCents: 1000 });
    await setSession(sid, `instructional_capacity = 1`);
    const [a, b, c] = await users(3);
    await signUp(a, sid, "instructional");
    await signUp(b, sid, "instructional");
    await signUp(c, sid, "full");
    expect((await reg(a, sid)).status).toBe("pending_payment");
    expect((await reg(b, sid)).status).toBe("waitlisted");
    expect((await reg(c, sid)).status).toBe("pending_payment"); // drop-in has its own room

    const res = await asUser<{ events: Event[] }>(db, a, `select public.cancel_registration($1) as events`, [(await reg(a, sid)).id]);
    expect(res.rows[0].events).toEqual([{ event: "promoted", registration_id: (await reg(b, sid)).id }]);
    expect((await reg(b, sid)).status).toBe("pending_payment");
  });

  it("keeps the queues apart: a free drop-in spot doesn't promote an instructional waitlist", async () => {
    const sid = await createSession(db, { capacity: 1, instructionalPriceCents: 1000 });
    await setSession(sid, `instructional_capacity = 1`);
    const [a, b, c] = await users(3);
    await signUp(a, sid, "full");
    await signUp(b, sid, "instructional");
    await signUp(c, sid, "instructional");
    await asUser(db, a, `select public.cancel_registration($1)`, [(await reg(a, sid)).id]);
    expect((await reg(c, sid)).status).toBe("waitlisted");
  });

  it("switching to instructional when it's full joins its waitlist and frees the drop-in spot", async () => {
    const sid = await createSession(db, { capacity: 1, instructionalPriceCents: 1000 });
    await setSession(sid, `instructional_capacity = 1`);
    const [a, b, c] = await users(3);
    await signUp(a, sid, "instructional");
    await signUp(b, sid, "full");
    await signUp(c, sid, "full");
    await asUser(db, b, `select public.change_registration_option($1, 'instructional')`, [(await reg(b, sid)).id]);
    expect((await reg(b, sid)).status).toBe("waitlisted");
    expect((await reg(c, sid)).status).toBe("pending_payment");
  });

  it("waitlist positions count within each queue", async () => {
    const sid = await createSession(db, { capacity: 1, instructionalPriceCents: 1000 });
    await setSession(sid, `instructional_capacity = 1`);
    const [a, b, c, d] = await users(4);
    await signUp(a, sid, "full");
    await signUp(b, sid, "instructional");
    await signUp(c, sid, "full");
    await signUp(d, sid, "instructional");
    const rows = await asUser<{ option: string; waitlist_position: number | null }>(
      db,
      a,
      `select option, waitlist_position from public.get_session_attendees($1) where status = 'waitlisted'`,
      [sid],
    );
    expect(rows.rows.map((r) => [r.option, r.waitlist_position]).sort()).toEqual([
      ["full", 1],
      ["instructional", 1],
    ]);
  });
});

describe("admin_add_player", () => {
  const add = (host: string, sid: string, args: { profile?: string; name?: string; email?: string; option?: string; paid?: boolean }) =>
    asUser<{ events: Event[] }>(db, host, `select public.admin_add_player($1, $2, $3, $4, $5, $6) as events`, [
      sid,
      args.profile ?? null,
      args.name ?? null,
      args.email ?? null,
      args.option ?? "full",
      args.paid ?? false,
    ]);

  it("adds an existing player to a full session and makes room", async () => {
    const sid = await createSession(db, { capacity: 1 });
    const host = await createUser(db, "Host", { admin: true });
    const [a, b] = await users(2);
    await signUp(a, sid);
    const res = await add(host, sid, { profile: b });
    expect(res.rows[0].events[0].event).toBe("signed_up");
    expect(await reg(b, sid)).toMatchObject({ status: "pending_payment", hold_expires_at: null });
    const cap = await db.query<{ capacity: number }>(`select capacity from public.sessions where id = $1`, [sid]);
    expect(cap.rows[0].capacity).toBe(2);

    // No hold, so the tick never expires it.
    await asService(db, `select public.run_tick()`);
    expect((await reg(b, sid)).status).toBe("pending_payment");
    await expect(add(host, sid, { profile: b })).rejects.toThrow(/already_signed_up/);
  });

  it("adds a guest by name, paid, without an account email", async () => {
    const sid = await createSession(db, { capacity: 5 });
    const host = await createUser(db, "Host", { admin: true });
    const res = await add(host, sid, { name: "Walk In", paid: true });
    expect(res.rows[0].events[0].event).toBe("confirmed");
    const guest = await db.query<{ guest: boolean; email: string; display_name: string; status: string }>(
      `select p.guest, p.email, p.display_name, r.status::text from public.registrations r
         join public.profiles p on p.id = r.profile_id where r.session_id = $1`,
      [sid],
    );
    expect(guest.rows[0]).toMatchObject({ guest: true, display_name: "Walk In", status: "confirmed" });
    expect(guest.rows[0].email).toMatch(/\.invalid$/);
  });

  it("uses the existing account when a guest's email matches one", async () => {
    const sid = await createSession(db);
    const host = await createUser(db, "Host", { admin: true });
    const a = await createUser(db, "Known Player");
    await add(host, sid, { name: "Known", email: "Known.Player@example.com" });
    expect((await reg(a, sid)).status).toBe("pending_payment");
  });

  it("raises the instructional cap when adding past it", async () => {
    const sid = await createSession(db, { instructionalPriceCents: 1000 });
    await setSession(sid, `instructional_capacity = 1`);
    const host = await createUser(db, "Host", { admin: true });
    const [a, b] = await users(2);
    await signUp(a, sid, "instructional");
    await add(host, sid, { profile: b, option: "instructional" });
    const cap = await db.query<{ instructional_capacity: number }>(`select instructional_capacity from public.sessions where id = $1`, [sid]);
    expect(cap.rows[0].instructional_capacity).toBe(2);
  });

  it("is hosts only", async () => {
    const sid = await createSession(db);
    const [a, b] = await users(2);
    await expect(add(a, sid, { profile: b })).rejects.toThrow(/forbidden/);
  });

  it("Add as paid from a full waitlist makes room too", async () => {
    const sid = await createSession(db, { capacity: 1 });
    const host = await createUser(db, "Host", { admin: true });
    const [a, b] = await users(2);
    await signUp(a, sid);
    await signUp(b, sid);
    await asUser(db, host, `select public.admin_mark_paid($1)`, [(await reg(b, sid)).id]);
    expect((await reg(b, sid)).status).toBe("confirmed");
    const cap = await db.query<{ capacity: number }>(`select capacity from public.sessions where id = $1`, [sid]);
    expect(cap.rows[0].capacity).toBe(2);
  });
});

describe("bring a friend", () => {
  async function regular(name = "Regular") {
    const id = await createUser(db, name);
    await db.query(`update public.profiles set attended_before = true where id = $1`, [id]);
    return id;
  }
  const link = (user: string, regId: string, buddy: string | null) =>
    asUser(db, user, `select public.set_brought_by($1, $2)`, [regId, buddy]);

  it("a friend whose hold runs out takes the regular's discount with them", async () => {
    const sid = await createSession(db, { priceCents: 1500 });
    const r = await regular();
    const f = await createUser(db, "Friend");
    await signUp(r, sid);
    await signUp(f, sid);
    await link(f, (await reg(f, sid)).id, (await reg(r, sid)).id);
    expect(await reg(r, sid)).toMatchObject({ amount_cents: 750, friend_discount: true });

    await db.query(`update public.registrations set hold_expires_at = now() - interval '1 minute' where profile_id = $1`, [f]);
    await asService(db, `select public.run_tick()`);
    expect((await reg(f, sid)).status).toBe("expired");
    expect(await reg(r, sid)).toMatchObject({ amount_cents: 1500, friend_discount: false });
  });

  it("a waitlisted friend only counts once they get a spot", async () => {
    const sid = await createSession(db, { capacity: 2, priceCents: 1500 });
    const r = await regular();
    const [x, f] = [await createUser(db, "Other"), await createUser(db, "Friend")];
    await signUp(r, sid);
    await signUp(x, sid);
    await signUp(f, sid); // waitlisted
    await link(f, (await reg(f, sid)).id, (await reg(r, sid)).id);
    expect(await reg(r, sid)).toMatchObject({ amount_cents: 1500, friend_discount: false });
    expect(await reg(f, sid)).toMatchObject({ status: "waitlisted", amount_cents: 750 });

    await asUser(db, x, `select public.cancel_registration($1)`, [(await reg(x, sid)).id]);
    expect((await reg(f, sid)).status).toBe("pending_payment");
    expect(await reg(r, sid)).toMatchObject({ amount_cents: 750, friend_discount: true });
  });

  it("the player you name has to be a regular", async () => {
    const sid = await createSession(db);
    const [f1, f2] = [await createUser(db, "New One"), await createUser(db, "New Two")];
    await signUp(f1, sid);
    await signUp(f2, sid);
    await expect(link(f1, (await reg(f1, sid)).id, (await reg(f2, sid)).id)).rejects.toThrow(/buddy_unavailable/);
  });

  it("a regular who already paid keeps the friend rate (and the flag) when the friend cancels", async () => {
    const sid = await createSession(db, { priceCents: 1500 });
    const host = await createUser(db, "Host", { admin: true });
    const r = await regular();
    const f = await createUser(db, "Friend");
    await signUp(r, sid);
    await signUp(f, sid);
    await link(f, (await reg(f, sid)).id, (await reg(r, sid)).id);
    await asUser(db, host, `select public.admin_mark_paid($1)`, [(await reg(r, sid)).id]);
    await asUser(db, f, `select public.cancel_registration($1)`, [(await reg(f, sid)).id]);
    expect(await reg(r, sid)).toMatchObject({ status: "confirmed", amount_cents: 750, friend_discount: true });
  });
});

describe("lowering a limit", () => {
  const promote = (host: string, sid: string) =>
    asUser<{ events: Event[] }>(db, host, `select public.admin_promote($1) as events`, [sid]);

  it("moves the newest unpaid instructional sign-up to the front of the instructional waitlist", async () => {
    const sid = await createSession(db, { instructionalPriceCents: 1000 });
    const host = await createUser(db, "Host", { admin: true });
    const [a, b, c] = await users(3);
    await signUp(a, sid, "instructional");
    await signUp(b, sid, "instructional");
    await db.query(`update public.sessions set instructional_capacity = 2 where id = $1`, [sid]);
    await signUp(c, sid, "instructional"); // waitlisted
    await db.query(`update public.sessions set instructional_capacity = 1 where id = $1`, [sid]);

    const res = await promote(host, sid);
    expect(res.rows[0].events).toEqual([{ event: "waitlisted", registration_id: (await reg(b, sid)).id }]);
    expect((await reg(a, sid)).status).toBe("pending_payment");
    expect((await reg(b, sid)).status).toBe("waitlisted");
    // b goes back in line ahead of c, who was already waiting.
    const line = await db.query<{ profile_id: string }>(
      `select profile_id from public.registrations where session_id = $1 and status = 'waitlisted' order by queued_at`,
      [sid],
    );
    expect(line.rows.map((r) => r.profile_id)).toEqual([b, c]);
  });

  it("never bumps paid players when the drop-in spots go down", async () => {
    const sid = await createSession(db, { capacity: 3 });
    const host = await createUser(db, "Host", { admin: true });
    const [a, b, c] = await users(3);
    for (const u of [a, b, c]) await signUp(u, sid);
    await asUser(db, host, `select public.admin_mark_paid($1)`, [(await reg(a, sid)).id]);
    await asUser(db, host, `select public.admin_mark_paid($1)`, [(await reg(b, sid)).id]);
    await db.query(`update public.sessions set capacity = 1 where id = $1`, [sid]);

    await promote(host, sid);
    expect((await reg(c, sid)).status).toBe("waitlisted");
    expect((await reg(a, sid)).status).toBe("confirmed");
    expect((await reg(b, sid)).status).toBe("confirmed");
  });
});

describe("guests", () => {
  it("don't count as new players in the stats", async () => {
    const host = await createUser(db, "Host", { admin: true });
    const sid = await createSession(db);
    await asUser(db, host, `select public.admin_add_player($1, null, 'Walk In', null, 'full', true)`, [sid]);
    // The session has happened.
    await db.query(`update public.sessions set starts_at = now() - interval '2 days', ends_at = now() - interval '1 day' where id = $1`, [sid]);
    const s = await asUser<{ s: { players: { new: number } } }>(
      db,
      host,
      `select public.admin_stats(now() - interval '30 days', now() + interval '30 days') as s`,
    );
    expect(s.rows[0].s.players.new).toBe(0);
  });
});

describe("email preferences", () => {
  it("default to every optional email on", async () => {
    const a = await createUser(db, "A");
    const res = await db.query(
      `select announcement_emails, email_updates, email_session_open, email_reminders from public.profiles where id = $1`,
      [a],
    );
    expect(res.rows[0]).toEqual({ announcement_emails: true, email_updates: true, email_session_open: true, email_reminders: true });
  });

  it("players can change their own", async () => {
    const a = await createUser(db, "A");
    await asUser(db, a, `update public.profiles set email_session_open = false where id = $1`, [a]);
    const res = await db.query<{ email_session_open: boolean }>(`select email_session_open from public.profiles where id = $1`, [a]);
    expect(res.rows[0].email_session_open).toBe(false);
  });
});
