-- A Full (Instructional + Drop-in) sign-up now gets its two resources
-- independently instead of as one atomic unit. If the drop-in spot is free
-- but the lesson is full, the sign-up still pays in full and holds the
-- drop-in spot right away, waiting on the lesson place in the background
-- (`lesson_queued_at`, set the moment it starts waiting and never reset by a
-- later promotion or switch). This only applies when the session prices
-- drop-in standalone (`dropin_price_cents is not null`) -- otherwise there's
-- no way to price a refund if the lesson place never opens, so a Full
-- sign-up stays fully atomic, exactly as before.

alter table public.registrations add column lesson_queued_at timestamptz;

-------------------------------------------------------------------------------
-- Fit predicates: the drop-in resource and the lesson resource, checked
-- independently. p_exclude leaves one sign-up out of the counts (the one
-- being granted or switched).
-------------------------------------------------------------------------------

-- Lesson places in use (full + instructional), minus any partial grant that
-- holds a drop-in spot but hasn't got a lesson place yet.
drop function public._instructional_used(uuid);
create function public._instructional_used(p_session_id uuid, p_exclude uuid default null) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.registrations
   where session_id = p_session_id
     and option in ('full', 'instructional')
     and status in ('pending_payment', 'confirmed')
     and lesson_queued_at is null
     and id is distinct from p_exclude;
$$;

create function public._dropin_fits(s public.sessions, p_exclude uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select count(*) from public.registrations
           where session_id = s.id and option in ('full', 'dropin')
             and status in ('pending_payment', 'confirmed')
             and id is distinct from p_exclude) < s.capacity;
$$;

