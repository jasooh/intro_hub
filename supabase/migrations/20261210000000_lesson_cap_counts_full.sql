-- The "instructional spots" limit is now a LESSON limit: it counts everyone at
-- the lesson, i.e. Instructional only AND Instructional + Drop-in ('full').
-- Drop-in only players skip the lesson and stay out of it.
--
-- Resources per option:
--   instructional -> a lesson place
--   dropin        -> a drop-in spot
--   full          -> both
-- A sign-up is confirmed/held only if every resource it needs has room, and a
-- waitlisted sign-up is promoted (in line order) as soon as it fits.

-- Lesson places in use (full + instructional).
create or replace function public._instructional_used(p_session_id uuid) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.registrations
   where session_id = p_session_id
     and option in ('full', 'instructional')
     and status in ('pending_payment', 'confirmed');
$$;

-- Would this option fit right now? p_exclude leaves one sign-up out of the
-- counts (the one being switched, which already holds a place).
create function public._fits(s public.sessions, p_option text, p_exclude uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (p_option = 'instructional'
          or (select count(*) from public.registrations
               where session_id = s.id and option in ('full', 'dropin')
                 and status in ('pending_payment', 'confirmed')
                 and id is distinct from p_exclude) < s.capacity)
     and (p_option = 'dropin'
          or s.instructional_capacity is null
          or (select count(*) from public.registrations
               where session_id = s.id and option in ('full', 'instructional')
                 and status in ('pending_payment', 'confirmed')
                 and id is distinct from p_exclude) < s.instructional_capacity);
$$;

-- A new sign-up gets a place only if it fits and doesn't jump a waiter who
-- competes for the same place and could take it.
create or replace function public._has_room(s public.sessions, p_option text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public._fits(s, p_option, null)
     and not exists (
       select 1 from public.registrations w
        where w.session_id = s.id and w.status = 'waitlisted'
          and (p_option = 'full' or w.option = 'full' or w.option = p_option)
          and public._fits(s, w.option, w.id));
$$;

-- Fill free places from the waitlist, longest waiting first. A waiter who
-- doesn't fit (e.g. lesson full) doesn't block ones behind who do.
create or replace function public._promote(p_session_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s public.sessions;
  v_next public.registrations;
  v_events jsonb := '[]';
begin
  select * into s from public.sessions where id = p_session_id for update;
  if not found or s.status <> 'scheduled' or now() >= s.starts_at then
    return v_events;
  end if;

  loop
    select w.* into v_next
      from public.registrations w
     where w.session_id = s.id and w.status = 'waitlisted'
       and public._fits(s, w.option, w.id)
     order by w.queued_at, w.created_at
     limit 1
     for update;
    exit when not found;

    if v_next.amount_cents = 0 then
      update public.registrations
         set status = 'confirmed', confirmed_at = now(), queued_at = null
       where id = v_next.id;
      v_events := v_events || jsonb_build_object('event', 'confirmed', 'registration_id', v_next.id);
    else
      update public.registrations
         set status = 'pending_payment',
             queued_at = null,
             hold_expires_at = least(now() + make_interval(hours => s.hold_hours), s.starts_at)
       where id = v_next.id;
      v_events := v_events || jsonb_build_object(
        'event',
        case when public._use_rejoin_credit(v_next.id) then 'confirmed' else 'promoted' end,
        'registration_id',
        v_next.id
      );
    end if;
    -- A friend who just got a spot brings the regular's discount with them.
    if v_next.brought_by is not null then
      v_events := v_events || public._claim_regular(v_next.brought_by);
    end if;
  end loop;

  return v_events;
end $$;

-- Lowering a limit: drop-in spots are shared by full + dropin, lesson places by
-- full + instructional. Newest unpaid sign-ups go back to the front of the
-- waitlist; paid players are never bumped.
create or replace function public._bump_overflow(p_session_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s public.sessions;
  v public.registrations;
  v_first timestamptz;
  v_events jsonb := '[]';
  v_lesson boolean;
  v_options text[];
begin
  select * into s from public.sessions where id = p_session_id;
  if not found then
    return v_events;
  end if;

  foreach v_lesson in array array[false, true] loop
    v_options := case when v_lesson then array['full', 'instructional'] else array['full', 'dropin'] end;
    loop
      if v_lesson then
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
         and option = any (v_options)
       order by (paid_cents > 0), (hold_expires_at is null), created_at desc
       limit 1
       for update;
      exit when not found;

      select min(queued_at) into v_first
        from public.registrations
       where session_id = s.id and status = 'waitlisted'
         and option = any (v_options);

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

-- Switching option (before paying): keeps the place when the new option still
-- fits, otherwise joins the waitlist (a waiting sign-up keeps its place in line).
create or replace function public.change_registration_option(p_registration_id uuid, p_option text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r public.registrations;
  s public.sessions;
  v_events jsonb := '[]';
  v_amount int;
begin
  if p_option not in ('full', 'instructional', 'dropin') then
    raise exception 'invalid_option';
  end if;
  select * into r from public.registrations where id = p_registration_id;
  if not found then
    raise exception 'registration_not_found';
  end if;
  if r.profile_id is distinct from auth.uid() then
    raise exception 'forbidden';
  end if;

  select * into s from public.sessions where id = r.session_id for update;
  select * into r from public.registrations where id = p_registration_id for update;

  if r.status not in ('pending_payment', 'waitlisted') then
    raise exception 'option_locked';
  end if;
  if r.option = p_option then
    return v_events;
  end if;
  if not public._option_offered(s, p_option) then
    raise exception 'option_unavailable';
  end if;

  v_amount := public._signup_price(s, p_option, r.friend_discount);

  if public._fits(s, p_option, r.id) then
    update public.registrations
       set option = p_option,
           amount_cents = v_amount,
           status = 'pending_payment',
           queued_at = null,
           hold_expires_at = case when r.status = 'pending_payment' and r.hold_expires_at is not null
                                  then r.hold_expires_at
                                  else least(now() + make_interval(hours => s.hold_hours), s.starts_at) end
     where id = r.id;
    if r.status = 'waitlisted' then
      v_events := v_events || jsonb_build_object('event', 'signed_up', 'registration_id', r.id);
    end if;
  elsif r.status = 'waitlisted' then
    update public.registrations set option = p_option, amount_cents = v_amount where id = r.id;
  else
    update public.registrations
       set option = p_option,
           amount_cents = v_amount,
           status = 'waitlisted',
           queued_at = now(),
           hold_expires_at = null
     where id = r.id;
    v_events := v_events || jsonb_build_object('event', 'waitlisted', 'registration_id', r.id);
  end if;

  -- Already paid enough for the new option (e.g. part-paid, then a cheaper one),
  -- or has credit from an earlier sign-up: confirmed.
  select * into r from public.registrations where id = r.id;
  if r.status = 'pending_payment' then
    if r.paid_cents > 0 and r.paid_cents >= r.amount_cents then
      v_events := v_events || public._reprice(r.id);
    elsif public._use_rejoin_credit(r.id) then
      v_events := v_events || jsonb_build_object('event', 'confirmed', 'registration_id', r.id);
    end if;
  end if;
  -- A spot (or lesson place) may have freed up with the option they left.
  return v_events || public._promote(s.id);
end $$;

-- lesson: everyone at the lesson (full + instructional-only), what the cap limits.
drop function public.get_session_counts(uuid[]);
create function public.get_session_counts(p_session_ids uuid[])
returns table (
  session_id uuid, confirmed int, holding int, waitlisted int, instructional int,
  instructional_waitlisted int, dropin int, lesson int
)
language sql stable security definer set search_path = '' as $$
  select s.id,
         (count(r.id) filter (where r.option in ('full', 'dropin') and r.status = 'confirmed'))::int,
         (count(r.id) filter (where r.option in ('full', 'dropin') and r.status = 'pending_payment'))::int,
         (count(r.id) filter (where r.option in ('full', 'dropin') and r.status = 'waitlisted'))::int,
         (count(r.id) filter (where r.option = 'instructional' and r.status in ('pending_payment', 'confirmed')))::int,
         (count(r.id) filter (where r.option = 'instructional' and r.status = 'waitlisted'))::int,
         (count(r.id) filter (where r.option = 'dropin' and r.status in ('pending_payment', 'confirmed')))::int,
         (count(r.id) filter (where r.option in ('full', 'instructional') and r.status in ('pending_payment', 'confirmed')))::int
    from public.sessions s
    left join public.registrations r on r.session_id = s.id
   where s.id = any (p_session_ids)
   group by s.id;
$$;
grant execute on function public.get_session_counts(uuid[]) to anon, authenticated;

revoke execute on function public._fits(public.sessions, text, uuid) from public, anon, authenticated;
