-- Owner tools: a repair kit for the site's owner (one Google account, not the
-- hosts). Everything goes through the owner_* functions below, which check
-- is_owner() themselves and write an owner_audit row, so the app can call them
-- with the owner's own session (no service key) and every change is traceable.
--
-- Also: app_settings (maintenance mode), which pauses new sign-ups and option
-- switches for players while something gets fixed. Cancelling still works.

-------------------------------------------------------------------------------
-- Who is the owner
-------------------------------------------------------------------------------
-- OWNER_EMAIL in src/lib/auth.ts must match.
create function public.is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users
     where id = (select auth.uid())
       and lower(email) = 'abuyuanjustin@gmail.com'
       and email_confirmed_at is not null
  );
$$;
revoke execute on function public.is_owner() from public, anon;
grant execute on function public.is_owner() to authenticated;

-------------------------------------------------------------------------------
-- Tables
-------------------------------------------------------------------------------
create table public.owner_audit (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  action text not null,
  target_table text,
  target_id text,
  before jsonb,
  after jsonb,
  note text
);
create index owner_audit_at_idx on public.owner_audit (at desc);
alter table public.owner_audit enable row level security;
create policy owner_audit_select on public.owner_audit for select to authenticated
  using ((select public.is_owner()));
revoke insert, update, delete, truncate on public.owner_audit from anon, authenticated;

create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
-- Readable by everyone so the maintenance banner can render for visitors.
create policy app_settings_select on public.app_settings for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on public.app_settings from anon, authenticated;
insert into public.app_settings (key, value) values ('maintenance', '{"on": false, "message": ""}');

-------------------------------------------------------------------------------
-- Maintenance mode: no new sign-ups or option switches for players
-------------------------------------------------------------------------------
create function public._maintenance_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Hosts can keep testing; cron / service calls (no auth.uid()) are never blocked.
  if (select auth.uid()) is not null
     and not public.is_admin()
     and coalesce((select (value ->> 'on')::boolean from public.app_settings where key = 'maintenance'), false)
  then
    raise exception 'maintenance';
  end if;
  return new;
end $$;
revoke execute on function public._maintenance_guard() from public, anon, authenticated;

create trigger registrations_maintenance_insert
  before insert on public.registrations
  for each row execute function public._maintenance_guard();
create trigger registrations_maintenance_option
  before update of option on public.registrations
  for each row when (old.option is distinct from new.option)
  execute function public._maintenance_guard();

-------------------------------------------------------------------------------
-- Helpers
-------------------------------------------------------------------------------
create function public._owner_guard() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_owner() then
    raise exception 'owner_only';
  end if;
end $$;

-- Tables the editor can browse / edit. team_requests has no id (edit via the
-- player's sign-up); owner_audit and app_settings are managed separately.
create function public._owner_table(p_table text) returns text
language plpgsql immutable set search_path = '' as $$
begin
  if p_table is null or not (p_table = any (array[
    'profiles', 'sessions', 'session_templates', 'registrations',
    'payments', 'session_teams', 'posts', 'email_log'
  ])) then
    raise exception 'unknown_table';
  end if;
  return p_table;
end $$;

create function public._owner_log(
  p_action text, p_table text, p_id text, p_before jsonb, p_after jsonb, p_note text default null
) returns void
language sql security definer set search_path = '' as $$
  insert into public.owner_audit (actor_id, action, target_table, target_id, before, after, note)
  values ((select auth.uid()), p_action, p_table, p_id, p_before, p_after, p_note);
$$;

revoke execute on function public._owner_guard() from public, anon, authenticated;
revoke execute on function public._owner_table(text) from public, anon, authenticated;
revoke execute on function public._owner_log(text, text, text, jsonb, jsonb, text) from public, anon, authenticated;

-------------------------------------------------------------------------------
-- Table editor
-------------------------------------------------------------------------------
-- Column list for building the edit form.
create function public.owner_table_columns(p_table text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._owner_guard();
  perform public._owner_table(p_table);
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', a.attname,
      'type', format_type(a.atttypid, a.atttypmod),
      'nullable', not a.attnotnull,
      'editable', a.attname not in ('id', 'created_at') and a.attgenerated = '' and a.attidentity = '',
      'enum', (select jsonb_agg(e.enumlabel order by e.enumsortorder) from pg_catalog.pg_enum e where e.enumtypid = a.atttypid)
    ) order by a.attnum), '[]')
      from pg_catalog.pg_attribute a
     where a.attrelid = format('public.%I', p_table)::regclass
       and a.attnum > 0 and not a.attisdropped
  );
end $$;

-- A page of rows, newest first, optionally filtered by text anywhere in the row.
create function public.owner_rows(p_table text, p_search text default '', p_limit int default 50, p_offset int default 0)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_order text;
  v_rows jsonb;
  v_total int;
  v_search text := coalesce(trim(p_search), '');
