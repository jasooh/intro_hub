-- Lowering a limit below what's already signed up: when a host cuts the drop-in
-- spots or the instructional cap, the extra unpaid sign-ups (newest first) go
-- back to the front of their waitlist, and get the waitlist email. Paid players
-- are never bumped; the host page warns if the session is still over.
--
-- Also: guests a host added by hand don't count as new/returning players in
-- the stats.

create function public._bump_overflow(p_session_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s public.sessions;
  v public.registrations;
  v_first timestamptz;
  v_events jsonb := '[]';
  v_instructional boolean;
begin
  select * into s from public.sessions where id = p_session_id;
  if not found then
    return v_events;
  end if;

  foreach v_instructional in array array[false, true] loop
    loop
      if v_instructional then
        exit when s.instructional_capacity is null
              or public._instructional_used(s.id) <= s.instructional_capacity;
      else
        exit when public._spots_used(s.id) <= s.capacity;
      end if;

      -- Who goes: unpaid before part-paid, people who signed up themselves
      -- before ones a host added (no hold), newest first.
      select * into v
        from public.registrations
       where session_id = s.id and status = 'pending_payment'
         and (option = 'instructional') = v_instructional
       order by (paid_cents > 0), (hold_expires_at is null), created_at desc
       limit 1
       for update;
      exit when not found;

      select min(queued_at) into v_first
        from public.registrations
       where session_id = s.id and status = 'waitlisted'
         and (option = 'instructional') = v_instructional;

      update public.registrations
         set status = 'waitlisted',
             hold_expires_at = null,
             queued_at = coalesce(v_first - interval '1 second', now())
       where id = v.id;
      v_events := v_events || jsonb_build_object('event', 'waitlisted', 'registration_id', v.id);
      if v.brought_by is not null then
        v_events := v_events || public._release_regular(v.brought_by);
      end if;
    end loop;
  end loop;

  return v_events;
end $$;

-- After a host edits a session: first make the sign-ups fit the new limits,
-- then fill any room from the waitlists.
create or replace function public.admin_promote(p_session_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;
  perform 1 from public.sessions where id = p_session_id for update;
  return public._bump_overflow(p_session_id) || public._promote(p_session_id);
end $$;

revoke execute on function public._bump_overflow(uuid) from public, anon, authenticated;

-- Same as 20261101000000_signup_options.sql, with guests left out of the player counts.
create or replace function public.admin_stats(p_from timestamptz, p_to timestamptz) returns jsonb
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
           count(*) filter (where r.option in ('full', 'dropin') and r.status = 'confirmed') as confirmed,
           count(*) filter (where r.option in ('full', 'dropin') and r.status = 'pending_payment') as holding,
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
    select r.profile_id, s.starts_at
      from public.registrations r
      join public.sessions s on s.id = r.session_id
      join public.profiles p on p.id = r.profile_id
     where r.status = 'confirmed' and s.status = 'scheduled' and s.starts_at <= now() and not p.guest
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
