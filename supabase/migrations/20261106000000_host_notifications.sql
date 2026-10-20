-- Host notifications:
--   * host_activity: a log of what players did (joined, waitlisted, moved up,
--     paid, cancelled, hold expired) and e-Transfers that arrived unmatched.
--     Written by triggers, so every path (players, hosts, the tick) is caught.
--   * Per-host settings on profiles: a digest (off / every 3 hours / daily),
--     a session-day email, and instant alerts for late cancellations and
--     unmatched payments. The emails themselves are sent by the cron route
--     (src/lib/host-notifications.ts).

alter table public.profiles
  add column host_digest text not null default '3h' check (host_digest in ('off', '3h', 'daily')),
  add column host_session_day boolean not null default true,
  add column host_alert_late_cancel boolean not null default true,
  add column host_alert_unmatched boolean not null default true,
  add column host_digest_sent_at timestamptz;

-- When the session-day email went out (once per session).
alter table public.sessions add column host_day_sent_at timestamptz;

create table public.host_activity (
  id bigint generated always as identity primary key,
  kind text not null check (
    kind in ('joined', 'waitlisted', 'promoted', 'paid', 'cancelled', 'expired', 'unmatched_payment')
  ),
  session_id uuid references public.sessions (id) on delete cascade,
  registration_id uuid references public.registrations (id) on delete cascade,
  payment_id uuid references public.payments (id) on delete cascade,
  -- A cancellation within 24 hours of the start (an instant alert).
  late boolean not null default false,
  -- Instant alert handled (sent, or no longer needed).
  alerted_at timestamptz,
  created_at timestamptz not null default now()
);
create index host_activity_created_idx on public.host_activity (created_at desc);
create index host_activity_pending_alert_idx on public.host_activity (created_at)
  where alerted_at is null and (late or kind = 'unmatched_payment');

alter table public.host_activity enable row level security;
create policy host_activity_admin_select on public.host_activity for select to authenticated
  using (public.is_admin());
revoke insert, update, delete on public.host_activity from anon, authenticated;

-------------------------------------------------------------------------------
-- Triggers
-------------------------------------------------------------------------------
create function public._log_registration_activity() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_kind text;
  v_late boolean := false;
  v_starts timestamptz;
begin
  if tg_op = 'INSERT' then
    v_kind := case new.status when 'waitlisted' then 'waitlisted' else 'joined' end;
  elsif new.status is distinct from old.status then
    v_kind := case
      when new.status = 'cancelled' then 'cancelled'
      when new.status = 'confirmed' then 'paid'
      when new.status = 'expired' then 'expired'
      when new.status = 'waitlisted' then 'waitlisted'
      when old.status = 'waitlisted' and new.status = 'pending_payment' then 'promoted'
    end;
    if v_kind = 'cancelled' and old.status in ('pending_payment', 'confirmed') then
      select starts_at into v_starts from public.sessions where id = new.session_id;
      v_late := now() < v_starts and now() >= v_starts - interval '24 hours';
    end if;
  end if;

  if v_kind is not null then
    insert into public.host_activity (kind, session_id, registration_id, late)
    values (v_kind, new.session_id, new.id, v_late);
  end if;
  return null;
end $$;

create trigger registrations_log_activity
  after insert or update of status on public.registrations
  for each row execute function public._log_registration_activity();

-- e-Transfers from Gmail that arrive without a sign-up. The ingest matches
-- right after inserting, so the alert waits a couple of minutes and only goes
-- out if the payment is still unmatched (src/lib/host-notifications.ts).
create function public._log_unmatched_payment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.registration_id is null and new.gmail_message_id is not null then
    insert into public.host_activity (kind, payment_id) values ('unmatched_payment', new.id);
  end if;
  return null;
end $$;

create trigger payments_log_unmatched
  after insert on public.payments
  for each row execute function public._log_unmatched_payment();

revoke execute on function public._log_registration_activity() from public, anon, authenticated;
revoke execute on function public._log_unmatched_payment() from public, anon, authenticated;

-- Dev tools reset also clears the activity log (it points at sessions and sign-ups).
create or replace function public.devtools_reset(p_confirm text, p_wipe_players boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._devtools_guard();
  if p_confirm is distinct from 'RESET' then
    raise exception 'confirm_mismatch';
  end if;
  truncate public.host_activity, public.session_messages, public.session_matches, public.team_requests,
           public.session_teams, public.email_log, public.payments, public.registrations, public.posts,
           public.sessions;
  if p_wipe_players then
    delete from auth.users where id <> (select auth.uid());
  end if;
  perform public._devtools_log('reset', null, null, null, null,
    case when p_wipe_players then 'everything + player accounts' else 'everything except accounts' end);
end $$;
