-- Tighten what the public (anon) and signed-in (authenticated) roles can do
-- directly through Supabase's API. Supabase's default grants gave both roles
-- every privilege on every table; row-level security (RLS) limits reads and
-- writes, but not TRUNCATE, which ignores RLS. Nothing in the app needs these:
--   * no client role gets TRUNCATE, TRIGGER or REFERENCES on any table
--   * anon can't write anywhere (no RLS policy allowed it anyway)
--   * the trigger function can't be called directly
-- Reads stay as they were (RLS decides): sessions, posts and app_settings are
-- public; get_session_counts and is_admin stay callable (RLS policies use is_admin).
-- New tables created by migrations get the same, through default privileges.

do $$
declare
  t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('revoke truncate, trigger, references on public.%I from anon, authenticated', t);
    execute format('revoke insert, update, delete on public.%I from anon', t);
  end loop;
end $$;

alter default privileges in schema public revoke truncate, trigger, references on tables from anon, authenticated;
alter default privileges in schema public revoke insert, update, delete on tables from anon;

revoke execute on function public._bump_schedule_revision() from public, anon, authenticated;
