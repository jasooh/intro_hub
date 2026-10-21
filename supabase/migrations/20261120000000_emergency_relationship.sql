-- How the emergency contact knows the player (partner, parent, friend…).
-- Asked in the profile form alongside the contact's name and phone.

alter table public.profiles
  add column emergency_relationship text check (char_length(emergency_relationship) <= 50);

grant update (emergency_relationship) on public.profiles to authenticated;
