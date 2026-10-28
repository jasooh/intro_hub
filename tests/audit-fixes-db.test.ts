import { beforeEach, describe, expect, it } from "vitest";
import { asService, asUser, createDb, createSession, createUser, type Db } from "./db-harness";

let db: Db;

beforeEach(async () => {
  db = await createDb();
});

const register = (u: string, sid: string) => asUser(db, u, `select public.register_for_session($1, 'full')`, [sid]);

describe("emergency contact and 18+", () => {
  it("don't block signing up (players are reminded instead), and players can fill them in", async () => {
    const a = await createUser(db, "A");
    const sid = await createSession(db);
    await db.query(`update public.profiles set emergency_name = null, emergency_phone = null, adult_confirmed_at = null where id = $1`, [a]);
    await register(a, sid);
    await asUser(db, a, `update public.profiles set emergency_name = 'Sam', adult_confirmed_at = now() where id = $1`, [a]);
    const res = await db.query<{ emergency_name: string }>(`select emergency_name from public.profiles where id = $1`, [a]);
    expect(res.rows[0].emergency_name).toBe("Sam");
  });

  it("the rest of the profile still has to be done first", async () => {
    const a = await createUser(db, "A", { incomplete: true });
    const sid = await createSession(db);
    await expect(register(a, sid)).rejects.toThrow(/profile_incomplete/);
  });
});

describe("blocked players", () => {
  it("can't sign up until unblocked, and only hosts see blocks", async () => {
    const host = await createUser(db, "Host", { admin: true });
    const a = await createUser(db, "A");
    const sid = await createSession(db);
    await asUser(db, host, `insert into public.player_blocks (profile_id, reason) values ($1, 'no-shows')`, [a]);
    await expect(register(a, sid)).rejects.toThrow(/blocked/);
    expect((await asUser(db, a, `select * from public.player_blocks`)).rows).toHaveLength(0);
    await expect(asUser(db, a, `delete from public.player_blocks where profile_id = $1`, [a])).resolves.toMatchObject({
      affectedRows: 0,
    });
    await asUser(db, host, `delete from public.player_blocks where profile_id = $1`, [a]);
    await register(a, sid);
  });
});

describe("schedule revision", () => {
  it("goes up only when the time or place changes", async () => {
    const sid = await createSession(db);
    const rev = async () =>
      (await db.query<{ r: number }>(`select schedule_revision as r from public.sessions where id = $1`, [sid])).rows[0].r;
    await db.query(`update public.sessions set capacity = capacity + 1 where id = $1`, [sid]);
    expect(await rev()).toBe(0);
    await db.query(`update public.sessions set location = 'Gym B' where id = $1`, [sid]);
    expect(await rev()).toBe(1);
    await db.query(`update public.sessions set starts_at = starts_at + interval '1 hour' where id = $1`, [sid]);
    expect(await rev()).toBe(2);
  });
});

describe("run_tick heartbeat", () => {
  it("records the last run", async () => {
    await asService(db, `select public.run_tick()`);
    const res = await db.query<{ n: number }>(`select count(*)::int as n from public.app_settings where key = 'last_tick'`);
    expect(res.rows[0].n).toBe(1);
  });

  it("clears old server errors", async () => {
    await db.query(`insert into public.app_errors (message, at) values ('old', now() - interval '40 days'), ('new', now())`);
    await asService(db, `select public.run_tick()`);
    expect((await db.query(`select message from public.app_errors`)).rows).toEqual([{ message: "new" }]);
  });
});

describe("server errors", () => {
  it("are hidden from players and hosts", async () => {
    const host = await createUser(db, "Host", { admin: true });
    await db.query(`insert into public.app_errors (message) values ('boom')`);
    expect((await asUser(db, host, `select * from public.app_errors`)).rows).toHaveLength(0);
    await expect(asUser(db, host, `insert into public.app_errors (message) values ('x')`)).rejects.toThrow();
  });
});

describe("admin_merge_guest", () => {
  async function guestIn(host: string, sid: string) {
    await asUser(db, host, `select public.admin_add_player($1, null, 'Walk In', null, 'full', false)`, [sid]);
    const res = await db.query<{ id: string }>(`select id from public.profiles where guest`);
    return res.rows[0].id;
  }

  it("moves the guest's sign-ups to the account and removes the guest", async () => {
    const host = await createUser(db, "Host", { admin: true });
    const a = await createUser(db, "A");
    const sid = await createSession(db);
    const guest = await guestIn(host, sid);
    const res = await asUser<{ n: number }>(db, host, `select public.admin_merge_guest($1, $2) as n`, [guest, a]);
    expect(res.rows[0].n).toBe(1);
    expect((await db.query(`select profile_id from public.registrations where session_id = $1`, [sid])).rows).toEqual([
      { profile_id: a },
    ]);
    expect((await db.query(`select id from public.profiles where id = $1`, [guest])).rows).toHaveLength(0);
    const names = await db.query<{ etransfer_names: string[] }>(`select etransfer_names from public.profiles where id = $1`, [a]);
    expect(names.rows[0].etransfer_names).toContain("Walk In");
  });

  it("refuses when both are signed up for the same session", async () => {
    const host = await createUser(db, "Host", { admin: true });
    const a = await createUser(db, "A");
    const sid = await createSession(db);
    const guest = await guestIn(host, sid);
    await register(a, sid);
    await expect(asUser(db, host, `select public.admin_merge_guest($1, $2)`, [guest, a])).rejects.toThrow(/merge_conflict/);
  });

  it("is hosts only and only merges guests into accounts", async () => {
    const host = await createUser(db, "Host", { admin: true });
    const [a, b] = [await createUser(db, "A"), await createUser(db, "B")];
    const sid = await createSession(db);
    const guest = await guestIn(host, sid);
    await expect(asUser(db, a, `select public.admin_merge_guest($1, $2)`, [guest, a])).rejects.toThrow(/forbidden/);
    await expect(asUser(db, host, `select public.admin_merge_guest($1, $2)`, [b, a])).rejects.toThrow(/not_a_guest/);
    await expect(asUser(db, host, `select public.admin_merge_guest($1, $2)`, [guest, guest])).rejects.toThrow(/not_an_account/);
  });
});

