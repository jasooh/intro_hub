import { beforeEach, describe, expect, it } from "vitest";
import { asService, createDb, createSession, type Db } from "./db-harness";

let db: Db;

beforeEach(async () => {
  db = await createDb();
});

type TickEvent = { event: string; session_id?: string };
const tick = async () =>
  (await asService<{ events: TickEvent[] }>(db, `select public.run_tick() as events`)).rows[0].events.filter(
    (e) => e.event === "session_open",
  );

describe("sign-ups are open emails", () => {
  it("go out once, when sign-ups open", async () => {
    const sid = await createSession(db, { opensInMinutes: 30 });
    expect(await tick()).toEqual([]);
    await db.query(`update public.sessions set opens_at = now() - interval '1 minute' where id = $1`, [sid]);
    expect(await tick()).toEqual([{ event: "session_open", session_id: sid }]);
    expect(await tick()).toEqual([]);
  });

  it("skip sessions the host turned off, cancelled ones, and ones that opened over a day ago", async () => {
    const off = await createSession(db, { opensInMinutes: -5 });
    const cancelled = await createSession(db, { opensInMinutes: -5 });
    const old = await createSession(db, { opensInMinutes: -60 * 30 });
    await db.query(`update public.sessions set announce = false where id = $1`, [off]);
    await db.query(`update public.sessions set status = 'cancelled' where id = $1`, [cancelled]);
    const sent = (await tick()).map((e) => e.session_id);
    expect(sent).not.toContain(off);
    expect(sent).not.toContain(cancelled);
    expect(sent).not.toContain(old);
  });
});
