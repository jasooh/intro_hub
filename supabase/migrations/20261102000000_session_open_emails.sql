-- "Sign-ups are open" emails: when a session's sign-ups open, players who get
-- announcements are emailed once, with the host's notes. Hosts can turn it off
-- per session (sessions.announce). Sessions that already exist are marked as
-- announced so nothing goes out for them.

alter table public.sessions
  add column announce boolean not null default true,
  add column announced_at timestamptz;

update public.sessions set announced_at = now() where announced_at is null;

-- Same as 20261101000000_signup_options.sql, plus step 6.
create or replace function public.run_tick() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_events jsonb := '[]';
  v_now timestamptz := now();
  v_sid uuid;
  r record;
begin
  perform public.create_sessions_from_templates();

  -- 1. Expire unpaid holds (session lock first, like everywhere else).
  for v_sid in
    select distinct session_id from public.registrations
     where status = 'pending_payment' and hold_expires_at <= now()
  loop
    perform 1 from public.sessions where id = v_sid for update;
    for r in
      update public.registrations
         set status = 'expired', hold_expires_at = null, refund_owed = (paid_cents > 0)
       where session_id = v_sid and status = 'pending_payment' and hold_expires_at <= now()
      returning id, brought_by
    loop
      v_events := v_events || jsonb_build_object('event', 'expired', 'registration_id', r.id);
      if r.brought_by is not null then
        v_events := v_events || public._release_regular(r.brought_by);
      end if;
    end loop;
  end loop;

  -- 2. Fill any free spots from waitlists.
  for v_sid in
    select distinct r2.session_id
      from public.registrations r2
      join public.sessions s on s.id = r2.session_id
     where r2.status = 'waitlisted' and s.status = 'scheduled' and s.starts_at > now()
  loop
    v_events := v_events || public._promote(v_sid);
  end loop;

  -- 3. Day-before reminders for confirmed players.
  for v_sid in
    update public.sessions
       set reminder_sent_at = now()
     where status = 'scheduled'
       and reminder_sent_at is null
       and starts_at > now()
       and starts_at <= now() + interval '24 hours'
    returning id
  loop
    v_events := v_events || coalesce((
      select jsonb_agg(jsonb_build_object('event', 'reminder', 'registration_id', id))
        from public.registrations
       where session_id = v_sid and status = 'confirmed'
    ), '[]'::jsonb);
  end loop;

  -- 4. Deposit sessions: once a session is over, everyone still confirmed gets
  --    their refundable deposit back (Refunds -> Deposit). Runs once per session.
  for v_sid in
    update public.sessions
       set deposits_released_at = now()
     where deposit_cents is not null and deposits_released_at is null and ends_at < now()
    returning id
  loop
    update public.registrations
       set refund_owed = true
     where session_id = v_sid and status = 'confirmed' and paid_cents > 0;
  end loop;

  -- 5. Payment reminders: once per hold, when it has at most 2 hours left (or
  --    half its window, for short holds).
  for r in
    update public.registrations reg
       set hold_nudged_at = v_now
      from public.sessions s
     where s.id = reg.session_id
       and s.status = 'scheduled'
       and reg.status = 'pending_payment'
       and reg.hold_nudged_at is null
       and reg.hold_expires_at > v_now
       and reg.hold_expires_at <= v_now + least(interval '2 hours', make_interval(hours => s.hold_hours) / 2)
    returning reg.id
  loop
    v_events := v_events || jsonb_build_object('event', 'hold_reminder', 'registration_id', r.id, 'nudged_at', v_now);
  end loop;

  -- 6. Sign-ups just opened: one email to everyone who gets announcements. A
  --    session that opened more than a day ago (or was turned off) is skipped.
  for v_sid in
    update public.sessions
       set announced_at = v_now
     where status = 'scheduled'
       and announce
       and announced_at is null
       and opens_at <= v_now
       and opens_at > v_now - interval '1 day'
       and starts_at > v_now
    returning id
  loop
    v_events := v_events || jsonb_build_object('event', 'session_open', 'session_id', v_sid);
  end loop;

  return v_events;
end $$;
