-- Host skill ratings: hosts can rate a player 1–5 after watching them play,
-- in place of the level the player picked on their profile. Team balancing
-- uses the host's rating when there is one. Players never see it (hosts only,
-- and it lives outside profiles so a player's own row can't reveal it).

create table public.player_ratings (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.player_ratings enable row level security;
create policy player_ratings_admin_select on public.player_ratings for select to authenticated
  using ((select public.is_admin()));
create policy player_ratings_admin_insert on public.player_ratings for insert to authenticated
  with check ((select public.is_admin()));
create policy player_ratings_admin_update on public.player_ratings for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy player_ratings_admin_delete on public.player_ratings for delete to authenticated
  using ((select public.is_admin()));
revoke all on public.player_ratings from anon;

-- Backups include the ratings.
create or replace function public.devtools_backup() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_out jsonb := '{}';
  v_table text;
  v_rows jsonb;
begin
  perform public._devtools_guard();
  foreach v_table in array array[
    'profiles', 'player_ratings', 'session_templates', 'sessions', 'registrations', 'payments',
    'session_teams', 'session_matches', 'team_requests', 'posts', 'email_log', 'app_settings', 'devtools_audit'
  ] loop
    execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]'') from public.%I t', v_table) into v_rows;
    v_out := v_out || jsonb_build_object(v_table, v_rows);
  end loop;
  perform public._devtools_log('backup', null, null, null, null, null);
  return v_out;
end $$;
