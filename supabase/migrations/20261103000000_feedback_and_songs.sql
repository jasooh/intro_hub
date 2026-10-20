-- Contact-page feedback (optionally anonymous) and the hosts' hype-song checklist.

-------------------------------------------------------------------------------
-- 1. Feedback
-------------------------------------------------------------------------------

-- Inserted only by the contact form's server action (service role). Anonymous
-- feedback has no profile, name or email.
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  message text not null check (char_length(message) between 1 and 5000),
  name text check (char_length(name) <= 100),
  email text check (char_length(email) <= 200),
  profile_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  handled_at timestamptz
);

create index feedback_created_idx on public.feedback (created_at desc);

alter table public.feedback enable row level security;
create policy feedback_admin_select on public.feedback for select to authenticated
  using (public.is_admin());
create policy feedback_admin_update on public.feedback for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
revoke insert, delete on public.feedback from anon, authenticated;

-------------------------------------------------------------------------------
-- 2. Song checklist
-------------------------------------------------------------------------------

-- A player's hype song counts as added to the playlist while `song` still
-- equals profiles.hype_song, so a changed song shows up as to-add again.
create table public.song_checklist (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  song text not null,
  checked_at timestamptz not null default now(),
  checked_by uuid references public.profiles (id) on delete set null
);

alter table public.song_checklist enable row level security;
create policy song_checklist_admin on public.song_checklist for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
