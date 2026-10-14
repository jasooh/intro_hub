import { beforeEach, describe, expect, it } from "vitest";
import { asService, asUser, createDb, createSession, createUser, type Db, type Event } from "./db-harness";

let db: Db;

beforeEach(async () => {
  db = await createDb();
});

async function register(userId: string, sessionId: string) {
  const res = await asUser<{ events: Event[] }>(
    db,
    userId,
    `select public.register_for_session($1) as events`,
    [sessionId],
  );
  return res.rows[0].events;
}

async function statuses(sessionId: string) {
  const res = await db.query<{ status: string; n: number }>(
    `select status::text, count(*)::int as n from public.registrations where session_id = $1 group by status`,
    [sessionId],
  );
  return Object.fromEntries(res.rows.map((r) => [r.status, r.n]));
}

async function regOf(userId: string, sessionId: string) {
  const res = await db.query<{ id: string; status: string; refund_owed: boolean }>(
    `select id, status::text, refund_owed from public.registrations
      where profile_id = $1 and session_id = $2 order by created_at desc limit 1`,
    [userId, sessionId],
  );
  return res.rows[0];
}

describe("profiles", () => {
  it("creates a profile from Google metadata on sign-up", async () => {
    const id = await createUser(db, "Jane Doe");
    const res = await db.query<{ display_name: string; etransfer_names: string[]; role: string }>(
      `select display_name, etransfer_names, role::text from public.profiles where id = $1`,
      [id],
    );
    expect(res.rows[0]).toEqual({ display_name: "Jane Doe", etransfer_names: ["Jane Doe"], role: "player" });
  });

  it("players cannot make themselves admin", async () => {
    const id = await createUser(db, "Sneaky");
    await expect(
      asUser(db, id, `update public.profiles set role = 'admin' where id = $1`, [id]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, id, `select public.admin_set_role($1, 'admin')`, [id]),
    ).rejects.toThrow(/forbidden/);
  });
});

describe("register_for_session", () => {
  it("fills capacity, then waitlists, and never double-books a player", async () => {
    const sid = await createSession(db, { capacity: 2 });
    const [a, b, c] = [await createUser(db, "A"), await createUser(db, "B"), await createUser(db, "C")];

    expect((await register(a, sid))[0].event).toBe("signed_up");
    expect(await register(a, sid)).toEqual([]); // idempotent
    expect((await register(b, sid))[0].event).toBe("signed_up");
    expect((await register(c, sid))[0].event).toBe("waitlisted");
    expect(await statuses(sid)).toEqual({ pending_payment: 2, waitlisted: 1 });
  });

  it("handles a burst of sign-ups without overbooking", async () => {
    const sid = await createSession(db, { capacity: 12 });
    const users = [];
    for (let i = 0; i < 50; i++) users.push(await createUser(db, `Player ${i}`));
    await Promise.all(users.map((u) => register(u, sid)));
    expect(await statuses(sid)).toEqual({ pending_payment: 12, waitlisted: 38 });

    const attendees = await asUser<{ waitlist_position: number | null }>(
      db,
      users[0],
      `select waitlist_position from public.get_session_attendees($1) where status = 'waitlisted'`,
      [sid],
    );
    expect(attendees.rows.map((r) => r.waitlist_position)).toEqual(
      Array.from({ length: 38 }, (_, i) => i + 1),
    );
  });

  it("rejects sign-ups before they open and for anonymous users", async () => {
    const sid = await createSession(db, { opensInMinutes: 30 });
    const a = await createUser(db, "Early");
    await expect(register(a, sid)).rejects.toThrow(/signups_not_open/);
    await expect(
      asUser(db, null, `select public.register_for_session($1)`, [sid]),
    ).rejects.toThrow(/permission denied/);
  });

  it("confirms immediately when the session is free", async () => {
    const sid = await createSession(db, { priceCents: 0 });
    const a = await createUser(db, "Free");
    expect((await register(a, sid))[0].event).toBe("confirmed");
  });
});

