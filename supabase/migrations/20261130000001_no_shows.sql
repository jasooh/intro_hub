-- No-shows: hosts mark a player who held a spot but didn't come.
--
-- Each marked sign-up is recorded on the registration (no_show_at / no_show_by),
-- which is the source of truth: one mark per sign-up, so marking twice does
-- nothing and undo is exact. profiles.no_show_count is the running total hosts
-- see. profiles.no_show_seen is how many of those the player has already been
-- shown the "please cancel early" pop-up for.
--
-- Players can't write either profile column: profiles only has column-level
-- update grants and these are not among them. All changes go through the
-- functions below.

alter table public.registrations
  add column no_show_at timestamptz,
  add column no_show_by uuid references public.profiles (id) on delete set null;

alter table public.profiles
  add column no_show_count int not null default 0 check (no_show_count >= 0),
  add column no_show_seen int not null default 0 check (no_show_seen >= 0);

-- Host: mark (or undo) a no-show. Only once the session has started, and only
-- for someone who held a spot.
create function public.admin_mark_no_show(p_registration_id uuid, p_no_show boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r public.registrations;
  v_starts timestamptz;
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;
  select * into r from public.registrations where id = p_registration_id;
  if not found then
    raise exception 'registration_not_found';
  end if;
  perform 1 from public.sessions where id = r.session_id for update;
  select * into r from public.registrations where id = p_registration_id for update;
  select starts_at into v_starts from public.sessions where id = r.session_id;

  if p_no_show then
    if v_starts > now() then
      raise exception 'not_started';
    end if;
    if r.status not in ('confirmed', 'pending_payment') then
      raise exception 'not_on_roster';
    end if;
    if r.no_show_at is null then
      update public.registrations set no_show_at = now(), no_show_by = auth.uid() where id = r.id;
      update public.profiles set no_show_count = no_show_count + 1 where id = r.profile_id;
    end if;
  elsif r.no_show_at is not null then
    update public.registrations set no_show_at = null, no_show_by = null where id = r.id;
    -- Undoing a mark the player was already told about also lowers "seen", so a
    -- later no-show still triggers a fresh pop-up.
    update public.profiles
       set no_show_count = greatest(no_show_count - 1, 0),
           no_show_seen = least(no_show_seen, greatest(no_show_count - 1, 0))
     where id = r.profile_id;
  end if;
  return '[]'::jsonb;
end $$;

revoke execute on function public.admin_mark_no_show(uuid, boolean) from public, anon;
grant execute on function public.admin_mark_no_show(uuid, boolean) to authenticated;

-- Player: "Got it" on the pop-up. Only ever touches their own row.
create function public.acknowledge_no_shows() returns void
language sql security definer set search_path = '' as $$
  update public.profiles set no_show_seen = no_show_count where id = auth.uid();
$$;

revoke execute on function public.acknowledge_no_shows() from public, anon;
grant execute on function public.acknowledge_no_shows() to authenticated;
