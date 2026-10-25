import { beforeEach, describe, expect, it } from "vitest";
import { asService, createDb, type Db } from "./db-harness";

let db: Db;

beforeEach(async () => {
  db = await createDb();
});

const TZ = "America/Toronto";

/** A weekly session 3 days from now, starting `startsInDays` days from today (club time). */
async function template(startsInDays: number | null) {
  const res = await db.query<{ id: string }>(
    `insert into public.session_templates (weekday, start_time, location, capacity, price_cents, timezone, starts_on)
     values (extract(dow from now() at time zone $1 + interval '3 days')::int, '18:00', 'Gym', 12, 1000, $1,
             coalesce((now() at time zone $1)::date + $2::int, (now() at time zone $1)::date))
     returning id`,
    [TZ, startsInDays],
  );
  return res.rows[0].id;
}

const sessionCount = async (templateId: string) =>
  (await db.query<{ n: number }>(`select count(*)::int as n from public.sessions where template_id = $1`, [templateId]))
    .rows[0].n;

describe("weekly session start date", () => {
  it("defaults to today and creates the next session", async () => {
    const res = await db.query<{ today: boolean }>(
      `insert into public.session_templates (weekday, start_time, location, capacity, price_cents)
       values (1, '18:00', 'Gym', 12, 1000)
       returning starts_on = (now() at time zone 'America/Toronto')::date as today`,
    );
    expect(res.rows[0].today).toBe(true);

    const id = await template(null);
    await asService(db, `select public.run_tick()`);
    expect(await sessionCount(id)).toBe(1);
  });

  it("skips weeks before the start date", async () => {
    const later = await template(5); // first matching day is 3 days out, before the start
    const onTheDay = await template(3); // starts exactly on the matching day
    await asService(db, `select public.run_tick()`);
    expect(await sessionCount(later)).toBe(0);
    expect(await sessionCount(onTheDay)).toBe(1);

    // Moving the start back lets the next tick create it.
    await db.query(`update public.session_templates set starts_on = starts_on - 5 where id = $1`, [later]);
    await asService(db, `select public.run_tick()`);
    expect(await sessionCount(later)).toBe(1);
  });
});
