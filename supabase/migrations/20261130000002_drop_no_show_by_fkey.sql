-- registrations.no_show_by gave registrations a second foreign key to profiles,
-- so every API embed like registrations -> profile:profiles(...) became
-- ambiguous (PGRST201) and returned nothing: refunds, the roster, payments and
-- e-Transfer matching all came up empty. Keep the column, drop the link; it only
-- records which host marked the no-show.
alter table public.registrations drop constraint if exists registrations_no_show_by_fkey;
