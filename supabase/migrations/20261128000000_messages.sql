-- Messages: a two-way inbox between players and the hosts.
--
-- One thread per conversation. A thread belongs to one player; every host sees
-- and can reply to every thread (shared host inbox). A host message to a whole
-- session just creates one private thread per player.
--
-- Reads go straight to the tables (RLS); every write goes through the
-- functions below, which check who is calling and rate-limit players.

create table public.message_threads (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  subject text not null check (char_length(subject) between 1 and 120),
  session_id uuid references public.sessions (id) on delete set null,
  started_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  last_from_host boolean not null,
  player_read_at timestamptz,
  host_read_at timestamptz
);
create index message_threads_profile_idx on public.message_threads (profile_id, last_message_at desc);
create index message_threads_recent_idx on public.message_threads (last_message_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.message_threads (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  -- Kept apart from author_id so a host's replies still read as "Host" after
  -- that host's account is gone.
  from_host boolean not null,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index messages_thread_idx on public.messages (thread_id, created_at);

alter table public.message_threads enable row level security;
alter table public.messages enable row level security;

create policy message_threads_select on public.message_threads for select to authenticated
  using ((select public.is_admin()) or profile_id = (select auth.uid()));

create policy messages_select on public.messages for select to authenticated
  using (
    (select public.is_admin())
    or exists (
      select 1 from public.message_threads t
      where t.id = messages.thread_id and t.profile_id = (select auth.uid())
    )
  );

revoke all on public.message_threads from anon;
revoke all on public.messages from anon;
revoke insert, update, delete on public.message_threads from authenticated;
revoke insert, update, delete on public.messages from authenticated;

-- Email preferences: players can turn message emails off; hosts get an alert
-- when a player writes (both sit under the existing main switches).
alter table public.profiles
  add column email_messages boolean not null default true,
  add column host_alert_messages boolean not null default true;

grant update (email_messages, host_alert_messages) on public.profiles to authenticated;

-- Live updates for an open thread.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages;
    alter publication supabase_realtime add table public.message_threads;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

create function public._clean_message(p_subject text, p_body text, out o_subject text, out o_body text)
language plpgsql immutable set search_path = '' as $$
begin
  o_subject := btrim(coalesce(p_subject, ''));
  o_body := btrim(coalesce(p_body, ''));
  if o_subject = '' or o_body = '' then raise exception 'empty_message'; end if;
  if char_length(o_subject) > 120 or char_length(o_body) > 4000 then raise exception 'message_too_long'; end if;
end $$;
revoke execute on function public._clean_message(text, text) from public, anon, authenticated;

-- Hosts: start a private thread with each of the given players.
-- Skips guests, players who haven't finished signing up, and the caller.
create function public.host_start_threads(
  p_profile_ids uuid[], p_subject text, p_body text, p_session_id uuid default null
) returns table (t_id uuid, p_id uuid, m_id uuid)
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  v_subject text;
  v_body text;
  v_pid uuid;
  v_tid uuid;
  v_mid uuid;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  select c.o_subject, c.o_body into v_subject, v_body from public._clean_message(p_subject, p_body) c;
  if coalesce(array_length(p_profile_ids, 1), 0) = 0 then raise exception 'no_recipients'; end if;

  for v_pid in
    select p.id from public.profiles p
    where p.id = any (p_profile_ids)
      and p.id <> v_me
      and not p.guest
      and p.onboarded_at is not null
  loop
    insert into public.message_threads (profile_id, subject, session_id, started_by, last_from_host, host_read_at)
    values (v_pid, v_subject, p_session_id, v_me, true, now())
    returning id into v_tid;
    insert into public.messages (thread_id, author_id, from_host, body)
    values (v_tid, v_me, true, v_body)
    returning id into v_mid;
    t_id := v_tid; p_id := v_pid; m_id := v_mid;
    return next;
  end loop;
end $$;

-- Players: start a thread with the hosts.
create function public.player_start_thread(p_subject text, p_body text)
returns table (t_id uuid, m_id uuid)
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  v_subject text;
  v_body text;
  v_tid uuid;
  v_mid uuid;
begin
  if v_me is null then raise exception 'forbidden'; end if;
  if not public._profile_complete(v_me) then raise exception 'profile_incomplete'; end if;
  select c.o_subject, c.o_body into v_subject, v_body from public._clean_message(p_subject, p_body) c;
  if not public.rate_limit_hit('msg-thread:' || v_me::text, 5, 86400) then raise exception 'rate_limited'; end if;

  insert into public.message_threads (profile_id, subject, started_by, last_from_host, player_read_at)
  values (v_me, v_subject, v_me, false, now())
  returning id into v_tid;
  insert into public.messages (thread_id, author_id, from_host, body)
  values (v_tid, v_me, false, v_body)
  returning id into v_mid;
  t_id := v_tid; m_id := v_mid;
  return next;
end $$;

-- Reply in a thread. The thread's player, or any host.
create function public.post_message(p_thread_id uuid, p_body text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  v_thread public.message_threads;
  v_body text := btrim(coalesce(p_body, ''));
  v_host boolean;
  v_mid uuid;
begin
  if v_me is null then raise exception 'forbidden'; end if;
  select * into v_thread from public.message_threads where id = p_thread_id for update;
  if not found then raise exception 'not_found'; end if;

  if v_thread.profile_id = v_me then
    v_host := false;
  elsif public.is_admin() then
    v_host := true;
  else
    raise exception 'forbidden';
  end if;

  if v_body = '' then raise exception 'empty_message'; end if;
  if char_length(v_body) > 4000 then raise exception 'message_too_long'; end if;
  if not v_host and not public.rate_limit_hit('msg-reply:' || v_me::text, 30, 3600) then
    raise exception 'rate_limited';
  end if;

  insert into public.messages (thread_id, author_id, from_host, body)
  values (p_thread_id, v_me, v_host, v_body)
  returning id into v_mid;

  update public.message_threads
  set last_message_at = now(),
      last_from_host = v_host,
      player_read_at = case when v_host then player_read_at else now() end,
      host_read_at = case when v_host then now() else host_read_at end
  where id = p_thread_id;

  return v_mid;
end $$;

-- Mark a thread read for whoever is looking at it.
create function public.mark_thread_read(p_thread_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  v_owner uuid;
begin
  if v_me is null then raise exception 'forbidden'; end if;
  select profile_id into v_owner from public.message_threads where id = p_thread_id;
  if not found then raise exception 'not_found'; end if;
  if v_owner = v_me then
    update public.message_threads set player_read_at = now() where id = p_thread_id;
  elsif public.is_admin() then
    update public.message_threads set host_read_at = now() where id = p_thread_id;
  else
    raise exception 'forbidden';
  end if;
end $$;

-- Unread threads for the caller: a player's threads whose latest message is
-- from a host, or (for hosts) every thread whose latest message is from a
-- player. Hosts share one read state per thread.
create function public.unread_message_count() returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select count(*)::int from public.message_threads t
    where case
      when public.is_admin() then
        not t.last_from_host and (t.host_read_at is null or t.host_read_at < t.last_message_at)
      else
        t.profile_id = auth.uid() and t.last_from_host
        and (t.player_read_at is null or t.player_read_at < t.last_message_at)
    end
  ), 0)
$$;

revoke execute on function public.host_start_threads(uuid[], text, text, uuid) from public, anon;
revoke execute on function public.player_start_thread(text, text) from public, anon;
revoke execute on function public.post_message(uuid, text) from public, anon;
revoke execute on function public.mark_thread_read(uuid) from public, anon;
revoke execute on function public.unread_message_count() from public, anon;
grant execute on function public.host_start_threads(uuid[], text, text, uuid) to authenticated;
grant execute on function public.player_start_thread(text, text) to authenticated;
grant execute on function public.post_message(uuid, text) to authenticated;
grant execute on function public.mark_thread_read(uuid) to authenticated;
grant execute on function public.unread_message_count() to authenticated;
