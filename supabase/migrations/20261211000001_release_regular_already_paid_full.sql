-- Bring a Friend: a regular who's already confirmed keeps the friend rate
-- once the friend who named them leaves -- *unless* they'd already paid the
-- full, undiscounted price before the friend ever showed up. In that case the
-- "discount" (and the refund it flagged as owed) was never real: they paid
-- full, so there's nothing new to ask them for, and reverting costs them
-- nothing. Only reached once no other active friend still has them on the
-- hook (same guard as before).
create or replace function public._release_regular(p_registration_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r public.registrations;
  s public.sessions;
  v_full int;
begin
  select * into r from public.registrations where id = p_registration_id for update;
  if not found or r.brought_by is not null or not r.friend_discount then
    return '[]'::jsonb;
  end if;
  if exists (
    select 1 from public.registrations f
     where f.brought_by = r.id and f.status in ('pending_payment', 'confirmed')
  ) then
    return '[]'::jsonb;
  end if;

  if r.status <> 'confirmed' then
    update public.registrations set friend_discount = false where id = r.id;
    return public._reprice(r.id);
  end if;

  select * into s from public.sessions where id = r.session_id;
  v_full := public._signup_price(s, r.option, false);
  if r.paid_cents < v_full then
    -- Paid less than full (they paid at the discount rate itself): leave
    -- them alone so they're never asked for more after being told they're
    -- all paid up.
    return '[]'::jsonb;
  end if;
  update public.registrations
     set friend_discount = false, amount_cents = v_full, refund_owed = (r.paid_cents > v_full)
   where id = r.id;
  return '[]'::jsonb;
end $$;
