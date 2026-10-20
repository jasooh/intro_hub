-- Sign-up options and host adds:
--   * "Drop-in only" (games, no lesson): a third option with its own price. It
--     uses a drop-in spot, like Instructional + Drop-in ('full').
--   * Instructional spots can be capped. Past the cap, Instructional only gets
--     its own waitlist, promoted the same way as the drop-in one.
--   * Hosts can add a player by hand (an account, or a guest with just a name).
--     Adding someone to a full session makes room for them.
--   * Bring a Friend fixes: a friend whose hold runs out lets go of the
--     regular's discount; a waitlisted friend only counts once they get a spot;
--     the player you name has to be a regular (not a first-timer); a regular
--     who already paid keeps the discount flag that matches what they paid.

-------------------------------------------------------------------------------
-- Columns
-------------------------------------------------------------------------------
alter table public.sessions
  add column dropin_price_cents int check (dropin_price_cents >= 0),
  add column instructional_capacity int check (instructional_capacity > 0);

alter table public.session_templates
  add column dropin_price_cents int check (dropin_price_cents >= 0),
  add column instructional_capacity int check (instructional_capacity > 0);

alter table public.registrations drop constraint registrations_option_check;
alter table public.registrations
  add constraint registrations_option_check check (option in ('full', 'instructional', 'dropin'));

-- Someone a host added without an account (no sign-in, no emails).
alter table public.profiles add column guest boolean not null default false;

-------------------------------------------------------------------------------
-- Spots
-------------------------------------------------------------------------------
-- Drop-in spots: Instructional + Drop-in and Drop-in only.
create or replace function public._spots_used(p_session_id uuid) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.registrations
   where session_id = p_session_id
     and option in ('full', 'dropin')
     and status in ('pending_payment', 'confirmed');
$$;

create function public._instructional_used(p_session_id uuid) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.registrations
   where session_id = p_session_id
     and option = 'instructional'
     and status in ('pending_payment', 'confirmed');
$$;

