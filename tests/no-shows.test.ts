import { beforeEach, describe, expect, it } from "vitest";
import { asUser, createDb, createSession, createUser, type Db } from "./db-harness";

let db: Db;

beforeEach(async () => {
  db = await createDb();
});

/** A signed-up player in a session that has already started. */
async function startedSignup() {
  const host = await createUser(db, "Host", { admin: true });
  const player = await createUser(db, "Player");
  const sid = await createSession(db);
  const res = await asUser(db, player, `select public.register_for_session($1, 'full')`, [sid]);
  expect(res.rows).toHaveLength(1);
  const reg = (
    await db.query<{ id: string }>(`select id from public.registrations where session_id = $1 and profile_id = $2`, [sid, player])
  ).rows[0].id;
  await db.query(`update public.sessions set starts_at = now() - interval '2 hours' where id = $1`, [sid]);
  return { host, player, sid, reg };
}

const counts = async (player: string) =>
  (
    await db.query<{ c: number; s: number }>(
      `select no_show_count as c, no_show_seen as s from public.profiles where id = $1`,
      [player],
    )
  ).rows[0];

const mark = (host: string, reg: string, on = true) =>
  asUser(db, host, `select public.admin_mark_no_show($1, $2)`, [reg, on]);

describe("no-shows", () => {
  it("a host marks a no-show once, and undo takes it back", async () => {
    const { host, player, reg } = await startedSignup();
    await mark(host, reg);
    expect(await counts(player)).toEqual({ c: 1, s: 0 });
    await mark(host, reg); // marking twice changes nothing
    expect(await counts(player)).toEqual({ c: 1, s: 0 });
    await mark(host, reg, false);
    expect(await counts(player)).toEqual({ c: 0, s: 0 });
    await mark(host, reg, false); // undoing twice doesn't go below zero
    expect(await counts(player)).toEqual({ c: 0, s: 0 });
  });

  it("can't be marked before the session starts", async () => {
    const { host, sid, reg } = await startedSignup();
    await db.query(`update public.sessions set starts_at = now() + interval '1 hour' where id = $1`, [sid]);
    await expect(mark(host, reg)).rejects.toThrow(/not_started/);
  });

  it("only hosts can mark, and only for someone holding a spot", async () => {
    const { host, player, reg } = await startedSignup();
    await expect(mark(player, reg)).rejects.toThrow(/forbidden/);
    await db.query(`update public.registrations set status = 'cancelled' where id = $1`, [reg]);
    await expect(mark(host, reg)).rejects.toThrow(/not_on_roster/);
    expect(await counts(player)).toEqual({ c: 0, s: 0 });
  });

  it("players can't change their own count, but can mark the pop-up as seen", async () => {
    const { host, player, reg } = await startedSignup();
    const other = await createUser(db, "Other");
    await expect(asUser(db, player, `update public.profiles set no_show_count = 5 where id = $1`, [player])).rejects.toThrow();
    await expect(asUser(db, player, `update public.profiles set no_show_seen = 5 where id = $1`, [player])).rejects.toThrow();
    await mark(host, reg);
    await asUser(db, other, `select public.acknowledge_no_shows()`);
    expect(await counts(player)).toEqual({ c: 1, s: 0 });
    await asUser(db, player, `select public.acknowledge_no_shows()`);
    expect(await counts(player)).toEqual({ c: 1, s: 1 });
  });

  it("undoing a mark the player already saw lets the next one pop up again", async () => {
    const { host, player, reg } = await startedSignup();
    await mark(host, reg);
    await asUser(db, player, `select public.acknowledge_no_shows()`);
    await mark(host, reg, false);
    expect(await counts(player)).toEqual({ c: 0, s: 0 });
    await mark(host, reg);
    expect(await counts(player)).toEqual({ c: 1, s: 0 });
  });
});
