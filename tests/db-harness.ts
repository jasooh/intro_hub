import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

// Minimal stand-in for the bits of Supabase the migration depends on:
// the auth schema, auth.uid(), the API roles and their default grants.
const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (
    id uuid primary key,
    email text,
    email_confirmed_at timestamptz default now(),
    raw_user_meta_data jsonb default '{}',
    instance_id uuid, aud text, role text, encrypted_password text, raw_app_meta_data jsonb,
    created_at timestamptz, updated_at timestamptz, confirmation_token text, recovery_token text,
    email_change_token_new text, email_change text
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema public, auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

export async function createDb() {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);
  const dir = join(__dirname, "..", "supabase", "migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(dir, file), "utf8"));
  }
  return db;
}

export type Db = PGlite;

let userCounter = 0;

/** Creates a signed-up user. Their profile is complete (waiver etc.) unless `incomplete` is set. */
export async function createUser(db: Db, name: string, opts: { admin?: boolean; incomplete?: boolean } = {}) {
  userCounter += 1;
  const id = `00000000-0000-4000-8000-${String(userCounter).padStart(12, "0")}`;
  await db.query(
    `insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`,
    [id, `${name.toLowerCase().replace(/\s+/g, ".")}@example.com`, { full_name: name }],
  );
  if (opts.admin) {
    await db.query(`update public.profiles set role = 'admin' where id = $1`, [id]);
  }
  if (!opts.incomplete) {
    await db.query(
      `update public.profiles
          set first_name = 'Test', last_name = $2, phone = '555-0100', skill_level = 'some',
              attended_before = false, media_consent = true, waiver_accepted_at = now(), waiver_version = 'test'
        where id = $1`,
      [id, name],
    );
  }
  return id;
}

/** Run `fn` as an authenticated user (RLS + auth.uid() apply). */
export async function asUser<T>(db: Db, userId: string | null, sql: string, params: unknown[] = []) {
  return db.transaction(async (tx) => {
    if (userId) {
      await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId]);
      await tx.exec(`set local role authenticated`);
    } else {
      await tx.exec(`set local role anon`);
    }
    return tx.query<T>(sql, params);
  });
}

export async function asService<T>(db: Db, sql: string, params: unknown[] = []) {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role service_role`);
    return tx.query<T>(sql, params);
  });
}

export async function createSession(
  db: Db,
  opts: {
    capacity?: number;
    priceCents?: number;
    instructionalPriceCents?: number | null;
    opensInMinutes?: number;
    startsInHours?: number;
  } = {},
) {
  const res = await db.query<{ id: string }>(
    `insert into public.sessions (title, starts_at, ends_at, location, capacity, price_cents, opens_at, hold_hours, cancel_cutoff,
                                  instructional_price_cents)
     values ('Test', now() + make_interval(hours => $1), now() + make_interval(hours => $1 + 2), 'Gym',
             $2, $3, now() + make_interval(mins => $4), 12, now() + make_interval(hours => $1 - 24), $5)
     returning id`,
    [
      opts.startsInHours ?? 72,
      opts.capacity ?? 12,
      opts.priceCents ?? 1000,
      opts.opensInMinutes ?? -60,
      opts.instructionalPriceCents ?? null,
    ],
  );
  return res.rows[0].id;
}

export type Event = { event: string; registration_id: string };
