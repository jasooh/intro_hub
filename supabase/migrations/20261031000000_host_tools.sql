-- Host tools:
--   1. Payment reminders: run_tick emails a player once when their unpaid hold is
--      about to run out, and hosts can nudge everyone unpaid in a session.
--   2. Roster emails: a log of messages hosts sent to one session's players.
--   3. Stats: admin_stats() for the /admin/stats page.

-------------------------------------------------------------------------------
-- 1. Payment reminders
-------------------------------------------------------------------------------

alter table public.registrations add column hold_nudged_at timestamptz;

-- A new or moved hold deadline (sign-up again, host changed hold_hours, partial
-- payment extension...) can be reminded about again.
create function public._reset_hold_nudge() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.hold_expires_at is distinct from old.hold_expires_at
     and new.hold_nudged_at is not distinct from old.hold_nudged_at then
    new.hold_nudged_at := null;
  end if;
  return new;
end $$;

create trigger registrations_reset_hold_nudge
  before update of hold_expires_at on public.registrations
  for each row execute function public._reset_hold_nudge();

revoke execute on function public._reset_hold_nudge() from public, anon, authenticated;

-- Host button: remind everyone in this session who still owes money. Skips
-- anyone reminded in the last few minutes so a double click can't double-send.
create function public.admin_nudge_unpaid(p_session_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_events jsonb := '[]';
  v_now timestamptz := now();
  r record;
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;
  perform 1 from public.sessions where id = p_session_id for update;
  if not found then
    raise exception 'session_not_found';
  end if;
  for r in
    update public.registrations
       set hold_nudged_at = v_now
     where session_id = p_session_id
       and status = 'pending_payment'
       and (hold_expires_at is null or hold_expires_at > v_now)
       and (hold_nudged_at is null or hold_nudged_at < v_now - interval '5 minutes')
    returning id
  loop
    v_events := v_events || jsonb_build_object('event', 'hold_reminder', 'registration_id', r.id, 'nudged_at', v_now);
  end loop;
  return v_events;
end $$;

revoke execute on function public.admin_nudge_unpaid(uuid) from public, anon;
grant execute on function public.admin_nudge_unpaid(uuid) to authenticated;

-- Same as 20261028000000_bring_a_friend_and_deposits.sql, plus step 5.
create or replace function public.run_tick() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_events jsonb := '[]';
  v_now timestamptz := now();
  v_sid uuid;
  r record;
begin
  perform public.create_sessions_from_templates();

  -- 1. Expire unpaid holds (session lock first, like everywhere else).
  for v_sid in
    select distinct session_id from public.registrations
     where status = 'pending_payment' and hold_expires_at <= now()
  loop
    perform 1 from public.sessions where id = v_sid for update;
    for r in
      update public.registrations
         set status = 'expired', hold_expires_at = null, refund_owed = (paid_cents > 0)
       where session_id = v_sid and status = 'pending_payment' and hold_expires_at <= now()
      returning id
    loop
      v_events := v_events || jsonb_build_object('event', 'expired', 'registration_id', r.id);
    end loop;
  end loop;

  -- 2. Fill any free spots from waitlists.
  for v_sid in
    select distinct r2.session_id
      from public.registrations r2
      join public.sessions s on s.id = r2.session_id
     where r2.status = 'waitlisted' and s.status = 'scheduled' and s.starts_at > now()
  loop
    v_events := v_events || public._promote(v_sid);
  end loop;

  -- 3. Day-before reminders for confirmed players.
  for v_sid in
    update public.sessions
       set reminder_sent_at = now()
     where status = 'scheduled'
       and reminder_sent_at is null
       and starts_at > now()
       and starts_at <= now() + interval '24 hours'
    returning id
  loop
    v_events := v_events || coalesce((
      select jsonb_agg(jsonb_build_object('event', 'reminder', 'registration_id', id))
        from public.registrations
       where session_id = v_sid and status = 'confirmed'
    ), '[]'::jsonb);
  end loop;

  -- 4. Deposit sessions: once a session is over, everyone still confirmed gets
  --    their refundable deposit back (Refunds -> Deposit). Runs once per session.
  for v_sid in
    update public.sessions
       set deposits_released_at = now()
     where deposit_cents is not null and deposits_released_at is null and ends_at < now()
    returning id
  loop
    update public.registrations
       set refund_owed = true
     where session_id = v_sid and status = 'confirmed' and paid_cents > 0;
  end loop;

  -- 5. Payment reminders: once per hold, when it has at most 2 hours left (or
  --    half its window, for short holds, so it never lands right after the
  --    sign-up email).
  for r in
    update public.registrations reg
       set hold_nudged_at = v_now
      from public.sessions s
     where s.id = reg.session_id
       and s.status = 'scheduled'
       and reg.status = 'pending_payment'
       and reg.hold_nudged_at is null
       and reg.hold_expires_at > v_now
       and reg.hold_expires_at <= v_now + least(interval '2 hours', make_interval(hours => s.hold_hours) / 2)
    returning reg.id
  loop
    v_events := v_events || jsonb_build_object('event', 'hold_reminder', 'registration_id', r.id, 'nudged_at', v_now);
  end loop;

  return v_events;
end $$;

-------------------------------------------------------------------------------
-- 2. Roster emails
-------------------------------------------------------------------------------

create table public.session_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  subject text not null check (char_length(subject) between 1 and 150),
  body_html text not null,
  audiences text[] not null check (
    cardinality(audiences) > 0 and audiences <@ array['confirmed', 'pending_payment', 'waitlisted', 'instructional']
  ),
  sent_by uuid references public.profiles (id) on delete set null,
  recipient_count int not null default 0,
  created_at timestamptz not null default now()
);

