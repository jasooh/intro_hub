-- Weekly schedules pick their hosts, and every session created from one starts
-- with those hosts. A host can still change a session's hosts from its own page.
--
-- host_ids is a plain uuid[] (no foreign key, like registrations.no_show_by: a
-- second kind of link to profiles is not worth the risk). Only accounts that are
-- hosts (role admin) are used when a session is created.
alter table public.session_templates
  add column host_ids uuid[] not null default '{}';

-- Same as 20261124000000_template_start_date.sql, plus the hosts for each new session.
create or replace function public.create_sessions_from_templates() returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_count int;
begin
  with new_sessions as (
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
    on conflict (template_id, starts_at) do nothing
    returning id, template_id
  ),
  new_hosts as (
    insert into public.session_hosts (session_id, profile_id)
    select n.id, pr.id
      from new_sessions n
      join public.session_templates t on t.id = n.template_id
      join public.profiles pr on pr.id = any (t.host_ids) and pr.role = 'admin'
    returning 1
  )
  select count(*) into v_count from new_sessions;

  return v_count;
end $$;
