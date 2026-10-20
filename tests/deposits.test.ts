import { expect, it } from "vitest";
import { asService, asUser, createDb, createSession, createUser } from "./db-harness";

// Refundable deposits are owed back after the session, including ones paid late.
it("a deposit paid after the session ended is still owed back", async () => {
  const db = await createDb();
  const host = await createUser(db, "Host", { admin: true });
  const [a, b] = [await createUser(db, "A"), await createUser(db, "B")];
  const sid = await createSession(db, { priceCents: 0 });
  await db.query(`update public.sessions set deposit_cents = 1000 where id = $1`, [sid]);
  for (const u of [a, b]) await asUser(db, u, `select public.register_for_session($1)`, [sid]);
  const reg = async (u: string) => (await db.query<{ id: string; status: string; refund_owed: boolean; paid_cents: number }>(`select id, status::text, refund_owed, paid_cents from public.registrations where profile_id = $1`, [u])).rows[0];
  await asUser(db, host, `select public.admin_mark_paid($1)`, [(await reg(a)).id]);
  // Session happens and ends; the tick releases deposits.
  await db.query(`update public.sessions set starts_at = now() - interval '3 hours', ends_at = now() - interval '1 hour' where id = $1`, [sid]);
  await asService(db, `select public.run_tick()`);
  // B (whose hold expired at the start) pays at the door; the host marks it after the game.
  await asUser(db, host, `select public.admin_mark_paid($1)`, [(await reg(b)).id]);
  await asService(db, `select public.run_tick()`);
  expect((await reg(a)).refund_owed).toBe(true);
  expect((await reg(b)).refund_owed).toBe(true);
});
