-- Weekly sessions get a start date: no session is created for a day before it.
-- Existing schedules start on the day they were made, so nothing changes for them.
alter table public.session_templates
  add column starts_on date;

update public.session_templates
   set starts_on = (created_at at time zone timezone)::date
 where starts_on is null;

alter table public.session_templates
  alter column starts_on set default ((now() at time zone 'America/Toronto')::date),
  alter column starts_on set not null;

-- Same as 20261101000000_signup_options.sql, skipping days before starts_on.
create or replace function public.create_sessions_from_templates() returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_count int;
begin
  insert into public.sessions (
    template_id, title, starts_at, ends_at, location, capacity, price_cents,
    opens_at, hold_hours, cancel_cutoff,
    instructional_price_cents, instructional_ends_at, dropin_starts_at,
    dropin_price_cents, instructional_capacity
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
         occ.starts_at - make_interval(hours => t.cancel_cutoff_hours),
         t.instructional_price_cents,
         occ.starts_at + make_interval(mins => t.instructional_minutes),
         occ.starts_at + make_interval(mins => t.dropin_offset_minutes),
         t.dropin_price_cents,
         t.instructional_capacity
    from public.session_templates t
   cross join lateral (
     select (d::date + t.start_time) at time zone t.timezone as starts_at
       from generate_series(
              (now() at time zone t.timezone)::date::timestamp,
              ((now() at time zone t.timezone)::date + (t.open_hours_before / 24 + 8))::timestamp,
              interval '1 day'
            ) d
      where extract(dow from d) = t.weekday
        and d::date >= t.starts_on
   ) occ
   where t.active
     and occ.starts_at > now()
     and (occ.starts_at <= now() + interval '7 days'
          or occ.starts_at - make_interval(hours => t.open_hours_before) <= now() + interval '1 day')
  on conflict (template_id, starts_at) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end $$;
