import { beforeEach, describe, expect, it } from "vitest";
import { createDb, createUser, type Db } from "./db-harness";

let db: Db;

beforeEach(async () => {
  db = await createDb();
});

const TZ = "America/Toronto";

async function template(hostIds: string[]) {
  const res = await db.query<{ id: string }>(
    `insert into public.session_templates (weekday, start_time, location, capacity, price_cents, timezone, host_ids)
     values (extract(dow from now() at time zone $1 + interval '3 days')::int, '18:00', 'Gym', 12, 1000, $1, $2::uuid[])
     returning id`,
    [TZ, hostIds],
  );
  return res.rows[0].id;
}

const hostsOf = async (templateId: string) =>
  (
    await db.query<{ profile_id: string }>(
      `select h.profile_id from public.session_hosts h join public.sessions s on s.id = h.session_id where s.template_id = $1 order by 1`,
      [templateId],
    )
  ).rows.map((r) => r.profile_id);

describe("weekly schedule hosts", () => {
  it("gives every session created from a schedule its hosts, and skips accounts that aren't hosts", async () => {
    const host = await createUser(db, "Hana Host", { admin: true });
    const player = await createUser(db, "Pat Player");
    const tid = await template([host, player]);

    const made = await db.query<{ n: number }>(`select public.create_sessions_from_templates() as n`);
    expect(made.rows[0].n).toBeGreaterThan(0);
    expect(await hostsOf(tid)).toEqual([host]);
  });

  it("doesn't change the hosts of sessions that already exist when the schedule's hosts change", async () => {
    const a = await createUser(db, "Hana Host", { admin: true });
    const b = await createUser(db, "Omar Other", { admin: true });
    const tid = await template([a]);
    await db.query(`select public.create_sessions_from_templates()`);

    await db.query(`update public.session_templates set host_ids = $2::uuid[] where id = $1`, [tid, [b]]);
    const again = await db.query<{ n: number }>(`select public.create_sessions_from_templates() as n`);
    expect(again.rows[0].n).toBe(0);
    expect(await hostsOf(tid)).toEqual([a]);
  });

  it("creates sessions without hosts when the schedule has none", async () => {
    const tid = await template([]);
    await db.query(`select public.create_sessions_from_templates()`);
    expect(await hostsOf(tid)).toEqual([]);
    expect((await db.query(`select 1 from public.sessions where template_id = $1`, [tid])).rows.length).toBeGreaterThan(0);
  });
});
