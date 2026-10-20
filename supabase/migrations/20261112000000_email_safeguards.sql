-- Safeguards for Gmail sending limits and outages.
--
-- email_sends: every email the app sends, and a queue for the ones that
-- couldn't go out yet (Gmail's daily limit, a rejected app password, a
-- hiccup). The every-minute job retries the queue once Gmail works again;
-- anything still stuck after 3 days is dropped. The body is kept only while
-- an email is queued.
--
-- email_health: one row saying whether sending is paused, why, and until when.
-- The host panel shows it as a banner.
--
-- Both are written by the server (service role) only; hosts can read them.

create table public.email_sends (
  id bigint generated always as identity primary key,
  to_email text not null,
  subject text not null,
  html text,
  body_text text,
  status text not null check (status in ('sent', 'queued', 'sending', 'failed', 'expired')),
  attempts int not null default 0,
  last_error text,
  next_try_at timestamptz,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index email_sends_queue_idx on public.email_sends (next_try_at) where status in ('queued', 'sending');
create index email_sends_sent_idx on public.email_sends (sent_at) where status = 'sent';

create table public.email_health (
  id boolean primary key default true check (id),
  paused_until timestamptz,
  reason text check (reason in ('quota', 'auth', 'transient')),
  detail text,
  updated_at timestamptz not null default now()
);
insert into public.email_health (id) values (true);

alter table public.email_sends enable row level security;
alter table public.email_health enable row level security;
create policy email_sends_admin_select on public.email_sends for select to authenticated using (public.is_admin());
create policy email_health_admin_select on public.email_health for select to authenticated using (public.is_admin());
revoke insert, update, delete, truncate on public.email_sends, public.email_health from anon, authenticated;
