import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createDb, createUser } from "./db-harness";

// supabase/demo-data: the seed runs cleanly on the current migrations, fills the
// Stats page's "Haven't been back" list, and the clean-up removes it all again.
it("demo seed and clean-up run end to end", async () => {
  const db = await createDb();
  // The bits of the hosted dev project the scripts expect: Supabase's extra
  // auth.users columns, JWT claims as JSON, and the dev cron job (their guard).
  await db.exec(`
    alter table auth.users add column instance_id uuid, add column aud text, add column role text,
      add column encrypted_password text, add column raw_app_meta_data jsonb, add column created_at timestamptz,
      add column updated_at timestamptz, add column confirmation_token text, add column recovery_token text,
      add column email_change_token_new text, add column email_change text;
    create or replace function auth.uid() returns uuid language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
    $$;
    create schema cron;
    create table cron.job (jobname text);
    insert into cron.job values ('intro-hub-tick-dev');
  `);
  const host = await createUser(db, "Host", { admin: true });
  const dir = join(__dirname, "..", "supabase", "demo-data");

  await db.exec(readFileSync(join(dir, "demo-seed.sql"), "utf8"));
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [host]);
  const res = await db.query<{ s: { players: { lapsed: { name: string; times: number }[] } } }>(
    `select public.admin_stats(now() - interval '91 days', now() + interval '31 days') as s`,
  );
  expect(res.rows[0].s.players.lapsed.map((p) => [p.name, p.times]).sort()).toEqual([
    ["Nina K.", 2],
    ["Omar S.", 2],
    ["Rachel A.", 2],
  ]);

  await db.exec(readFileSync(join(dir, "demo-clean.sql"), "utf8"));
  const left = await db.query<{ sessions: number; players: number }>(
    `select (select count(*)::int from public.sessions) as sessions,
            (select count(*)::int from public.profiles where email like '%@demo.intro2volleyball.test') as players`,
  );
  expect(left.rows[0]).toEqual({ sessions: 0, players: 0 });
});
