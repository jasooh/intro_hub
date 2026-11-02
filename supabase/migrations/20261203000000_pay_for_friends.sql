-- Paying for friends: one e-Transfer with the payer's own code covers friends'
-- unpaid sign-ups in the same session. The money is split into one payment row
-- per sign-up (payments.split_from), so paid_cents, refunds and reversals keep
-- working per sign-up.

alter table public.registrations
  add column covered_by uuid references public.registrations (id) on delete set null,
  add column covered_seen boolean not null default false;
create index registrations_covered_by_idx on public.registrations (covered_by) where covered_by is not null;

alter table public.payments add column split_from uuid references public.payments (id) on delete cascade;
create index payments_split_from_idx on public.payments (split_from) where split_from is not null;

-- When the payer leaves (cancelled, hold expired, payment taken back), friends
-- still waiting to pay are no longer covered and pay with their own code.
create function public._release_covered() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.registrations
     set covered_by = null
   where covered_by = new.id and status = 'pending_payment';
  return null;
end $$;
revoke execute on function public._release_covered() from public, anon, authenticated;

create trigger registrations_release_covered
  after update of status on public.registrations
  for each row
  when (old.status in ('pending_payment', 'confirmed') and new.status not in ('pending_payment', 'confirmed'))
  execute function public._release_covered();

