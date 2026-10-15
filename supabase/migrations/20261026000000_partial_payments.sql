-- Partial payments add up. Each sign-up keeps paid_cents, the total of the
-- payments linked to it (kept in sync by a trigger on payments). A payment
-- that covers less than what's owed is linked anyway: the spot stays held
-- (a few hours longer, so they can send the rest) and the player is emailed
-- what's left. Once the total reaches what's owed, the spot is confirmed.
--
-- Refunds are now based on what was actually paid:
--   cancelled / expired / session cancelled -> give back everything paid
--   confirmed but overpaid                  -> give back the extra
-- A host assigning a payment by hand still confirms regardless of the amount.

alter table public.registrations add column paid_cents int not null default 0;

create function public._sync_paid_cents() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.registration_id is not null then
    update public.registrations
       set paid_cents = coalesce((select sum(amount_cents) from public.payments where registration_id = old.registration_id), 0)
     where id = old.registration_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.registration_id is not null then
    update public.registrations
       set paid_cents = coalesce((select sum(amount_cents) from public.payments where registration_id = new.registration_id), 0)
     where id = new.registration_id;
  end if;
  return null;
end $$;
revoke execute on function public._sync_paid_cents() from public, anon, authenticated;

create trigger payments_sync_paid
  after insert or delete or update of registration_id, amount_cents on public.payments
  for each row execute function public._sync_paid_cents();

update public.registrations r
   set paid_cents = p.total
  from (select registration_id, sum(amount_cents) as total
          from public.payments where registration_id is not null group by registration_id) p
 where r.id = p.registration_id;

-------------------------------------------------------------------------------
-- Applying a payment
-------------------------------------------------------------------------------
create or replace function public._apply_payment(
  p_payment_id uuid,
  p_registration_id uuid,
  p_matched_by text,
  p_require_pending boolean
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r public.registrations;
  s public.sessions;
begin
  select * into r from public.registrations where id = p_registration_id;
  if not found then
    raise exception 'registration_not_found';
  end if;

  select * into s from public.sessions where id = r.session_id for update;
  select * into r from public.registrations where id = p_registration_id for update;

  if p_require_pending and r.status <> 'pending_payment' then
    return null; -- caller leaves the payment unmatched
  end if;

  update public.payments
     set registration_id = r.id, matched_by = p_matched_by, matched_at = now(), note = null
   where id = p_payment_id;
  select * into r from public.registrations where id = p_registration_id; -- paid_cents now includes it

  if r.status = 'confirmed' then
    -- Already in: anything beyond what's owed is money to give back.
    if r.paid_cents > r.amount_cents then
      update public.registrations set refund_owed = true where id = r.id;
    end if;
    return '[]'::jsonb;
  end if;

  if r.paid_cents < r.amount_cents and p_matched_by <> 'admin' then
    -- Part of what's owed: keep the spot a while longer so they can send the rest.
    update public.registrations
       set hold_expires_at = least(greatest(coalesce(hold_expires_at, now()), now() + interval '6 hours'), s.starts_at)
     where id = r.id;
    return jsonb_build_array(jsonb_build_object(
      'event', 'partial_payment', 'registration_id', r.id, 'payment_id', p_payment_id
    ));
  end if;

  update public.registrations
     set status = 'confirmed',
         confirmed_at = now(),
         hold_expires_at = null,
         queued_at = null,
         cancelled_at = null,
         refund_owed = (r.paid_cents > r.amount_cents)
   where id = r.id;

  return jsonb_build_array(jsonb_build_object('event', 'confirmed', 'registration_id', r.id));
end $$;

-- Mark paid records only what's still owed.
create or replace function public.admin_mark_paid(p_registration_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_payment_id uuid;
  r public.registrations;
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

  return public._apply_payment(v_payment_id, p_registration_id, 'admin', false);
end $$;

-------------------------------------------------------------------------------
-- Refunds follow what was actually paid
-------------------------------------------------------------------------------
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

  return public._promote(s.id);
end $$;

create or replace function public.admin_cancel_session(p_session_id uuid, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_events jsonb := '[]';
  r record;
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;
  update public.sessions
     set status = 'cancelled',
         cancel_reason = nullif(trim(p_reason), '')
   where id = p_session_id;
  for r in
    update public.registrations
       set status = 'cancelled',
           cancelled_at = now(),
           queued_at = null,
           hold_expires_at = null,
           refund_owed = (paid_cents > 0)
     where session_id = p_session_id
       and status in ('pending_payment', 'confirmed', 'waitlisted')
    returning id
  loop
    v_events := v_events || jsonb_build_object('event', 'session_cancelled', 'registration_id', r.id);
  end loop;
  return v_events;
end $$;

-- Same as before, except an expired hold that was partly paid owes that money back.
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

  return v_events;
end $$;

-- Rejoining: what they actually paid on the cancelled sign-up must equal the new price.
create or replace function public._use_rejoin_credit(p_registration_id uuid) returns boolean
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
     and o.status in ('cancelled', 'expired')
     and o.refund_owed
     and o.refunded_at is null
     and o.refund_waived_at is null
     and o.paid_cents = r.amount_cents
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
