import { beforeEach, describe, expect, it } from "vitest";
import { asUser, createDb, createSession, createUser, type Db } from "./db-harness";

let db: Db;

beforeEach(async () => {
  db = await createDb();
});

const setHosts = (userId: string, sid: string, ids: string[]) =>
  asUser(db, userId, `select public.admin_set_session_hosts($1, $2::uuid[])`, [sid, ids]);

describe("session hosts", () => {
  it("lets a host pick hosts, shows only name and avatar to anyone, and replaces the list on save", async () => {
    const sid = await createSession(db);
    const host = await createUser(db, "Hana Host", { admin: true });
    const other = await createUser(db, "Omar Other", { admin: true });

    await setHosts(host, sid, [host, other]);
    const both = await asUser<{ name: string; avatar_url: string | null }>(db, null, `select * from public.get_session_hosts($1)`, [sid]);
    expect(both.rows).toHaveLength(2);
    expect(Object.keys(both.rows[0]).sort()).toEqual(["avatar_url", "name"]);

    await setHosts(host, sid, [other]);
    const one = await asUser(db, null, `select * from public.get_session_hosts($1)`, [sid]);
    expect(one.rows).toHaveLength(1);

    await setHosts(host, sid, []);
    expect((await asUser(db, null, `select * from public.get_session_hosts($1)`, [sid])).rows).toHaveLength(0);
  });

  it("ignores anyone who isn't a host, and players can't set hosts", async () => {
    const sid = await createSession(db);
    const host = await createUser(db, "Hana Host", { admin: true });
    const player = await createUser(db, "Pat Player");

    await setHosts(host, sid, [player, host]);
    const rows = await db.query<{ profile_id: string }>(`select profile_id from public.session_hosts where session_id = $1`, [sid]);
    expect(rows.rows.map((r) => r.profile_id)).toEqual([host]);

    await expect(setHosts(player, sid, [player])).rejects.toThrow(/forbidden/);
  });

  it("keeps the table private to hosts", async () => {
    const sid = await createSession(db);
    const host = await createUser(db, "Hana Host", { admin: true });
    const player = await createUser(db, "Pat Player");
    await setHosts(host, sid, [host]);

    expect((await asUser(db, player, `select * from public.session_hosts`)).rows).toHaveLength(0);
    expect((await asUser(db, host, `select * from public.session_hosts`)).rows).toHaveLength(1);
    await expect(asUser(db, null, `select * from public.session_hosts`)).rejects.toThrow();
  });
});
