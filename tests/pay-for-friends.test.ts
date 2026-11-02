import { beforeEach, describe, expect, it } from "vitest";
import { asService, asUser, createDb, createSession, createUser, type Db, type Event } from "./db-harness";

// Paying for friends (supabase/migrations/20261203000000_pay_for_friends.sql).
let db: Db;

beforeEach(async () => {
  db = await createDb();
});

/** Signs a player up and returns their sign-up id. */
async function signUp(player: string, sid: string) {
  await asUser(db, player, `select public.register_for_session($1, 'full')`, [sid]);
  return (
    await db.query<{ id: string }>(`select id from public.registrations where session_id = $1 and profile_id = $2`, [sid, player])
  ).rows[0].id;
}

type RegRow = { status: string; paid_cents: number; covered_by: string | null; covered_seen: boolean; refund_owed: boolean };
const reg = async (id: string) =>
  (
    await db.query<RegRow>(
      `select status, paid_cents, covered_by, covered_seen, refund_owed from public.registrations where id = $1`,
      [id],
    )
  ).rows[0];

const cover = (player: string, payerReg: string, targets: string[]) =>
  asUser(db, player, `select public.set_covered_signups($1, $2::uuid[])`, [payerReg, targets]);

/** Payer A and friends B, C in one $10 session. */
async function group() {
  const sid = await createSession(db);
  const a = await createUser(db, "Alex");
  const b = await createUser(db, "Blake");
  const c = await createUser(db, "Casey");
  return { sid, a, b, c, regA: await signUp(a, sid), regB: await signUp(b, sid), regC: await signUp(c, sid) };
}

