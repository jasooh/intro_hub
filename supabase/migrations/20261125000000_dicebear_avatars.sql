-- DiceBear avatars instead of Google photos. Players pick a style and a random
-- seed; avatar_url is always built from them (served by /api/avatar/<style>/<seed>),
-- so everything that already shows avatar_url keeps working. The style list must
-- match AVATAR_STYLES in src/lib/avatars.ts.
alter table public.profiles
  add column avatar_style text not null default 'thumbs'
    check (avatar_style in ('thumbs', 'fun-emoji', 'bottts-neutral', 'adventurer-neutral')),
  -- Random, not the player's name, so nothing personal ends up in image URLs.
  add column avatar_seed text not null default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)
    check (avatar_seed ~ '^[a-z0-9]{1,32}$');

create function public._set_avatar_url() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.avatar_url := '/api/avatar/' || new.avatar_style || '/' || new.avatar_seed;
  return new;
end $$;

-- Also replaces the Google picture handle_new_user() copies in on sign-up.
create trigger profiles_set_avatar_url
  before insert or update of avatar_style, avatar_seed on public.profiles
  for each row execute function public._set_avatar_url();

update public.profiles
   set avatar_url = '/api/avatar/' || avatar_style || '/' || avatar_seed
 where avatar_url is distinct from '/api/avatar/' || avatar_style || '/' || avatar_seed;

-- Players change their own style and seed; avatar_url itself stays read-only.
grant update (avatar_style, avatar_seed) on public.profiles to authenticated;

revoke execute on function public._set_avatar_url() from public, anon, authenticated;
