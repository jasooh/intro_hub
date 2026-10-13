-- Intro Hub: initial schema
--
-- All registration status transitions happen inside the SECURITY DEFINER
-- functions below. They lock the session row first (then registrations), so
-- concurrent sign-ups / cancels / cron ticks are serialized per session and a
-- session can never be overbooked.
--
-- Functions return a jsonb array of events, e.g.
--   [{"event": "promoted", "registration_id": "..."}]
-- which the Next.js app turns into emails (src/lib/registrations.ts).

-------------------------------------------------------------------------------
-- Types
-------------------------------------------------------------------------------
create type public.user_role as enum ('player', 'admin');
create type public.registration_status as enum (
  'pending_payment', -- holding a spot, waiting for e-Transfer
  'confirmed',       -- paid (or free session)
  'waitlisted',      -- session full, in the queue
  'expired',         -- hold ran out before payment arrived
  'cancelled'        -- player cancelled or admin removed
);

-------------------------------------------------------------------------------
-- Tables
-------------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  display_name text,
  avatar_url text,
  role public.user_role not null default 'player',
  -- Names Interac may show as the sender of this person's e-Transfers.
  etransfer_names text[] not null default '{}',
  onboarded_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.session_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Intro 2 Volleyball',
  weekday smallint not null check (weekday between 0 and 6), -- 0 = Sunday
  start_time time not null,
  duration_minutes int not null default 120 check (duration_minutes > 0),
  location text not null,
  capacity int not null check (capacity > 0),
  price_cents int not null check (price_cents >= 0),
  open_hours_before int not null default 120 check (open_hours_before >= 0),
  hold_hours int not null default 12 check (hold_hours > 0),
  cancel_cutoff_hours int not null default 24 check (cancel_cutoff_hours >= 0),
  timezone text not null default 'America/Toronto',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references public.session_templates (id) on delete set null,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text not null,
  capacity int not null check (capacity > 0),
  price_cents int not null check (price_cents >= 0),
  opens_at timestamptz not null,
  hold_hours int not null default 12 check (hold_hours > 0),
  cancel_cutoff timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
  notes text,
  reminder_sent_at timestamptz,
  -- Bumped whenever the roster changes; clients subscribe to this via Realtime.
  roster_version int not null default 0,
  created_at timestamptz not null default now(),
  unique (template_id, starts_at)
);
create index sessions_starts_at_idx on public.sessions (starts_at);

create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  status public.registration_status not null,
  ref_code text not null unique,
  queued_at timestamptz,        -- waitlist order, set while waitlisted
  hold_expires_at timestamptz,  -- set while pending_payment
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  refund_owed boolean not null default false,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- One live registration per player per session (history rows are kept).
create unique index registrations_one_active_idx
  on public.registrations (session_id, profile_id)
  where status in ('pending_payment', 'confirmed', 'waitlisted');
create index registrations_session_status_idx on public.registrations (session_id, status);
create index registrations_hold_idx on public.registrations (hold_expires_at) where status = 'pending_payment';

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  gmail_message_id text unique,  -- null for manual "mark paid"
  sender_name text,
  amount_cents int not null,
  memo text,
  received_at timestamptz not null default now(),
  registration_id uuid references public.registrations (id) on delete set null,
  matched_by text check (matched_by in ('ref', 'name_amount', 'admin')),
  matched_at timestamptz,
  note text,                     -- why auto-matching failed
  dismissed boolean not null default false,
  raw jsonb,
  created_at timestamptz not null default now()
);

create table public.email_log (
  id bigint generated always as identity primary key,
  dedupe_key text not null unique,
  registration_id uuid references public.registrations (id) on delete cascade,
  kind text not null,
  sent_at timestamptz not null default now()
);

-------------------------------------------------------------------------------
-- Triggers
-------------------------------------------------------------------------------
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    split_part(new.email, '@', 1)
  );
