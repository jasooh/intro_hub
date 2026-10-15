-- Bring a Friend: a first-time player who comes with a regular gets half
-- price, and so does the regular. The new friend picks who brought them
-- (set_brought_by); both sign-ups are repriced. If the friend cancels, the
-- regular loses the discount (while still unpaid and no other friend came with
-- them); if the regular cancels, the friend keeps it. Hosts can undo a pairing.
--
-- Refundable deposits: a session with deposit_cents is free, but every sign-up
-- pays the deposit to hold a spot. After the session, run_tick marks it as owed
-- back to everyone still confirmed. Cancelling follows the usual cutoff rule.

alter table public.registrations
  add column brought_by uuid references public.registrations (id) on delete set null,
  add column friend_discount boolean not null default false;
create index registrations_brought_by_idx on public.registrations (brought_by) where brought_by is not null;

alter table public.sessions
  add column deposit_cents int check (deposit_cents >= 0),
  add column deposits_released_at timestamptz;

-------------------------------------------------------------------------------
-- Pricing
-------------------------------------------------------------------------------
-- What a sign-up owes: the deposit on a deposit session, otherwise the option's
-- price, halved for Bring a Friend.
create function public._signup_price(s public.sessions, p_option text, p_discounted boolean) returns int
language sql immutable set search_path = '' as $$
  select case
    when s.deposit_cents is not null then s.deposit_cents
    else round(
      (case when p_option = 'instructional' then s.instructional_price_cents else s.price_cents end)
      / (case when p_discounted then 2.0 else 1.0 end)
    )::int
  end
$$;

