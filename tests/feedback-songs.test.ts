import { beforeEach, describe, expect, it } from "vitest";
import { asService, asUser, createDb, createUser, type Db } from "./db-harness";

let db: Db;
let host: string;
let player: string;

beforeEach(async () => {
  db = await createDb();
  host = await createUser(db, "Host", { admin: true });
  player = await createUser(db, "Player");
});

describe("feedback", () => {
  beforeEach(async () => {
    await asService(db, `insert into public.feedback (message, profile_id) values ('Great sessions', $1)`, [player]);
    await asService(db, `insert into public.feedback (message) values ('Anonymous note')`);
  });

  it("only hosts can read it", async () => {
    expect((await asUser(db, player, `select * from public.feedback`)).rows).toHaveLength(0);
    expect((await asUser(db, null, `select * from public.feedback`)).rows).toHaveLength(0);
    expect((await asUser(db, host, `select * from public.feedback`)).rows).toHaveLength(2);
  });

  it("hosts can mark it handled; players can't", async () => {
    await asUser(db, player, `update public.feedback set handled_at = now()`);
    expect((await db.query(`select * from public.feedback where handled_at is not null`)).rows).toHaveLength(0);
    await asUser(db, host, `update public.feedback set handled_at = now()`);
    expect((await db.query(`select * from public.feedback where handled_at is not null`)).rows).toHaveLength(2);
  });

  it("nobody inserts or deletes it directly (the contact form uses the service role)", async () => {
    await expect(asUser(db, null, `insert into public.feedback (message) values ('spam')`)).rejects.toThrow();
    await expect(asUser(db, player, `insert into public.feedback (message) values ('hi')`)).rejects.toThrow();
    await expect(asUser(db, host, `delete from public.feedback`)).rejects.toThrow();
  });

  it("checks the message length", async () => {
    await expect(asService(db, `insert into public.feedback (message) values ('')`)).rejects.toThrow();
    await expect(asService(db, `insert into public.feedback (message) values (repeat('a', 5001))`)).rejects.toThrow();
  });

  it("keeps feedback when the sender's account is deleted", async () => {
    await db.query(`delete from auth.users where id = $1`, [player]);
    const res = await db.query<{ profile_id: string | null }>(`select profile_id from public.feedback`);
    expect(res.rows.map((r) => r.profile_id)).toEqual([null, null]);
  });
});

describe("song checklist", () => {
  it("only hosts can read and write it", async () => {
    await asUser(db, host, `insert into public.song_checklist (profile_id, song, checked_by) values ($1, 'Song', $2)`, [
      player,
      host,
    ]);
    expect((await asUser(db, host, `select * from public.song_checklist`)).rows).toHaveLength(1);
    expect((await asUser(db, player, `select * from public.song_checklist`)).rows).toHaveLength(0);
    await expect(
      asUser(db, player, `insert into public.song_checklist (profile_id, song) values ($1, 'Mine')`, [host]),
    ).rejects.toThrow();
    await asUser(db, player, `delete from public.song_checklist`);
    expect((await db.query(`select * from public.song_checklist`)).rows).toHaveLength(1);
    await asUser(db, host, `delete from public.song_checklist`);
    expect((await db.query(`select * from public.song_checklist`)).rows).toHaveLength(0);
  });
});
