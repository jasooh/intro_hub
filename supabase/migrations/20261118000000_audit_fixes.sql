-- Fixes from the site audit:
--   * emergency contact + 18+ confirmation, required to sign up
--   * hosts can block a player from signing up
--   * sessions remember when their time or place changed (for "session changed" emails / calendars)
--   * queued emails keep their headers (unsubscribe links)
--   * run_tick leaves a heartbeat, so hosts can see if the every-minute job stops
--   * server errors are logged for the dev account
--   * hosts can link a guest they added to the account that person makes later

-------------------------------------------------------------------------------
-- Emergency contact and 18+
-------------------------------------------------------------------------------
alter table public.profiles
  add column emergency_name text check (char_length(emergency_name) <= 100),
  add column emergency_phone text check (char_length(emergency_phone) <= 40),
  add column adult_confirmed_at timestamptz;

grant update (emergency_name, emergency_phone, adult_confirmed_at) on public.profiles to authenticated;

create or replace function public._profile_complete(p_profile_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
     where id = p_profile_id
       and nullif(trim(first_name), '') is not null
       and nullif(trim(last_name), '') is not null
       and nullif(trim(phone), '') is not null
       and nullif(trim(emergency_name), '') is not null
       and nullif(trim(emergency_phone), '') is not null
       and adult_confirmed_at is not null
       and skill_level is not null
       and attended_before is not null
       and media_consent is not null
       and waiver_accepted_at is not null
  );
$$;

