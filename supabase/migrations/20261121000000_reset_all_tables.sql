-- The dev-tools reset missed tables added after it was written (feedback,
-- songs, email queue, ratings, blocks, error log…). It now empties every table
-- in public except the ones it promises to keep, so new tables are covered
-- automatically:
--   profiles (accounts), session_templates (weekly schedule),
--   app_settings (settings), devtools_audit (audit log).
-- email_health is a single settings-like row the email code updates in place,
-- so it's cleared rather than deleted.

create or replace function public.devtools_reset(p_confirm text, p_wipe_players boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_tables text;
begin
  perform public._devtools_guard();
  if p_confirm is distinct from 'RESET' then
    raise exception 'confirm_mismatch';
  end if;

  select string_agg(format('public.%I', tablename), ', ' order by tablename)
    into v_tables
    from pg_tables
   where schemaname = 'public'
     and tablename not in ('profiles', 'session_templates', 'app_settings', 'devtools_audit', 'email_health');
  if v_tables is not null then
    execute 'truncate ' || v_tables;
  end if;
  update public.email_health set paused_until = null, reason = null, detail = null, updated_at = now() where id;

  if p_wipe_players then
    delete from auth.users where id <> (select auth.uid());
  end if;
  perform public._devtools_log('reset', null, null, null, null,
    case when p_wipe_players then 'everything + player accounts' else 'everything except accounts' end);
end $$;
