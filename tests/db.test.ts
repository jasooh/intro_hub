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
    // Paid in full (refunds follow what was actually paid).
    await db.query(`insert into public.payments (sender_name, amount_cents, registration_id) values ('A', 1000, $1)`, [regA.id]);
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

describe("cancelling a session with a reason", () => {
  it("stores the host's message, trimmed, and cancels everyone", async () => {
    const sid = await createSession(db);
    const admin = await createUser(db, "Host", { admin: true });
    const a = await createUser(db, "A");
    await register(a, sid);
    const res = await asUser<{ events: Event[] }>(
      db,
      admin,
      `select public.admin_cancel_session($1, $2) as events`,
      [sid, "  Gym double-booked, sorry!  "],
    );
    expect(res.rows[0].events).toHaveLength(1);
    const s = await db.query<{ status: string; cancel_reason: string }>(
      `select status, cancel_reason from public.sessions where id = $1`,
      [sid],
    );
    expect(s.rows[0]).toEqual({ status: "cancelled", cancel_reason: "Gym double-booked, sorry!" });
  });

  it("works without a reason, and players can't call it", async () => {
    const sid = await createSession(db);
    const admin = await createUser(db, "Host", { admin: true });
    const a = await createUser(db, "A");
    await expect(asUser(db, a, `select public.admin_cancel_session($1)`, [sid])).rejects.toThrow(/forbidden/);
    await asUser(db, admin, `select public.admin_cancel_session($1)`, [sid]);
    const s = await db.query<{ cancel_reason: string | null }>(`select cancel_reason from public.sessions where id = $1`, [sid]);
    expect(s.rows[0].cancel_reason).toBeNull();
  });
});

describe("sign-up rate limits", () => {
  async function cancelOwn(userId: string, sessionId: string) {
    const reg = await regOf(userId, sessionId);
    await asUser(db, userId, `select public.cancel_registration($1)`, [reg.id]);
  }

  it("stops a player rejoining the same session after 3 sign-ups", async () => {
    const sid = await createSession(db);
    const a = await createUser(db, "A");
    for (let i = 0; i < 3; i++) {
      expect(await register(a, sid)).toHaveLength(1);
      if (i < 2) await cancelOwn(a, sid);
    }
    await cancelOwn(a, sid);
    await expect(register(a, sid)).rejects.toThrow(/too_many_signups/);
  });

  it("caps sign-up bursts across sessions at 10 an hour", async () => {
    const a = await createUser(db, "A");
    for (let i = 0; i < 10; i++) await register(a, await createSession(db));
    await expect(register(a, await createSession(db))).rejects.toThrow(/slow_down/);
    // Older sign-ups fall out of the window.
    await asService(db, `update public.registrations set created_at = now() - interval '2 hours'`);
    expect(await register(a, await createSession(db))).toHaveLength(1);
  });

  it("doesn't limit hosts", async () => {
    const sid = await createSession(db);
    const host = await createUser(db, "Host", { admin: true });
    for (let i = 0; i < 4; i++) {
      await register(host, sid);
      await cancelOwn(host, sid);
    }
    expect(await register(host, sid)).toHaveLength(1);
  });
});

