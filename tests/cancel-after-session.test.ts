import { beforeEach, describe, expect, it } from "vitest";
import { asUser, createDb, createSession, createUser, type Db } from "./db-harness";

let db: Db;

beforeEach(async () => {
  db = await createDb();
});

const cancel = (userId: string, regId: string) =>
  asUser(db, userId, `select public.cancel_registration($1) as events`, [regId]);

async function signedUp() {
  const sid = await createSession(db);
  const player = await createUser(db, "Pat Player");
  await asUser(db, player, `select public.register_for_session($1, 'full')`, [sid]);
  const { rows } = await db.query<{ id: string }>(`select id from public.registrations where session_id = $1`, [sid]);
  return { sid, player, regId: rows[0].id };
}

const endSession = (sid: string) =>
  db.query(`update public.sessions set starts_at = now() - interval '4 hours', ends_at = now() - interval '1 hour' where id = $1`, [sid]);

describe("cancelling once the session is over", () => {
  it("is refused for the player, and the sign-up stays as it was", async () => {
    const { sid, player, regId } = await signedUp();
    await endSession(sid);

    await expect(cancel(player, regId)).rejects.toThrow(/session_over/);
    const { rows } = await db.query<{ status: string }>(`select status::text from public.registrations where id = $1`, [regId]);
    expect(rows[0].status).not.toBe("cancelled");
  });

  it("still works before the session ends, and a host can still cancel afterwards", async () => {
    const a = await signedUp();
    await cancel(a.player, a.regId);
    const { rows } = await db.query<{ status: string }>(`select status::text from public.registrations where id = $1`, [a.regId]);
    expect(rows[0].status).toBe("cancelled");

    const b = await signedUp();
    const host = await createUser(db, "Hana Host", { admin: true });
    await endSession(b.sid);
    await cancel(host, b.regId);
    const after = await db.query<{ status: string }>(`select status::text from public.registrations where id = $1`, [b.regId]);
    expect(after.rows[0].status).toBe("cancelled");
  });
});