create index session_messages_session_idx on public.session_messages (session_id, created_at desc);

alter table public.session_messages enable row level security;
create policy session_messages_admin_select on public.session_messages for select to authenticated
  using (public.is_admin());
create policy session_messages_admin_insert on public.session_messages for insert to authenticated
  with check (public.is_admin());
revoke update, delete on public.session_messages from anon, authenticated;

-- Dev tools reset also clears the new table.
create or replace function public.devtools_reset(p_confirm text, p_wipe_players boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._devtools_guard();
  if p_confirm is distinct from 'RESET' then
    raise exception 'confirm_mismatch';
  end if;
  truncate public.session_messages, public.session_matches, public.team_requests, public.session_teams,
           public.email_log, public.payments, public.registrations, public.posts, public.sessions;
  if p_wipe_players then
    delete from auth.users where id <> (select auth.uid());
  end if;
  perform public._devtools_log('reset', null, null, null, null,
    case when p_wipe_players then 'everything + player accounts' else 'everything except accounts' end);
end $$;

-------------------------------------------------------------------------------
-- 3. Stats
-------------------------------------------------------------------------------

-- Sessions starting in [p_from, p_to), with how full they were and the money:
--   collected = what players sent, minus what was refunded (same amounts as
--               src/lib/refunds.ts refundAmount)
--   owed      = what unpaid holds still owe
-- Players: first-timers whose first played session is in the range, returning
-- players who also played in it, and regulars who haven't been back in 4 weeks.
create function public.admin_stats(p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_sessions jsonb;
  v_players jsonb;
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;

  select coalesce(jsonb_agg(x order by x.starts_at), '[]') into v_sessions from (
    select s.id, s.title, s.starts_at, s.status, s.capacity,
           count(*) filter (where r.option = 'full' and r.status = 'confirmed') as confirmed,
           count(*) filter (where r.option = 'full' and r.status = 'pending_payment') as holding,
           count(*) filter (where r.option = 'instructional' and r.status in ('confirmed', 'pending_payment')) as instructional,
           count(*) filter (where r.status = 'waitlisted') as waitlisted,
           count(*) filter (where r.status = 'expired') as expired,
           coalesce(sum(r.paid_cents), 0)
             - coalesce(sum(
                 case
                   when r.refunded_at is null then 0
                   when s.deposit_cents is not null then r.paid_cents
                   when r.status = 'confirmed' then greatest(r.paid_cents - r.amount_cents, 0)
                   else r.paid_cents
                 end), 0) as collected,
           coalesce(sum(greatest(r.amount_cents - r.paid_cents, 0)) filter (where r.status = 'pending_payment'), 0) as owed
      from public.sessions s
      left join public.registrations r on r.session_id = s.id
     where s.starts_at >= p_from and s.starts_at < p_to
     group by s.id
  ) x;

  with played as (
    -- Confirmed spots in sessions that went ahead and have started.
    select r.profile_id, s.starts_at
      from public.registrations r
      join public.sessions s on s.id = r.session_id
     where r.status = 'confirmed' and s.status = 'scheduled' and s.starts_at <= now()
  ),
  per_player as (
    select profile_id,
           min(starts_at) as first_played,
           max(starts_at) as last_played,
           count(*) as times,
           bool_or(starts_at >= p_from and starts_at < p_to) as played_in_range
      from played
     group by profile_id
  ),
  upcoming as (
    select distinct r.profile_id
      from public.registrations r
      join public.sessions s on s.id = r.session_id
     where s.starts_at > now() and s.status = 'scheduled'
       and r.status in ('pending_payment', 'confirmed', 'waitlisted')
  )
  select jsonb_build_object(
    'new', (select count(*) from per_player where first_played >= p_from and first_played < p_to),
    'returning', (select count(*) from per_player where played_in_range and first_played < p_from),
    'lapsed', (
      select coalesce(jsonb_agg(l order by l.last_played desc), '[]') from (
        select p.id, coalesce(p.display_name, p.full_name, p.email) as name, pp.last_played, pp.times
          from per_player pp
          join public.profiles p on p.id = pp.profile_id
         where pp.times >= 2
           and pp.last_played < now() - interval '28 days'
           and pp.profile_id not in (select profile_id from upcoming)
         order by pp.last_played desc
         limit 50
      ) l
    )
  ) into v_players;

  return jsonb_build_object('sessions', v_sessions, 'players', v_players);
end $$;

revoke execute on function public.admin_stats(timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_stats(timestamptz, timestamptz) to authenticated;
