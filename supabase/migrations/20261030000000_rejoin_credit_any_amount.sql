-- Rejoining after a paid cancel used to carry the payment over only when it
-- exactly matched the new price. Now any refund still owed (not sent, not
-- waived) for the same session moves to the new sign-up, whatever the amount:
--   paid at least the price -> confirmed; anything extra stays owed (Overpaid)
--   paid less               -> counts as a partial payment; they owe the rest
-- Returns true only when the new sign-up ends up confirmed.
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
     and o.paid_cents > 0
   order by coalesce(o.cancelled_at, o.updated_at) desc
   limit 1
   for update;
  if v_old is null then
    return false;
  end if;

  update public.payments set registration_id = r.id where registration_id = v_old;
  update public.registrations set refund_owed = false where id = v_old;
  select * into r from public.registrations where id = p_registration_id; -- paid_cents now includes it

  if r.paid_cents < r.amount_cents then
    return false; -- a partial payment toward this sign-up
  end if;
  update public.registrations
     set status = 'confirmed', confirmed_at = now(), hold_expires_at = null, queued_at = null,
         refund_owed = (r.paid_cents > r.amount_cents)
   where id = r.id;
  return true;
end $$;