describe("cancel + promotion", () => {
  it("promotes the next waitlister and owes a refund when cancelling before the cutoff", async () => {
    const sid = await createSession(db, { capacity: 1 });
    const a = await createUser(db, "A");
    const b = await createUser(db, "B");
    await register(a, sid);
    await register(b, sid);
    const regA = await regOf(a, sid);
    await db.query(`update public.registrations set status = 'confirmed' where id = $1`, [regA.id]);

    const res = await asUser<{ events: Event[] }>(db, a, `select public.cancel_registration($1) as events`, [regA.id]);
    expect(res.rows[0].events).toEqual([{ event: "promoted", registration_id: (await regOf(b, sid)).id }]);
    expect((await regOf(a, sid)).refund_owed).toBe(true);
    expect((await regOf(b, sid)).status).toBe("pending_payment");
  });

  it("players cannot cancel someone else", async () => {
    const sid = await createSession(db);
    const a = await createUser(db, "A");
    const b = await createUser(db, "B");
    await register(a, sid);
    const regA = await regOf(a, sid);
    await expect(
      asUser(db, b, `select public.cancel_registration($1)`, [regA.id]),
    ).rejects.toThrow(/forbidden/);
  });

  it("a player can sign up again after cancelling", async () => {
    const sid = await createSession(db);
    const a = await createUser(db, "A");
    await register(a, sid);
    await asUser(db, a, `select public.cancel_registration($1)`, [(await regOf(a, sid)).id]);
    expect((await register(a, sid))[0].event).toBe("signed_up");
  });
});