-- Whether a new sign-up for this option gets a spot now (nobody jumps a queue).
create function public._has_room(s public.sessions, p_option text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when p_option = 'instructional' then
      s.instructional_capacity is null
      or (public._instructional_used(s.id) < s.instructional_capacity
          and not exists (select 1 from public.registrations
                           where session_id = s.id and status = 'waitlisted' and option = 'instructional'))
    else
      public._spots_used(s.id) < s.capacity
      and not exists (select 1 from public.registrations
                       where session_id = s.id and status = 'waitlisted' and option in ('full', 'dropin'))
  end
$$;

create function public._option_offered(s public.sessions, p_option text) returns boolean
language sql immutable set search_path = '' as $$
  select case p_option
    when 'full' then true
    when 'instructional' then s.instructional_price_cents is not null
    when 'dropin' then s.dropin_price_cents is not null
    else false
  end
$$;

-------------------------------------------------------------------------------
-- Pricing
-------------------------------------------------------------------------------
create or replace function public._signup_price(s public.sessions, p_option text, p_discounted boolean) returns int
language sql immutable set search_path = '' as $$
  select case
    when s.deposit_cents is not null then s.deposit_cents
    else round(
      (case p_option
         when 'instructional' then s.instructional_price_cents
         when 'dropin' then s.dropin_price_cents
         else s.price_cents
       end)
      / (case when p_discounted then 2.0 else 1.0 end)
    )::int
  end
$$;

-------------------------------------------------------------------------------
-- Bring a Friend
-------------------------------------------------------------------------------
-- A regular keeps the friend rate while a friend who named them has a spot. A
-- regular who already paid keeps it (and the flag that explains their price).
create or replace function public._release_regular(p_registration_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r public.registrations;
begin
  select * into r from public.registrations where id = p_registration_id for update;
  if not found or r.brought_by is not null or not r.friend_discount or r.status = 'confirmed' then
    return '[]'::jsonb;
  end if;
  if exists (
    select 1 from public.registrations f
     where f.brought_by = r.id and f.status in ('pending_payment', 'confirmed')
  ) then
    return '[]'::jsonb;
  end if;
  update public.registrations set friend_discount = false where id = r.id;
  return public._reprice(r.id);
end $$;

-- A friend got a spot: the regular who brought them gets the friend rate.
create function public._claim_regular(p_registration_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r public.registrations;
begin
  select * into r from public.registrations where id = p_registration_id for update;
  if not found or r.friend_discount or r.status not in ('pending_payment', 'confirmed', 'waitlisted') then
    return '[]'::jsonb;
  end if;
  update public.registrations set friend_discount = true where id = r.id;
  return public._reprice(r.id);
end $$;

-- The new friend says who brought them (null to unlink). The person they name
-- has to be a regular; the regular's discount starts once the friend has a spot.
create or replace function public.set_brought_by(p_registration_id uuid, p_buddy_id uuid) returns jsonb
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
     or b.status not in ('pending_payment', 'confirmed', 'waitlisted')
     or public._is_first_timer(b.profile_id) then
    raise exception 'buddy_unavailable';
  end if;

  update public.registrations set brought_by = b.id, friend_discount = true where id = r.id;
  v_events := public._reprice(r.id);
  if r.status in ('pending_payment', 'confirmed') then
    v_events := v_events || public._claim_regular(b.id);
  end if;
  if v_old is not null and v_old <> b.id then
    v_events := v_events || public._release_regular(v_old);
  end if;
  return v_events;
end $$;

-------------------------------------------------------------------------------
-- Waitlist promotion: drop-in spots and instructional spots, each in order
-------------------------------------------------------------------------------
create or replace function public._promote(p_session_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s public.sessions;
  v_next public.registrations;
  v_events jsonb := '[]';
  v_instructional boolean;
begin
  select * into s from public.sessions where id = p_session_id for update;
  if not found or s.status <> 'scheduled' or now() >= s.starts_at then
    return v_events;
  end if;

  foreach v_instructional in array array[false, true] loop
    loop
      if v_instructional then
        exit when s.instructional_capacity is not null
              and public._instructional_used(s.id) >= s.instructional_capacity;
      else
        exit when public._spots_used(s.id) >= s.capacity;
      end if;

      select * into v_next
        from public.registrations
       where session_id = s.id and status = 'waitlisted'
         and (option = 'instructional') = v_instructional
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
      -- A friend who just got a spot brings the regular's discount with them.
      if v_next.brought_by is not null then
        v_events := v_events || public._claim_regular(v_next.brought_by);
      end if;
    end loop;
  end loop;

  return v_events;
end $$;

-------------------------------------------------------------------------------
-- Sign up
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
  v_amount int;
  v_status public.registration_status;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_option not in ('full', 'instructional', 'dropin') then
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
  if not public._option_offered(s, p_option) then
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
  if public._has_room(s, p_option) then
    v_status := case when v_amount = 0 then 'confirmed' else 'pending_payment' end;
  else
    v_status := 'waitlisted';
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
-- Switching option (before paying)
-------------------------------------------------------------------------------
-- Full <-> Drop-in only keeps the spot (or place in line); moving to or from
-- Instructional only needs room in the other queue, or joins its waitlist.
create or replace function public.change_registration_option(p_registration_id uuid, p_option text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r public.registrations;
  s public.sessions;
  v_events jsonb := '[]';
  v_same_queue boolean;
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
  v_same_queue := (r.option = 'instructional') = (p_option = 'instructional');

  if v_same_queue then
    -- Same spot (or same place in line), new price.
    update public.registrations set option = p_option, amount_cents = v_amount where id = r.id;
  elsif public._has_room(s, p_option) then
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
  -- A spot (or instructional place) may have freed up in the queue they left.
  return v_events || public._promote(s.id);
end $$;

-------------------------------------------------------------------------------
-- Host: mark paid makes room if confirming someone puts the session over
-------------------------------------------------------------------------------
-- "Add as paid" from the waitlist (or re-adding a late payer) confirms them even
-- when the session is full; the capacity goes up to match so the counts and
-- the waitlist stay right.
create or replace function public.admin_mark_paid(p_registration_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_payment_id uuid;
  r public.registrations;
  v_events jsonb;
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;
  select * into r from public.registrations where id = p_registration_id;
  if not found then
    raise exception 'registration_not_found';
  end if;

  insert into public.payments (sender_name, amount_cents, memo)
  values ('Marked paid by admin', greatest(r.amount_cents - r.paid_cents, 0), null)
  returning id into v_payment_id;

  v_events := public._apply_payment(v_payment_id, p_registration_id, 'admin', false);
  perform public._fit_capacity(r.session_id);
  return v_events;
end $$;

-- Raise the drop-in capacity / instructional cap to what's actually in use.
create function public._fit_capacity(p_session_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.sessions
     set capacity = greatest(capacity, public._spots_used(id)),
         instructional_capacity = case
           when instructional_capacity is null then null
           else greatest(instructional_capacity, public._instructional_used(id))
         end
   where id = p_session_id;
end $$;

-------------------------------------------------------------------------------
-- Host: add a player by hand
-------------------------------------------------------------------------------
-- An existing account (p_profile_id), or a guest by name (and email, if they
-- have one). The added player gets a spot straight away, without a hold (so it
-- never expires); a full session gets one more spot. Paid adds are confirmed.
create function public.admin_add_player(
  p_session_id uuid,
  p_profile_id uuid,
  p_guest_name text,
  p_guest_email text,
  p_option text,
  p_paid boolean
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s public.sessions;
  v_profile uuid := p_profile_id;
  v_name text := nullif(trim(p_guest_name), '');
  v_email text := lower(nullif(trim(p_guest_email), ''));
  v_amount int;
  v_id uuid;
  v_payment_id uuid;
  v_events jsonb;
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;
  if p_option not in ('full', 'instructional', 'dropin') then
    raise exception 'invalid_option';
  end if;

  select * into s from public.sessions where id = p_session_id for update;
  if not found or s.status <> 'scheduled' then
    raise exception 'session_unavailable';
  end if;
  if not public._option_offered(s, p_option) then
    raise exception 'option_unavailable';
  end if;

  if v_profile is null then
    if v_name is null then
      raise exception 'guest_name_required';
    end if;
    -- Someone with that email already has an account: add them instead.
    if v_email is not null then
      select id into v_profile from public.profiles where lower(email) = v_email;
    end if;
    if v_profile is null then
      v_profile := gen_random_uuid();
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change
      ) values (
        '00000000-0000-0000-0000-000000000000', v_profile, 'authenticated', 'authenticated',
        coalesce(v_email, 'guest-' || v_profile || '@guest.intro2volleyball.invalid'), '', null,
        '{"provider": "guest", "providers": []}', jsonb_build_object('full_name', v_name, 'name', v_name),
        now(), now(), '', '', '', ''
      );
      update public.profiles
         set guest = true,
             first_name = split_part(v_name, ' ', 1),
             last_name = nullif(trim(substr(v_name, length(split_part(v_name, ' ', 1)) + 1)), '')
       where id = v_profile;
    end if;
  elsif not exists (select 1 from public.profiles where id = v_profile) then
    raise exception 'player_not_found';
  end if;

  if exists (
    select 1 from public.registrations
     where session_id = s.id and profile_id = v_profile
       and status in ('pending_payment', 'confirmed', 'waitlisted')
  ) then
    raise exception 'already_signed_up';
  end if;

  v_amount := public._signup_price(s, p_option, false);
  insert into public.registrations (session_id, profile_id, status, ref_code, confirmed_at, option, amount_cents)
  values (
    s.id, v_profile,
    case when v_amount = 0 then 'confirmed' else 'pending_payment' end::public.registration_status,
    public.gen_ref_code(),
    case when v_amount = 0 then now() end,
    p_option, v_amount
  )
  returning id into v_id;
  perform public._fit_capacity(s.id);

  if p_paid and v_amount > 0 then
    insert into public.payments (sender_name, amount_cents, memo)
    values ('Marked paid by admin', v_amount, null)
    returning id into v_payment_id;
    v_events := public._apply_payment(v_payment_id, v_id, 'admin', false);
  else
    v_events := jsonb_build_array(jsonb_build_object(
      'event', case when v_amount = 0 then 'confirmed' else 'signed_up' end, 'registration_id', v_id));
  end if;
  return v_events;
end $$;

-------------------------------------------------------------------------------
-- The tick: an expired friend lets go of the regular's discount
-------------------------------------------------------------------------------
-- Same as 20261031000000_host_tools.sql, plus the Bring a Friend release in step 1.
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

  return v_events;
end $$;

-------------------------------------------------------------------------------
-- Counts, templates, stats
-------------------------------------------------------------------------------
-- confirmed / holding / waitlisted: drop-in spots (full + dropin);
-- instructional / instructional_waitlisted: the instructional queue; dropin:
-- how many of the drop-in spots are Drop-in only.
drop function public.get_session_counts(uuid[]);
create function public.get_session_counts(p_session_ids uuid[])
returns table (
  session_id uuid, confirmed int, holding int, waitlisted int, instructional int,
  instructional_waitlisted int, dropin int
)
language sql stable security definer set search_path = '' as $$
  select s.id,
         (count(r.id) filter (where r.option in ('full', 'dropin') and r.status = 'confirmed'))::int,
         (count(r.id) filter (where r.option in ('full', 'dropin') and r.status = 'pending_payment'))::int,
         (count(r.id) filter (where r.option in ('full', 'dropin') and r.status = 'waitlisted'))::int,
         (count(r.id) filter (where r.option = 'instructional' and r.status in ('pending_payment', 'confirmed')))::int,
         (count(r.id) filter (where r.option = 'instructional' and r.status = 'waitlisted'))::int,
         (count(r.id) filter (where r.option = 'dropin' and r.status in ('pending_payment', 'confirmed')))::int
    from public.sessions s
    left join public.registrations r on r.session_id = s.id
   where s.id = any (p_session_ids)
   group by s.id;
$$;
grant execute on function public.get_session_counts(uuid[]) to anon, authenticated;

create or replace function public.create_sessions_from_templates() returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_count int;
begin
  insert into public.sessions (
    template_id, title, starts_at, ends_at, location, capacity, price_cents,
    opens_at, hold_hours, cancel_cutoff,
    instructional_price_cents, instructional_ends_at, dropin_starts_at,
    dropin_price_cents, instructional_capacity
  )
  select t.id,
         t.title,
         occ.starts_at,
         occ.starts_at + make_interval(mins => t.duration_minutes),
         t.location,
         t.capacity,
         t.price_cents,
         occ.starts_at - make_interval(hours => t.open_hours_before),
         t.hold_hours,
         occ.starts_at - make_interval(hours => t.cancel_cutoff_hours),
         t.instructional_price_cents,
         occ.starts_at + make_interval(mins => t.instructional_minutes),
         occ.starts_at + make_interval(mins => t.dropin_offset_minutes),
         t.dropin_price_cents,
         t.instructional_capacity
    from public.session_templates t
   cross join lateral (
     select (d::date + t.start_time) at time zone t.timezone as starts_at
       from generate_series(
              (now() at time zone t.timezone)::date::timestamp,
              ((now() at time zone t.timezone)::date + (t.open_hours_before / 24 + 8))::timestamp,
              interval '1 day'
            ) d
      where extract(dow from d) = t.weekday
   ) occ
   where t.active
     and occ.starts_at > now()
     and (occ.starts_at <= now() + interval '7 days'
          or occ.starts_at - make_interval(hours => t.open_hours_before) <= now() + interval '1 day')
  on conflict (template_id, starts_at) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Same as 20261031000000_host_tools.sql, with Drop-in only counted as a spot.
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
           and not p.guest
         order by pp.last_played desc
         limit 50
      ) l
    )
  ) into v_players;

  return jsonb_build_object('sessions', v_sessions, 'players', v_players);
end $$;

-------------------------------------------------------------------------------
-- Privileges
-------------------------------------------------------------------------------
revoke execute on function public._instructional_used(uuid) from public, anon, authenticated;
revoke execute on function public._has_room(public.sessions, text) from public, anon, authenticated;
revoke execute on function public._option_offered(public.sessions, text) from public, anon, authenticated;
revoke execute on function public._claim_regular(uuid) from public, anon, authenticated;
revoke execute on function public._fit_capacity(uuid) from public, anon, authenticated;
revoke execute on function public.admin_add_player(uuid, uuid, text, text, text, boolean) from public, anon;
grant execute on function public.admin_add_player(uuid, uuid, text, text, text, boolean) to authenticated;

-- Waitlist positions count within each queue (drop-in spots, instructional).
create or replace function public.get_session_attendees(p_session_id uuid)
returns table (
  registration_id uuid,
  display_name text,
  avatar_url text,
  status public.registration_status,
  option text,
  team_id uuid,
  waitlist_position int,
  is_me boolean
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    return;
  end if;
  return query
    select r.id,
           coalesce(p.display_name, p.full_name, 'Player'),
           p.avatar_url,
           r.status,
           r.option,
           case when s.teams_published_at is not null then r.team_id end,
           case when r.status = 'waitlisted'
                then (row_number() over (partition by r.status, r.option = 'instructional'
                                         order by r.queued_at, r.created_at))::int
           end,
           r.profile_id = auth.uid()
      from public.registrations r
      join public.profiles p on p.id = r.profile_id
      join public.sessions s on s.id = r.session_id
     where r.session_id = p_session_id
       and r.status in ('pending_payment', 'confirmed', 'waitlisted')
     order by r.status, coalesce(r.confirmed_at, r.queued_at, r.created_at);
end $$;

-- Host reorders the waitlist: swaps with the neighbour in the same queue.
create or replace function public.admin_move_waitlist(p_registration_id uuid, p_direction int) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.registrations;
  other public.registrations;
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;
  select * into r from public.registrations where id = p_registration_id;
  perform 1 from public.sessions where id = r.session_id for update;
  select * into r from public.registrations
   where id = p_registration_id and status = 'waitlisted' for update;
  if not found then
    return;
  end if;

  if p_direction < 0 then
    select * into other from public.registrations
     where session_id = r.session_id and status = 'waitlisted'
       and (option = 'instructional') = (r.option = 'instructional')
       and (queued_at, created_at) < (r.queued_at, r.created_at)
     order by queued_at desc, created_at desc limit 1 for update;
  else
    select * into other from public.registrations
     where session_id = r.session_id and status = 'waitlisted'
       and (option = 'instructional') = (r.option = 'instructional')
       and (queued_at, created_at) > (r.queued_at, r.created_at)
     order by queued_at, created_at limit 1 for update;
  end if;
  if not found then
    return;
  end if;

  update public.registrations set queued_at = other.queued_at, created_at = other.created_at where id = r.id;
  update public.registrations set queued_at = r.queued_at, created_at = r.created_at where id = other.id;
end $$;
