-- When the host changes a session's payment window (hold_hours) or start time,
-- spots that are already being held follow the new rule instead of keeping the
-- deadline they got at sign-up.
--
--   new deadline = (when the hold started) + new window, capped at the start time
--
-- The hold start is recovered from the old deadline minus the old window. If a
-- shorter window would put the deadline in the past, the player gets 30 more
-- minutes instead of losing the spot on the next tick.

create function public._sync_holds_to_session() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.registrations
     set hold_expires_at = least(
           greatest(
             hold_expires_at - make_interval(hours => old.hold_hours) + make_interval(hours => new.hold_hours),
             now() + interval '30 minutes'
           ),
           new.starts_at
         )
   where session_id = new.id
     and status = 'pending_payment'
     and hold_expires_at is not null;
  return new;
end $$;

create trigger sessions_sync_holds
  after update of hold_hours, starts_at on public.sessions
  for each row
  when (old.hold_hours is distinct from new.hold_hours or old.starts_at is distinct from new.starts_at)
  execute function public._sync_holds_to_session();

revoke execute on function public._sync_holds_to_session() from public, anon, authenticated;