-------------------------------------------------------------------------------
-- Blocked players (hosts only; the player just can't sign up)
-------------------------------------------------------------------------------
create table public.player_blocks (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  reason text check (char_length(reason) <= 500),
  blocked_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index player_blocks_blocked_by_idx on public.player_blocks (blocked_by);

alter table public.player_blocks enable row level security;
create policy player_blocks_admin_select on public.player_blocks for select to authenticated
  using ((select public.is_admin()));
create policy player_blocks_admin_insert on public.player_blocks for insert to authenticated
  with check ((select public.is_admin()));
create policy player_blocks_admin_update on public.player_blocks for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy player_blocks_admin_delete on public.player_blocks for delete to authenticated
  using ((select public.is_admin()));
revoke all on public.player_blocks from anon;

-- register_for_session: refuse blocked players right after the profile check.
-- (Patched in place so the long function isn't copied here.)
do $$
declare
  v_def text := pg_get_functiondef('public.register_for_session(uuid, text, text)'::regprocedure);
  v_find text := 'raise exception ''profile_incomplete'';';
  v_new text;
begin
  if (length(v_def) - length(replace(v_def, v_find, ''))) / length(v_find) <> 1 then
    raise exception 'register_for_session: profile check not found exactly once';
  end if;
  v_new := replace(v_def, v_find, v_find || '
  end if;
  if exists (select 1 from public.player_blocks where profile_id = v_uid) then
    raise exception ''blocked'';');
  execute v_new;
end $$;

-------------------------------------------------------------------------------
-- Session time/place changes
-------------------------------------------------------------------------------
alter table public.sessions add column schedule_revision int not null default 0;

create function public._bump_schedule_revision() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.starts_at is distinct from old.starts_at
     or new.ends_at is distinct from old.ends_at
     or new.dropin_starts_at is distinct from old.dropin_starts_at
     or new.location is distinct from old.location then
    new.schedule_revision := old.schedule_revision + 1;
  end if;
  return new;
end $$;

create trigger sessions_schedule_revision
  before update of starts_at, ends_at, dropin_starts_at, location on public.sessions
  for each row execute function public._bump_schedule_revision();

-------------------------------------------------------------------------------
-- Queued emails keep their headers
-------------------------------------------------------------------------------
alter table public.email_sends add column headers jsonb;

-------------------------------------------------------------------------------
-- Server errors (dev account only)
-------------------------------------------------------------------------------
create table public.app_errors (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  message text not null,
  digest text,
  path text,
  method text,
  kind text
);
create index app_errors_at_idx on public.app_errors (at desc);

alter table public.app_errors enable row level security;
create policy app_errors_devtools_select on public.app_errors for select to authenticated
  using ((select public.is_devtools_user()));
revoke insert, update, delete, truncate on public.app_errors from anon, authenticated;

-------------------------------------------------------------------------------
-- run_tick: heartbeat + error-log clean-up at the end. (Patched in place.)
-------------------------------------------------------------------------------
do $$
declare
  v_def text := pg_get_functiondef('public.run_tick()'::regprocedure);
  v_find text := 'return v_events;';
  v_new text;
begin
  if (length(v_def) - length(replace(v_def, v_find, ''))) / length(v_find) <> 1 then
    raise exception 'run_tick: return not found exactly once';
  end if;
  v_new := replace(v_def, v_find, 'delete from public.app_errors where at < v_now - interval ''30 days'';

  -- Heartbeat: hosts get a banner if this stops (src/lib/tick-health.ts).
  insert into public.app_settings (key, value) values (''last_tick'', to_jsonb(v_now))
  on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at;

  ' || v_find);
  execute v_new;
end $$;

-------------------------------------------------------------------------------
-- Link a host-added guest to a real account
-------------------------------------------------------------------------------
create function public.admin_merge_guest(p_guest uuid, p_account uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_guest public.profiles;
  v_account public.profiles;
  v_moved int;
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;
  select * into v_guest from public.profiles where id = p_guest;
  select * into v_account from public.profiles where id = p_account;
  if v_guest.id is null or not v_guest.guest then
    raise exception 'not_a_guest';
  end if;
  if v_account.id is null or v_account.guest then
    raise exception 'not_an_account';
  end if;

  -- Lock the sessions involved so sign-ups can't change underneath.
  perform 1 from public.sessions
   where id in (select session_id from public.registrations where profile_id in (p_guest, p_account))
   order by id for update;

  if exists (
    select 1
      from public.registrations g
      join public.registrations a on a.session_id = g.session_id and a.profile_id = p_account
     where g.profile_id = p_guest
       and g.status in ('pending_payment', 'confirmed', 'waitlisted')
       and a.status in ('pending_payment', 'confirmed', 'waitlisted')
  ) then
    raise exception 'merge_conflict';
  end if;

  update public.registrations set profile_id = p_account where profile_id = p_guest;
  get diagnostics v_moved = row_count;
  update public.feedback set profile_id = p_account where profile_id = p_guest;
  update public.player_ratings set profile_id = p_account
   where profile_id = p_guest and not exists (select 1 from public.player_ratings where profile_id = p_account);
  update public.song_checklist set profile_id = p_account
   where profile_id = p_guest and not exists (select 1 from public.song_checklist where profile_id = p_account);
  update public.profiles
     set etransfer_names = (
       select coalesce(array_agg(distinct n), '{}')
         from unnest(v_account.etransfer_names || v_guest.etransfer_names || array[v_guest.full_name]) n
        where nullif(trim(n), '') is not null
     )
   where id = p_account;

  delete from auth.users where id = p_guest;
  return v_moved;
end $$;

revoke execute on function public.admin_merge_guest(uuid, uuid) from public, anon;
grant execute on function public.admin_merge_guest(uuid, uuid) to authenticated;

-------------------------------------------------------------------------------
-- Backups include blocks
-------------------------------------------------------------------------------
create or replace function public.devtools_backup() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_out jsonb := '{}';
  v_table text;
  v_rows jsonb;
begin
  perform public._devtools_guard();
  foreach v_table in array array[
    'profiles', 'player_ratings', 'player_blocks', 'session_templates', 'sessions', 'registrations', 'payments',
    'session_teams', 'session_matches', 'team_requests', 'posts', 'email_log', 'app_settings', 'devtools_audit'
  ] loop
    execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]'') from public.%I t', v_table) into v_rows;
    v_out := v_out || jsonb_build_object(v_table, v_rows);
  end loop;
  perform public._devtools_log('backup', null, null, null, null, null);
  return v_out;
end $$;