describe("editing a session updates existing holds", () => {
  async function holdOf(regId: string) {
    const res = await db.query<{ hours: number; status: string }>(
      `select round(extract(epoch from hold_expires_at - now()) / 3600, 2)::float as hours, status::text
         from public.registrations where id = $1`,
      [regId],
    );
    return res.rows[0];
  }

  it("moves the deadline when the payment window changes", async () => {
    const sid = await createSession(db); // 12h window
    const a = await createUser(db, "A");
    await register(a, sid);
    const reg = await regOf(a, sid);
    expect((await holdOf(reg.id)).hours).toBeCloseTo(12, 1);

    await asService(db, `update public.sessions set hold_hours = 1 where id = $1`, [sid]);
    expect((await holdOf(reg.id)).hours).toBeCloseTo(1, 1);

    await asService(db, `update public.sessions set hold_hours = 24 where id = $1`, [sid]);
    expect((await holdOf(reg.id)).hours).toBeCloseTo(24, 1);
  });

  it("gives 30 minutes instead of expiring instantly when the window shrinks", async () => {
    const sid = await createSession(db);
    const a = await createUser(db, "A");
    await register(a, sid);
    const reg = await regOf(a, sid);
    // Hold started 11 hours ago (1 hour left of 12).
    await asService(db, `update public.registrations set hold_expires_at = now() + interval '1 hour' where id = $1`, [reg.id]);
    await asService(db, `update public.sessions set hold_hours = 2 where id = $1`, [sid]);
    expect((await holdOf(reg.id)).hours).toBeCloseTo(0.5, 1);
  });

  it("never lets a hold run past a session that moved earlier, and leaves paid spots alone", async () => {
    const sid = await createSession(db, { startsInHours: 72 });
    const a = await createUser(db, "A");
    const b = await createUser(db, "B");
    await register(a, sid);
    await register(b, sid);
    const regA = await regOf(a, sid);
    const regB = await regOf(b, sid);
    const host = await createUser(db, "Host", { admin: true });
    await asUser(db, host, `select public.admin_mark_paid($1)`, [regB.id]);

    await asService(db, `update public.sessions set starts_at = now() + interval '5 hours' where id = $1`, [sid]);
    expect((await holdOf(regA.id)).hours).toBeCloseTo(5, 1);
    expect(await holdOf(regB.id)).toEqual({ hours: null, status: "confirmed" });
  });
});

describe("updates board posts", () => {
  async function addPost(published: boolean, featured = false) {
    const res = await asService<{ id: string }>(
      db,
      `insert into public.posts (title, body_html, published_at, featured)
       values ('Hello', '<p>Hi</p>', $1, $2) returning id`,
      [published ? new Date().toISOString() : null, featured],
    );
    return res.rows[0].id;
  }

  it("shows published posts to everyone, drafts only to hosts", async () => {
    await addPost(true);
    await addPost(false);
    const player = await createUser(db, "P");
    const host = await createUser(db, "H", { admin: true });
    const count = async (who: string | null) =>
      (await asUser<{ n: number }>(db, who, `select count(*)::int as n from public.posts`)).rows[0].n;
    expect(await count(null)).toBe(1);
    expect(await count(player)).toBe(1);
    expect(await count(host)).toBe(2);
  });

  it("only hosts can write posts", async () => {
    const player = await createUser(db, "P");
    const host = await createUser(db, "H", { admin: true });
    await expect(
      asUser(db, player, `insert into public.posts (title) values ('Nope')`),
    ).rejects.toThrow();
    await asUser(db, host, `insert into public.posts (title) values ('Yes')`);
    const n = await db.query<{ n: number }>(`select count(*)::int as n from public.posts`);
    expect(n.rows[0].n).toBe(1);
  });

  it("allows only one featured post", async () => {
    await addPost(true, true);
    await expect(addPost(true, true)).rejects.toThrow(/posts_one_featured/);
  });

  it("players get announcement emails by default and can opt out", async () => {
    const player = await createUser(db, "P");
    const before = await db.query<{ on: boolean }>(`select announcement_emails as on from public.profiles where id = $1`, [player]);
    expect(before.rows[0].on).toBe(true);
    await asUser(db, player, `update public.profiles set announcement_emails = false where id = auth.uid()`);
    const after = await db.query<{ on: boolean }>(`select announcement_emails as on from public.profiles where id = $1`, [player]);
    expect(after.rows[0].on).toBe(false);
  });
});

