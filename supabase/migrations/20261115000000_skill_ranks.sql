-- One skill scale for everyone: players now pick 1–5 on their profile, the same
-- scale hosts rate on (1 Beginner, 2 Learning, 3 Comfortable, 4 Strong, 5 Advanced).
-- Old answers: never → 1, some → 2, experienced → 3, prefer not to say → 2.

alter table public.profiles drop constraint if exists profiles_skill_level_check;

alter table public.profiles
  alter column skill_level type smallint using (
    case skill_level when 'never' then 1 when 'some' then 2 when 'experienced' then 3 when 'prefer_not' then 2 end
  );

alter table public.profiles
  add constraint profiles_skill_level_check check (skill_level between 1 and 5);

-- admin_stats groups players by skill and mixed the column with text; cast it.
-- (Patched in place so the long function isn't copied here.)
do $$
declare
  v_def text := pg_get_functiondef('public.admin_stats(timestamptz, timestamptz, text)'::regprocedure);
  v_new text := replace(v_def, 'coalesce(skill, ''unknown'')', 'coalesce(skill::text, ''unknown'')');
begin
  if v_new = v_def then
    raise exception 'admin_stats: skill grouping not found';
  end if;
  execute v_new;
end $$;
