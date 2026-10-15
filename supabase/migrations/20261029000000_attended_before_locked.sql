-- "Have you attended this class before?" is asked once. It decides who counts as
-- a first-timer for Bring a Friend (_is_first_timer), so a player can't flip it
-- back later. Once answered, a player's update keeps the stored answer; hosts
-- and dev tools can still correct it.
create function public._lock_attended_before() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Only signed-in players are held to it (service / dashboard writes have no auth.uid()).
  if old.attended_before is not null
     and new.attended_before is distinct from old.attended_before
     and (select auth.uid()) is not null
     and not public.is_admin()
     and not public.is_devtools_user()
  then
    new.attended_before := old.attended_before;
  end if;
  return new;
end $$;
revoke execute on function public._lock_attended_before() from public, anon, authenticated;

create trigger profiles_lock_attended_before
  before update of attended_before on public.profiles
  for each row execute function public._lock_attended_before();