describe("team requests", () => {
  async function signUp(userId: string, sessionId: string, option = "full") {
    const res = await asUser<{ events: Event[] }>(db, userId, `select public.register_for_session($1, $2) as events`, [
      sessionId,
      option,
    ]);
    return res.rows[0].events[0].registration_id;
  }
  const setRequests = (userId: string, regId: string, targets: string[]) =>
    asUser(db, userId, `select public.set_team_requests($1, $2::uuid[])`, [regId, targets]);
  const requestsOf = async (regId: string) =>
    (
      await db.query<{ requested_id: string }>(
        `select requested_id from public.team_requests where registration_id = $1 order by requested_id`,
        [regId],
      )
    ).rows.map((r) => r.requested_id);

  it("lets a player pick up to five teammates (a whole team) and replaces the set each time", async () => {
    const sid = await createSession(db, { instructionalPriceCents: 500 });
    const users = await Promise.all(["A", "B", "C", "D", "E", "F", "G"].map((n) => createUser(db, n)));
    const regs: string[] = [];
    for (const u of users) regs.push(await signUp(u, sid));
    const [a] = users;
    const [ra, rb, rc, rd] = regs;

    await setRequests(a, ra, regs.slice(1, 6));
    expect(await requestsOf(ra)).toHaveLength(5);
    await expect(setRequests(a, ra, regs.slice(1, 7))).rejects.toThrow(/too_many_teammates/);

    await setRequests(a, ra, [rb, rc]);
    expect(await requestsOf(ra)).toEqual([rb, rc].sort());
    await setRequests(a, ra, [rd]);
    expect(await requestsOf(ra)).toEqual([rd]);
    await setRequests(a, ra, []);
    expect(await requestsOf(ra)).toEqual([]);
  });

  it("rejects self, other sessions, instructional-only players and other people's sign-ups", async () => {
    const sid = await createSession(db, { instructionalPriceCents: 500 });
    const other = await createSession(db);
    const [a, b, c, e] = await Promise.all(["A", "B", "C", "E"].map((n) => createUser(db, n)));
    const ra = await signUp(a, sid);
    const rb = await signUp(b, sid);
    const rcInstr = await signUp(c, sid, "instructional");
    const reOther = await signUp(e, other);

    await expect(setRequests(a, ra, [ra])).rejects.toThrow(/teammate_unavailable/);
    await expect(setRequests(a, ra, [reOther])).rejects.toThrow(/teammate_unavailable/);
    await expect(setRequests(a, ra, [rcInstr])).rejects.toThrow(/teammate_unavailable/);
    await expect(setRequests(b, ra, [rb])).rejects.toThrow(/forbidden/);
    await expect(setRequests(c, rcInstr, [ra])).rejects.toThrow(/teammate_unavailable/);
  });

  it("players only see their own requests; hosts see all; rows go when a sign-up is deleted", async () => {
    const sid = await createSession(db);
    const [a, b] = await Promise.all(["A", "B"].map((n) => createUser(db, n)));
    const host = await createUser(db, "H", { admin: true });
    const ra = await signUp(a, sid);
    const rb = await signUp(b, sid);
    await setRequests(a, ra, [rb]);
    const visible = async (who: string) =>
      (await asUser<{ n: number }>(db, who, `select count(*)::int as n from public.team_requests`)).rows[0].n;
    expect(await visible(a)).toBe(1);
    expect(await visible(b)).toBe(0);
    expect(await visible(host)).toBe(1);
    await expect(asUser(db, a, `insert into public.team_requests values ($1, $2)`, [rb, ra])).rejects.toThrow();

    await asService(db, `delete from public.registrations where id = $1`, [rb]);
    expect(await requestsOf(ra)).toEqual([]);
  });
});

