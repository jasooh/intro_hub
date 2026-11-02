-- Pay for friends, fixes from review.

-- 1. Take back the friends' shares before the payer's own payment. If the payer
--    is then past their time to pay and loses the spot, _release_covered sees the
--    friends already waiting to pay again and stops covering them.
create or replace function public._reverse_payment(p_cancellation_id uuid, p_payment_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_events jsonb := '[]';
  v_split uuid;
begin
  for v_split in
    select id from public.payments where split_from = p_payment_id and reversed_at is null order by created_at, id
  loop
    v_events := v_events || public._reverse_single_payment(p_cancellation_id, v_split);
  end loop;
  v_events := v_events || public._reverse_single_payment(p_cancellation_id, p_payment_id);
  -- The cancellation points at the e-Transfer itself, not one of its shares.
  update public.payment_cancellations set payment_id = p_payment_id where id = p_cancellation_id;
  return v_events;
end $$;
revoke execute on function public._reverse_payment(uuid, uuid) from public, anon, authenticated;

-- 2. A covered friend confirmed by anything but a share of the payer's
--    e-Transfer (they paid themselves, or a host marked them paid) is no longer
--    covered, so nobody is shown as having paid for them.
create function public._drop_stale_cover() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.payments
     where registration_id = new.id and split_from is not null and reversed_at is null
  ) then
    new.covered_by := null;
  end if;
  return new;
end $$;
revoke execute on function public._drop_stale_cover() from public, anon, authenticated;

create trigger registrations_drop_stale_cover
  before update of status on public.registrations
  for each row
  when (new.status = 'confirmed' and old.status <> 'confirmed' and new.covered_by is not null)
  execute function public._drop_stale_cover();