describe("rate limits", () => {
  it("allow up to the limit in a window, then refuse; only the server can use them", async () => {
    const hit = () => asService<{ ok: boolean }>(db, `select public.rate_limit_hit('feedback:ip:1.2.3.4', 2, 600) as ok`);
    expect((await hit()).rows[0].ok).toBe(true);
    expect((await hit()).rows[0].ok).toBe(true);
    expect((await hit()).rows[0].ok).toBe(false);
    // Another key has its own count.
    expect((await asService<{ ok: boolean }>(db, `select public.rate_limit_hit('feedback:ip:5.6.7.8', 2, 600) as ok`)).rows[0].ok).toBe(true);
    const a = await createUser(db, "A");
    await expect(asUser(db, a, `select public.rate_limit_hit('x', 1, 60)`)).rejects.toThrow();
  });

  it("old windows are cleared by run_tick", async () => {
    await db.query(`insert into public.rate_limits (key, window_start, hits) values ('old', now() - interval '2 days', 3), ('new', now(), 1)`);
    await asService(db, `select public.run_tick()`);
    expect((await db.query(`select key from public.rate_limits`)).rows).toEqual([{ key: "new" }]);
  });
});

describe("client privileges", () => {
  it("no client role can truncate, and anon can't write, on any table (new ones included)", async () => {
    await db.query(`create table public.zz_new_table (id int)`);
    const res = await db.query<{ t: string; role: string; priv: string }>(`
      select c.relname as t, r.role, p.priv
        from pg_class c
        cross join (values ('anon'), ('authenticated')) r(role)
        cross join (values ('TRUNCATE'), ('INSERT'), ('UPDATE'), ('DELETE')) p(priv)
       where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
         and has_table_privilege(r.role, c.oid, p.priv)
         and (p.priv = 'TRUNCATE' or r.role = 'anon')`);
    expect(res.rows).toEqual([]);
  });

  it("public pages can still read sessions and spot counts without signing in", async () => {
    const sid = await createSession(db);
    expect((await asUser(db, null, `select id from public.sessions`)).rows).toHaveLength(1);
    await asUser(db, null, `select * from public.get_session_counts(array[$1]::uuid[])`, [sid]);
  });
});

describe("photo avatars", () => {
  it("build a URL under the player's own id, even with someone else's seed", async () => {
    const [a, b] = [await createUser(db, "A"), await createUser(db, "B")];
    await db.query(`update public.profiles set avatar_style = 'photo', avatar_seed = 'abc123' where id = $1`, [a]);
    await db.query(`update public.profiles set avatar_style = 'photo', avatar_seed = 'abc123' where id = $1`, [b]);
    const urls = await db.query<{ id: string; avatar_url: string }>(`select id, avatar_url from public.profiles where id in ($1, $2)`, [a, b]);
    const byId = new Map(urls.rows.map((r) => [r.id, r.avatar_url]));
    expect(byId.get(a)).toBe(`/api/avatar/photo/${a}/abc123`);
    expect(byId.get(b)).toBe(`/api/avatar/photo/${b}/abc123`);
    await db.query(`update public.profiles set avatar_style = 'thumbs' where id = $1`, [a]);
    expect((await db.query<{ u: string }>(`select avatar_url as u from public.profiles where id = $1`, [a])).rows[0].u).toBe(
      "/api/avatar/thumbs/abc123",
    );
  });

  it("count toward the daily identity-change limit", async () => {
    const a = await createUser(db, "A");
    await db.query(`update public.profiles set onboarded_at = now() where id = $1`, [a]);
    for (const seed of ["s1", "s2", "s3"]) {
      await asUser(db, a, `update public.profiles set avatar_style = 'photo', avatar_seed = $2 where id = $1`, [a, seed]);
    }
    await expect(
      asUser(db, a, `update public.profiles set avatar_seed = 's4' where id = $1`, [a]),
    ).rejects.toThrow(/identity_change_limit/);
  });
});

describe("post authors", () => {
  it("show the poster's display name and avatar for published posts only", async () => {
    const host = await createUser(db, "Host", { admin: true });
    await db.query(`update public.profiles set display_name = 'Coach K' where id = $1`, [host]);
    const ins = await db.query<{ id: string; published: boolean }>(
      `insert into public.posts (title, body_html, published_at, author_id) values
         ('Live', '<p>x</p>', now(), $1), ('Draft', '<p>y</p>', null, $1) returning id, published_at is not null as published`,
      [host],
    );
    const ids = ins.rows.map((r) => r.id);
    const res = await asUser<{ post_id: string; name: string; avatar_url: string }>(
      db,
      null,
      `select * from public.get_post_authors($1::uuid[])`,
      [ids],
    );
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]).toMatchObject({ post_id: ins.rows.find((r) => r.published)!.id, name: "Coach K" });
    expect(res.rows[0].avatar_url).toMatch(/^\/api\/avatar\//);
  });
});
