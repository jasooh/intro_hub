-- "Remind" on the host's Owed page: email one player about every sign-up they
-- still owe money on (sessions that haven't started), in one go. Same email
-- and rules as admin_nudge_unpaid: skips anything reminded in the last few
-- minutes, so a double click can't double-send. Guests (no inbox) are skipped.
create function public.admin_nudge_player(p_profile_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_events jsonb := '[]';
  v_now timestamptz := now();
  v_sid uuid;
  r record;
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;
  if exists (select 1 from public.profiles where id = p_profile_id and guest) then
    return v_events;
  end if;

  for v_sid in
    select distinct g.session_id
      from public.registrations g
      join public.sessions s on s.id = g.session_id
     where g.profile_id = p_profile_id and g.status = 'pending_payment'
       and s.status = 'scheduled' and s.starts_at > v_now
     order by g.session_id
  loop
    perform 1 from public.sessions where id = v_sid for update;
    for r in
      update public.registrations
         set hold_nudged_at = v_now
       where session_id = v_sid
         and profile_id = p_profile_id
         and status = 'pending_payment'
         and amount_cents > paid_cents
         and (hold_expires_at is null or hold_expires_at > v_now)
         and (hold_nudged_at is null or hold_nudged_at < v_now - interval '5 minutes')
      returning id
    loop
      v_events := v_events || jsonb_build_object('event', 'hold_reminder', 'registration_id', r.id, 'nudged_at', v_now);
    end loop;
  end loop;
  return v_events;
end $$;

revoke execute on function public.admin_nudge_player(uuid) from public, anon;
grant execute on function public.admin_nudge_player(uuid) to authenticated;
