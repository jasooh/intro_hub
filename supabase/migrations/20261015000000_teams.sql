-- Teams for the drop-in portion of a session. Hosts build them (auto-balanced
-- by the app, then adjusted) and publish them; players only see teams once
-- the session's teams_published_at is set.

create table public.session_teams (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index session_teams_session_idx on public.session_teams (session_id, position);

alter table public.registrations
  add column team_id uuid references public.session_teams (id) on delete set null;

alter table public.sessions
  add column teams_published_at timestamptz;

-- Hosts manage teams; signed-in players can read them once published.
alter table public.session_teams enable row level security;
create policy session_teams_select on public.session_teams for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.sessions s
       where s.id = session_teams.session_id and s.teams_published_at is not null
    )
  );
create policy session_teams_admin_write on public.session_teams for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
revoke all on public.session_teams from anon;

-- Hosts assign players to teams (the registrations update policy is admin-only).
grant update (team_id) on public.registrations to authenticated;

-- Attendees now carry their team, but only once teams are published.
drop function public.get_session_attendees(uuid);
create function public.get_session_attendees(p_session_id uuid)
returns table (
  registration_id uuid,
  display_name text,
  avatar_url text,
  status public.registration_status,
  option text,
  team_id uuid,
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
           case when s.teams_published_at is not null then r.team_id end,
           case when r.status = 'waitlisted'
                then (row_number() over (partition by r.status order by r.queued_at, r.created_at))::int
           end,
           r.profile_id = auth.uid()
      from public.registrations r
      join public.profiles p on p.id = r.profile_id
      join public.sessions s on s.id = r.session_id
     where r.session_id = p_session_id
       and r.status in ('pending_payment', 'confirmed', 'waitlisted')
     order by r.status, coalesce(r.confirmed_at, r.queued_at, r.created_at);
end $$;

revoke execute on function public.get_session_attendees(uuid) from public, anon, authenticated;
grant execute on function public.get_session_attendees(uuid) to authenticated;

-- Switching to instructional-only (which leaves before drop-in) drops the team.
create or replace function public.clear_team_on_instructional() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.option = 'instructional' or new.status not in ('pending_payment', 'confirmed') then
    new.team_id := null;
  end if;
  return new;
end $$;

create trigger registrations_clear_team
  before update of option, status on public.registrations
  for each row execute function public.clear_team_on_instructional();
