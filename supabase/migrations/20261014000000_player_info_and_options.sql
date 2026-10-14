-- Player info (asked once), the "Instructional only" sign-up option, per-sign-up
-- notes, and per-session instructional / drop-in times.
--
-- Instructional-only sign-ups pay a lower price and do NOT use one of the
-- session's spots, so they never go on the waitlist. Each registration stores
-- the amount it owes, which payments, refunds and emails use.

-------------------------------------------------------------------------------
-- Columns
-------------------------------------------------------------------------------
alter table public.profiles
  add column first_name text,
  add column last_name text,
  add column phone text,
  add column skill_level text check (skill_level in ('never', 'some', 'experienced', 'prefer_not')),
  add column attended_before boolean,
  add column learning_goals text,
  add column hype_song text,
  add column heard_about text check (heard_about in ('word_of_mouth', 'instagram', 'javelin', 'other')),
  add column heard_about_other text,
  add column media_consent boolean,
  add column media_consent_at timestamptz,
  add column waiver_accepted_at timestamptz,
  add column waiver_version text;

alter table public.session_templates
  add column instructional_price_cents int check (instructional_price_cents >= 0),
  add column instructional_minutes int check (instructional_minutes > 0),
  add column dropin_offset_minutes int check (dropin_offset_minutes >= 0);

alter table public.sessions
  add column instructional_price_cents int check (instructional_price_cents >= 0),
  add column instructional_ends_at timestamptz,
  add column dropin_starts_at timestamptz;

alter table public.registrations
  add column option text not null default 'full' check (option in ('full', 'instructional')),
  add column amount_cents int not null default 0 check (amount_cents >= 0),
  add column note text check (char_length(note) <= 1000);

update public.registrations r
   set amount_cents = s.price_cents
  from public.sessions s
 where s.id = r.session_id;

alter table public.registrations alter column amount_cents drop default;

-- Players may edit their own new profile fields (role stays admin-only).
grant update (
  first_name, last_name, phone, skill_level, attended_before, learning_goals, hype_song,
  heard_about, heard_about_other, media_consent, media_consent_at, waiver_accepted_at, waiver_version
) on public.profiles to authenticated;

-------------------------------------------------------------------------------
-- Helpers
-------------------------------------------------------------------------------
create function public._profile_complete(p_profile_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
     where id = p_profile_id
       and nullif(trim(first_name), '') is not null
       and nullif(trim(last_name), '') is not null
       and nullif(trim(phone), '') is not null
       and skill_level is not null
       and attended_before is not null
       and media_consent is not null
       and waiver_accepted_at is not null
  );
$$;

-- Spots in use: only full (drop-in) sign-ups count; instructional-only never does.
create function public._spots_used(p_session_id uuid) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.registrations
   where session_id = p_session_id
     and option = 'full'
     and status in ('pending_payment', 'confirmed');
$$;

