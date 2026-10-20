-- Dev and prod differed only by a comment inside this function (prod had it, dev didn't).
-- Re-create it identically everywhere so `npm run db:status -- --drift` reports no differences.
create or replace function public._maintenance_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Hosts can keep testing; cron / service calls (no auth.uid()) are never blocked.
  if (select auth.uid()) is not null
     and not public.is_admin()
     and coalesce((select (value ->> 'on')::boolean from public.app_settings where key = 'maintenance'), false)
  then
    raise exception 'maintenance';
  end if;
  return new;
end $$;
