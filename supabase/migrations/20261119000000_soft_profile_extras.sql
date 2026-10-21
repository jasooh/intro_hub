-- Emergency contact and the 18+ tick no longer block sign-ups: players who
-- joined before they were asked can keep signing up, and the site reminds them
-- to fill them in (hosts see who's missing them on the roster). The profile
-- form still requires both, so everyone adds them the next time they save.

create or replace function public._profile_complete(p_profile_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
     where id = p_profile_id
       and nullif(trim(first_name), '') is not null
       and nullif(trim(last_name), '') is not null
       and nullif(trim(phone), '') is not null
       and skill_level is not null
       and attended_before is not null
       and media_consent is not null
       and waiver_accepted_at is not null
  );
$$;