begin
  perform public._owner_guard();
  perform public._owner_table(p_table);
  v_order := case when p_table = 'email_log' then 'sent_at' else 'created_at' end;

  execute format(
    $q$select coalesce(jsonb_agg(to_jsonb(x)), '[]') from (
         select * from public.%1$I t
          where $1 = '' or t::text ilike '%%' || $1 || '%%'
          order by t.%2$I desc
          limit $2 offset $3) x$q$,
    p_table, v_order)
    into v_rows using v_search, least(greatest(p_limit, 1), 200), greatest(p_offset, 0);
  execute format(
    $q$select count(*) from public.%I t where $1 = '' or t::text ilike '%%' || $1 || '%%'$q$, p_table)
    into v_total using v_search;

  return jsonb_build_object('rows', v_rows, 'total', v_total);
end $$;

create function public.owner_get_row(p_table text, p_id text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_row jsonb;
begin
  perform public._owner_guard();
  perform public._owner_table(p_table);
  execute format('select to_jsonb(t) from public.%I t where t.id::text = $1', p_table) into v_row using p_id;
  return v_row;
end $$;

-- Sets only the columns present in p_patch (JSON values, null allowed).
create function public.owner_update_row(p_table text, p_id text, p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_sets text;
  v_bad text;
begin
  perform public._owner_guard();
  perform public._owner_table(p_table);
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then
    raise exception 'nothing_to_change';
  end if;

  select k into v_bad
    from jsonb_object_keys(p_patch) as k
   where k in ('id', 'created_at')
      or not exists (
        select 1 from pg_catalog.pg_attribute a
         where a.attrelid = format('public.%I', p_table)::regclass
           and a.attname = k and a.attnum > 0 and not a.attisdropped
           and a.attgenerated = '' and a.attidentity = ''
      )
   limit 1;
  if v_bad is not null then
    raise exception 'column_not_editable: %', v_bad;
  end if;

  execute format('select to_jsonb(t) from public.%I t where t.id::text = $1 for update', p_table)
    into v_before using p_id;
  if v_before is null then
    raise exception 'row_not_found';
  end if;

  select string_agg(format('%1$I = r.%1$I', k), ', ') into v_sets from jsonb_object_keys(p_patch) as k;
  execute format(
    'update public.%1$I t set %2$s from jsonb_populate_record(null::public.%1$I, $1) r where t.id::text = $2 returning to_jsonb(t)',
    p_table, v_sets)
    into v_after using p_patch, p_id;

  perform public._owner_log('update_row', p_table, p_id, v_before, v_after);
  return v_after;
end $$;

-- Deleting a profile deletes the whole account (auth user, sign-ups cascade).
create function public.owner_delete_row(p_table text, p_id text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_before jsonb;
begin
  perform public._owner_guard();
  perform public._owner_table(p_table);
  execute format('select to_jsonb(t) from public.%I t where t.id::text = $1', p_table) into v_before using p_id;
  if v_before is null then
    raise exception 'row_not_found';
  end if;
  if p_table = 'profiles' then
    if p_id = (select auth.uid())::text then
      raise exception 'cannot_delete_owner';
    end if;
    delete from auth.users where id = p_id::uuid;
  else
    execute format('delete from public.%I t where t.id::text = $1', p_table) using p_id;
  end if;
  perform public._owner_log('delete_row', p_table, p_id, v_before, null);
end $$;

-------------------------------------------------------------------------------
-- Repairs
-------------------------------------------------------------------------------
-- Put a sign-up into a status with the bookkeeping that status needs, then let
-- the waitlist move up if that freed a spot. Returns events for emails.
create function public.owner_force_status(p_registration_id uuid, p_status public.registration_status) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r public.registrations;
  s public.sessions;
  v_after jsonb;
begin
  perform public._owner_guard();
  select * into r from public.registrations where id = p_registration_id;
  if not found then
    raise exception 'registration_not_found';
  end if;
  select * into s from public.sessions where id = r.session_id for update;
  select * into r from public.registrations where id = p_registration_id for update;

  update public.registrations
     set status = p_status,
         confirmed_at = case when p_status = 'confirmed' then coalesce(confirmed_at, now()) else confirmed_at end,
         hold_expires_at = case when p_status = 'pending_payment'
                                then least(now() + make_interval(hours => s.hold_hours), greatest(s.starts_at, now() + interval '30 minutes'))
                           end,
         queued_at = case when p_status = 'waitlisted' then coalesce(queued_at, now()) end,
         cancelled_at = case when p_status = 'cancelled' then coalesce(cancelled_at, now()) else cancelled_at end
   where id = r.id
  returning to_jsonb(registrations.*) into v_after;

  perform public._owner_log('force_status', 'registrations', r.id::text, to_jsonb(r), v_after, p_status::text);
  return public._promote(s.id);
end $$;

-- Bulk clean-ups. Returns how many rows went.
create function public.owner_clear(p_scope text) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_count int;
begin
  perform public._owner_guard();
  case p_scope
    when 'email_log' then
      delete from public.email_log;
    when 'past_sessions' then
      -- Sign-ups, teams and their emails cascade; payments stay, unlinked.
      delete from public.sessions where ends_at < now();
    when 'unmatched_payments' then
      delete from public.payments where registration_id is null;
    when 'audit' then
      delete from public.owner_audit where at < now() - interval '30 days';
    else
      raise exception 'unknown_scope';
  end case;
  get diagnostics v_count = row_count;
  perform public._owner_log('clear', null, null, null, null, format('%s (%s rows)', p_scope, v_count));
  return v_count;
end $$;

-- Wipes every session, sign-up, payment, team, post and email record. Keeps
-- accounts, the weekly schedule, settings and the audit log. p_wipe_players
-- also deletes every account except the owner's.
create function public.owner_reset(p_confirm text, p_wipe_players boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._owner_guard();
  if p_confirm is distinct from 'RESET' then
    raise exception 'confirm_mismatch';
  end if;
  truncate public.team_requests, public.session_teams, public.email_log, public.payments,
           public.registrations, public.posts, public.sessions;
  if p_wipe_players then
    delete from auth.users where id <> (select auth.uid());
  end if;
  perform public._owner_log('reset', null, null, null, null,
    case when p_wipe_players then 'everything + player accounts' else 'everything except accounts' end);
end $$;

create function public.owner_set_maintenance(p_on boolean, p_message text default '') returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_before jsonb;
  v_after jsonb := jsonb_build_object('on', coalesce(p_on, false), 'message', left(trim(coalesce(p_message, '')), 300));
begin
  perform public._owner_guard();
  select value into v_before from public.app_settings where key = 'maintenance';
  insert into public.app_settings (key, value, updated_at) values ('maintenance', v_after, now())
  on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at;
  perform public._owner_log('maintenance', 'app_settings', 'maintenance', v_before, v_after);
end $$;

-- Lets the owner re-send an email: drops its de-dupe claim so the app can send it again.
create function public.owner_release_email(p_email_id bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.email_log;
begin
  perform public._owner_guard();
  delete from public.email_log where id = p_email_id returning * into v_row;
  if v_row.id is null then
    raise exception 'row_not_found';
  end if;
  perform public._owner_log('resend_email', 'email_log', p_email_id::text, to_jsonb(v_row), null, v_row.kind);
  return to_jsonb(v_row);
end $$;

-------------------------------------------------------------------------------
-- Health + backup
-------------------------------------------------------------------------------
create function public.owner_health() returns jsonb
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

-- Every table as JSON, for a download before risky changes.
create function public.owner_backup() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_out jsonb := '{}';
  v_table text;
  v_rows jsonb;
begin
  perform public._owner_guard();
  foreach v_table in array array[
    'profiles', 'session_templates', 'sessions', 'registrations', 'payments',
    'session_teams', 'team_requests', 'posts', 'email_log', 'app_settings', 'owner_audit'
  ] loop
    execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]'') from public.%I t', v_table) into v_rows;
    v_out := v_out || jsonb_build_object(v_table, v_rows);
  end loop;
  perform public._owner_log('backup', null, null, null, null, null);
  return v_out;
end $$;

-------------------------------------------------------------------------------
-- Grants: signed-in only; each function checks is_owner() itself
-------------------------------------------------------------------------------
revoke execute on function public.owner_table_columns(text) from public, anon;
revoke execute on function public.owner_rows(text, text, int, int) from public, anon;
revoke execute on function public.owner_get_row(text, text) from public, anon;
revoke execute on function public.owner_update_row(text, text, jsonb) from public, anon;
revoke execute on function public.owner_delete_row(text, text) from public, anon;
revoke execute on function public.owner_force_status(uuid, public.registration_status) from public, anon;
revoke execute on function public.owner_clear(text) from public, anon;
revoke execute on function public.owner_reset(text, boolean) from public, anon;
revoke execute on function public.owner_set_maintenance(boolean, text) from public, anon;
revoke execute on function public.owner_release_email(bigint) from public, anon;
revoke execute on function public.owner_health() from public, anon;
revoke execute on function public.owner_backup() from public, anon;
grant execute on function public.owner_table_columns(text) to authenticated;
grant execute on function public.owner_rows(text, text, int, int) to authenticated;
grant execute on function public.owner_get_row(text, text) to authenticated;
grant execute on function public.owner_update_row(text, text, jsonb) to authenticated;
grant execute on function public.owner_delete_row(text, text) to authenticated;
grant execute on function public.owner_force_status(uuid, public.registration_status) to authenticated;
grant execute on function public.owner_clear(text) to authenticated;
grant execute on function public.owner_reset(text, boolean) to authenticated;
grant execute on function public.owner_set_maintenance(boolean, text) to authenticated;
grant execute on function public.owner_release_email(bigint) to authenticated;
grant execute on function public.owner_health() to authenticated;
grant execute on function public.owner_backup() to authenticated;
