-- A more useful Stats page, without logging what players do.
--
-- Everything comes from data the app already keeps (sign-up and payment
-- timestamps, profiles, host_activity). Two things keep it from growing forever:
--   * session_stats: a summary written once when a session ends (by run_tick),
--     so older detail (host_activity) can be cleaned up without losing the
--     numbers the Stats page shows.
--   * Clean-up in run_tick: host_activity after 180 days, email_sends after
--     90 days, email_log after 400 days.
-- admin_stats gains timing / reliability / growth / demand sections.

-------------------------------------------------------------------------------
-- Per-session summary
-------------------------------------------------------------------------------
alter table public.sessions add column stats_at timestamptz;

create table public.session_stats (
  session_id uuid primary key references public.sessions (id) on delete cascade,
  starts_at timestamptz not null,
  cancelled_session boolean not null default false,
  capacity int not null,
  dropin int not null default 0,         -- Instructional + Drop-in, paid or holding at the end
  dropin_only int not null default 0,    -- Drop-in only
  instructional int not null default 0,  -- Instructional only
  waitlisted int not null default 0,     -- joined a waitlist at some point
  promoted int not null default 0,       -- got a spot from the waitlist
  cancelled int not null default 0,
  late_cancelled int not null default 0, -- within 24 h of the start
  expired int not null default 0,        -- holds that ran out unpaid
  signups int not null default 0,        -- everyone who signed up for a spot or the lesson
  minutes_to_full int,                   -- from sign-ups opening until as many signed up as there were spots
  first_hour_pct int,                    -- % of drop-in spots claimed in the first hour of sign-ups
  first_day_pct int,
  collected int not null default 0,      -- money in, minus refunds sent
  refunded int not null default 0,
  owed int not null default 0,
  matched_ref int not null default 0,    -- payments matched by VB- code
  matched_name int not null default 0,   -- by name + amount
  matched_admin int not null default 0,  -- marked paid by a host
  computed_at timestamptz not null default now()
);
create index session_stats_starts_idx on public.session_stats (starts_at);

alter table public.session_stats enable row level security;
create policy session_stats_admin_select on public.session_stats for select to authenticated using (public.is_admin());
revoke insert, update, delete, truncate on public.session_stats from anon, authenticated;

-- How fast a session's drop-in spots were claimed after sign-ups opened.
create function public._fill_stats(p_session_id uuid)
returns table (minutes_to_full int, first_hour_pct int, first_day_pct int)
language sql stable security definer set search_path = '' as $$
  with s as (select * from public.sessions where id = p_session_id),
  spots as (
    select r.created_at, row_number() over (order by r.created_at) as n
      from public.registrations r, s
     where r.session_id = s.id and r.option in ('full', 'dropin')
  )
  select
    (select (extract(epoch from spots.created_at - s.opens_at) / 60)::int
       from spots, s where spots.n = s.capacity),
    (select least(100, round(100.0 * count(*) / nullif(s.capacity, 0)))::int
       from spots, s where spots.created_at < s.opens_at + interval '1 hour' group by s.capacity),
    (select least(100, round(100.0 * count(*) / nullif(s.capacity, 0)))::int
       from spots, s where spots.created_at < s.opens_at + interval '1 day' group by s.capacity)
$$;

