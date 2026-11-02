-- Paying for friends: one e-Transfer with the payer's own code covers friends'
-- unpaid sign-ups in the same session. The money is split into one payment row
-- per sign-up (payments.split_from), so paid_cents, refunds and reversals keep
-- working per sign-up.

alter table public.registrations
  add column covered_by uuid references public.registrations (id) on delete set null,
  add column covered_seen boolean not null default false;
create index registrations_covered_by_idx on public.registrations (covered_by) where covered_by is not null;

alter table public.payments add column split_from uuid references public.payments (id) on delete cascade;
create index payments_split_from_idx on public.payments (split_from) where split_from is not null;

-- When the payer leaves (cancelled, hold expired, payment taken back), friends
-- still waiting to pay are no longer covered and pay with their own code.
create function public._release_covered() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.registrations
     set covered_by = null
   where covered_by = new.id and status = 'pending_payment';
  return null;
end $$;
revoke execute on function public._release_covered() from public, anon, authenticated;

create trigger registrations_release_covered
  after update of status on public.registrations
  for each row
  when (old.status in ('pending_payment', 'confirmed') and new.status not in ('pending_payment', 'confirmed'))
  execute function public._release_covered();

-- The payer picks whose sign-ups they're paying for (replaces the whole list).
create function public.set_covered_signups(p_registration_id uuid, p_targets uuid[]) returns void
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
  if r.profile_id is distinct from auth.uid() then
    raise exception 'forbidden';
  end if;

  select * into s from public.sessions where id = r.session_id for update;
  select * into r from public.registrations where id = p_registration_id for update;
  if s.status <> 'scheduled' then
    raise exception 'session_unavailable';
  end if;
  if now() >= s.starts_at then
    raise exception 'session_started';
  end if;
  -- Only someone holding a spot, and not covered by someone else (no chains).
  if r.status not in ('pending_payment', 'confirmed') or r.covered_by is not null then
    raise exception 'cover_unavailable';
  end if;

  v_targets := array(select distinct t from unnest(coalesce(p_targets, '{}'::uuid[])) as t);
  if cardinality(v_targets) > 5 then  -- MAX_TEAMMATES in src/lib/teams.ts
    raise exception 'too_many_friends';
  end if;
  if p_registration_id = any (v_targets) or exists (
    select 1 from unnest(v_targets) as t(id)
     where not exists (
       select 1 from public.registrations x
        where x.id = t.id
          and x.session_id = r.session_id
          and x.status = 'pending_payment'
          and (x.covered_by is null or x.covered_by = p_registration_id)
          and not exists (select 1 from public.registrations y where y.covered_by = x.id)
     )
  ) then
    raise exception 'cover_unavailable';
  end if;

  update public.registrations
     set covered_by = null
   where covered_by = p_registration_id and status = 'pending_payment' and not (id = any (v_targets));
  update public.registrations
     set covered_by = p_registration_id, covered_seen = false
   where id = any (v_targets) and covered_by is null;
end $$;

-- Other unpaid sign-ups in a session, for the payer's picker. Only for someone
-- signed up for that session (players can't read each other's sign-ups).
create function public.payable_signups(p_session_id uuid)
returns table (registration_id uuid, display_name text, avatar_url text, owed_cents int)
language sql stable security definer set search_path = '' as $$
  select x.id, coalesce(p.display_name, p.full_name), p.avatar_url, greatest(x.amount_cents - x.paid_cents, 0)
    from public.registrations x
    join public.profiles p on p.id = x.profile_id
   where x.session_id = p_session_id
     and x.status = 'pending_payment'
     and x.profile_id is distinct from auth.uid()
     and exists (
       select 1 from public.registrations me
        where me.session_id = p_session_id and me.profile_id = auth.uid()
          and me.status in ('pending_payment', 'confirmed')
     )
   order by lower(coalesce(p.display_name, p.full_name));
$$;

-- The friend says they'll pay for themselves.
create function public.decline_cover(p_registration_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.registrations;
begin
  select * into r from public.registrations where id = p_registration_id;
  if not found then
    raise exception 'registration_not_found';
  end if;
  if r.profile_id is distinct from auth.uid() then
    raise exception 'forbidden';
  end if;
  perform 1 from public.sessions where id = r.session_id for update;
  update public.registrations
     set covered_by = null, covered_seen = true
   where id = r.id and status = 'pending_payment';
end $$;

-- The friend saw the "your spot is covered" pop-up.
create function public.acknowledge_cover(p_registration_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.registrations where id = p_registration_id and profile_id = auth.uid()) then
    raise exception 'forbidden';
  end if;
  update public.registrations set covered_seen = true where id = p_registration_id;
end $$;

revoke execute on function public.set_covered_signups(uuid, uuid[]) from public, anon;
grant execute on function public.set_covered_signups(uuid, uuid[]) to authenticated;
revoke execute on function public.payable_signups(uuid) from public, anon;
grant execute on function public.payable_signups(uuid) to authenticated;
revoke execute on function public.decline_cover(uuid) from public, anon;
grant execute on function public.decline_cover(uuid) to authenticated;
revoke execute on function public.acknowledge_cover(uuid) from public, anon;
grant execute on function public.acknowledge_cover(uuid) to authenticated;
