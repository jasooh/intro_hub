-- Optional message from the host explaining why a session was cancelled.
-- Shown on the session page and in the cancellation email.

alter table public.sessions
  add column cancel_reason text check (char_length(cancel_reason) <= 500);

drop function public.admin_cancel_session(uuid);

create function public.admin_cancel_session(p_session_id uuid, p_reason text default null) returns jsonb
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
           refund_owed = (status = 'confirmed' and amount_cents > 0)
     where session_id = p_session_id
       and status in ('pending_payment', 'confirmed', 'waitlisted')
    returning id
  loop
    v_events := v_events || jsonb_build_object('event', 'session_cancelled', 'registration_id', r.id);
  end loop;
  return v_events;
end $$;

revoke execute on function public.admin_cancel_session(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_cancel_session(uuid, text) to authenticated;