create function public._compute_session_stats(p_session_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s public.sessions;
  f record;
begin
  select * into s from public.sessions where id = p_session_id;
  if not found then
    return;
  end if;
  select * into f from public._fill_stats(s.id);

  insert into public.session_stats (
    session_id, starts_at, cancelled_session, capacity, dropin, dropin_only, instructional,
    waitlisted, promoted, cancelled, late_cancelled, expired, signups,
    minutes_to_full, first_hour_pct, first_day_pct, collected, refunded, owed,
    matched_ref, matched_name, matched_admin, computed_at
  )
  select s.id, s.starts_at, s.status = 'cancelled', s.capacity,
         count(*) filter (where r.option = 'full' and r.status in ('confirmed', 'pending_payment')),
         count(*) filter (where r.option = 'dropin' and r.status in ('confirmed', 'pending_payment')),
         count(*) filter (where r.option = 'instructional' and r.status in ('confirmed', 'pending_payment')),
         greatest(
           (select count(*) from public.host_activity a where a.session_id = s.id and a.kind = 'waitlisted'),
           count(*) filter (where r.status = 'waitlisted')
         ),
         (select count(*) from public.host_activity a where a.session_id = s.id and a.kind = 'promoted'),
         count(*) filter (where r.status = 'cancelled'),
         count(*) filter (where r.status = 'cancelled' and r.cancelled_at > s.starts_at - interval '24 hours'),
         count(*) filter (where r.status = 'expired'),
         count(*),
         f.minutes_to_full, f.first_hour_pct, f.first_day_pct,
         coalesce(sum(r.paid_cents), 0) - coalesce(sum(public._refunded_cents(r, s)), 0),
         coalesce(sum(public._refunded_cents(r, s)), 0),
         coalesce(sum(greatest(r.amount_cents - r.paid_cents, 0)) filter (where r.status = 'pending_payment'), 0),
         (select count(*) from public.payments p join public.registrations x on x.id = p.registration_id
           where x.session_id = s.id and p.reversed_at is null and p.matched_by = 'ref'),
         (select count(*) from public.payments p join public.registrations x on x.id = p.registration_id
           where x.session_id = s.id and p.reversed_at is null and p.matched_by = 'name_amount'),
         (select count(*) from public.payments p join public.registrations x on x.id = p.registration_id
           where x.session_id = s.id and p.reversed_at is null and p.matched_by = 'admin'),
         now()
    from public.registrations r
   where r.session_id = s.id
  on conflict (session_id) do update set
    starts_at = excluded.starts_at, cancelled_session = excluded.cancelled_session, capacity = excluded.capacity,
    dropin = excluded.dropin, dropin_only = excluded.dropin_only, instructional = excluded.instructional,
    waitlisted = excluded.waitlisted, promoted = excluded.promoted, cancelled = excluded.cancelled,
    late_cancelled = excluded.late_cancelled, expired = excluded.expired, signups = excluded.signups,
    minutes_to_full = excluded.minutes_to_full, first_hour_pct = excluded.first_hour_pct,
    first_day_pct = excluded.first_day_pct, collected = excluded.collected, refunded = excluded.refunded,
    owed = excluded.owed, matched_ref = excluded.matched_ref, matched_name = excluded.matched_name,
    matched_admin = excluded.matched_admin, computed_at = excluded.computed_at;

  -- A session nobody signed up for still gets a row.
  insert into public.session_stats (session_id, starts_at, cancelled_session, capacity)
  values (s.id, s.starts_at, s.status = 'cancelled', s.capacity)
  on conflict (session_id) do nothing;
end $$;

-- What was sent back to a player (same amounts as src/lib/refunds.ts refundAmount).
create function public._refunded_cents(r public.registrations, s public.sessions) returns int
language sql immutable set search_path = '' as $$
  select case
    when r.refunded_at is null then 0
    when s.deposit_cents is not null then r.paid_cents
    when r.status = 'confirmed' then greatest(r.paid_cents - r.amount_cents, 0)
    else r.paid_cents
  end
$$;

revoke execute on function public._fill_stats(uuid) from public, anon, authenticated;
revoke execute on function public._compute_session_stats(uuid) from public, anon, authenticated;
revoke execute on function public._refunded_cents(public.registrations, public.sessions) from public, anon, authenticated;

-- Indexes the clean-up uses.
create index email_sends_created_idx on public.email_sends (created_at);
create index email_log_sent_idx on public.email_log (sent_at);

-------------------------------------------------------------------------------
-- The tick: summaries for sessions that just ended, then clean-up
-------------------------------------------------------------------------------
-- Same as 20261102000000_session_open_emails.sql, plus steps 7 and 8.
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
      returning id, brought_by
    loop
      v_events := v_events || jsonb_build_object('event', 'expired', 'registration_id', r.id);
      if r.brought_by is not null then
        v_events := v_events || public._release_regular(r.brought_by);
      end if;
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
  --    half its window, for short holds).
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

  -- 6. Sign-ups just opened: one email to everyone who gets announcements.
  for v_sid in
    update public.sessions
       set announced_at = v_now
     where status = 'scheduled'
       and announce
       and announced_at is null
       and opens_at <= v_now
       and opens_at > v_now - interval '1 day'
       and starts_at > v_now
    returning id
  loop
    v_events := v_events || jsonb_build_object('event', 'session_open', 'session_id', v_sid);
  end loop;

  -- 7. Stats: a summary of each session once it has ended (cancelled ones too).
  for v_sid in
    update public.sessions
       set stats_at = v_now
     where stats_at is null and ends_at < v_now
    returning id
  loop
    perform public._compute_session_stats(v_sid);
  end loop;

  -- 8. Clean-up, so the logs don't grow forever (each run only deletes what just aged out).
  delete from public.host_activity
   where created_at < v_now - interval '180 days' and (alerted_at is not null or not (late or kind in ('unmatched_payment', 'payment_reversed')));
  delete from public.email_sends
   where created_at < v_now - interval '90 days' and status in ('sent', 'failed', 'expired');
  delete from public.email_log where sent_at < v_now - interval '400 days';

  return v_events;
