-- Assigning a payment to an old (expired or cancelled) sign-up used to try to
-- confirm that old row, which fails when the player has since signed up again
-- for the same session (one active sign-up per player per session). The money
-- belongs to the player's current sign-up, so it goes there instead.
create or replace function public.admin_assign_payment(p_payment_id uuid, p_registration_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r public.registrations;
  v_target uuid := p_registration_id;
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;
  select * into r from public.registrations where id = p_registration_id;
  if not found then
    raise exception 'registration_not_found';
  end if;
  if r.status not in ('pending_payment', 'confirmed', 'waitlisted') then
    select id into v_target
      from public.registrations
     where session_id = r.session_id and profile_id = r.profile_id
       and status in ('pending_payment', 'confirmed', 'waitlisted')
     limit 1;
    v_target := coalesce(v_target, p_registration_id);
  end if;
  return public._apply_payment(p_payment_id, v_target, 'admin', false);
end $$;