describe("covering friends", () => {
  it("sets and clears the list", async () => {
    const { a, regA, regB } = await group();
    await cover(a, regA, [regB]);
    expect(await reg(regB)).toMatchObject({ covered_by: regA, covered_seen: false });
    await cover(a, regA, []);
    expect((await reg(regB)).covered_by).toBeNull();
  });

  it("rejects bad targets", async () => {
    const { sid, a, c, regA, regB, regC } = await group();
    const otherSid = await createSession(db);
    const d = await createUser(db, "Dana");
    const regD = await signUp(d, otherSid);
    await expect(cover(a, regA, [regD])).rejects.toThrow(/cover_unavailable/);
    await expect(cover(a, regA, [regA])).rejects.toThrow(/cover_unavailable/);
    await db.query(`update public.registrations set status = 'waitlisted' where id = $1`, [regB]);
    await expect(cover(a, regA, [regB])).rejects.toThrow(/cover_unavailable/);
    await db.query(`update public.registrations set status = 'pending_payment' where id = $1`, [regB]);
    await cover(c, regC, [regB]);
    await expect(cover(a, regA, [regB])).rejects.toThrow(/cover_unavailable/);
    const many: string[] = [];
    for (let i = 0; i < 6; i++) many.push(await signUp(await createUser(db, `Friend ${i}`), sid));
    await expect(cover(a, regA, many)).rejects.toThrow(/too_many_friends/);
  });

  it("rejects a payer who can't pay", async () => {
    const { sid, a, b, c, regA, regB, regC } = await group();
    await cover(c, regC, [regA]);
    await expect(cover(a, regA, [regB])).rejects.toThrow(/cover_unavailable/); // no chains
    await cover(c, regC, []);
    await db.query(`update public.registrations set status = 'waitlisted' where id = $1`, [regA]);
    await expect(cover(a, regA, [regB])).rejects.toThrow(/cover_unavailable/);
    await db.query(`update public.registrations set status = 'expired' where id = $1`, [regA]);
    await expect(cover(a, regA, [regB])).rejects.toThrow(/cover_unavailable/);
    // A payer covering others can't be covered in turn.
    await cover(b, regB, [regC]);
    await expect(cover(a, regA, [regB])).rejects.toThrow(/cover_unavailable/);
    await db.query(`update public.registrations set status = 'pending_payment' where id = $1`, [regA]);
    await db.query(`update public.sessions set starts_at = now() - interval '1 hour' where id = $1`, [sid]);
    await expect(cover(a, regA, [])).rejects.toThrow(/session_started/);
  });

  it("only the owner sets it", async () => {
    const { b, regA, regB } = await group();
    await expect(cover(b, regA, [regB])).rejects.toThrow(/forbidden/);
  });

  it("players can't write the columns directly", async () => {
    const { a, b, regA, regB } = await group();
    await cover(a, regA, [regB]);
    await asUser(db, b, `update public.registrations set covered_by = null, covered_seen = true where id = $1`, [regB]).catch(
      () => null,
    );
    expect(await reg(regB)).toMatchObject({ covered_by: regA, covered_seen: false });
  });

  it("lists unpaid sign-ups others can pay for", async () => {
    const { sid, a, regB, regC } = await group();
    await db.query(`update public.registrations set status = 'confirmed' where id = $1`, [regC]);
    const rows = (
      await asUser<{ registration_id: string; display_name: string; owed_cents: number }>(
        db,
        a,
        `select * from public.payable_signups($1)`,
        [sid],
      )
    ).rows;
    expect(rows).toEqual([expect.objectContaining({ registration_id: regB, owed_cents: 1000 })]);
    const stranger = await createUser(db, "Stranger");
    expect((await asUser(db, stranger, `select * from public.payable_signups($1)`, [sid])).rows).toHaveLength(0);
  });

  it("the friend can decline and dismiss it", async () => {
    const { a, b, regA, regB, regC } = await group();
    await cover(a, regA, [regB, regC]);
    await asUser(db, b, `select public.acknowledge_cover($1)`, [regB]);
    expect((await reg(regB)).covered_seen).toBe(true);
    await asUser(db, b, `select public.decline_cover($1)`, [regB]);
    expect((await reg(regB)).covered_by).toBeNull();
    await expect(asUser(db, a, `select public.decline_cover($1)`, [regC])).rejects.toThrow(/forbidden/);
    await expect(asUser(db, a, `select public.acknowledge_cover($1)`, [regC])).rejects.toThrow(/forbidden/);
  });

  it("the payer cancelling un-covers their friends", async () => {
    const { a, regA, regB } = await group();
    await cover(a, regA, [regB]);
    await asUser(db, a, `select public.cancel_registration($1)`, [regA]);
    expect((await reg(regB)).covered_by).toBeNull();
  });

  it("the payer's hold running out un-covers their friends", async () => {
    const { a, regA, regB } = await group();
    await cover(a, regA, [regB]);
    await db.query(`update public.registrations set hold_expires_at = now() - interval '1 minute' where id = $1`, [regA]);
    await asService(db, `select public.run_tick()`);
    expect((await reg(regA)).status).toBe("expired");
    expect((await reg(regB)).covered_by).toBeNull();
  });
});