create function public._lesson_fits(s public.sessions, p_exclude uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select s.instructional_capacity is null
     or public._instructional_used(s.id, p_exclude) < s.instructional_capacity;
$$;

-- Would this option fit right now? Now just the two predicates above, one per
-- resource the option needs.
create or replace function public._fits(s public.sessions, p_option text, p_exclude uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (p_option = 'instructional' or public._dropin_fits(s, p_exclude))
     and (p_option = 'dropin' or public._lesson_fits(s, p_exclude));
$$;

revoke execute on function public._instructional_used(uuid, uuid) from public, anon, authenticated;
revoke execute on function public._dropin_fits(public.sessions, uuid) from public, anon, authenticated;
revoke execute on function public._lesson_fits(public.sessions, uuid) from public, anon, authenticated;

-------------------------------------------------------------------------------
-- Counts: a partially-granted Full row holds a drop-in spot, not a lesson
-- place, so it no longer counts toward `lesson`.
-------------------------------------------------------------------------------
create or replace function public.get_session_counts(p_session_ids uuid[])
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
         (count(r.id) filter (where r.option in ('full', 'instructional') and r.status in ('pending_payment', 'confirmed')
                                 and r.lesson_queued_at is null))::int
    from public.sessions s
    left join public.registrations r on r.session_id = s.id
   where s.id = any (p_session_ids)
   group by s.id;
$$;

-------------------------------------------------------------------------------
-- Sign up: a Full sign-up can take the drop-in spot now and wait on the
-- lesson, when the session prices drop-in standalone. (Patched in place so
-- the long function isn't copied here.)
-------------------------------------------------------------------------------
do $$
declare
  v_def text := pg_get_functiondef('public.register_for_session(uuid, text, text)'::regprocedure);
  v_find_decl text := '  v_id uuid;
begin';
  v_find_grant text := '  v_amount := public._signup_price(s, p_option, false);
  if public._has_room(s, p_option) then
    v_status := case when v_amount = 0 then ''confirmed'' else ''pending_payment'' end;
  else
    v_status := ''waitlisted'';
  end if;';
  v_find_cols text := 'session_id, profile_id, status, ref_code, queued_at, hold_expires_at, confirmed_at, option, amount_cents, note';
  v_find_vals text := '    nullif(trim(p_note), '''')
  )';
  v_new text;
begin
  if (length(v_def) - length(replace(v_def, v_find_decl, ''))) / length(v_find_decl) <> 1 then
    raise exception 'register_for_session: declare block not found exactly once';
  end if;
  if (length(v_def) - length(replace(v_def, v_find_grant, ''))) / length(v_find_grant) <> 1 then
    raise exception 'register_for_session: grant decision not found exactly once';
  end if;
  if (length(v_def) - length(replace(v_def, v_find_cols, ''))) / length(v_find_cols) <> 1 then
    raise exception 'register_for_session: insert columns not found exactly once';
  end if;
  if (length(v_def) - length(replace(v_def, v_find_vals, ''))) / length(v_find_vals) <> 1 then
    raise exception 'register_for_session: insert values not found exactly once';
  end if;

  v_new := replace(v_def, v_find_decl, '  v_id uuid;
  v_dropin_ok boolean;
  v_lesson_ok boolean;
  v_lesson_queued_at timestamptz;
begin');

  v_new := replace(v_new, v_find_grant, '  v_amount := public._signup_price(s, p_option, false);
  if p_option = ''full'' then
    v_dropin_ok := public._dropin_fits(s, null);
    v_lesson_ok := public._lesson_fits(s, null);
    if v_dropin_ok and v_lesson_ok then
      v_status := case when v_amount = 0 then ''confirmed'' else ''pending_payment'' end;
      v_lesson_queued_at := null;
    elsif v_dropin_ok and s.dropin_price_cents is not null then
      v_status := case when v_amount = 0 then ''confirmed'' else ''pending_payment'' end;
      v_lesson_queued_at := now();
    else
      v_status := ''waitlisted'';
      -- Only track the lesson wait when a later partial grant is possible
      -- (dropin_price_cents is not null); otherwise this stays atomic
      -- exactly as before, with no lesson_queued_at for _promote to clear.
      if s.dropin_price_cents is not null then
        v_lesson_queued_at := now();
      end if;
    end if;
  elsif public._has_room(s, p_option) then
    v_status := case when v_amount = 0 then ''confirmed'' else ''pending_payment'' end;
  else
    v_status := ''waitlisted'';
  end if;');

  v_new := replace(v_new, v_find_cols,
    'session_id, profile_id, status, ref_code, queued_at, hold_expires_at, confirmed_at, option, amount_cents, note, lesson_queued_at');

  v_new := replace(v_new, v_find_vals, '    nullif(trim(p_note), ''''),
    v_lesson_queued_at
  )');

  execute v_new;
end $$;

-------------------------------------------------------------------------------
-- Switching option: the same independent drop-in/lesson split as the sign-up
-- path above, parameterized by the row being switched instead of a fresh
-- insert.
-------------------------------------------------------------------------------
create or replace function public.change_registration_option(p_registration_id uuid, p_option text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r public.registrations;
  s public.sessions;
  v_events jsonb := '[]';
  v_amount int;
  v_dropin_ok boolean;
  v_lesson_ok boolean;
  v_lesson_queued_at timestamptz;
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

  v_dropin_ok := public._dropin_fits(s, r.id);
  v_lesson_ok := public._lesson_fits(s, r.id);

  if p_option = 'dropin' or v_lesson_ok then
    v_lesson_queued_at := null;
  else
    v_lesson_queued_at := coalesce(r.lesson_queued_at,
      case when r.option = 'instructional' and r.status = 'waitlisted' then r.queued_at else now() end);
  end if;

  if (p_option in ('dropin', 'instructional') and public._fits(s, p_option, r.id))
     or (p_option = 'full' and v_dropin_ok and (v_lesson_ok or s.dropin_price_cents is not null)) then
    update public.registrations
       set option = p_option,
           amount_cents = v_amount,
           status = 'pending_payment',
           queued_at = null,
           hold_expires_at = case when r.status = 'pending_payment' and r.hold_expires_at is not null
                                  then r.hold_expires_at
                                  else least(now() + make_interval(hours => s.hold_hours), s.starts_at) end,
           lesson_queued_at = v_lesson_queued_at
     where id = r.id;
    if r.status = 'waitlisted' then
      v_events := v_events || jsonb_build_object('event', 'signed_up', 'registration_id', r.id);
    end if;
  elsif r.status = 'waitlisted' then
    update public.registrations
       set option = p_option, amount_cents = v_amount, lesson_queued_at = v_lesson_queued_at
     where id = r.id;
  else
    update public.registrations
       set option = p_option,
           amount_cents = v_amount,
           status = 'waitlisted',
           queued_at = now(),
           hold_expires_at = null,
           lesson_queued_at = v_lesson_queued_at
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
