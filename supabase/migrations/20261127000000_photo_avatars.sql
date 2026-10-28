-- Players can upload their own picture as a fifth avatar style, "photo".
-- The server resizes it and stores it in the private "avatars" bucket at
-- <profile id>/<seed>.webp; /api/avatar/photo/<profile id>/<seed> serves it.
-- The URL carries the owner's id, so a player can only ever show their own
-- uploads (copying someone else's seed points at a file that doesn't exist).
-- The identity-change limit already covers it (it watches style and seed).
-- The style list must match src/lib/avatars.ts.

alter table public.profiles drop constraint profiles_avatar_style_check;
alter table public.profiles add constraint profiles_avatar_style_check
  check (avatar_style in ('thumbs', 'fun-emoji', 'bottts-neutral', 'adventurer-neutral', 'photo'));

create or replace function public._set_avatar_url() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.avatar_url := case
    when new.avatar_style = 'photo' then '/api/avatar/photo/' || new.id || '/' || new.avatar_seed
    else '/api/avatar/' || new.avatar_style || '/' || new.avatar_seed
  end;
  return new;
end $$;

-- Private bucket: only the server (service role) reads and writes it.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('avatars', 'avatars', false, 2097152, array['image/webp'])
    on conflict (id) do nothing;
  end if;
end $$;

-- Who posted each update, for the public Updates pages: just the poster's
-- display name and avatar, and only for published posts (profiles are private).
create function public.get_post_authors(p_post_ids uuid[])
returns table (post_id uuid, name text, avatar_url text)
language sql stable security definer set search_path = '' as $$
  select p.id, coalesce(nullif(trim(pr.display_name), ''), pr.first_name, 'A host'), pr.avatar_url
    from public.posts p
    join public.profiles pr on pr.id = p.author_id
   where p.id = any(p_post_ids)
     and p.published_at is not null;
$$;

revoke execute on function public.get_post_authors(uuid[]) from public;
grant execute on function public.get_post_authors(uuid[]) to anon, authenticated;