describe("group payments", () => {
  /** A Gmail e-Transfer of `cents`, applied as a group payment for `payerReg`. */
  async function payGroup(payerReg: string, cents: number, reference = "REF-1") {
    const p = await db.query<{ id: string }>(
      `insert into public.payments (gmail_message_id, sender_name, amount_cents, received_at, raw)
       values (gen_random_uuid()::text, 'ALEX TEST', $1, now(), jsonb_build_object('reference', $2::text)) returning id`,
      [cents, reference],
    );
    const res = await asService<{ events: Event[] }>(
      db,
      `select public.ingest_apply_group_payment($1, $2, 'ref') as events`,
      [p.rows[0].id, payerReg],
    );
    return { paymentId: p.rows[0].id, events: res.rows[0].events };
  }
  const splits = async (paymentId: string) =>
    (
      await db.query<{ registration_id: string; amount_cents: number }>(
        `select registration_id, amount_cents from public.payments where split_from = $1 order by amount_cents`,
        [paymentId],
      )
    ).rows;
  const amountOf = async (paymentId: string) =>
    (await db.query<{ amount_cents: number }>(`select amount_cents from public.payments where id = $1`, [paymentId])).rows[0]
      .amount_cents;
  async function cancelTransfer(cents: number, reference: string | null, sender: string | null = null) {
    const c = await db.query<{ id: string }>(
      `insert into public.payment_cancellations (gmail_message_id, sender_name, amount_cents, reference, sent_on, received_at)
       values (gen_random_uuid()::text, $3, $1, $2, (now() at time zone 'America/Toronto')::date, now()) returning id`,
      [cents, reference, sender],
    );
    await asService(db, `select public.ingest_reverse_payment($1, 'America/Toronto')`, [c.rows[0].id]);
  }

  it("confirms everyone it covers", async () => {
    const { a, regA, regB } = await group();
    await cover(a, regA, [regB]);
    const { paymentId, events } = await payGroup(regA, 2000);
    expect(await reg(regA)).toMatchObject({ status: "confirmed", paid_cents: 1000 });
    expect(await reg(regB)).toMatchObject({ status: "confirmed", paid_cents: 1000, covered_by: regA });
    expect(await splits(paymentId)).toEqual([{ registration_id: regB, amount_cents: 1000 }]);
    expect(await amountOf(paymentId)).toBe(1000);
    expect(events.filter((e) => e.event === "confirmed").map((e) => e.registration_id).sort()).toEqual([regA, regB].sort());
  });

  it("fills the payer first on a short payment", async () => {
    const { a, regA, regB, regC } = await group();
    await cover(a, regA, [regB, regC]);
    const { events } = await payGroup(regA, 1500);
    expect((await reg(regA)).status).toBe("confirmed");
    expect(await reg(regB)).toMatchObject({ status: "pending_payment", paid_cents: 500 });
    expect(await reg(regC)).toMatchObject({ status: "pending_payment", paid_cents: 0 });
    expect(events).toContainEqual(expect.objectContaining({ event: "partial_payment", registration_id: regB }));
  });

  it("covers only the payer when that's all that was sent", async () => {
    const { a, regA, regB } = await group();
    await cover(a, regA, [regB]);
    const { paymentId } = await payGroup(regA, 1000);
    expect((await reg(regA)).status).toBe("confirmed");
    expect((await reg(regB)).status).toBe("pending_payment");
    expect(await splits(paymentId)).toEqual([]);
  });

  it("works when the payer has already paid", async () => {
    const { a, regA, regB } = await group();
    await payGroup(regA, 1000);
    await cover(a, regA, [regB]);
    await payGroup(regA, 1000, "REF-2");
    expect(await reg(regA)).toMatchObject({ status: "confirmed", paid_cents: 1000, refund_owed: false });
    expect((await reg(regB)).status).toBe("confirmed");
  });

  it("skips a friend who paid, cancelled or expired, and owes the rest back", async () => {
    const { a, regA, regB, regC } = await group();
    await cover(a, regA, [regB, regC]);
    await payGroup(regB, 1000, "REF-B"); // B paid for themselves
    await db.query(`update public.registrations set status = 'expired' where id = $1`, [regC]);
    await payGroup(regA, 3000);
    expect(await reg(regA)).toMatchObject({ status: "confirmed", paid_cents: 3000, refund_owed: true });
    expect((await reg(regB)).paid_cents).toBe(1000);
  });

  it("a cancelled group transfer takes back every share", async () => {
    const { a, regA, regB } = await group();
    await cover(a, regA, [regB]);
    const { paymentId } = await payGroup(regA, 2000);
    await cancelTransfer(2000, "REF-1");
    const rows = (
      await db.query<{ reversed: boolean }>(
        `select reversed_at is not null as reversed from public.payments where id = $1 or split_from = $1`,
        [paymentId],
      )
    ).rows;
    expect(rows).toEqual([{ reversed: true }, { reversed: true }]);
    expect((await reg(regA)).status).toBe("pending_payment");
    expect((await reg(regB)).status).toBe("pending_payment");
  });

  it("a cancellation without a reference matches the full amount", async () => {
    const { a, regA, regB } = await group();
    await cover(a, regA, [regB]);
    const { paymentId } = await payGroup(regA, 2000);
    await cancelTransfer(2000, null, "ALEX TEST");
    expect((await reg(regA)).paid_cents).toBe(0);
    expect((await reg(regB)).paid_cents).toBe(0);
    const c = await db.query<{ payment_id: string }>(`select payment_id from public.payment_cancellations`);
    expect(c.rows[0].payment_id).toBe(paymentId);
  });
});
