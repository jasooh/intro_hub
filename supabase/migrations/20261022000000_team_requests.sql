-- Team requests: a drop-in player can ask to be on the same team as up to five
-- other drop-in players signed up for the same session (enough to bring a whole
-- team). One-way is enough; Make teams / Re-balance keeps requested groups together.

create table public.team_requests (
  registration_id uuid not null references public.registrations (id) on delete cascade,
  requested_id uuid not null references public.registrations (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (registration_id, requested_id),
  check (registration_id <> requested_id)
);
create index team_requests_requested_idx on public.team_requests (requested_id);

-- Players see their own requests; hosts see all. Writes only via set_team_requests().
alter table public.team_requests enable row level security;
create policy team_requests_select on public.team_requests for select to authenticated
  using (
    (select public.is_admin())
    or exists (
      select 1 from public.registrations r
       where r.id = team_requests.registration_id and r.profile_id = (select auth.uid())
    )
  );
revoke insert, update, delete on public.team_requests from anon, authenticated;

-- Replace the teammates a registration asked for (empty array clears them).
create function public.set_team_requests(p_registration_id uuid, p_requested uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.registrations;
  s public.sessions;
  v_targets uuid[];
begin
  select * into r from public.registrations where id = p_registration_id;
  if not found then
    raise exception 'registration_not_found';
  end if;
  if r.profile_id is distinct from auth.uid() and not public.is_admin() then
    raise exception 'forbidden';
  end if;

  select * into s from public.sessions where id = r.session_id for update;
  select * into r from public.registrations where id = p_registration_id;
  if s.status <> 'scheduled' then
    raise exception 'session_unavailable';
  end if;
  if now() >= s.starts_at then
    raise exception 'session_started';
  end if;
  if r.status not in ('pending_payment', 'confirmed', 'waitlisted') or r.option <> 'full' then
    raise exception 'teammate_unavailable';
  end if;

  v_targets := array(select distinct t from unnest(coalesce(p_requested, '{}'::uuid[])) as t);
  if cardinality(v_targets) > 5 then  -- MAX_TEAMMATES in src/lib/teams.ts
    raise exception 'too_many_teammates';
  end if;
  if p_registration_id = any (v_targets) or exists (
    select 1 from unnest(v_targets) as t(id)
     where not exists (
       select 1 from public.registrations x
        where x.id = t.id
          and x.session_id = r.session_id
          and x.status in ('pending_payment', 'confirmed', 'waitlisted')
          and x.option = 'full'
     )
  ) then
    raise exception 'teammate_unavailable';
  end if;

  delete from public.team_requests where registration_id = p_registration_id;
  insert into public.team_requests (registration_id, requested_id)
  select p_registration_id, t from unnest(v_targets) as t;
end $$;

revoke execute on function public.set_team_requests(uuid, uuid[]) from public, anon;
grant execute on function public.set_team_requests(uuid, uuid[]) to authenticated;
