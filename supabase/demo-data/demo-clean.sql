-- Removes everything demo-seed.sql added to the DEV project, and nothing else.
-- Safe to run when there's no demo data. Refuses to run outside dev.
--
-- Also removes what happened to demo data during a demo: payments the host
-- assigned to demo sign-ups, emails logged for them, teams made on a session
-- that had none before the seed, and sign-ups by real accounts on the demo
-- sessions B/C/D (those sessions are deleted).

begin;

do $$
declare
  rec record;
begin
  if to_regclass('cron.job') is null
     or not exists (select 1 from cron.job where jobname = 'intro-hub-tick-dev')
     or exists (select 1 from cron.job where jobname = 'intro-hub-tick') then
    raise exception 'demo-clean: this does not look like the dev project (no intro-hub-tick-dev cron job).';
  end if;

  -- Put back the settings demo-seed changed on an existing session (session A).
  for rec in
    select target_id::uuid as id, before from public.devtools_audit
     where action = 'demo_seed_adopt' and target_table = 'sessions'
  loop
    if not (rec.before ->> 'had_teams')::boolean then
      delete from public.session_teams where session_id = rec.id; -- matches and team_id go with them
    end if;
    update public.sessions
       set opens_at = (rec.before ->> 'opens_at')::timestamptz,
           teams_published_at = (rec.before ->> 'teams_published_at')::timestamptz,
           schedule_game_minutes = (rec.before ->> 'schedule_game_minutes')::smallint
     where id = rec.id;
  end loop;
  delete from public.devtools_audit where action = 'demo_seed_adopt';

  -- Payments: the seeded e-Transfers, plus any payment linked to a demo sign-up
  -- (Mark paid, or assigned by the host during the demo).
  delete from public.payments
   where gmail_message_id like 'demo-%'
      or registration_id in (
           select g.id from public.registrations g
             join public.profiles p on p.id = g.profile_id
            where p.email like '%@demo.intro2volleyball.test'
           union
           select id from public.registrations where session_id::text like 'de3a0000-0000-4000-a000-%'
         );

  -- Announcement email claims for the demo posts (registration_id is null on those).
  delete from public.email_log
   where dedupe_key like 'post:de3a0000-0000-4000-a000-%';

  -- Players: profiles, sign-ups, team requests and email logs cascade from auth.users.
  delete from auth.users where email like '%@demo.intro2volleyball.test';

  -- Demo sessions (teams, matches and any remaining sign-ups cascade), including
  -- any made from the demo weekly template.
  delete from public.sessions
   where id::text like 'de3a0000-0000-4000-a000-%'
      or template_id = 'de3a0000-0000-4000-a000-000000000001';
  delete from public.session_templates where id = 'de3a0000-0000-4000-a000-000000000001';

  delete from public.posts where id::text like 'de3a0000-0000-4000-a000-%';
end $$;

commit;
