-- Rate limits on signing up. Cancelling sends no email to the player, and repeat
-- emails for one registration are already de-duplicated, but every new sign-up
-- row sends a fresh email. Cap rejoining one session and sign-up bursts overall.

create or replace function public.register_for_session(
  p_session_id uuid,
  p_option text default 'full',
  p_note text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  s public.sessions;
  v_waiting int;
  v_amount int;
  v_status public.registration_status;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_option not in ('full', 'instructional') then
    raise exception 'invalid_option';
  end if;
  if not public._profile_complete(v_uid) then
    raise exception 'profile_incomplete';
  end if;

  select * into s from public.sessions where id = p_session_id for update;
  if not found or s.status <> 'scheduled' then
    raise exception 'session_unavailable';
  end if;
  if now() < s.opens_at then
    raise exception 'signups_not_open';
  end if;
  if now() >= s.starts_at then
    raise exception 'session_started';
  end if;
  if p_option = 'instructional' and s.instructional_price_cents is null then
    raise exception 'option_unavailable';
  end if;

  if exists (
    select 1 from public.registrations
     where session_id = s.id and profile_id = v_uid
       and status in ('pending_payment', 'confirmed', 'waitlisted')
  ) then
    return '[]'::jsonb; -- already signed up
  end if;

  -- Every sign-up sends an email, so stop sign up / cancel loops from flooding
  -- the host's mailbox. Hosts are exempt so they can test freely.
  if not public.is_admin() then
    if (select count(*) from public.registrations
         where session_id = s.id and profile_id = v_uid) >= 3 then
      raise exception 'too_many_signups';
    end if;
    if (select count(*) from public.registrations
         where profile_id = v_uid and created_at > now() - interval '1 hour') >= 10 then
      raise exception 'slow_down';
    end if;
  end if;

  v_amount := case p_option when 'instructional' then s.instructional_price_cents else s.price_cents end;

  if p_option = 'instructional' then
    -- Doesn't use a spot: never waitlisted.
    v_status := case when v_amount = 0 then 'confirmed' else 'pending_payment' end;
  else
    select count(*) into v_waiting
      from public.registrations
     where session_id = s.id and status = 'waitlisted';
    -- Nobody jumps the queue: if anyone is waiting, newcomers wait too.
    if public._spots_used(s.id) < s.capacity and v_waiting = 0 then
      v_status := case when v_amount = 0 then 'confirmed' else 'pending_payment' end;
    else
      v_status := 'waitlisted';
    end if;
  end if;

  insert into public.registrations (
    session_id, profile_id, status, ref_code, queued_at, hold_expires_at, confirmed_at, option, amount_cents, note
  )
  values (
    s.id,
    v_uid,
    v_status,
    public.gen_ref_code(),
    case when v_status = 'waitlisted' then now() end,
    case when v_status = 'pending_payment'
         then least(now() + make_interval(hours => s.hold_hours), s.starts_at) end,
    case when v_status = 'confirmed' then now() end,
    p_option,
    v_amount,
    nullif(trim(p_note), '')
  )
  returning id into v_id;

  return jsonb_build_array(jsonb_build_object(
    'event',
    case v_status when 'pending_payment' then 'signed_up' else v_status::text end,
    'registration_id',
    v_id
  ));
end $$;
