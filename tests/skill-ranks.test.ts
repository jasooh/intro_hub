import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { asUser, createDb } from "./db-harness";

const MIGRATION = "20261115000000_skill_ranks.sql";

describe("skill ranks migration", () => {
  it("moves the old worded answers onto the 1–5 scale and keeps admin_stats working", async () => {
    const db = await createDb({ before: MIGRATION });
    const answers = ["never", "some", "experienced", "prefer_not"];
    for (const [i, answer] of answers.entries()) {
      const id = `00000000-0000-4000-8000-00000000010${i}`;
      await db.query(`insert into auth.users (id, email) values ($1, $2)`, [id, `p${i}@example.com`]);
      await db.query(`update public.profiles set skill_level = $2 where id = $1`, [id, answer]);
    }
    await db.exec(readFileSync(join(__dirname, "..", "supabase", "migrations", MIGRATION), "utf8"));

    const { rows } = await db.query<{ email: string; skill_level: number }>(
      `select email, skill_level from public.profiles order by email`,
    );
    expect(rows.map((r) => r.skill_level)).toEqual([1, 2, 3, 2]);
    await expect(db.query(`update public.profiles set skill_level = 6`)).rejects.toThrow();
    const host = "00000000-0000-4000-8000-000000000199";
    await db.query(`insert into auth.users (id, email) values ($1, 'host@example.com')`, [host]);
    await db.query(`update public.profiles set role = 'admin' where id = $1`, [host]);
    await asUser(db, host, `select public.admin_stats(now() - interval '30 days', now()) as s`);
  });
});
