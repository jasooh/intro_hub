-- App-level rate limits (src/lib/rate-limit.ts): a fixed-window counter per
-- key (e.g. "feedback:ip:1.2.3.4"). Only the server (service role) can use it.
-- run_tick clears windows older than a day.

create table public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (key, window_start)
);
create index rate_limits_window_idx on public.rate_limits (window_start);

alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

-- Counts one hit for p_key in the current window; true while it is within p_limit.
create function public.rate_limit_hit(p_key text, p_limit int, p_window_seconds int) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_start timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits int;
begin
  insert into public.rate_limits as r (key, window_start, hits) values (p_key, v_start, 1)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning hits into v_hits;
  return v_hits <= p_limit;
end $$;

revoke execute on function public.rate_limit_hit(text, int, int) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, int, int) to service_role;

-- run_tick: clear old windows. (Patched in place.)
do $$
declare
  v_def text := pg_get_functiondef('public.run_tick()'::regprocedure);
  v_find text := 'return v_events;';
begin
  if (length(v_def) - length(replace(v_def, v_find, ''))) / length(v_find) <> 1 then
    raise exception 'run_tick: return not found exactly once';
  end if;
  execute replace(v_def, v_find, 'delete from public.rate_limits where window_start < v_now - interval ''1 day'';

  ' || v_find);
end $$;
