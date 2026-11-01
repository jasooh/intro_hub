-- Session hosts: who is hosting a session ("Hosted by ..." on the session page).
--
-- A session can have one or more hosts, picked by a host on the session form.
-- Only hosts (role admin) can be picked. The table is readable by hosts only;
-- players and visitors get just a name and avatar through get_session_hosts().
-- Hosting a session that ran counts toward the host's "Played" number (that
-- count is worked out in src/lib/queries.ts getPlayerHistory).

create table public.session_hosts (
  session_id uuid not null references public.sessions (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  primary key (session_id, profile_id)
);
create index session_hosts_profile_idx on public.session_hosts (profile_id);

alter table public.session_hosts enable row level security;

create policy session_hosts_select on public.session_hosts for select to authenticated
  using ((select public.is_admin()));

revoke all on public.session_hosts from anon;
revoke insert, update, delete on public.session_hosts from authenticated;

-- Replace a session's hosts. Anyone who isn't a host (role admin) is ignored.
create function public.admin_set_session_hosts(p_session_id uuid, p_profile_ids uuid[])
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;
  if not exists (select 1 from public.sessions where id = p_session_id) then
    raise exception 'session_unavailable';
  end if;

  delete from public.session_hosts
   where session_id = p_session_id
     and profile_id <> all (coalesce(p_profile_ids, '{}'));

  insert into public.session_hosts (session_id, profile_id)
  select p_session_id, pr.id
    from public.profiles pr
   where pr.id = any (coalesce(p_profile_ids, '{}')) and pr.role = 'admin'
  on conflict do nothing;
end $$;

revoke execute on function public.admin_set_session_hosts(uuid, uuid[]) from public, anon;
grant execute on function public.admin_set_session_hosts(uuid, uuid[]) to authenticated;

-- Who hosts a session, for the public session page: just a display name and
-- avatar (profiles are private).
create function public.get_session_hosts(p_session_id uuid)
returns table (name text, avatar_url text)
language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(trim(pr.display_name), ''), pr.first_name, 'A host'), pr.avatar_url
    from public.session_hosts h
    join public.profiles pr on pr.id = h.profile_id
   where h.session_id = p_session_id
   order by h.profile_id;
$$;

revoke execute on function public.get_session_hosts(uuid) from public;
grant execute on function public.get_session_hosts(uuid) to anon, authenticated;