begin
  insert into public.profiles (id, email, full_name, display_name, avatar_url, etransfer_names)
  values (
    new.id,
    new.email,
    v_name,
    v_name,
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture'),
    array[v_name]
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.touch_registration() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger registrations_touch
  before update on public.registrations
  for each row execute function public.touch_registration();

create function public.bump_roster_version() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.sessions
     set roster_version = roster_version + 1
   where id = coalesce(new.session_id, old.session_id);
  return null;
end $$;

create trigger registrations_bump_roster
  after insert or update or delete on public.registrations
  for each row execute function public.bump_roster_version();

-------------------------------------------------------------------------------
-- Helpers
-------------------------------------------------------------------------------
create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- "VB-" + 4 chars, skipping look-alikes (0/O, 1/I/L).
create function public.gen_ref_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    code := 'VB-';
    for i in 1..4 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.registrations where ref_code = code);
  end loop;
  return code;
end $$;

-- Fill free spots from the waitlist. Caller must not hold registration locks
-- for this session without first holding the session lock.
create function public._promote(p_session_id uuid) returns jsonb
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

  select count(*) into v_active
    from public.registrations
   where session_id = s.id and status in ('pending_payment', 'confirmed');

  while v_active < s.capacity loop
    select * into v_next
      from public.registrations
     where session_id = s.id and status = 'waitlisted'
     order by queued_at, created_at
     limit 1
     for update;
    exit when not found;

    if s.price_cents = 0 then
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

