-- Players can change their display name and avatar at most 3 times in 24 hours,
-- so team sheets and rosters don't keep shifting. A save that changes both counts
-- once. The first profile setup (onboarding) and edits by anyone else (hosts,
-- dev tools, the service role) don't count. Enforced here because players can
-- also update their profile straight through the API. The limit is shown to
-- players as IDENTITY_CHANGES_PER_DAY in src/lib/profile.ts.
alter table public.profiles
  add column identity_changed_at timestamptz[] not null default '{}';

create function public._limit_identity_changes() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_recent timestamptz[];
begin
  if new.display_name is not distinct from old.display_name
     and new.avatar_style is not distinct from old.avatar_style
     and new.avatar_seed is not distinct from old.avatar_seed then
    return new;
  end if;
  if old.onboarded_at is null or (select auth.uid()) is distinct from new.id then
    return new;
  end if;

  select coalesce(array_agg(t order by t), '{}') into v_recent
    from unnest(old.identity_changed_at) t
   where t > now() - interval '24 hours';
  if cardinality(v_recent) >= 3 then
    raise exception 'identity_change_limit'
      using detail = to_char((v_recent[1] + interval '24 hours') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  end if;
  new.identity_changed_at := v_recent || now();
  return new;
end $$;

create trigger profiles_limit_identity_changes
  before update of display_name, avatar_style, avatar_seed on public.profiles
  for each row execute function public._limit_identity_changes();

revoke execute on function public._limit_identity_changes() from public, anon, authenticated;
