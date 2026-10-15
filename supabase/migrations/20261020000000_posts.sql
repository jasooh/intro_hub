-- Updates board: short posts from the hosts. Published posts are public
-- (/updates); one can be featured on the home page; a post can be emailed to
-- every player who hasn't opted out (profiles.announcement_emails).

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  -- Sanitized on save (src/lib/rich-text.ts) and again before rendering.
  body_html text not null default '' check (char_length(body_html) <= 50000),
  published_at timestamptz,            -- null = draft
  featured boolean not null default false,
  emailed_at timestamptz,              -- set once, when the email send is claimed
  author_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index posts_published_idx on public.posts (published_at desc) where published_at is not null;

-- At most one featured post at a time.
create unique index posts_one_featured on public.posts ((true)) where featured;

alter table public.posts enable row level security;
create policy posts_select on public.posts for select to anon, authenticated
  using (published_at is not null or public.is_admin());
create policy posts_admin_write on public.posts for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
revoke insert, update, delete on public.posts from anon;

-- Players can opt out of host announcement emails (sign-up/payment emails are unaffected).
alter table public.profiles add column announcement_emails boolean not null default true;
grant update (announcement_emails) on public.profiles to authenticated;