describe("dev tools", () => {
  const DEV_ID = "00000000-0000-4000-9000-000000000001";
  async function createDevUser() {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'AbuyuanJustin@gmail.com', '{"full_name":"Dev"}')`, [
      DEV_ID,
    ]);
    return DEV_ID;
  }
  const audit = async () =>
    (await db.query<{ action: string; note: string | null }>(`select action, note from public.devtools_audit order by id`)).rows;

  it("only the dev tools account (verified) can use them; hosts and players can't", async () => {
    const devUser = await createDevUser();
    const host = await createUser(db, "Host", { admin: true });
    const player = await createUser(db, "Player");
    for (const who of [host, player]) {
      await expect(asUser(db, who, `select public.devtools_health()`)).rejects.toThrow(/devtools_only/);
      await expect(asUser(db, who, `select public.devtools_reset('RESET')`)).rejects.toThrow(/devtools_only/);
      expect((await asUser<{ n: number }>(db, who, `select count(*)::int as n from public.devtools_audit`)).rows[0].n).toBe(0);
    }
    await expect(asUser(db, null, `select public.devtools_health()`)).rejects.toThrow(/permission denied/);
    expect((await asUser<{ h: { counts: { profiles: number } } }>(db, devUser, `select public.devtools_health() as h`)).rows[0].h.counts.profiles).toBe(3);

    await db.query(`update auth.users set email_confirmed_at = null where id = $1`, [devUser]);
    await expect(asUser(db, devUser, `select public.devtools_health()`)).rejects.toThrow(/devtools_only/);
  });

  it("edits and deletes rows on allowlisted tables only, and audits each change", async () => {
    const devUser = await createDevUser();
    const sid = await createSession(db, { capacity: 4 });

    const res = await asUser<{ row: { capacity: number; notes: string | null } }>(
      db,
      devUser,
      `select public.devtools_update_row('sessions', $1, '{"capacity": 9, "notes": null}') as row`,
      [sid],
    );
    expect(res.rows[0].row.capacity).toBe(9);
    await expect(
      asUser(db, devUser, `select public.devtools_update_row('sessions', $1, '{"id": "x"}')`, [sid]),
    ).rejects.toThrow(/column_not_editable/);
    await expect(
      asUser(db, devUser, `select public.devtools_update_row('sessions', $1, '{"nope": 1}')`, [sid]),
    ).rejects.toThrow(/column_not_editable/);
    await expect(asUser(db, devUser, `select public.devtools_rows('devtools_audit')`)).rejects.toThrow(/unknown_table/);
    await expect(asUser(db, devUser, `select public.devtools_rows('pg_authid')`)).rejects.toThrow(/unknown_table/);

    const found = await asUser<{ r: { total: number } }>(db, devUser, `select public.devtools_rows('sessions', 'Gym') as r`);
    expect(found.rows[0].r.total).toBe(1);

    await asUser(db, devUser, `select public.devtools_delete_row('sessions', $1)`, [sid]);
    expect((await db.query(`select 1 from public.sessions where id = $1`, [sid])).rows).toHaveLength(0);
    expect((await audit()).map((a) => a.action)).toEqual(["update_row", "delete_row"]);
  });

  it("deleting a profile removes the account, but never your own", async () => {
    const devUser = await createDevUser();
    const p = await createUser(db, "Gone");
    await asUser(db, devUser, `select public.devtools_delete_row('profiles', $1)`, [p]);
    expect((await db.query(`select 1 from auth.users where id = $1`, [p])).rows).toHaveLength(0);
    await expect(asUser(db, devUser, `select public.devtools_delete_row('profiles', $1)`, [devUser])).rejects.toThrow(
      /cannot_delete_self/,
    );
  });

  it("forcing a sign-up out lets the waitlist move up", async () => {
    const devUser = await createDevUser();
    const sid = await createSession(db, { capacity: 1 });
    const [a, b] = [await createUser(db, "A"), await createUser(db, "B")];
    await register(a, sid);
    await register(b, sid);
    const res = await asUser<{ events: Event[] }>(db, devUser, `select public.devtools_force_status($1, 'cancelled') as events`, [
      (await regOf(a, sid)).id,
    ]);
    expect(res.rows[0].events.map((e) => e.event)).toEqual(["promoted"]);
    expect((await regOf(b, sid)).status).toBe("pending_payment");
  });

  it("reset needs the exact word and keeps accounts and the weekly schedule", async () => {
    const devUser = await createDevUser();
    const sid = await createSession(db);
    const a = await createUser(db, "A");
    await register(a, sid);
    await db.query(
      `insert into public.session_templates (weekday, start_time, location, capacity, price_cents) values (6, '20:00', 'Gym', 18, 1500)`,
    );

    await expect(asUser(db, devUser, `select public.devtools_reset('reset')`)).rejects.toThrow(/confirm_mismatch/);
    await asUser(db, devUser, `select public.devtools_reset('RESET')`);
    const n = async (t: string) => (await db.query<{ n: number }>(`select count(*)::int as n from public.${t}`)).rows[0].n;
    expect(await n("sessions")).toBe(0);
    expect(await n("registrations")).toBe(0);
    expect(await n("profiles")).toBe(2);
    expect(await n("session_templates")).toBe(1);

    await asUser(db, devUser, `select public.devtools_reset('RESET', true)`);
    expect(await n("profiles")).toBe(1);
    expect((await audit()).map((x) => x.action)).toEqual(["reset", "reset"]);
  });

  it("maintenance mode pauses sign-ups and option switches for players, not cancelling or hosts", async () => {
    const devUser = await createDevUser();
    const sid = await createSession(db, { instructionalPriceCents: 500 });
    const [a, b] = [await createUser(db, "A"), await createUser(db, "B")];
    const host = await createUser(db, "Host", { admin: true });
    await register(a, sid);
    const ra = (await regOf(a, sid)).id;

    await asUser(db, devUser, `select public.devtools_set_maintenance(true, 'Fixing payments')`);
    const banner = await asUser<{ value: { on: boolean; message: string } }>(
      db,
      null,
      `select value from public.app_settings where key = 'maintenance'`,
    );
    expect(banner.rows[0].value).toEqual({ on: true, message: "Fixing payments" });

    await expect(register(b, sid)).rejects.toThrow(/maintenance/);
    await expect(
      asUser(db, a, `select public.change_registration_option($1, 'instructional')`, [ra]),
    ).rejects.toThrow(/maintenance/);
    expect((await register(host, sid))[0].event).toBe("signed_up");
    await asUser(db, a, `select public.cancel_registration($1)`, [ra]);
    expect((await regOf(a, sid)).status).toBe("cancelled");

    await asUser(db, devUser, `select public.devtools_set_maintenance(false)`);
    expect((await register(b, sid))[0].event).toBe("signed_up");
  });

  it("backs up every table and can release an email so it sends again", async () => {
    const devUser = await createDevUser();
    await db.query(`insert into public.email_log (dedupe_key, kind) values ('announcement:x', 'announcement')`);
    const backup = await asUser<{ b: Record<string, unknown[]> }>(db, devUser, `select public.devtools_backup() as b`);
    expect(Object.keys(backup.rows[0].b)).toContain("registrations");
    expect(backup.rows[0].b.email_log).toHaveLength(1);

    const id = (await db.query<{ id: number }>(`select id from public.email_log`)).rows[0].id;
    await asUser(db, devUser, `select public.devtools_release_email($1)`, [id]);
    expect((await db.query(`select 1 from public.email_log`)).rows).toHaveLength(0);
  });
});

describe("rejoining after a paid cancel", () => {
  async function payAndCancel(userId: string, sessionId: string) {
    const host = await createUser(db, `Host ${userId.slice(-4)}`, { admin: true });
    const reg = await regOf(userId, sessionId);
    await asUser(db, host, `select public.admin_mark_paid($1)`, [reg.id]);
    await asUser(db, userId, `select public.cancel_registration($1)`, [reg.id]);
    return reg.id;
  }
  const paymentsOf = async (regId: string) =>
    (await db.query<{ n: number }>(`select count(*)::int as n from public.payments where registration_id = $1`, [regId])).rows[0].n;

  it("confirms right away using the earlier payment, which stops being a refund owed", async () => {
    const sid = await createSession(db);
    const a = await createUser(db, "A");
    await register(a, sid);
    const oldId = await payAndCancel(a, sid);
    expect((await regOf(a, sid)).refund_owed).toBe(true);

    const events = await register(a, sid);
    expect(events.map((e) => e.event)).toEqual(["confirmed"]);
    const fresh = await regOf(a, sid);
    expect(fresh.status).toBe("confirmed");
    expect(await paymentsOf(fresh.id)).toBe(1);
    expect(await paymentsOf(oldId)).toBe(0);
    const old = await db.query<{ refund_owed: boolean }>(`select refund_owed from public.registrations where id = $1`, [oldId]);
    expect(old.rows[0].refund_owed).toBe(false);
  });

  it("does nothing when the host waived the refund or it was a late cancel (no refund owed)", async () => {
    const sid = await createSession(db);
    const [a, b] = [await createUser(db, "A"), await createUser(db, "B")];

    await register(a, sid);
    const waived = await payAndCancel(a, sid);
    await db.query(`update public.registrations set refund_waived_at = now() where id = $1`, [waived]);
    expect((await register(a, sid))[0].event).toBe("signed_up");
    expect((await regOf(a, sid)).status).toBe("pending_payment");

    await register(b, sid);
    const late = await payAndCancel(b, sid);
    await db.query(`update public.registrations set refund_owed = false where id = $1`, [late]);
    expect((await register(b, sid))[0].event).toBe("signed_up");
  });

  it("does nothing once the refund was sent, or for a different option's price", async () => {
    const sid = await createSession(db, { instructionalPriceCents: 500 });
    const [a, b] = [await createUser(db, "A"), await createUser(db, "B")];

    await register(a, sid);
    const refunded = await payAndCancel(a, sid);
    await db.query(`update public.registrations set refunded_at = now() where id = $1`, [refunded]);
    expect((await register(a, sid))[0].event).toBe("signed_up");

    await register(b, sid);
    await payAndCancel(b, sid);
    await asUser(db, b, `select public.register_for_session($1, 'instructional')`, [sid]);
    expect((await regOf(b, sid)).status).toBe("pending_payment");
    // Switching back to the option they paid for uses it.
    const res = await asUser<{ events: Event[] }>(db, b, `select public.change_registration_option($1, 'full') as events`, [
      (await regOf(b, sid)).id,
    ]);
    expect(res.rows[0].events.map((e) => e.event)).toEqual(["confirmed"]);
    expect((await regOf(b, sid)).status).toBe("confirmed");
  });

  it("applies when they come off the waitlist", async () => {
    const sid = await createSession(db, { capacity: 1 });
    const [a, b] = [await createUser(db, "A"), await createUser(db, "B")];
    await register(a, sid);
    await payAndCancel(a, sid);
    await register(b, sid); // takes the freed spot
    expect((await register(a, sid))[0].event).toBe("waitlisted");

    const res = await asUser<{ events: Event[] }>(db, b, `select public.cancel_registration($1) as events`, [(await regOf(b, sid)).id]);
    expect(res.rows[0].events).toEqual([{ event: "confirmed", registration_id: (await regOf(a, sid)).id }]);
    expect((await regOf(a, sid)).status).toBe("confirmed");
  });
});

describe("game schedule", () => {
  async function setup() {
    const sid = await createSession(db);
    const host = await createUser(db, "Host", { admin: true });
    const a = await createUser(db, "A");
    const teams = await asUser<{ id: string }>(
      db,
      host,
      `insert into public.session_teams (session_id, name, position) values ($1, 'One', 0), ($1, 'Two', 1) returning id`,
      [sid],
    );
    const [t1, t2] = teams.rows.map((r) => r.id);
    await asUser(
      db,
      host,
      `insert into public.session_matches (session_id, slot, court, team_a_id, team_b_id) values ($1, 1, 1, $2, $3)`,
      [sid, t1, t2],
    );
    return { sid, host, a, t1, t2 };
  }
  const matchCount = async (who: string) =>
    (await asUser<{ n: number }>(db, who, `select count(*)::int as n from public.session_matches`)).rows[0].n;

  it("is hidden from players until the teams are published", async () => {
    const { sid, host, a } = await setup();
    expect(await matchCount(a)).toBe(0);
    expect(await matchCount(host)).toBe(1);
    await asUser(db, host, `update public.sessions set teams_published_at = now() where id = $1`, [sid]);
    expect(await matchCount(a)).toBe(1);
    await expect(asUser(db, null, `select * from public.session_matches`)).rejects.toThrow(/permission denied/);
  });

  it("only hosts can write it, and a team can't play itself", async () => {
    const { sid, host, a, t1, t2 } = await setup();
    await expect(
      asUser(db, a, `insert into public.session_matches (session_id, slot, court, team_a_id, team_b_id) values ($1, 2, 1, $2, $3)`, [
        sid,
        t1,
        t2,
      ]),
    ).rejects.toThrow(/row-level security/);
    await expect(
      asUser(db, host, `update public.session_matches set team_b_id = team_a_id`),
    ).rejects.toThrow(/check constraint/);
  });

  it("goes away with the teams, and dev tools reset still works with matches present", async () => {
    const { sid, host } = await setup();
    await asUser(db, host, `delete from public.session_teams where session_id = $1`, [sid]);
    expect(await matchCount(host)).toBe(0);

    const { host: host2 } = await setup();
    expect(await matchCount(host2)).toBe(1);
    const devUser = "00000000-0000-4000-9000-000000000002";
    await db.query(`insert into auth.users (id, email) values ($1, 'abuyuanjustin@gmail.com')`, [devUser]);
    await asUser(db, devUser, `select public.devtools_reset('RESET')`);
    expect(await matchCount(host2)).toBe(0);
  });
});

describe("partial payments", () => {
  let n = 0;
  async function pay(regId: string, cents: number) {
    n += 1;
    const p = await db.query<{ id: string }>(
      `insert into public.payments (gmail_message_id, sender_name, amount_cents) values ($1, 'X', $2) returning id`,
      [`partial-${n}`, cents],
    );
    const res = await asService<{ events: Event[] | null }>(db, `select public.ingest_apply_payment($1, $2, 'ref') as events`, [
      p.rows[0].id,
      regId,
    ]);
    return res.rows[0].events;
  }
  const row = async (id: string) =>
    (
      await db.query<{ status: string; paid_cents: number; refund_owed: boolean; hold_expires_at: Date | null }>(
        `select status::text, paid_cents, refund_owed, hold_expires_at from public.registrations where id = $1`,
        [id],
      )
    ).rows[0];

  it("adds up: a short payment holds the spot longer, the top-up confirms it", async () => {
    const sid = await createSession(db, { priceCents: 1500 });
    const a = await createUser(db, "A");
    await register(a, sid);
    const id = (await regOf(a, sid)).id;
    await db.query(`update public.registrations set hold_expires_at = now() + interval '10 minutes' where id = $1`, [id]);

    const first = await pay(id, 1000);
    expect(first?.map((e) => e.event)).toEqual(["partial_payment"]);
    let r = await row(id);
    expect(r).toMatchObject({ status: "pending_payment", paid_cents: 1000, refund_owed: false });
    expect(r.hold_expires_at!.getTime()).toBeGreaterThan(Date.now() + 5 * 3600 * 1000);

    const second = await pay(id, 500);
    expect(second?.map((e) => e.event)).toEqual(["confirmed"]);
    r = await row(id);
    expect(r).toMatchObject({ status: "confirmed", paid_cents: 1500, refund_owed: false });
  });

  it("an expired hold or a cancel owes back what was partly paid", async () => {
    const sid = await createSession(db, { priceCents: 1500 });
    const [a, b] = [await createUser(db, "A"), await createUser(db, "B")];
    await register(a, sid);
    await register(b, sid);
    const ra = (await regOf(a, sid)).id;
    const rb = (await regOf(b, sid)).id;
    await pay(ra, 500);
    await pay(rb, 700);

    await db.query(`update public.registrations set hold_expires_at = now() - interval '1 minute' where id = $1`, [ra]);
    await asService(db, `select public.run_tick()`);
    expect(await row(ra)).toMatchObject({ status: "expired", paid_cents: 500, refund_owed: true });

    await asUser(db, b, `select public.cancel_registration($1)`, [rb]);
    expect(await row(rb)).toMatchObject({ status: "cancelled", paid_cents: 700, refund_owed: true });
  });

  it("paying more than owed confirms and owes back the extra", async () => {
    const sid = await createSession(db, { priceCents: 1500 });
    const a = await createUser(db, "A");
    await register(a, sid);
    const id = (await regOf(a, sid)).id;
    expect((await pay(id, 2000))?.map((e) => e.event)).toEqual(["confirmed"]);
    expect(await row(id)).toMatchObject({ status: "confirmed", paid_cents: 2000, refund_owed: true });
  });

  it("mark paid records only what's still owed; a host's assign confirms regardless", async () => {
    const sid = await createSession(db, { priceCents: 1500 });
    const host = await createUser(db, "Host", { admin: true });
    const [a, b] = [await createUser(db, "A"), await createUser(db, "B")];
    await register(a, sid);
    await register(b, sid);
    const ra = (await regOf(a, sid)).id;
    await pay(ra, 1000);
    await asUser(db, host, `select public.admin_mark_paid($1)`, [ra]);
    const amounts = await db.query<{ amount_cents: number }>(
      `select amount_cents from public.payments where registration_id = $1 order by amount_cents`,
      [ra],
    );
    expect(amounts.rows.map((x) => x.amount_cents)).toEqual([500, 1000]);
    expect(await row(ra)).toMatchObject({ status: "confirmed", paid_cents: 1500 });

    const p = await db.query<{ id: string }>(`insert into public.payments (sender_name, amount_cents) values ('B', 800) returning id`);
    await asUser(db, host, `select public.admin_assign_payment($1, $2)`, [p.rows[0].id, (await regOf(b, sid)).id]);
    expect((await regOf(b, sid)).status).toBe("confirmed");
  });

  it("players see their own paid amount", async () => {
    const sid = await createSession(db, { priceCents: 1500 });
    const a = await createUser(db, "A");
    await register(a, sid);
    const id = (await regOf(a, sid)).id;
    await pay(id, 1000);
    const mine = await asUser<{ paid_cents: number }>(db, a, `select paid_cents from public.registrations where id = $1`, [id]);
    expect(mine.rows[0].paid_cents).toBe(1000);
  });
});
