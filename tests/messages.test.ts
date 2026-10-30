import { beforeEach, describe, expect, it } from "vitest";
import { asUser, createDb, createUser, type Db } from "./db-harness";

let db: Db;

beforeEach(async () => {
  db = await createDb();
});

async function onboard(...ids: string[]) {
  await db.query(`update public.profiles set onboarded_at = now() where id = any($1::uuid[])`, [ids]);
}

async function hostStart(host: string, ids: string[], subject = "Hello", body = "Welcome!") {
  const res = await asUser<{ t_id: string; p_id: string; m_id: string }>(
    db,
    host,
    `select * from public.host_start_threads($1::uuid[], $2, $3)`,
    [ids, subject, body],
  );
  return res.rows;
}

async function unread(userId: string) {
  const res = await asUser<{ n: number }>(db, userId, `select public.unread_message_count() as n`);
  return res.rows[0].n;
}

describe("host_start_threads", () => {
  it("makes one thread per player and skips guests, the caller and un-onboarded players", async () => {
    const host = await createUser(db, "Host", { admin: true });
    const a = await createUser(db, "A");
    const b = await createUser(db, "B");
    const guest = await createUser(db, "Guest");
    const fresh = await createUser(db, "Fresh");
    await onboard(host, a, b, guest);
    await db.query(`update public.profiles set guest = true where id = $1`, [guest]);

    const rows = await hostStart(host, [a, b, guest, fresh, host]);
    expect(rows.map((r) => r.p_id).sort()).toEqual([a, b].sort());
    const threads = await db.query(`select count(*)::int as n from public.message_threads`);
    expect((threads.rows[0] as { n: number }).n).toBe(2);
  });

  it("is hosts only", async () => {
    const a = await createUser(db, "A");
    const b = await createUser(db, "B");
    await onboard(a, b);
    await expect(hostStart(a, [b])).rejects.toThrow(/forbidden/);
  });

  it("rejects empty and over-long messages", async () => {
    const host = await createUser(db, "Host", { admin: true });
    const a = await createUser(db, "A");
    await onboard(a);
    await expect(hostStart(host, [a], "  ", "hi")).rejects.toThrow(/empty_message/);
    await expect(hostStart(host, [a], "Hi", "x".repeat(4001))).rejects.toThrow(/message_too_long/);
  });
});

describe("privacy", () => {
  it("lets a player read only their own threads and messages; hosts read all", async () => {
    const host = await createUser(db, "Host", { admin: true });
    const a = await createUser(db, "A");
    const b = await createUser(db, "B");
    await onboard(a, b);
    await hostStart(host, [a, b]);

    const mineA = await asUser<{ profile_id: string }>(db, a, `select profile_id from public.message_threads`);
    expect(mineA.rows.map((r) => r.profile_id)).toEqual([a]);
    const msgsA = await asUser(db, a, `select id from public.messages`);
    expect(msgsA.rows).toHaveLength(1);
    const all = await asUser(db, host, `select id from public.message_threads`);
    expect(all.rows).toHaveLength(2);
  });

  it("blocks direct writes and anonymous reads", async () => {
    const a = await createUser(db, "A");
    await expect(
      asUser(db, a, `insert into public.message_threads (profile_id, subject, last_from_host) values ($1, 'x', false)`, [a]),
    ).rejects.toThrow();
    await expect(asUser(db, null, `select * from public.messages`)).rejects.toThrow();
  });

  it("stops other players posting in or reading a thread", async () => {
    const host = await createUser(db, "Host", { admin: true });
    const a = await createUser(db, "A");
    const b = await createUser(db, "B");
    await onboard(a, b);
    const [t] = await hostStart(host, [a]);
    await expect(asUser(db, b, `select public.post_message($1, 'hi')`, [t.t_id])).rejects.toThrow(/forbidden/);
    await expect(asUser(db, b, `select public.mark_thread_read($1)`, [t.t_id])).rejects.toThrow(/forbidden/);
  });
});

describe("unread counts and replies", () => {
  it("flips unread for each side as people reply and read", async () => {
    const host = await createUser(db, "Host", { admin: true });
    const a = await createUser(db, "A");
    await onboard(a);
    const [t] = await hostStart(host, [a]);

    expect(await unread(a)).toBe(1);
    expect(await unread(host)).toBe(0);

    await asUser(db, a, `select public.mark_thread_read($1)`, [t.t_id]);
    expect(await unread(a)).toBe(0);

    await asUser(db, a, `select public.post_message($1, 'Thanks!')`, [t.t_id]);
    expect(await unread(host)).toBe(1);
    expect(await unread(a)).toBe(0);

    await asUser(db, host, `select public.mark_thread_read($1)`, [t.t_id]);
    expect(await unread(host)).toBe(0);

    await asUser(db, host, `select public.post_message($1, 'See you there')`, [t.t_id]);
    expect(await unread(a)).toBe(1);
    expect(await unread(host)).toBe(0);
  });

  it("records who replied as the host or the player", async () => {
    const host = await createUser(db, "Host", { admin: true });
    const a = await createUser(db, "A");
    await onboard(a);
    const [t] = await hostStart(host, [a]);
    await asUser(db, a, `select public.post_message($1, 'Reply')`, [t.t_id]);
    const res = await db.query<{ from_host: boolean }>(
      `select from_host from public.messages where thread_id = $1 order by created_at, id`,
      [t.t_id],
    );
    expect(res.rows.map((r) => r.from_host)).toEqual([true, false]);
  });
});

describe("player_start_thread", () => {
  it("starts a thread the hosts see as unread", async () => {
    const host = await createUser(db, "Host", { admin: true });
    const a = await createUser(db, "A");
    await asUser(db, a, `select * from public.player_start_thread('Running late', 'Back in 10')`);
    expect(await unread(host)).toBe(1);
    expect(await unread(a)).toBe(0);
  });

  it("needs a complete profile", async () => {
    const a = await createUser(db, "A", { incomplete: true });
    await expect(asUser(db, a, `select * from public.player_start_thread('Hi', 'there')`)).rejects.toThrow(
      /profile_incomplete/,
    );
  });

  it("limits new threads to 5 a day", async () => {
    const a = await createUser(db, "A");
    for (let i = 0; i < 5; i++) {
      await asUser(db, a, `select * from public.player_start_thread('Hi', 'there')`);
    }
    await expect(asUser(db, a, `select * from public.player_start_thread('Hi', 'there')`)).rejects.toThrow(
      /rate_limited/,
    );
  });
});

describe("deleting accounts", () => {
  it("removes a player's threads and keeps a deleted host's messages as host messages", async () => {
    const host = await createUser(db, "Host", { admin: true });
    const a = await createUser(db, "A");
    const b = await createUser(db, "B");
    await onboard(a, b);
    await hostStart(host, [a, b]);

    await db.query(`delete from auth.users where id = $1`, [a]);
    const threads = await db.query(`select count(*)::int as n from public.message_threads`);
    expect((threads.rows[0] as { n: number }).n).toBe(1);

    await db.query(`delete from auth.users where id = $1`, [host]);
    const msgs = await db.query<{ author_id: string | null; from_host: boolean }>(
      `select author_id, from_host from public.messages`,
    );
    expect(msgs.rows).toEqual([{ author_id: null, from_host: true }]);
  });
});
