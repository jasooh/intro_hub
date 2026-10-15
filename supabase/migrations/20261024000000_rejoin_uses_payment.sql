-- Rejoining after a paid cancel: if a player paid, cancelled, and signs up for
-- the same session again while that refund is still owed (not sent, not
-- waived), the money they already sent covers the new sign-up. A waived refund
-- or a cancel after the cutoff (no refund owed) means the host kept the money,
-- so the new sign-up pays as normal. It's confirmed right away (no second payment),
-- the payment moves to the new sign-up, and the old one stops showing as a
-- refund owed. Applies whenever a sign-up would start holding an unpaid spot:
-- signing up, being promoted off the waitlist, or switching option.
--
-- Only an exact amount match counts (same option, same price). A different
-- option goes through the normal flow and the old refund stays owed, since a
-- partial credit can't be tracked.

create function public._use_rejoin_credit(p_registration_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  r public.registrations;
  v_old uuid;
begin
  select * into r from public.registrations where id = p_registration_id;
  if not found or r.status <> 'pending_payment' or r.amount_cents = 0 then
    return false;
  end if;

  select o.id into v_old
    from public.registrations o
   where o.session_id = r.session_id
     and o.profile_id = r.profile_id
     and o.id <> r.id
     and o.status = 'cancelled'
     and o.refund_owed
     and o.refunded_at is null
     and o.refund_waived_at is null
     and o.amount_cents = r.amount_cents
     and exists (select 1 from public.payments p where p.registration_id = o.id)
   order by o.cancelled_at desc nulls last
   limit 1
   for update;
  if v_old is null then
    return false;
  end if;

  update public.payments set registration_id = r.id where registration_id = v_old;
  update public.registrations set refund_owed = false where id = v_old;
  update public.registrations
     set status = 'confirmed', confirmed_at = now(), hold_expires_at = null, queued_at = null
   where id = r.id;
  return true;
end $$;
revoke execute on function public._use_rejoin_credit(uuid) from public, anon, authenticated;

-------------------------------------------------------------------------------
-- Sign up (from signup_limits, plus the credit check)
-------------------------------------------------------------------------------
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

  -- Paid, cancelled, and back before the refund went out: that payment covers this.
  if v_status = 'pending_payment' and public._use_rejoin_credit(v_id) then
    v_status := 'confirmed';
  end if;

  return jsonb_build_array(jsonb_build_object(
    'event',
    case v_status when 'pending_payment' then 'signed_up' else v_status::text end,
    'registration_id',
    v_id
  ));
end $$;

-------------------------------------------------------------------------------
-- Waitlist promotion (from player_info_and_options, plus the credit check)
-------------------------------------------------------------------------------
create or replace function public._promote(p_session_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s public.sessions;
  v_active int;
  v_next public.registrations;
  v_events jsonb := '[]';
begin
  select * into s from public.sessions where id = p_session_id for update;
  if not found or s.status <> 'scheduled' or now() >= s.starts_at then
    return v_events;
  end if;

  v_active := public._spots_used(s.id);

  while v_active < s.capacity loop
    select * into v_next
      from public.registrations
     where session_id = s.id and status = 'waitlisted'
     order by queued_at, created_at
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
    v_active := v_active + 1;
  end loop;

  return v_events;
end $$;

-------------------------------------------------------------------------------
-- Switching option (from player_info_and_options, plus the credit check)
-------------------------------------------------------------------------------
create or replace function public.change_registration_option(p_registration_id uuid, p_option text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r public.registrations;
  s public.sessions;
  v_waiting int;
  v_events jsonb := '[]';
begin
  if p_option not in ('full', 'instructional') then
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
  if p_option = 'instructional' and s.instructional_price_cents is null then
    raise exception 'option_unavailable';
  end if;

  if p_option = 'instructional' then
    -- Frees (or no longer waits for) a spot.
    update public.registrations
       set option = 'instructional',
           amount_cents = s.instructional_price_cents,
           status = 'pending_payment',
           queued_at = null,
           hold_expires_at = coalesce(
             hold_expires_at,
             least(now() + make_interval(hours => s.hold_hours), s.starts_at)
           )
     where id = r.id;
    if public._use_rejoin_credit(r.id) then
      v_events := v_events || jsonb_build_object('event', 'confirmed', 'registration_id', r.id);
    elsif r.status = 'waitlisted' then
      v_events := v_events || jsonb_build_object('event', 'signed_up', 'registration_id', r.id);
    end if;
    return v_events || public._promote(s.id);
  end if;

  -- instructional -> full: needs a spot.
  select count(*) into v_waiting
    from public.registrations
   where session_id = s.id and status = 'waitlisted';
  if public._spots_used(s.id) < s.capacity and v_waiting = 0 then
    update public.registrations
       set option = 'full',
           amount_cents = s.price_cents,
           status = 'pending_payment',
           hold_expires_at = least(now() + make_interval(hours => s.hold_hours), s.starts_at)
     where id = r.id;
    if public._use_rejoin_credit(r.id) then
      v_events := v_events || jsonb_build_object('event', 'confirmed', 'registration_id', r.id);
    end if;
  else
    update public.registrations
       set option = 'full',
           amount_cents = s.price_cents,
           status = 'waitlisted',
           queued_at = now(),
           hold_expires_at = null
     where id = r.id;
    v_events := v_events || jsonb_build_object('event', 'waitlisted', 'registration_id', r.id);
  end if;
  return v_events;
end $$;
