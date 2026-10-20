import { beforeEach, describe, expect, it } from "vitest";
import { asService, asUser, createDb, createSession, createUser, type Db, type Event } from "./db-harness";

// Cancelled e-Transfers (supabase/migrations/20261107000000_payment_cancellations.sql).
describe("cancelled e-Transfers", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createDb();
  });

  const reg = async (profileId: string) =>
    (
      await db.query<{ id: string; status: string; paid_cents: number; hold_expires_at: string | null; created_at: string }>(
        `select id, status, paid_cents, hold_expires_at, created_at from public.registrations where profile_id = $1`,
        [profileId],
      )
    ).rows[0];

  /** An e-Transfer from Gmail, matched to the sign-up by its code. */
  async function pay(registrationId: string, cents = 1000, gmailId = `g-${registrationId}`) {
    const p = await db.query<{ id: string }>(
      `insert into public.payments (gmail_message_id, sender_name, amount_cents, received_at) values ($1, 'JANE DOE', $2, now()) returning id`,
      [gmailId, cents],
    );
    await asService(db, `select public.ingest_apply_payment($1, $2, 'ref')`, [p.rows[0].id, registrationId]);
    return p.rows[0].id;
  }

  /** The real email: amount and the day it was sent (today), no sender. */
  async function cancel(cents = 1000, memo: string | null = null) {
    const c = await db.query<{ id: string }>(
      `insert into public.payment_cancellations (gmail_message_id, amount_cents, memo, sent_on, received_at)
       values (gen_random_uuid()::text, $1, $2, (now() at time zone 'America/Toronto')::date, now()) returning id`,
      [cents, memo],
    );
    const res = await asService<{ events: Event[] }>(
      db,
      `select public.ingest_reverse_payment($1, 'America/Toronto') as events`,
      [c.rows[0].id],
    );
    return { id: c.rows[0].id, events: res.rows[0].events };
  }

  it("still inside the time to pay: back to holding for the rest of it, and asked to pay again", async () => {
    const sid = await createSession(db);
    const a = await createUser(db, "A");
    await asUser(db, a, `select public.register_for_session($1)`, [sid]);
    const before = await reg(a);
    const paymentId = await pay(before.id);
    expect((await reg(a)).status).toBe("confirmed");

    const { events } = await cancel();
    expect(events.map((e) => e.event)).toEqual(["payment_reversed"]);
    const after = await reg(a);
    expect(after.status).toBe("pending_payment");
    expect(after.paid_cents).toBe(0);
    // 12-hour window from when they signed up.
    expect(Date.parse(after.hold_expires_at!) - Date.parse(before.created_at)).toBeCloseTo(12 * 3600 * 1000, -4);
    const p = await db.query<{ reversed_at: string | null }>(`select reversed_at from public.payments where id = $1`, [paymentId]);
    expect(p.rows[0].reversed_at).not.toBeNull();
    const kinds = await db.query<{ kind: string }>(`select kind from public.host_activity order by id`);
    expect(kinds.rows.at(-1)!.kind).toBe("payment_reversed");
  });

  it("past the time to pay: the spot is released and the waitlist moves up", async () => {
    const sid = await createSession(db, { capacity: 1 });
    const [a, b] = [await createUser(db, "A"), await createUser(db, "B")];
    await asUser(db, a, `select public.register_for_session($1)`, [sid]);
    await pay((await reg(a)).id);
    await asUser(db, b, `select public.register_for_session($1)`, [sid]);
    expect((await reg(b)).status).toBe("waitlisted");
    // A signed up 13 hours ago (the window is 12).
    await db.query(`update public.registrations set created_at = now() - interval '13 hours' where profile_id = $1`, [a]);
    await db.query(
      `update public.host_activity set created_at = now() - interval '13 hours' where registration_id = $1 and kind = 'joined'`,
      [(await reg(a)).id],
    );

    const { events } = await cancel();
    expect(events.map((e) => e.event)).toEqual(["spot_released", "promoted"]);
    expect((await reg(a)).status).toBe("expired");
    expect((await reg(b)).status).toBe("pending_payment");
  });

  it("two payments it could be: nothing is guessed, a host picks", async () => {
    const sid = await createSession(db);
    const host = await createUser(db, "Host", { admin: true });
    const [a, b] = [await createUser(db, "A"), await createUser(db, "B")];
    await asUser(db, a, `select public.register_for_session($1)`, [sid]);
    await asUser(db, b, `select public.register_for_session($1)`, [sid]);
    await pay((await reg(a)).id);
    const paymentB = await pay((await reg(b)).id);

    const { id, events } = await cancel();
    expect(events).toEqual([]);
    const c = await db.query<{ note: string; payment_id: string | null }>(
      `select note, payment_id from public.payment_cancellations where id = $1`,
      [id],
    );
    expect(c.rows[0]).toMatchObject({ payment_id: null, note: expect.stringContaining("2 payments") });
    expect((await reg(a)).status).toBe("confirmed");

    await expect(asUser(db, a, `select public.admin_reverse_payment($1, $2)`, [id, paymentB])).rejects.toThrow(/forbidden/);
    await asUser(db, host, `select public.admin_reverse_payment($1, $2)`, [id, paymentB]);
    expect((await reg(a)).status).toBe("confirmed");
    expect((await reg(b)).status).toBe("pending_payment");
    await expect(asUser(db, host, `select public.admin_reverse_payment($1, $2)`, [id, paymentB])).rejects.toThrow(
      /cancellation_handled/,
    );
  });

  it("the ref code in the message picks the right payment when the amount and day can't", async () => {
    const sid = await createSession(db);
    const [a, b] = [await createUser(db, "A"), await createUser(db, "B")];
    await asUser(db, a, `select public.register_for_session($1)`, [sid]);
    await asUser(db, b, `select public.register_for_session($1)`, [sid]);
    await pay((await reg(a)).id);
    await pay((await reg(b)).id);
    const code = (await db.query<{ ref_code: string }>(`select ref_code from public.registrations where profile_id = $1`, [b]))
      .rows[0].ref_code;

    const { events } = await cancel(1000, code.replace("-", " ").toLowerCase()); // "vb 7k3q"
    expect(events.map((e) => e.event)).toEqual(["payment_reversed"]);
    expect((await reg(a)).status).toBe("confirmed");
    expect((await reg(b)).status).toBe("pending_payment");
  });

  it("hosts can dismiss one that isn't about volleyball", async () => {
    const host = await createUser(db, "Host", { admin: true });
    const { id } = await cancel(4200); // no payment of that amount
    await asUser(db, host, `select public.admin_dismiss_cancellation($1, true)`, [id]);
    const c = await db.query<{ dismissed_at: string | null; note: string }>(
      `select dismissed_at, note from public.payment_cancellations where id = $1`,
      [id],
    );
    expect(c.rows[0].dismissed_at).not.toBeNull();
    expect(c.rows[0].note).toMatch(/No payment found/);
  });

  it("once the session has started nothing moves", async () => {
    const sid = await createSession(db, { startsInHours: 1 });
    const a = await createUser(db, "A");
    await asUser(db, a, `select public.register_for_session($1)`, [sid]);
    await pay((await reg(a)).id);
    await db.query(`update public.sessions set starts_at = now() - interval '10 minutes' where id = $1`, [sid]);

    const { events } = await cancel();
    expect(events).toEqual([]);
    expect((await reg(a))).toMatchObject({ status: "confirmed", paid_cents: 0 });
  });
});