end $$;

-- Every session that has already ended gets its summary now.
do $$
declare
  v_sid uuid;
begin
  for v_sid in
    update public.sessions set stats_at = now() where stats_at is null and ends_at < now() returning id
  loop
    perform public._compute_session_stats(v_sid);
  end loop;
end $$;

-- Dev tools reset also clears the session summaries (they point at sessions).
create or replace function public.devtools_reset(p_confirm text, p_wipe_players boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._devtools_guard();
  if p_confirm is distinct from 'RESET' then
    raise exception 'confirm_mismatch';
  end if;
  truncate public.session_stats, public.host_activity, public.payment_cancellations, public.session_messages,
           public.session_matches, public.team_requests, public.session_teams, public.email_log, public.payments,
           public.registrations, public.posts, public.sessions;
  if p_wipe_players then
    delete from auth.users where id <> (select auth.uid());
  end if;
  perform public._devtools_log('reset', null, null, null, null,
    case when p_wipe_players then 'everything + player accounts' else 'everything except accounts' end);
end $$;

-------------------------------------------------------------------------------
-- Stats for the host page
-------------------------------------------------------------------------------
-- Keeps the keys it had (sessions, players) and adds timing, reliability,
-- growth and demand. p_tz is the club's time zone (for "when do people sign up").
drop function public.admin_stats(timestamptz, timestamptz);
create function public.admin_stats(p_from timestamptz, p_to timestamptz, p_tz text default 'America/Toronto')
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_sessions jsonb;
  v_players jsonb;
  v_timing jsonb;
  v_reliability jsonb;
  v_growth jsonb;
  v_demand jsonb;
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;

  -- Per session (as before), plus fill timing.
  select coalesce(jsonb_agg(x order by x.starts_at), '[]') into v_sessions from (
    select s.id, s.title, s.starts_at, s.status, s.capacity,
           count(r.id) filter (where r.option in ('full', 'dropin') and r.status = 'confirmed') as confirmed,
           count(r.id) filter (where r.option in ('full', 'dropin') and r.status = 'pending_payment') as holding,
           count(r.id) filter (where r.option = 'instructional' and r.status in ('confirmed', 'pending_payment')) as instructional,
           count(r.id) filter (where r.status = 'waitlisted') as waitlisted,
           count(r.id) filter (where r.status = 'expired') as expired,
           coalesce(sum(r.paid_cents), 0) - coalesce(sum(public._refunded_cents(r, s)), 0) as collected,
           coalesce(sum(greatest(r.amount_cents - r.paid_cents, 0)) filter (where r.status = 'pending_payment'), 0) as owed,
           coalesce(st.minutes_to_full, f.minutes_to_full) as minutes_to_full,
           coalesce(st.first_hour_pct, f.first_hour_pct) as first_hour_pct,
           coalesce(st.first_day_pct, f.first_day_pct) as first_day_pct
      from public.sessions s
      left join public.registrations r on r.session_id = s.id
      left join public.session_stats st on st.session_id = s.id
      left join lateral public._fill_stats(s.id) f on st.session_id is null
     where s.starts_at >= p_from and s.starts_at < p_to
     group by s.id, st.session_id, f.minutes_to_full, f.first_hour_pct, f.first_day_pct
  ) x;

  -- Players (as before).
  with played as (
    select r.profile_id, s.starts_at
      from public.registrations r
      join public.sessions s on s.id = r.session_id
      join public.profiles p on p.id = r.profile_id
     where r.status = 'confirmed' and s.status = 'scheduled' and s.starts_at <= now() and not p.guest
  ),
  per_player as (
    select profile_id, min(starts_at) as first_played, max(starts_at) as last_played, count(*) as times,
           bool_or(starts_at >= p_from and starts_at < p_to) as played_in_range
      from played group by profile_id
  ),
  upcoming as (
    select distinct r.profile_id
      from public.registrations r join public.sessions s on s.id = r.session_id
     where s.starts_at > now() and s.status = 'scheduled'
       and r.status in ('pending_payment', 'confirmed', 'waitlisted')
  )
  select jsonb_build_object(
    'new', (select count(*) from per_player where first_played >= p_from and first_played < p_to),
    'returning', (select count(*) from per_player where played_in_range and first_played < p_from),
    'lapsed', (
      select coalesce(jsonb_agg(l order by l.last_played desc), '[]') from (
        select p.id, coalesce(p.display_name, p.full_name, p.email) as name, pp.last_played, pp.times
          from per_player pp join public.profiles p on p.id = pp.profile_id
         where pp.times >= 2 and pp.last_played < now() - interval '28 days'
           and pp.profile_id not in (select profile_id from upcoming)
         order by pp.last_played desc limit 50
      ) l
    )
  ) into v_players;

  -- Timing: when people sign up, and how far ahead.
  select jsonb_build_object(
    'heatmap', coalesce((
      select jsonb_agg(jsonb_build_object('dow', dow, 'hour', hour, 'count', n))
        from (
          select extract(dow from r.created_at at time zone p_tz)::int as dow,
                 extract(hour from r.created_at at time zone p_tz)::int as hour,
                 count(*) as n
            from public.registrations r
            join public.sessions s on s.id = r.session_id
            join public.profiles p on p.id = r.profile_id
           where s.starts_at >= p_from and s.starts_at < p_to and not p.guest
           group by 1, 2
        ) h
    ), '[]'),
    'median_days_ahead', (
      select round((percentile_cont(0.5) within group (order by extract(epoch from s.starts_at - r.created_at) / 86400))::numeric, 1)
        from public.registrations r
        join public.sessions s on s.id = r.session_id
        join public.profiles p on p.id = r.profile_id
       where s.starts_at >= p_from and s.starts_at < p_to and not p.guest and r.created_at < s.starts_at
    )
  ) into v_timing;

  -- Reliability: of everyone who signed up for a spot or the lesson.
  with regs as (
    select r.*, s.starts_at
      from public.registrations r
      join public.sessions s on s.id = r.session_id
     where s.starts_at >= p_from and s.starts_at < p_to and s.status = 'scheduled'
  )
  select jsonb_build_object(
    'signups', (select count(*) from regs),
    'cancelled', (select count(*) from regs where status = 'cancelled'),
    'late_cancelled', (select count(*) from regs where status = 'cancelled' and cancelled_at > starts_at - interval '24 hours'),
    'expired', (select count(*) from regs where status = 'expired'),
    'median_minutes_to_pay', (
      select round(percentile_cont(0.5) within group (order by extract(epoch from confirmed_at - created_at) / 60))::int
        from regs where status = 'confirmed' and confirmed_at is not null and paid_cents > 0 and confirmed_at > created_at
    ),
    'matched', (
      select jsonb_build_object(
        'ref', count(*) filter (where p.matched_by = 'ref'),
        'name_amount', count(*) filter (where p.matched_by = 'name_amount'),
        'admin', count(*) filter (where p.matched_by = 'admin')
      )
        from public.payments p join regs on regs.id = p.registration_id
       where p.reversed_at is null
    )
  ) into v_reliability;

  -- Growth: new players, who came back, regulars, friends, skill and where they heard about us.
  with played as (
    select r.profile_id, s.starts_at
      from public.registrations r
      join public.sessions s on s.id = r.session_id
      join public.profiles p on p.id = r.profile_id
     where r.status = 'confirmed' and s.status = 'scheduled' and s.starts_at <= now() and not p.guest
  ),
  firsts as (
    select profile_id, min(starts_at) as first_played from played group by profile_id
  ),
  new_in_range as (
    select f.* from firsts f where f.first_played >= p_from and f.first_played < p_to
  )
  select jsonb_build_object(
    'new_by_month', coalesce((
      select jsonb_agg(jsonb_build_object('month', m, 'count', n) order by m)
        from (select to_char(first_played at time zone p_tz, 'YYYY-MM') as m, count(*) as n
                from new_in_range group by 1) x
    ), '[]'),
    -- Of new players whose first session was at least 4 weeks ago, how many came back within 4 weeks.
    'came_back', (
      select jsonb_build_object(
        'eligible', count(*),
        'came_back', count(*) filter (where exists (
          select 1 from played pl
           where pl.profile_id = n.profile_id and pl.starts_at > n.first_played
             and pl.starts_at <= n.first_played + interval '28 days'
        ))
      )
        from new_in_range n where n.first_played <= now() - interval '28 days'
    ),
    -- Over the last 8 weeks: regulars played 3+ times, occasional 1-2.
    'regulars', (
      select jsonb_build_object(
        'regular', count(*) filter (where n >= 3),
        'occasional', count(*) filter (where n between 1 and 2)
      )
        from (select profile_id, count(*) as n from played where starts_at > now() - interval '56 days' group by 1) x
    ),
    -- Bring a Friend: friends who came in this range, and how many played again after.
    'friends', (
      select jsonb_build_object(
        'friends', count(distinct r.profile_id),
        'came_back', count(distinct r.profile_id) filter (where exists (
          select 1 from played pl where pl.profile_id = r.profile_id and pl.starts_at > s.starts_at
        ))
      )
        from public.registrations r join public.sessions s on s.id = r.session_id
       where r.brought_by is not null and r.status = 'confirmed'
         and s.starts_at >= p_from and s.starts_at < p_to and s.starts_at <= now()
    ),
    'skill', coalesce((
      select jsonb_object_agg(coalesce(skill, 'unknown'), n)
        from (select p.skill_level as skill, count(distinct p.id) as n
                from played pl join public.profiles p on p.id = pl.profile_id
               where pl.starts_at >= p_from and pl.starts_at < p_to
               group by 1) x
    ), '{}'),
    'heard_about', coalesce((
      select jsonb_object_agg(coalesce(heard, 'unknown'), n)
        from (select p.heard_about as heard, count(*) as n
                from new_in_range nr join public.profiles p on p.id = nr.profile_id
               group by 1) x
    ), '{}')
  ) into v_growth;

  -- Demand & money: waitlists, option mix, money by month.
  select jsonb_build_object(
    'waitlisted', coalesce((
      select sum(coalesce(st.waitlisted, live.w)) from public.sessions s
        left join public.session_stats st on st.session_id = s.id
        left join lateral (
          select greatest(
            (select count(*) from public.host_activity a where a.session_id = s.id and a.kind = 'waitlisted'),
            (select count(*) from public.registrations r where r.session_id = s.id and r.status = 'waitlisted')
          ) as w
        ) live on true
       where s.starts_at >= p_from and s.starts_at < p_to and s.status = 'scheduled'
    ), 0),
    'promoted', coalesce((
      select sum(coalesce(st.promoted,
               (select count(*) from public.host_activity a where a.session_id = s.id and a.kind = 'promoted')))
        from public.sessions s left join public.session_stats st on st.session_id = s.id
       where s.starts_at >= p_from and s.starts_at < p_to and s.status = 'scheduled'
    ), 0),
    'options', (
      select jsonb_build_object(
        'full', count(*) filter (where r.option = 'full'),
        'dropin', count(*) filter (where r.option = 'dropin'),
        'instructional', count(*) filter (where r.option = 'instructional')
      )
        from public.registrations r join public.sessions s on s.id = r.session_id
       where s.starts_at >= p_from and s.starts_at < p_to and s.status = 'scheduled'
         and r.status in ('confirmed', 'pending_payment')
    ),
    'money_by_month', coalesce((
      select jsonb_agg(jsonb_build_object('month', m, 'collected', c, 'refunded', rf, 'owed', o) order by m)
        from (
          select to_char(s.starts_at at time zone p_tz, 'YYYY-MM') as m,
                 coalesce(sum(r.paid_cents), 0) - coalesce(sum(public._refunded_cents(r, s)), 0) as c,
                 coalesce(sum(public._refunded_cents(r, s)), 0) as rf,
                 coalesce(sum(greatest(r.amount_cents - r.paid_cents, 0)) filter (where r.status = 'pending_payment'), 0) as o
            from public.sessions s join public.registrations r on r.session_id = s.id
           where s.starts_at >= p_from and s.starts_at < p_to
           group by 1
        ) x
    ), '[]')
  ) into v_demand;

  return jsonb_build_object(
    'sessions', v_sessions, 'players', v_players, 'timing', v_timing,
    'reliability', v_reliability, 'growth', v_growth, 'demand', v_demand
  );
end $$;

revoke execute on function public.admin_stats(timestamptz, timestamptz, text) from public, anon;
grant execute on function public.admin_stats(timestamptz, timestamptz, text) to authenticated;
