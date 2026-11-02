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
