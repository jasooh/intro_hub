-- set_team_requests() predates the Drop-in only option (20261101000000) and still
-- requires option = 'full' for the caller and every teammate. A Drop-in only player
-- plays in the games and gets a team same as Full, and the picker/make-teams already
-- treat them that way (usesSpot in src/lib/options.ts, makeTeams's option in
-- ('full','dropin')) -- only this check was left behind, so a Drop-in only player got
-- "isn't signed up for drop-in anymore" picking, or being picked as, a teammate.
-- Instructional only is still the one option that's excluded.

create or replace function public.set_team_requests(p_registration_id uuid, p_requested uuid[]) returns void
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
  if r.status not in ('pending_payment', 'confirmed', 'waitlisted') or r.option = 'instructional' then
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
          and x.option <> 'instructional'
     )
  ) then
    raise exception 'teammate_unavailable';
  end if;

  delete from public.team_requests where registration_id = p_registration_id;
  insert into public.team_requests (registration_id, requested_id)
  select p_registration_id, t from unnest(v_targets) as t;
end $$;
