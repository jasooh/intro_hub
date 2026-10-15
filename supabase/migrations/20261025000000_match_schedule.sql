-- Game schedule: which team plays which, in what order. Hosts generate a round
-- robin (src/lib/schedule.ts) and can swap matchups; players see it alongside
-- the teams once the host publishes them (sessions.teams_published_at).

create table public.session_matches (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  slot smallint not null check (slot >= 1),     -- time block, in order
  court smallint not null check (court between 1 and 3),
  team_a_id uuid not null references public.session_teams (id) on delete cascade,
  team_b_id uuid not null references public.session_teams (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (team_a_id <> team_b_id),
  unique (session_id, slot, court)
);
create index session_matches_team_a_idx on public.session_matches (team_a_id);
create index session_matches_team_b_idx on public.session_matches (team_b_id);

-- Minutes per game; times count up from drop-in start. Null = order only.
alter table public.sessions
  add column schedule_game_minutes smallint check (schedule_game_minutes between 5 and 120);

-- Same visibility as the teams: hosts always, players once teams are published.
alter table public.session_matches enable row level security;
create policy session_matches_select on public.session_matches for select to authenticated
  using (
    (select public.is_admin())
    or exists (
      select 1 from public.sessions s
       where s.id = session_matches.session_id and s.teams_published_at is not null
    )
  );
create policy session_matches_admin_insert on public.session_matches for insert to authenticated
  with check ((select public.is_admin()));
create policy session_matches_admin_update on public.session_matches for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy session_matches_admin_delete on public.session_matches for delete to authenticated
  using ((select public.is_admin()));
revoke all on public.session_matches from anon;

-------------------------------------------------------------------------------
-- Owner tools now know about matches (reset truncates them with sessions)
-------------------------------------------------------------------------------
create or replace function public.owner_reset(p_confirm text, p_wipe_players boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._owner_guard();
  if p_confirm is distinct from 'RESET' then
    raise exception 'confirm_mismatch';
  end if;
  truncate public.session_matches, public.team_requests, public.session_teams, public.email_log, public.payments,
           public.registrations, public.posts, public.sessions;
  if p_wipe_players then
    delete from auth.users where id <> (select auth.uid());
  end if;
  perform public._owner_log('reset', null, null, null, null,
    case when p_wipe_players then 'everything + player accounts' else 'everything except accounts' end);
end $$;

create or replace function public.owner_backup() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_out jsonb := '{}';
  v_table text;
  v_rows jsonb;
begin
  perform public._owner_guard();
  foreach v_table in array array[
    'profiles', 'session_templates', 'sessions', 'registrations', 'payments',
    'session_teams', 'session_matches', 'team_requests', 'posts', 'email_log', 'app_settings', 'owner_audit'
  ] loop
    execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]'') from public.%I t', v_table) into v_rows;
    v_out := v_out || jsonb_build_object(v_table, v_rows);
  end loop;
  perform public._owner_log('backup', null, null, null, null, null);
  return v_out;
end $$;

create or replace function public.owner_health() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_cron jsonb := null;
begin
  perform public._owner_guard();
  -- pg_cron only exists on the hosted database (not in tests / local).
  if to_regclass('cron.job_run_details') is not null then
    execute $q$
      select coalesce(jsonb_agg(x), '[]') from (
        select d.status, d.start_time, d.end_time, left(d.return_message, 200) as message, j.jobname
          from cron.job_run_details d left join cron.job j on j.jobid = d.jobid
         order by d.start_time desc limit 5) x$q$
      into v_cron;
  end if;

  return jsonb_build_object(
    'counts', jsonb_build_object(
      'profiles', (select count(*) from public.profiles),
      'sessions', (select count(*) from public.sessions),
      'session_templates', (select count(*) from public.session_templates),
      'registrations', (select count(*) from public.registrations),
      'payments', (select count(*) from public.payments),
      'session_teams', (select count(*) from public.session_teams),
      'session_matches', (select count(*) from public.session_matches),
      'team_requests', (select count(*) from public.team_requests),
      'posts', (select count(*) from public.posts),
      'email_log', (select count(*) from public.email_log)
    ),
    'cron', v_cron,
    'last_payment_at', (select max(received_at) from public.payments where gmail_message_id is not null),
    'unmatched_payments', (select count(*) from public.payments where registration_id is null and not dismissed),
    'stuck_holds', (select count(*) from public.registrations
                     where status = 'pending_payment' and hold_expires_at < now() - interval '5 minutes'),
    'recent_emails', (select coalesce(jsonb_agg(x), '[]') from (
                        select e.id, e.kind, e.sent_at, e.registration_id, p.email as recipient
                          from public.email_log e
                          left join public.registrations r on r.id = e.registration_id
                          left join public.profiles p on p.id = r.profile_id
                         order by e.sent_at desc limit 15) x),
    'maintenance', (select value from public.app_settings where key = 'maintenance')
  );
end $$;