-- Bring the sign-up's price in line with its session and discount. A price
-- that drops can confirm a hold that's already paid enough, or leave a confirmed
-- player overpaid (Refunds -> Overpaid). Confirmed players are never charged more.
-- Callers lock the session row first.
create function public._reprice(p_registration_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r public.registrations;
  s public.sessions;
  v_new int;
begin
  select * into r from public.registrations where id = p_registration_id for update;
  if not found or r.status not in ('pending_payment', 'confirmed', 'waitlisted') then
    return '[]'::jsonb;
  end if;
  select * into s from public.sessions where id = r.session_id;
  v_new := public._signup_price(s, r.option, r.friend_discount);

  if r.status = 'confirmed' then
    if v_new < r.amount_cents then
      update public.registrations
         set amount_cents = v_new, refund_owed = (r.paid_cents > v_new)
       where id = r.id;
    end if;
    return '[]'::jsonb;
  end if;

  update public.registrations set amount_cents = v_new where id = r.id;
  if r.status = 'pending_payment' and r.paid_cents >= v_new then
    update public.registrations
       set status = 'confirmed', confirmed_at = now(), hold_expires_at = null,
           refund_owed = (r.paid_cents > v_new)
     where id = r.id;
    return jsonb_build_array(jsonb_build_object('event', 'confirmed', 'registration_id', r.id));
  end if;
  return '[]'::jsonb;
end $$;

-- A regular keeps the friend rate while at least one friend who named them is
-- still coming (or they were brought by someone themselves).
create function public._release_regular(p_registration_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r public.registrations;
begin
  select * into r from public.registrations where id = p_registration_id for update;
  if not found or r.brought_by is not null then
    return '[]'::jsonb;
  end if;
  if exists (
    select 1 from public.registrations f
     where f.brought_by = r.id and f.status in ('pending_payment', 'confirmed', 'waitlisted')
  ) then
    return '[]'::jsonb;
  end if;
  update public.registrations set friend_discount = false where id = r.id;
  return public._reprice(r.id);
end $$;

-- New here: never had a confirmed spot at a session that has ended, and said
-- "No, I'm new" on their profile.
create function public._is_first_timer(p_profile_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select attended_before from public.profiles where id = p_profile_id), true) = false
     and not exists (
       select 1 from public.registrations r
         join public.sessions s on s.id = r.session_id
        where r.profile_id = p_profile_id and r.status = 'confirmed' and s.ends_at < now()
     );
$$;

-------------------------------------------------------------------------------
-- Bring a Friend
-------------------------------------------------------------------------------
-- The new friend says who brought them (null to unlink). Returns events for emails.
create function public.set_brought_by(p_registration_id uuid, p_buddy_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r public.registrations;
  s public.sessions;
  b public.registrations;
  v_old uuid;
  v_events jsonb := '[]';
begin
  select * into r from public.registrations where id = p_registration_id;
  if not found then
    raise exception 'registration_not_found';
  end if;
  if r.profile_id is distinct from auth.uid() then
    raise exception 'forbidden';
  end if;

  select * into s from public.sessions where id = r.session_id for update;
  select * into r from public.registrations where id = p_registration_id for update;
  if s.status <> 'scheduled' or now() >= s.starts_at
     or r.status not in ('pending_payment', 'confirmed', 'waitlisted') then
    raise exception 'session_unavailable';
  end if;
  v_old := r.brought_by;

  if p_buddy_id is null then
    update public.registrations set brought_by = null, friend_discount = false where id = r.id;
    v_events := public._reprice(r.id);
    if v_old is not null then
      v_events := v_events || public._release_regular(v_old);
    end if;
    return v_events;
  end if;

  if s.deposit_cents is not null then
    raise exception 'friend_rate_unavailable';
  end if;
  if not public._is_first_timer(r.profile_id) then
    raise exception 'not_first_timer';
  end if;
  select * into b from public.registrations where id = p_buddy_id;
  if not found or b.session_id <> r.session_id or b.id = r.id or b.profile_id = r.profile_id
     or b.status not in ('pending_payment', 'confirmed', 'waitlisted') then
    raise exception 'buddy_unavailable';
  end if;

  update public.registrations set brought_by = b.id, friend_discount = true where id = r.id;
  update public.registrations set friend_discount = true where id = b.id;
  v_events := public._reprice(r.id) || public._reprice(b.id);
  if v_old is not null and v_old <> b.id then
    v_events := v_events || public._release_regular(v_old);
  end if;
  return v_events;
end $$;

-- Host undo. On a friend: unlink them (both may go back to full price). On a
-- regular: remove only their own discount.
create function public.admin_remove_friend_discount(p_registration_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r public.registrations;
  v_old uuid;
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;
  select * into r from public.registrations where id = p_registration_id;
  if not found then
    raise exception 'registration_not_found';
  end if;
  perform 1 from public.sessions where id = r.session_id for update;
  select * into r from public.registrations where id = p_registration_id for update;
  v_old := r.brought_by;
  update public.registrations set brought_by = null, friend_discount = false where id = r.id;
  return public._reprice(r.id)
      || case when v_old is not null then public._release_regular(v_old) else '[]'::jsonb end;
end $$;

-- After a host changes a session's prices or deposit: sign-ups that haven't
-- paid in full yet owe the new amount (a hold already paid enough is confirmed).
-- Confirmed players are left alone; on a deposit session everything they paid
-- is returned after the session anyway.
create function public.admin_reprice_session(p_session_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_events jsonb := '[]';
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;
  perform 1 from public.sessions where id = p_session_id for update;
  for v_id in
    select id from public.registrations
     where session_id = p_session_id and status in ('pending_payment', 'waitlisted')
  loop
    v_events := v_events || public._reprice(v_id);
  end loop;
  return v_events;
end $$;

-------------------------------------------------------------------------------
-- Sign-up, option switch, cancel and the tick, now priced by _signup_price
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

  v_amount := public._signup_price(s, p_option, false);

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
           amount_cents = public._signup_price(s, 'instructional', r.friend_discount),
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
           amount_cents = public._signup_price(s, 'full', r.friend_discount),
           status = 'pending_payment',
           hold_expires_at = least(now() + make_interval(hours => s.hold_hours), s.starts_at)
     where id = r.id;
    if public._use_rejoin_credit(r.id) then
      v_events := v_events || jsonb_build_object('event', 'confirmed', 'registration_id', r.id);
    end if;
  else
    update public.registrations
       set option = 'full',
           amount_cents = public._signup_price(s, 'full', r.friend_discount),
           status = 'waitlisted',
           queued_at = now(),
           hold_expires_at = null
     where id = r.id;
    v_events := v_events || jsonb_build_object('event', 'waitlisted', 'registration_id', r.id);
  end if;
  return v_events;
end $$;

create or replace function public.cancel_registration(p_registration_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r public.registrations;
  s public.sessions;
begin
  select * into r from public.registrations where id = p_registration_id;
  if not found then
    raise exception 'registration_not_found';
  end if;
  if r.profile_id is distinct from auth.uid() and not public.is_admin() then
    raise exception 'forbidden';
  end if;

  select * into s from public.sessions where id = r.session_id for update;
  select * into r from public.registrations where id = p_registration_id for update;

  if r.status not in ('pending_payment', 'confirmed', 'waitlisted') then
    return '[]'::jsonb;
  end if;

  update public.registrations
     set status = 'cancelled',
         cancelled_at = now(),
         queued_at = null,
         hold_expires_at = null,
         refund_owed = (r.paid_cents > 0 and (now() < s.cancel_cutoff or public.is_admin()))
   where id = r.id;

  -- A friend who cancels takes the regular's discount with them (unless another
  -- friend still came with the regular, or the regular has already paid).
  return public._promote(s.id)
      || case when r.brought_by is not null then public._release_regular(r.brought_by) else '[]'::jsonb end;
end $$;

create or replace function public.run_tick() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_events jsonb := '[]';
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

  return v_events;
end $$;

revoke execute on function public._signup_price(public.sessions, text, boolean) from public, anon, authenticated;
revoke execute on function public._reprice(uuid) from public, anon, authenticated;
revoke execute on function public._release_regular(uuid) from public, anon, authenticated;
revoke execute on function public._is_first_timer(uuid) from public, anon, authenticated;
revoke execute on function public.set_brought_by(uuid, uuid) from public, anon;
grant execute on function public.set_brought_by(uuid, uuid) to authenticated;
revoke execute on function public.admin_remove_friend_discount(uuid) from public, anon;
grant execute on function public.admin_remove_friend_discount(uuid) to authenticated;
revoke execute on function public.admin_reprice_session(uuid) from public, anon;
grant execute on function public.admin_reprice_session(uuid) to authenticated;