-- Link a payment to a registration and confirm it.
create function public._apply_payment(
  p_payment_id uuid,
  p_registration_id uuid,
  p_matched_by text,
  p_require_pending boolean
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r public.registrations;
begin
  select * into r from public.registrations where id = p_registration_id;
  if not found then
    raise exception 'registration_not_found';
  end if;

  perform 1 from public.sessions where id = r.session_id for update;
  select * into r from public.registrations where id = p_registration_id for update;

  if p_require_pending and r.status <> 'pending_payment' then
    return null; -- caller leaves the payment unmatched
  end if;

  update public.payments
     set registration_id = r.id, matched_by = p_matched_by, matched_at = now(), note = null
   where id = p_payment_id;

  if r.status = 'confirmed' then
    return '[]'::jsonb; -- already paid; payment is just recorded
  end if;

  update public.registrations
     set status = 'confirmed',
         confirmed_at = now(),
         hold_expires_at = null,
         queued_at = null,
         cancelled_at = null
   where id = r.id;

  return jsonb_build_array(jsonb_build_object('event', 'confirmed', 'registration_id', r.id));
end $$;

-------------------------------------------------------------------------------
-- Player-facing functions (called with the user's JWT)
-------------------------------------------------------------------------------
create function public.register_for_session(p_session_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  s public.sessions;
  v_active int;
  v_waiting int;
  v_status public.registration_status;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
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

  if exists (
    select 1 from public.registrations
     where session_id = s.id and profile_id = v_uid
       and status in ('pending_payment', 'confirmed', 'waitlisted')
  ) then
    return '[]'::jsonb; -- already signed up
  end if;

  select count(*) filter (where status in ('pending_payment', 'confirmed')),
         count(*) filter (where status = 'waitlisted')
    into v_active, v_waiting
    from public.registrations
   where session_id = s.id;

  -- Nobody jumps the queue: if anyone is waiting, newcomers wait too.
  if v_active < s.capacity and v_waiting = 0 then
    v_status := case when s.price_cents = 0 then 'confirmed' else 'pending_payment' end;
  else
    v_status := 'waitlisted';
  end if;

  insert into public.registrations (session_id, profile_id, status, ref_code, queued_at, hold_expires_at, confirmed_at)
  values (
    s.id,
    v_uid,
    v_status,
    public.gen_ref_code(),
    case when v_status = 'waitlisted' then now() end,
    case when v_status = 'pending_payment'
         then least(now() + make_interval(hours => s.hold_hours), s.starts_at) end,
    case when v_status = 'confirmed' then now() end
  )
  returning id into v_id;

  return jsonb_build_array(jsonb_build_object(
    'event',
    case v_status when 'pending_payment' then 'signed_up' else v_status::text end,
    'registration_id',
    v_id
  ));
end $$;

-- Player cancels their own spot, or an admin removes a player.
create function public.cancel_registration(p_registration_id uuid) returns jsonb
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
         refund_owed = (r.status = 'confirmed' and s.price_cents > 0
                        and (now() < s.cancel_cutoff or public.is_admin()))
   where id = r.id;

  return public._promote(s.id);
end $$;

-- Who's coming. Logged-in users only; never exposes emails or ref codes.
create function public.get_session_attendees(p_session_id uuid)
returns table (
  registration_id uuid,
  display_name text,
  avatar_url text,
  status public.registration_status,
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

-- Public counts for the session cards (works for logged-out visitors).
create function public.get_session_counts(p_session_ids uuid[])
returns table (session_id uuid, confirmed int, holding int, waitlisted int)
language sql stable security definer set search_path = '' as $$
  select s.id,
         (count(r.id) filter (where r.status = 'confirmed'))::int,
         (count(r.id) filter (where r.status = 'pending_payment'))::int,
         (count(r.id) filter (where r.status = 'waitlisted'))::int
    from public.sessions s
    left join public.registrations r on r.session_id = s.id
   where s.id = any (p_session_ids)
   group by s.id;
$$;

-------------------------------------------------------------------------------
-- Admin functions (called with the admin's JWT; each checks is_admin())
-------------------------------------------------------------------------------
create function public.admin_mark_paid(p_registration_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_payment_id uuid;
  v_price int;
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;
  select s.price_cents into v_price
    from public.registrations r join public.sessions s on s.id = r.session_id
   where r.id = p_registration_id;
  if not found then
    raise exception 'registration_not_found';
  end if;

  insert into public.payments (sender_name, amount_cents, memo)
  values ('Marked paid by admin', v_price, null)
  returning id into v_payment_id;

  return public._apply_payment(v_payment_id, p_registration_id, 'admin', false);
end $$;

create function public.admin_assign_payment(p_payment_id uuid, p_registration_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;
  return public._apply_payment(p_payment_id, p_registration_id, 'admin', false);
end $$;

-- Swap a waitlisted player with the one ahead of (-1) or behind (+1) them.
create function public.admin_move_waitlist(p_registration_id uuid, p_direction int) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.registrations;
  other public.registrations;
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;
  select * into r from public.registrations where id = p_registration_id;
  perform 1 from public.sessions where id = r.session_id for update;
  select * into r from public.registrations
   where id = p_registration_id and status = 'waitlisted' for update;
  if not found then
    return;
  end if;

  if p_direction < 0 then
    select * into other from public.registrations
     where session_id = r.session_id and status = 'waitlisted'
       and (queued_at, created_at) < (r.queued_at, r.created_at)
     order by queued_at desc, created_at desc limit 1 for update;
  else
    select * into other from public.registrations
     where session_id = r.session_id and status = 'waitlisted'
       and (queued_at, created_at) > (r.queued_at, r.created_at)
     order by queued_at, created_at limit 1 for update;
  end if;
  if not found then
    return;
  end if;

  update public.registrations set queued_at = other.queued_at, created_at = other.created_at where id = r.id;
  update public.registrations set queued_at = r.queued_at, created_at = r.created_at where id = other.id;
end $$;

-- Re-run promotion after an admin edits capacity.
create function public.admin_promote(p_session_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;
  return public._promote(p_session_id);
end $$;

create function public.admin_cancel_session(p_session_id uuid) returns jsonb
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
           refund_owed = (status = 'confirmed'
                          and (select price_cents from public.sessions where id = p_session_id) > 0)
     where session_id = p_session_id
       and status in ('pending_payment', 'confirmed', 'waitlisted')
    returning id
  loop
    v_events := v_events || jsonb_build_object('event', 'session_cancelled', 'registration_id', r.id);
  end loop;
  return v_events;
end $$;

create function public.admin_set_role(p_profile_id uuid, p_role public.user_role) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;
  if p_profile_id = auth.uid() and p_role <> 'admin' then
    raise exception 'cannot_demote_self';
  end if;
  update public.profiles set role = p_role where id = p_profile_id;
end $$;

-------------------------------------------------------------------------------
-- Server-only functions (service role: cron + payment ingest)
-------------------------------------------------------------------------------
create function public.ingest_apply_payment(
  p_payment_id uuid,
  p_registration_id uuid,
  p_matched_by text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  return public._apply_payment(p_payment_id, p_registration_id, p_matched_by, true);
end $$;

-- Create upcoming sessions from active weekly templates. A session is created
-- once it is within 7 days, or its sign-ups open within the next day.
create function public.create_sessions_from_templates() returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_count int;
begin
  insert into public.sessions (
    template_id, title, starts_at, ends_at, location, capacity, price_cents,
    opens_at, hold_hours, cancel_cutoff
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
         occ.starts_at - make_interval(hours => t.cancel_cutoff_hours)
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

-- Runs every minute via pg_cron -> /api/cron/tick.
create function public.run_tick() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_events jsonb := '[]';
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
         set status = 'expired', hold_expires_at = null
       where session_id = v_sid and status = 'pending_payment' and hold_expires_at <= now()
      returning id
    loop
      v_events := v_events || jsonb_build_object('event', 'expired', 'registration_id', r.id);
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

  return v_events;
end $$;

-------------------------------------------------------------------------------
-- Function privileges
-------------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.get_session_counts(uuid[]) to anon, authenticated;
grant execute on function
  public.register_for_session(uuid),
  public.cancel_registration(uuid),
  public.get_session_attendees(uuid),
  public.admin_mark_paid(uuid),
  public.admin_assign_payment(uuid, uuid),
  public.admin_move_waitlist(uuid, int),
  public.admin_promote(uuid),
  public.admin_cancel_session(uuid),
  public.admin_set_role(uuid, public.user_role)
  to authenticated;
grant execute on function
  public.ingest_apply_payment(uuid, uuid, text),
  public.run_tick(),
  public.create_sessions_from_templates()
  to service_role;

-------------------------------------------------------------------------------
-- Row level security
-------------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.session_templates enable row level security;
alter table public.sessions enable row level security;
alter table public.registrations enable row level security;
alter table public.payments enable row level security;
alter table public.email_log enable row level security;

-- profiles: you see/edit yourself; admins see/edit everyone. Role changes go
-- through admin_set_role(), so the role column isn't directly updatable.
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (display_name, etransfer_names, onboarded_at) on public.profiles to authenticated;

-- session_templates: admins only.
create policy templates_admin on public.session_templates for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- sessions: anyone can read; admins write.
create policy sessions_select on public.sessions for select to anon, authenticated using (true);
create policy sessions_admin_insert on public.sessions for insert to authenticated
  with check (public.is_admin());
create policy sessions_admin_update on public.sessions for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy sessions_admin_delete on public.sessions for delete to authenticated
  using (public.is_admin());

-- registrations: your own rows; admins see all and may toggle refunds.
-- Status changes only happen through the functions above.
create policy registrations_select on public.registrations for select to authenticated
  using (profile_id = auth.uid() or public.is_admin());
create policy registrations_admin_update on public.registrations for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
revoke insert, update, delete on public.registrations from anon, authenticated;
grant update (refund_owed, refunded_at) on public.registrations to authenticated;

-- payments / email_log: admins only.
create policy payments_admin_select on public.payments for select to authenticated
  using (public.is_admin());
create policy payments_admin_update on public.payments for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
revoke insert, delete on public.payments from anon, authenticated;
create policy email_log_admin_select on public.email_log for select to authenticated
  using (public.is_admin());

-------------------------------------------------------------------------------
-- Realtime: clients watch sessions.roster_version to refresh the roster.
-------------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.sessions;
  end if;
end $$;
