-- Cancellation emails keep the e-Transfer's message, so the VB- code in it is
-- the surest way to find the payment being taken back. Order now:
--   1. the same Interac reference number
--   2. the ref code in the message (narrowed by amount if more than one)
--   3. that amount, received on the day it was sent
--   4. no date in the email: the same sender and amount in the last 45 days
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
       where id = any (v_ids) and amount_cents = c.amount_cents;
      -- Still several (e.g. paid twice): the latest one of that amount.
      v_ids := v_ids[1:1];
    end if;
  end if;
  -- 3. That amount, received on the day it was sent (narrowed by name, if the email gives one).
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
  -- 4. No date in the email: the same sender and amount in the last 45 days.
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
    when coalesce(cardinality(v_ids), 0) = 0 then 'No payment found for this code, amount and day.'
    else cardinality(v_ids) || ' payments could be this one. Pick the right one.'
  end;
  update public.payment_cancellations set note = v_note where id = c.id;
  insert into public.host_activity (kind, cancellation_id) values ('payment_reversed', c.id);
  return '[]'::jsonb;
end $$;

revoke execute on function public.ingest_reverse_payment(uuid, text) from public, anon, authenticated;
grant execute on function public.ingest_reverse_payment(uuid, text) to service_role;
