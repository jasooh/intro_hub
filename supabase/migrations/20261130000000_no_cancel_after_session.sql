-- Players can't cancel (or leave the waitlist for) a session that is over.
-- Hosts still can, from the roster.
-- Same as 20261028000000_bring_a_friend_and_deposits.sql, plus the session_over check.
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
  if now() >= s.ends_at and not public.is_admin() then
    raise exception 'session_over';
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