create or replace function public._promote(p_session_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s public.sessions;
  v_active int;
  v_next public.registrations;
  v_events jsonb := '[]';
begin
  select * into s from public.sessions where id = p_session_id for update;
  if not found or s.status <> 'scheduled' or now() >= s.starts_at then
    return v_events;
  end if;

  v_active := public._spots_used(s.id);

  while v_active < s.capacity loop
    select * into v_next
      from public.registrations
     where session_id = s.id and status = 'waitlisted'
     order by queued_at, created_at
     limit 1
     for update;
    exit when not found;

    if v_next.amount_cents = 0 then
      update public.registrations
         set status = 'confirmed', confirmed_at = now(), queued_at = null
       where id = v_next.id;
      v_events := v_events || jsonb_build_object('event', 'confirmed', 'registration_id', v_next.id);
    else
      update public.registrations
         set status = 'pending_payment',
             queued_at = null,
             hold_expires_at = least(now() + make_interval(hours => s.hold_hours), s.starts_at)
       where id = v_next.id;
      v_events := v_events || jsonb_build_object('event', 'promoted', 'registration_id', v_next.id);
    end if;
    v_active := v_active + 1;
  end loop;

  return v_events;
end $$;

-------------------------------------------------------------------------------
-- Sign up (now with an option and a note)
-------------------------------------------------------------------------------
drop function public.register_for_session(uuid);

create function public.register_for_session(
  p_session_id uuid,
  p_option text default 'full',
  p_note text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  s public.sessions;
  v_waiting int;
  v_amount int;
  v_status public.registration_status;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_option not in ('full', 'instructional') then
    raise exception 'invalid_option';
  end if;
  if not public._profile_complete(v_uid) then
    raise exception 'profile_incomplete';
  end if;

  select * into s from public.sessions where id = p_session_id for update;
  if not found or s.status <> 'scheduled' then
    raise exception 'session_unavailable';
  end if;
  if now() < s.opens_at then
    raise exception 'signups_not_open';
  end if;
  if now() >= s.starts_at then
    raise exception 'session_started';
  end if;
  if p_option = 'instructional' and s.instructional_price_cents is null then
    raise exception 'option_unavailable';
  end if;

  if exists (
    select 1 from public.registrations
     where session_id = s.id and profile_id = v_uid
       and status in ('pending_payment', 'confirmed', 'waitlisted')
  ) then
    return '[]'::jsonb; -- already signed up
  end if;

  v_amount := case p_option when 'instructional' then s.instructional_price_cents else s.price_cents end;

  if p_option = 'instructional' then
    -- Doesn't use a spot: never waitlisted.
    v_status := case when v_amount = 0 then 'confirmed' else 'pending_payment' end;
  else
    select count(*) into v_waiting
      from public.registrations
     where session_id = s.id and status = 'waitlisted';
    -- Nobody jumps the queue: if anyone is waiting, newcomers wait too.
    if public._spots_used(s.id) < s.capacity and v_waiting = 0 then
      v_status := case when v_amount = 0 then 'confirmed' else 'pending_payment' end;
    else
      v_status := 'waitlisted';
    end if;
  end if;

  insert into public.registrations (
    session_id, profile_id, status, ref_code, queued_at, hold_expires_at, confirmed_at, option, amount_cents, note
  )
  values (
    s.id,
    v_uid,
    v_status,
    public.gen_ref_code(),
    case when v_status = 'waitlisted' then now() end,
    case when v_status = 'pending_payment'
         then least(now() + make_interval(hours => s.hold_hours), s.starts_at) end,
    case when v_status = 'confirmed' then now() end,
    p_option,
    v_amount,
    nullif(trim(p_note), '')
  )
  returning id into v_id;

  return jsonb_build_array(jsonb_build_object(
    'event',
    case v_status when 'pending_payment' then 'signed_up' else v_status::text end,
    'registration_id',
    v_id
  ));
end $$;

-------------------------------------------------------------------------------
-- Switch option (only before paying)
-------------------------------------------------------------------------------
create function public.change_registration_option(p_registration_id uuid, p_option text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r public.registrations;
  s public.sessions;
  v_waiting int;
  v_events jsonb := '[]';
begin
  if p_option not in ('full', 'instructional') then
    raise exception 'invalid_option';
  end if;
  select * into r from public.registrations where id = p_registration_id;
  if not found then
    raise exception 'registration_not_found';
  end if;
  if r.profile_id is distinct from auth.uid() then
    raise exception 'forbidden';
  end if;

  select * into s from public.sessions where id = r.session_id for update;
  select * into r from public.registrations where id = p_registration_id for update;

  if r.status not in ('pending_payment', 'waitlisted') then
    raise exception 'option_locked';
  end if;
  if r.option = p_option then
    return v_events;
  end if;
  if p_option = 'instructional' and s.instructional_price_cents is null then
    raise exception 'option_unavailable';
  end if;

  if p_option = 'instructional' then
    -- Frees (or no longer waits for) a spot.
    update public.registrations
       set option = 'instructional',
           amount_cents = s.instructional_price_cents,
           status = 'pending_payment',
           queued_at = null,
           hold_expires_at = coalesce(
             hold_expires_at,
             least(now() + make_interval(hours => s.hold_hours), s.starts_at)
           )
     where id = r.id;
    if r.status = 'waitlisted' then
      v_events := v_events || jsonb_build_object('event', 'signed_up', 'registration_id', r.id);
    end if;
    return v_events || public._promote(s.id);
  end if;

  -- instructional -> full: needs a spot.
  select count(*) into v_waiting
    from public.registrations
   where session_id = s.id and status = 'waitlisted';
  if public._spots_used(s.id) < s.capacity and v_waiting = 0 then
    update public.registrations
       set option = 'full',
           amount_cents = s.price_cents,
           status = 'pending_payment',
           hold_expires_at = least(now() + make_interval(hours => s.hold_hours), s.starts_at)
     where id = r.id;
  else
    update public.registrations
       set option = 'full',
           amount_cents = s.price_cents,
           status = 'waitlisted',
           queued_at = now(),
           hold_expires_at = null
     where id = r.id;
    v_events := v_events || jsonb_build_object('event', 'waitlisted', 'registration_id', r.id);
  end if;
  return v_events;
end $$;

-------------------------------------------------------------------------------
-- Money now comes from the registration, not the session
-------------------------------------------------------------------------------
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

  update public.registrations
     set status = 'cancelled',
         cancelled_at = now(),
         queued_at = null,
         hold_expires_at = null,
         refund_owed = (r.status = 'confirmed' and r.amount_cents > 0
                        and (now() < s.cancel_cutoff or public.is_admin()))
   where id = r.id;

  return public._promote(s.id);
end $$;

create or replace function public.admin_cancel_session(p_session_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_events jsonb := '[]';
  r record;
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;
  update public.sessions set status = 'cancelled' where id = p_session_id;
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

create or replace function public.admin_mark_paid(p_registration_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_payment_id uuid;
  v_amount int;
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;
  select amount_cents into v_amount from public.registrations where id = p_registration_id;
  if not found then
    raise exception 'registration_not_found';
  end if;

  insert into public.payments (sender_name, amount_cents, memo)
  values ('Marked paid by admin', v_amount, null)
  returning id into v_payment_id;

  return public._apply_payment(v_payment_id, p_registration_id, 'admin', false);
end $$;

-------------------------------------------------------------------------------
-- Read functions (return types change, so drop + create)
-------------------------------------------------------------------------------
drop function public.get_session_attendees(uuid);
create function public.get_session_attendees(p_session_id uuid)
returns table (
  registration_id uuid,
  display_name text,
  avatar_url text,
  status public.registration_status,
  option text,
  waitlist_position int,
  is_me boolean
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    return;
  end if;
  return query
    select r.id,
           coalesce(p.display_name, p.full_name, 'Player'),
           p.avatar_url,
           r.status,
           r.option,
           case when r.status = 'waitlisted'
                then (row_number() over (partition by r.status order by r.queued_at, r.created_at))::int
           end,
           r.profile_id = auth.uid()
      from public.registrations r
      join public.profiles p on p.id = r.profile_id
     where r.session_id = p_session_id
       and r.status in ('pending_payment', 'confirmed', 'waitlisted')
     order by r.status, coalesce(r.confirmed_at, r.queued_at, r.created_at);
end $$;

-- confirmed / holding count drop-in (spot-using) sign-ups only.
drop function public.get_session_counts(uuid[]);
create function public.get_session_counts(p_session_ids uuid[])
returns table (session_id uuid, confirmed int, holding int, waitlisted int, instructional int)
language sql stable security definer set search_path = '' as $$
  select s.id,
         (count(r.id) filter (where r.option = 'full' and r.status = 'confirmed'))::int,
         (count(r.id) filter (where r.option = 'full' and r.status = 'pending_payment'))::int,
         (count(r.id) filter (where r.status = 'waitlisted'))::int,
         (count(r.id) filter (where r.option = 'instructional' and r.status in ('pending_payment', 'confirmed')))::int
    from public.sessions s
    left join public.registrations r on r.session_id = s.id
   where s.id = any (p_session_ids)
   group by s.id;
$$;

-------------------------------------------------------------------------------
-- Weekly templates carry the instructional price and times
-------------------------------------------------------------------------------
create or replace function public.create_sessions_from_templates() returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_count int;
begin
  insert into public.sessions (
    template_id, title, starts_at, ends_at, location, capacity, price_cents,
    opens_at, hold_hours, cancel_cutoff,
    instructional_price_cents, instructional_ends_at, dropin_starts_at
  )
  select t.id,
         t.title,
         occ.starts_at,
         occ.starts_at + make_interval(mins => t.duration_minutes),
         t.location,
         t.capacity,
         t.price_cents,
         occ.starts_at - make_interval(hours => t.open_hours_before),
         t.hold_hours,
         occ.starts_at - make_interval(hours => t.cancel_cutoff_hours),
         t.instructional_price_cents,
         occ.starts_at + make_interval(mins => t.instructional_minutes),
         occ.starts_at + make_interval(mins => t.dropin_offset_minutes)
    from public.session_templates t
   cross join lateral (
     select (d::date + t.start_time) at time zone t.timezone as starts_at
       from generate_series(
              (now() at time zone t.timezone)::date::timestamp,
              ((now() at time zone t.timezone)::date + (t.open_hours_before / 24 + 8))::timestamp,
              interval '1 day'
            ) d
      where extract(dow from d) = t.weekday
   ) occ
   where t.active
     and occ.starts_at > now()
     and (occ.starts_at <= now() + interval '7 days'
          or occ.starts_at - make_interval(hours => t.open_hours_before) <= now() + interval '1 day')
  on conflict (template_id, starts_at) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end $$;

-------------------------------------------------------------------------------
-- Privileges: new/recreated functions default to PUBLIC execute, so reset them.
-------------------------------------------------------------------------------
revoke execute on function
  public._profile_complete(uuid),
  public._spots_used(uuid),
  public.register_for_session(uuid, text, text),
  public.change_registration_option(uuid, text),
  public.get_session_attendees(uuid),
  public.get_session_counts(uuid[])
  from public, anon, authenticated;

grant execute on function public.get_session_counts(uuid[]) to anon, authenticated;
grant execute on function
  public.register_for_session(uuid, text, text),
  public.change_registration_option(uuid, text),
  public.get_session_attendees(uuid)
  to authenticated;