-- The payer picks whose sign-ups they're paying for (replaces the whole list).
create function public.set_covered_signups(p_registration_id uuid, p_targets uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.registrations;
  s public.sessions;
  v_targets uuid[];
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
  if s.status <> 'scheduled' then
    raise exception 'session_unavailable';
  end if;
  if now() >= s.starts_at then
    raise exception 'session_started';
  end if;
  -- Only someone holding a spot, and not covered by someone else (no chains).
  if r.status not in ('pending_payment', 'confirmed') or r.covered_by is not null then
    raise exception 'cover_unavailable';
  end if;

  v_targets := array(select distinct t from unnest(coalesce(p_targets, '{}'::uuid[])) as t);
  if cardinality(v_targets) > 5 then  -- MAX_TEAMMATES in src/lib/teams.ts
    raise exception 'too_many_friends';
  end if;
  if p_registration_id = any (v_targets) or exists (
    select 1 from unnest(v_targets) as t(id)
     where not exists (
       select 1 from public.registrations x
        where x.id = t.id
          and x.session_id = r.session_id
          and x.status = 'pending_payment'
          and (x.covered_by is null or x.covered_by = p_registration_id)
          and not exists (select 1 from public.registrations y where y.covered_by = x.id)
     )
  ) then
    raise exception 'cover_unavailable';
  end if;

  update public.registrations
     set covered_by = null
   where covered_by = p_registration_id and status = 'pending_payment' and not (id = any (v_targets));
  update public.registrations
     set covered_by = p_registration_id, covered_seen = false
   where id = any (v_targets) and covered_by is null;
end $$;

-- Other unpaid sign-ups in a session, for the payer's picker. Only for someone
-- signed up for that session (players can't read each other's sign-ups).
create function public.payable_signups(p_session_id uuid)
returns table (registration_id uuid, display_name text, avatar_url text, owed_cents int)
language sql stable security definer set search_path = '' as $$
  select x.id, coalesce(p.display_name, p.full_name), p.avatar_url, greatest(x.amount_cents - x.paid_cents, 0)
    from public.registrations x
    join public.profiles p on p.id = x.profile_id
   where x.session_id = p_session_id
     and x.status = 'pending_payment'
     and x.profile_id is distinct from auth.uid()
     and exists (
       select 1 from public.registrations me
        where me.session_id = p_session_id and me.profile_id = auth.uid()
          and me.status in ('pending_payment', 'confirmed')
     )
   order by lower(coalesce(p.display_name, p.full_name));
$$;

-- The friend says they'll pay for themselves.
create function public.decline_cover(p_registration_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.registrations;
begin
  select * into r from public.registrations where id = p_registration_id;
  if not found then
    raise exception 'registration_not_found';
  end if;
  if r.profile_id is distinct from auth.uid() then
    raise exception 'forbidden';
  end if;
  perform 1 from public.sessions where id = r.session_id for update;
  update public.registrations
     set covered_by = null, covered_seen = true
   where id = r.id and status = 'pending_payment';
end $$;

-- The friend saw the "your spot is covered" pop-up.
create function public.acknowledge_cover(p_registration_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.registrations where id = p_registration_id and profile_id = auth.uid()) then
    raise exception 'forbidden';
  end if;
  update public.registrations set covered_seen = true where id = p_registration_id;
end $$;

revoke execute on function public.set_covered_signups(uuid, uuid[]) from public, anon;
grant execute on function public.set_covered_signups(uuid, uuid[]) to authenticated;
revoke execute on function public.payable_signups(uuid) from public, anon;
grant execute on function public.payable_signups(uuid) to authenticated;
revoke execute on function public.decline_cover(uuid) from public, anon;
grant execute on function public.decline_cover(uuid) to authenticated;
revoke execute on function public.acknowledge_cover(uuid) from public, anon;
grant execute on function public.acknowledge_cover(uuid) to authenticated;

-- What one e-Transfer brought in: its own amount plus the shares split off it.
create function public._received_cents(p_payment_id uuid) returns int
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(amount_cents), 0)::int from public.payments where id = p_payment_id or split_from = p_payment_id;
$$;
revoke execute on function public._received_cents(uuid) from public, anon, authenticated;

-- The ingest route (service role), for an e-Transfer carrying the code of a
-- payer who covers friends. Pays the payer first, then friends in the order
-- they signed up; each gets at most what it still owes. Anything left over
-- stays with the payer (owed back once they're confirmed).
create function public.ingest_apply_group_payment(
  p_payment_id uuid,
  p_payer_registration_id uuid,
  p_matched_by text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.payments;
  payer public.registrations;
  f public.registrations;
  v_remaining int;
  v_share int;
  v_split_id uuid;
  v_events jsonb := '[]';
begin
  select * into payer from public.registrations where id = p_payer_registration_id;
  if not found then
    raise exception 'registration_not_found';
  end if;
  perform 1 from public.sessions where id = payer.session_id for update;
  select * into payer from public.registrations where id = p_payer_registration_id for update;
  if payer.status not in ('pending_payment', 'confirmed') then
    return null; -- caller leaves the payment unmatched
  end if;

  select * into p from public.payments where id = p_payment_id for update;
  v_remaining := p.amount_cents;
  if payer.status = 'pending_payment' then
    v_remaining := v_remaining - least(v_remaining, greatest(payer.amount_cents - payer.paid_cents, 0));
  end if;

  for f in
    select * from public.registrations
     where covered_by = payer.id and status = 'pending_payment'
     order by created_at, id
     for update
  loop
    exit when v_remaining <= 0;
    v_share := least(v_remaining, greatest(f.amount_cents - f.paid_cents, 0));
    continue when v_share = 0;
    insert into public.payments (sender_name, amount_cents, memo, received_at, split_from, raw)
    values (p.sender_name, v_share, p.memo, p.received_at, p.id, jsonb_build_object('split_from', p.id))
    returning id into v_split_id;
    v_events := v_events || coalesce(public._apply_payment(v_split_id, f.id, p_matched_by, true), '[]'::jsonb);
    v_remaining := v_remaining - v_share;
  end loop;

  -- The payer keeps their own share plus anything nobody else needed.
  update public.payments set amount_cents = p.amount_cents - (public._received_cents(p.id) - p.amount_cents)
   where id = p.id;
  return v_events || coalesce(public._apply_payment(p.id, payer.id, p_matched_by, false), '[]'::jsonb);
end $$;
revoke execute on function public.ingest_apply_group_payment(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.ingest_apply_group_payment(uuid, uuid, text) to service_role;

-- Taking back a group e-Transfer takes back every share split off it.
alter function public._reverse_payment(uuid, uuid) rename to _reverse_single_payment;

create function public._reverse_payment(p_cancellation_id uuid, p_payment_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_events jsonb;
  v_split uuid;
begin
  v_events := public._reverse_single_payment(p_cancellation_id, p_payment_id);
  for v_split in
    select id from public.payments where split_from = p_payment_id and reversed_at is null order by created_at, id
  loop
    v_events := v_events || public._reverse_single_payment(p_cancellation_id, v_split);
  end loop;
  -- The cancellation points at the e-Transfer itself, not its last share.
  update public.payment_cancellations set payment_id = p_payment_id where id = p_cancellation_id;
  return v_events;
end $$;
revoke execute on function public._reverse_payment(uuid, uuid) from public, anon, authenticated;
revoke execute on function public._reverse_single_payment(uuid, uuid) from public, anon, authenticated;

-- Matching a cancellation by amount compares the whole e-Transfer (with its shares).
create or replace function public.ingest_reverse_payment(p_cancellation_id uuid, p_timezone text default 'America/Toronto') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.payment_cancellations;
  v_ids uuid[];
  v_code text;
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
  -- 2. The ref code in the message ("VB-7K3Q", "vb 7k3q"): payments on that sign-up,
  --    or not linked yet but carrying the same code.
  v_code := upper((regexp_match(coalesce(c.memo, ''), 'vb[\s-]?([a-hj-np-z2-9]{4})', 'i'))[1]);
  if coalesce(cardinality(v_ids), 0) = 0 and v_code is not null then
    select array_agg(p.id order by p.received_at desc) into v_ids
      from public.payments p
      left join public.registrations r on r.id = p.registration_id
     where p.reversed_at is null and p.gmail_message_id is not null
       and (r.ref_code = 'VB-' || v_code
            or (p.registration_id is null
                and upper((regexp_match(coalesce(p.memo, ''), 'vb[\s-]?([a-hj-np-z2-9]{4})', 'i'))[1]) = v_code));
    if cardinality(v_ids) > 1 and c.amount_cents is not null then
      select array_agg(id) into v_ids from public.payments
       where id = any (v_ids) and public._received_cents(id) = c.amount_cents;
      -- Still several (e.g. paid twice): the latest one of that amount.
      v_ids := v_ids[1:1];
    end if;
  end if;
  -- 3. That amount, received on the day it was sent, from the same sender (when the
  --    email names one). Never a payment from someone else.
  if coalesce(cardinality(v_ids), 0) = 0 and c.amount_cents is not null and c.sent_on is not null then
    select array_agg(id order by received_at desc) into v_ids from public.payments
     where reversed_at is null and gmail_message_id is not null
       and public._received_cents(id) = c.amount_cents
       and (received_at at time zone p_timezone)::date = c.sent_on
       and (c.sender_name is null or lower(btrim(sender_name)) = lower(btrim(c.sender_name)));
  end if;
  -- 4. No date in the email: the same sender and amount in the last 45 days.
  if coalesce(cardinality(v_ids), 0) = 0 and c.sent_on is null and c.sender_name is not null then
    select array_agg(id) into v_ids from public.payments
     where reversed_at is null and gmail_message_id is not null
       and lower(btrim(sender_name)) = lower(btrim(c.sender_name))
       and (c.amount_cents is null or public._received_cents(id) = c.amount_cents)
       and received_at > c.received_at - interval '45 days' and received_at <= c.received_at;
  end if;

  if cardinality(v_ids) = 1 then
    return public._reverse_payment(c.id, v_ids[1]);
  end if;

  v_note := case
    when coalesce(cardinality(v_ids), 0) = 0 then 'No payment found for this code, amount and day.'
    else cardinality(v_ids) || ' payments could be this one. Pick the right one.'
  end;
  update public.payment_cancellations set note = v_note where id = c.id;
  insert into public.host_activity (kind, cancellation_id) values ('payment_reversed', c.id);
  return '[]'::jsonb;
end $$;

revoke execute on function public.ingest_reverse_payment(uuid, text) from public, anon, authenticated;
grant execute on function public.ingest_reverse_payment(uuid, text) to service_role;