describe("run_tick", () => {
  it("expires unpaid holds and promotes the waitlist", async () => {
    const sid = await createSession(db, { capacity: 1 });
    const a = await createUser(db, "A");
    const b = await createUser(db, "B");
    await register(a, sid);
    await register(b, sid);
    await db.query(
      `update public.registrations set hold_expires_at = now() - interval '1 minute' where profile_id = $1`,
      [a],
    );
    const res = await asService<{ events: Event[] }>(db, `select public.run_tick() as events`);
    expect(res.rows[0].events.map((e) => e.event)).toEqual(["expired", "promoted"]);
    expect((await regOf(a, sid)).status).toBe("expired");
    expect((await regOf(b, sid)).status).toBe("pending_payment");
  });

  it("sends reminders once, for confirmed players only", async () => {
    const sid = await createSession(db, { startsInHours: 20 });
    const a = await createUser(db, "A");
    const b = await createUser(db, "B");
    await register(a, sid);
    await register(b, sid);
    await db.query(`update public.registrations set status = 'confirmed' where profile_id = $1`, [a]);

    const first = await asService<{ events: Event[] }>(db, `select public.run_tick() as events`);
    expect(first.rows[0].events).toEqual([{ event: "reminder", registration_id: (await regOf(a, sid)).id }]);
    const second = await asService<{ events: Event[] }>(db, `select public.run_tick() as events`);
    expect(second.rows[0].events).toEqual([]);
  });

  it("creates the next weekly session from a template exactly once", async () => {
    await db.query(
      `insert into public.session_templates (weekday, start_time, location, capacity, price_cents, timezone)
       values (extract(dow from now() at time zone 'America/Toronto' + interval '3 days')::int, '18:00', 'Gym', 12, 1000, 'America/Toronto')`,
    );
    await asService(db, `select public.run_tick()`);
    await asService(db, `select public.run_tick()`);
    const res = await db.query<{ n: number; local_time: string }>(
      `select count(*)::int as n, min(to_char(starts_at at time zone 'America/Toronto', 'HH24:MI')) as local_time
         from public.sessions`,
    );
    expect(res.rows[0]).toEqual({ n: 1, local_time: "18:00" });
  });

  it("is not callable by players", async () => {
    const a = await createUser(db, "A");
    await expect(asUser(db, a, `select public.run_tick()`)).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, a, `select public.ingest_apply_payment(gen_random_uuid(), gen_random_uuid(), 'ref')`),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("payments", () => {
  it("auto-applies only to pending registrations", async () => {
    const sid = await createSession(db, { capacity: 1 });
    const a = await createUser(db, "A");
    const b = await createUser(db, "B");
    await register(a, sid);
    await register(b, sid);
    const pay = await db.query<{ id: string }>(
      `insert into public.payments (gmail_message_id, sender_name, amount_cents) values ('m1', 'B', 1000) returning id`,
    );
    const waitlisted = await asService<{ events: Event[] | null }>(
      db,
      `select public.ingest_apply_payment($1, $2, 'ref') as events`,
      [pay.rows[0].id, (await regOf(b, sid)).id],
    );
    expect(waitlisted.rows[0].events).toBeNull();

    const ok = await asService<{ events: Event[] }>(
      db,
      `select public.ingest_apply_payment($1, $2, 'ref') as events`,
      [pay.rows[0].id, (await regOf(a, sid)).id],
    );
    expect(ok.rows[0].events[0].event).toBe("confirmed");
    expect((await regOf(a, sid)).status).toBe("confirmed");
  });

  it("admin can mark paid; players cannot", async () => {
    const sid = await createSession(db);
    const admin = await createUser(db, "Host", { admin: true });
    const a = await createUser(db, "A");
    await register(a, sid);
    const regA = await regOf(a, sid);
    await expect(asUser(db, a, `select public.admin_mark_paid($1)`, [regA.id])).rejects.toThrow(/forbidden/);
    await asUser(db, admin, `select public.admin_mark_paid($1)`, [regA.id]);
    expect((await regOf(a, sid)).status).toBe("confirmed");
  });
});

describe("row level security", () => {
  it("players only see their own registrations and no payments", async () => {
    const sid = await createSession(db);
    const a = await createUser(db, "A");
    const b = await createUser(db, "B");
    await register(a, sid);
    await register(b, sid);

    const regs = await asUser<{ profile_id: string }>(db, a, `select profile_id from public.registrations`);
    expect(regs.rows.map((r) => r.profile_id)).toEqual([a]);
    const pays = await asUser(db, a, `select * from public.payments`);
    expect(pays.rows).toEqual([]);
    const profiles = await asUser<{ id: string }>(db, a, `select id from public.profiles`);
    expect(profiles.rows.map((r) => r.id)).toEqual([a]);
  });

  it("attendee list needs a login and exposes no private fields", async () => {
    const sid = await createSession(db);
    const a = await createUser(db, "A");
    await register(a, sid);
    const anon = await asUser(db, null, `select * from public.get_session_counts(array[$1::uuid])`, [sid]);
    expect(anon.rows).toHaveLength(1);
    await expect(
      asUser(db, null, `select * from public.get_session_attendees($1)`, [sid]),
    ).rejects.toThrow(/permission denied/);
    const seen = await asUser<Record<string, unknown>>(db, a, `select * from public.get_session_attendees($1)`, [sid]);
    expect(Object.keys(seen.rows[0]).sort()).toEqual(
      ["avatar_url", "display_name", "is_me", "option", "registration_id", "status", "team_id", "waitlist_position"],
    );
  });

  it("admins see everything", async () => {
    const sid = await createSession(db);
    const admin = await createUser(db, "Host", { admin: true });
    const a = await createUser(db, "A");
    await register(a, sid);
    const regs = await asUser(db, admin, `select * from public.registrations`);
    expect(regs.rows).toHaveLength(1);
  });
});

describe("instructional-only option", () => {
  async function registerAs(userId: string, sessionId: string, option: string, note: string | null = null) {
    const res = await asUser<{ events: Event[] }>(
      db,
      userId,
      `select public.register_for_session($1, $2, $3) as events`,
      [sessionId, option, note],
    );
    return res.rows[0].events;
  }
  async function switchTo(userId: string, regId: string, option: string) {
    const res = await asUser<{ events: Event[] }>(
      db,
      userId,
      `select public.change_registration_option($1, $2) as events`,
      [regId, option],
    );
    return res.rows[0].events;
  }
  async function reg(userId: string, sessionId: string) {
    const res = await db.query<{ id: string; status: string; option: string; amount_cents: number; note: string | null }>(
      `select id, status::text, option, amount_cents, note from public.registrations
        where profile_id = $1 and session_id = $2 order by created_at desc limit 1`,
      [userId, sessionId],
    );
    return res.rows[0];
  }

  it("doesn't use a spot, never waitlists, and owes the instructional price", async () => {
    const sid = await createSession(db, { capacity: 1, priceCents: 1500, instructionalPriceCents: 1000 });
    const [a, b, c] = [await createUser(db, "A"), await createUser(db, "B"), await createUser(db, "C")];
    await registerAs(a, sid, "full");
    expect((await registerAs(b, sid, "instructional", "  first time!  "))[0].event).toBe("signed_up");
    expect((await registerAs(c, sid, "full"))[0].event).toBe("waitlisted");

    expect(await reg(b, sid)).toMatchObject({ status: "pending_payment", option: "instructional", amount_cents: 1000, note: "first time!" });
    expect((await reg(a, sid)).amount_cents).toBe(1500);
    const counts = await asUser<{ confirmed: number; holding: number; waitlisted: number; instructional: number }>(
      db,
      a,
      `select confirmed, holding, waitlisted, instructional from public.get_session_counts(array[$1::uuid])`,
      [sid],
    );
    expect(counts.rows[0]).toEqual({ confirmed: 0, holding: 1, waitlisted: 1, instructional: 1 });
  });

  it("is refused when the session has no instructional price", async () => {
    const sid = await createSession(db);
    const a = await createUser(db, "A");
    await expect(registerAs(a, sid, "instructional")).rejects.toThrow(/option_unavailable/);
  });

  it("switching full -> instructional frees the spot for the next waitlister", async () => {
    const sid = await createSession(db, { capacity: 1, priceCents: 1500, instructionalPriceCents: 1000 });
    const [a, b] = [await createUser(db, "A"), await createUser(db, "B")];
    await registerAs(a, sid, "full");
    await registerAs(b, sid, "full");
    const events = await switchTo(a, (await reg(a, sid)).id, "instructional");
    expect(events).toEqual([{ event: "promoted", registration_id: (await reg(b, sid)).id }]);
    expect(await reg(a, sid)).toMatchObject({ status: "pending_payment", option: "instructional", amount_cents: 1000 });
    expect((await reg(b, sid)).status).toBe("pending_payment");
  });

  it("switching instructional -> full needs a spot, otherwise waitlists", async () => {
    const sid = await createSession(db, { capacity: 1, priceCents: 1500, instructionalPriceCents: 1000 });
    const [a, b] = [await createUser(db, "A"), await createUser(db, "B")];
    await registerAs(a, sid, "instructional");
    await registerAs(b, sid, "full");
    expect(await switchTo(a, (await reg(a, sid)).id, "full")).toEqual([
      { event: "waitlisted", registration_id: (await reg(a, sid)).id },
    ]);
    expect(await reg(a, sid)).toMatchObject({ status: "waitlisted", option: "full", amount_cents: 1500 });
  });

  it("can't switch once paid, or someone else's sign-up", async () => {
    const sid = await createSession(db, { priceCents: 1500, instructionalPriceCents: 1000 });
    const [a, b] = [await createUser(db, "A"), await createUser(db, "B")];
    await registerAs(a, sid, "full");
    const id = (await reg(a, sid)).id;
    await expect(switchTo(b, id, "instructional")).rejects.toThrow(/forbidden/);
    await db.query(`update public.registrations set status = 'confirmed' where id = $1`, [id]);
    await expect(switchTo(a, id, "instructional")).rejects.toThrow(/option_locked/);
  });

  it("admin mark-paid records the registration's own amount", async () => {
    const sid = await createSession(db, { priceCents: 1500, instructionalPriceCents: 1000 });
    const admin = await createUser(db, "Host", { admin: true });
    const a = await createUser(db, "A");
    await registerAs(a, sid, "instructional");
    await asUser(db, admin, `select public.admin_mark_paid($1)`, [(await reg(a, sid)).id]);
    const paid = await db.query<{ amount_cents: number }>(`select amount_cents from public.payments`);
    expect(paid.rows[0].amount_cents).toBe(1000);
    expect((await reg(a, sid)).status).toBe("confirmed");
  });
});

describe("profile completeness", () => {
  it("sign-up needs a completed profile (name, phone, skill, waiver...)", async () => {
    const sid = await createSession(db);
    const a = await createUser(db, "New", { incomplete: true });
    await expect(register(a, sid)).rejects.toThrow(/profile_incomplete/);
  });

  it("players can fill in their own profile fields but not someone else's", async () => {
    const [a, b] = [await createUser(db, "A", { incomplete: true }), await createUser(db, "B")];
    await asUser(
      db,
      a,
      `update public.profiles set first_name = 'Ann', phone = '555', waiver_accepted_at = now() where id = $1`,
      [a],
    );
    const res = await db.query<{ first_name: string }>(`select first_name from public.profiles where id = $1`, [a]);
    expect(res.rows[0].first_name).toBe("Ann");
    const other = await asUser(db, a, `update public.profiles set phone = 'x' where id = $1`, [b]);
    expect(other.affectedRows).toBe(0);
  });
});

describe("teams", () => {
  async function setup() {
    const sid = await createSession(db, { priceCents: 1500, instructionalPriceCents: 1000 });
    const admin = await createUser(db, "Host", { admin: true });
    const a = await createUser(db, "A");
    const b = await createUser(db, "B");
    await register(a, sid);
    await register(b, sid);
    const team = await asUser<{ id: string }>(
      db,
      admin,
      `insert into public.session_teams (session_id, name, position) values ($1, 'Spikers', 0) returning id`,
      [sid],
    );
    const teamId = team.rows[0].id;
    const regA = await regOf(a, sid);
    await asUser(db, admin, `update public.registrations set team_id = $1 where id = $2`, [teamId, regA.id]);
    return { sid, admin, a, b, teamId, regA };
  }

  it("are hidden from players until the host publishes them", async () => {
    const { sid, admin, a, teamId } = await setup();
    const hidden = await asUser<{ team_id: string | null }>(db, a, `select team_id from public.get_session_attendees($1)`, [sid]);
    expect(hidden.rows.every((r) => r.team_id === null)).toBe(true);
    expect((await asUser(db, a, `select * from public.session_teams`)).rows).toHaveLength(0);

    await asUser(db, admin, `update public.sessions set teams_published_at = now() where id = $1`, [sid]);
    const shown = await asUser<{ team_id: string | null; is_me: boolean }>(
      db,
      a,
      `select team_id, is_me from public.get_session_attendees($1)`,
      [sid],
    );
    expect(shown.rows.find((r) => r.is_me)?.team_id).toBe(teamId);
    expect((await asUser(db, a, `select name from public.session_teams`)).rows).toEqual([{ name: "Spikers" }]);
  });

  it("only hosts can create teams or move players", async () => {
    const { sid, b, teamId } = await setup();
    await expect(
      asUser(db, b, `insert into public.session_teams (session_id, name) values ($1, 'Mine')`, [sid]),
    ).rejects.toThrow(/row-level security/);
    const regB = await regOf(b, sid);
    const res = await asUser(db, b, `update public.registrations set team_id = $1 where id = $2`, [teamId, regB.id]);
    expect(res.affectedRows).toBe(0);
  });

  it("switching to instructional-only or cancelling drops the team", async () => {
    const { a, regA, sid } = await setup();
    await asUser(db, a, `select public.change_registration_option($1, 'instructional')`, [regA.id]);
    const after = await db.query<{ team_id: string | null }>(`select team_id from public.registrations where id = $1`, [regA.id]);
    expect(after.rows[0].team_id).toBeNull();
    expect((await regOf(a, sid)).status).toBe("pending_payment");
  });
});

describe("deleting an account", () => {
  it("removes the profile and sign-ups but keeps payments, unlinked", async () => {
    const sid = await createSession(db);
    const admin = await createUser(db, "Host", { admin: true });
    const a = await createUser(db, "Rude Name");
    await register(a, sid);
    const reg = await regOf(a, sid);
    await asUser(db, admin, `select public.admin_mark_paid($1)`, [reg.id]);

    await db.query(`delete from auth.users where id = $1`, [a]);

    const profiles = await db.query(`select 1 from public.profiles where id = $1`, [a]);
    const regs = await db.query(`select 1 from public.registrations where profile_id = $1`, [a]);
    const payments = await db.query<{ registration_id: string | null }>(`select registration_id from public.payments`);
    expect(profiles.rows).toHaveLength(0);
    expect(regs.rows).toHaveLength(0);
    expect(payments.rows).toEqual([{ registration_id: null }]);
  });
});
