-- Cancelled e-Transfers. Without Autodeposit the host has to click "deposit",
-- and until then the sender can cancel (or the transfer expires unclaimed).
-- The Gmail script now also forwards those notifications. The real email says
-- only the amount and the day it was sent ("The recent transfer of $14.00
-- (CAD) sent to you on Oct 19, 2026 has been cancelled"), so:
--   * Each cancellation is stored, then matched to the payment it takes back:
--     the same Interac reference number if it has one, otherwise the one
--     payment of exactly that amount received that day. Two or more of them,
--     or none: no guessing, the hosts are alerted to pick on the Payments page.
--   * The payment is reversed and no longer counts (paid_cents leaves it out).
--   * The sign-up follows "Hours to pay after signing up": still inside the
--     player's window (from when they got their spot) -> back to holding, for
--     what's left of the window, and asked to pay again; window over -> the
--     spot is released (expired) and the waitlist moves up. Once the session
--     has started nothing moves; the hosts are alerted instead.
--   * Every cancellation is an instant host alert (host_activity
--     'payment_reversed').

alter table public.payments add column reversed_at timestamptz;

create table public.payment_cancellations (
  id uuid primary key default gen_random_uuid(),
  gmail_message_id text not null unique,
  sender_name text,
  amount_cents int check (amount_cents > 0),
  memo text,
  reference text,
  -- The day the cancelled transfer was sent, as the email gives it.
  sent_on date,
  received_at timestamptz not null,
  -- The payment it took back, once matched (automatically or by a host).
  payment_id uuid references public.payments (id) on delete set null,
  -- Why it wasn't matched automatically.
  note text,
  -- A host decided it isn't about a volleyball payment.
  dismissed_at timestamptz,
  raw jsonb,
  created_at timestamptz not null default now()
);
create index payment_cancellations_received_idx on public.payment_cancellations (received_at desc);

alter table public.payment_cancellations enable row level security;
create policy payment_cancellations_admin_select on public.payment_cancellations for select to authenticated
  using (public.is_admin());
revoke insert, update, delete on public.payment_cancellations from anon, authenticated;

-- Host activity: a reversed payment / unresolved cancellation (instant alert).
alter table public.host_activity add column cancellation_id uuid references public.payment_cancellations (id) on delete cascade;
alter table public.host_activity drop constraint host_activity_kind_check;
alter table public.host_activity add constraint host_activity_kind_check check (
  kind in ('joined', 'waitlisted', 'promoted', 'paid', 'cancelled', 'expired', 'unmatched_payment', 'payment_reversed')
);
drop index public.host_activity_pending_alert_idx;
create index host_activity_pending_alert_idx on public.host_activity (created_at)
  where alerted_at is null and (late or kind in ('unmatched_payment', 'payment_reversed'));

-------------------------------------------------------------------------------
-- paid_cents leaves out reversed payments
-------------------------------------------------------------------------------
create or replace function public._sync_paid_cents() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.registration_id is not null then
    update public.registrations
       set paid_cents = coalesce((select sum(amount_cents) from public.payments
                                   where registration_id = old.registration_id and reversed_at is null), 0)
     where id = old.registration_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.registration_id is not null then
    update public.registrations
       set paid_cents = coalesce((select sum(amount_cents) from public.payments
                                   where registration_id = new.registration_id and reversed_at is null), 0)
     where id = new.registration_id;
  end if;
  return null;
end $$;

drop trigger payments_sync_paid on public.payments;
create trigger payments_sync_paid
  after insert or delete or update of registration_id, amount_cents, reversed_at on public.payments
  for each row execute function public._sync_paid_cents();

-------------------------------------------------------------------------------
-- Taking a payment back
-------------------------------------------------------------------------------
-- Reverse payment p for cancellation c and settle the sign-up. Returns events
-- for emails. Callers check who may do it.
create function public._reverse_payment(p_cancellation_id uuid, p_payment_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.payments;
  r public.registrations;
  s public.sessions;
  v_spot_at timestamptz;
  v_window_end timestamptz;
  v_events jsonb := '[]';
begin
  select * into p from public.payments where id = p_payment_id;
  if not found or p.reversed_at is not null then
    raise exception 'payment_unavailable';
  end if;

  -- Session lock first (as everywhere else), then the sign-up.
  if p.registration_id is not null then
    select * into r from public.registrations where id = p.registration_id;
    select * into s from public.sessions where id = r.session_id for update;
    select * into r from public.registrations where id = p.registration_id for update;
  end if;
  update public.payments set reversed_at = now() where id = p.id;
  update public.payment_cancellations set payment_id = p.id, note = null where id = p_cancellation_id;

  if p.registration_id is not null then
    select * into r from public.registrations where id = p.registration_id; -- paid_cents without it
    if r.status in ('pending_payment', 'confirmed') and s.status = 'scheduled' and now() < s.starts_at then
      if r.paid_cents < r.amount_cents then
        -- Their time to pay runs from when they got the spot (signing up, or
        -- being moved up from the waitlist), capped at the start.
        select max(created_at) into v_spot_at
          from public.host_activity
         where registration_id = r.id and kind in ('joined', 'promoted');
        v_window_end := least(coalesce(v_spot_at, r.created_at) + make_interval(hours => s.hold_hours), s.starts_at);
        if now() < v_window_end then
          update public.registrations
             set status = 'pending_payment', confirmed_at = null, hold_expires_at = v_window_end,
                 hold_nudged_at = null, refund_owed = false
           where id = r.id;
          v_events := jsonb_build_array(jsonb_build_object(
            'event', 'payment_reversed', 'registration_id', r.id, 'payment_id', p.id));
        else
          -- Past their time to pay: the spot goes to the next person.
          update public.registrations
             set status = 'expired', confirmed_at = null, hold_expires_at = null, queued_at = null,
                 refund_owed = (r.paid_cents > 0)
           where id = r.id;
          v_events := jsonb_build_array(jsonb_build_object(
            'event', 'spot_released', 'registration_id', r.id, 'payment_id', p.id))
            || public._promote(s.id);
          if r.brought_by is not null then
            v_events := v_events || public._release_regular(r.brought_by);
          end if;
        end if;
      else
        -- Still covered (e.g. they had paid twice): only an overpayment changes.
        update public.registrations
           set refund_owed = (r.status = 'confirmed' and r.paid_cents > r.amount_cents)
         where id = r.id;
      end if;
    elsif r.status in ('cancelled', 'expired') and r.refunded_at is null then
      -- Nothing to give back for money that never arrived.
      update public.registrations set refund_owed = (r.paid_cents > 0) where id = r.id;
    end if;
    -- Session started or cancelled: nothing moves; the hosts' alert says so.
  end if;

  insert into public.host_activity (kind, session_id, registration_id, payment_id, cancellation_id)
  values ('payment_reversed', r.session_id, r.id, p.id, p_cancellation_id);
  return v_events;
end $$;

-- The ingest route (service role), for each new cancellation. Matches it to
-- one payment or leaves it for the hosts (with a note and an alert).
create function public.ingest_reverse_payment(p_cancellation_id uuid, p_timezone text default 'America/Toronto') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.payment_cancellations;
  v_ids uuid[];
  v_note text;
begin
  select * into c from public.payment_cancellations where id = p_cancellation_id for update;
  if not found or c.payment_id is not null then
    return '[]'::jsonb;
  end if;

  -- 1. The same Interac reference number.
  if c.reference is not null then
    select array_agg(id) into v_ids from public.payments
     where reversed_at is null and gmail_message_id is not null and raw ->> 'reference' = c.reference;
  end if;
  -- 2. That amount, received on the day it was sent (narrowed by name, if the email gives one).
  if coalesce(cardinality(v_ids), 0) = 0 and c.amount_cents is not null and c.sent_on is not null then
    select array_agg(id order by received_at desc) into v_ids from public.payments
     where reversed_at is null and gmail_message_id is not null
       and amount_cents = c.amount_cents
       and (received_at at time zone p_timezone)::date = c.sent_on;
    if cardinality(v_ids) > 1 and c.sender_name is not null then
      select array_agg(id) into v_ids from public.payments
       where id = any (v_ids) and lower(btrim(sender_name)) = lower(btrim(c.sender_name));
    end if;
  end if;
  -- 3. No date in the email: the same sender and amount in the last 45 days.
  if coalesce(cardinality(v_ids), 0) = 0 and c.sent_on is null and c.sender_name is not null then
    select array_agg(id) into v_ids from public.payments
     where reversed_at is null and gmail_message_id is not null
       and lower(btrim(sender_name)) = lower(btrim(c.sender_name))
       and (c.amount_cents is null or amount_cents = c.amount_cents)
       and received_at > c.received_at - interval '45 days' and received_at <= c.received_at;
  end if;

  if cardinality(v_ids) = 1 then
    return public._reverse_payment(c.id, v_ids[1]);
  end if;

  v_note := case
    when coalesce(cardinality(v_ids), 0) = 0 then 'No payment found for this amount and day.'
    else cardinality(v_ids) || ' payments could be this one. Pick the right one.'
  end;
  update public.payment_cancellations set note = v_note where id = c.id;
  insert into public.host_activity (kind, cancellation_id) values ('payment_reversed', c.id);
  return '[]'::jsonb;
end $$;

-- A host picks the payment an unmatched cancellation takes back (Payments page).
create function public.admin_reverse_payment(p_cancellation_id uuid, p_payment_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.payment_cancellations;
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;
  select * into c from public.payment_cancellations where id = p_cancellation_id for update;
  if not found or c.payment_id is not null then
    raise exception 'cancellation_handled';
  end if;
  return public._reverse_payment(c.id, p_payment_id);
end $$;

-- A host decides a cancellation isn't about a volleyball payment (or undoes that).
create function public.admin_dismiss_cancellation(p_cancellation_id uuid, p_dismissed boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;
  update public.payment_cancellations
     set dismissed_at = case when p_dismissed then now() end
   where id = p_cancellation_id and payment_id is null;
end $$;

revoke execute on function public.admin_dismiss_cancellation(uuid, boolean) from public, anon;
grant execute on function public.admin_dismiss_cancellation(uuid, boolean) to authenticated;
revoke execute on function public._reverse_payment(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.ingest_reverse_payment(uuid, text) from public, anon, authenticated;
grant execute on function public.ingest_reverse_payment(uuid, text) to service_role;
revoke execute on function public.admin_reverse_payment(uuid, uuid) from public, anon;
grant execute on function public.admin_reverse_payment(uuid, uuid) to authenticated;

-- Dev tools reset also clears cancellations (they point at payments).
create or replace function public.devtools_reset(p_confirm text, p_wipe_players boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._devtools_guard();
  if p_confirm is distinct from 'RESET' then
    raise exception 'confirm_mismatch';
  end if;
  truncate public.host_activity, public.payment_cancellations, public.session_messages, public.session_matches,
           public.team_requests, public.session_teams, public.email_log, public.payments, public.registrations,
           public.posts, public.sessions;
  if p_wipe_players then
    delete from auth.users where id <> (select auth.uid());
  end if;
  perform public._devtools_log('reset', null, null, null, null,
    case when p_wipe_players then 'everything + player accounts' else 'everything except accounts' end);
end $$;
