-- Housekeeping from an audit. Same permissions as before; cheaper to check.
--
-- 1. Policies call auth.uid() / is_admin() through a sub-select so Postgres
--    evaluates them once per statement instead of once per row.
-- 2. "Hosts can do anything" FOR ALL policies are split into insert/update/
--    delete, so SELECT has exactly one policy per table (no double checks).
-- 3. Indexes for foreign keys that are filtered on or cascaded through.
-- 4. Trigger-only functions aren't callable by API roles.
--
-- is_admin() stays executable by anon: published-post and session policies
-- evaluate it for signed-out visitors (it just returns false for them).

-- profiles ------------------------------------------------------------------
drop policy profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

drop policy profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()))
  with check (id = (select auth.uid()) or (select public.is_admin()));

-- registrations -------------------------------------------------------------
drop policy registrations_select on public.registrations;
create policy registrations_select on public.registrations for select to authenticated
  using (profile_id = (select auth.uid()) or (select public.is_admin()));

drop policy registrations_admin_update on public.registrations;
create policy registrations_admin_update on public.registrations for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- sessions ------------------------------------------------------------------
drop policy sessions_admin_insert on public.sessions;
create policy sessions_admin_insert on public.sessions for insert to authenticated
  with check ((select public.is_admin()));
drop policy sessions_admin_update on public.sessions;
create policy sessions_admin_update on public.sessions for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy sessions_admin_delete on public.sessions;
create policy sessions_admin_delete on public.sessions for delete to authenticated
  using ((select public.is_admin()));

-- session_templates (hosts only, so one FOR ALL policy is the only policy) ---
drop policy templates_admin on public.session_templates;
create policy templates_admin on public.session_templates for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- payments / email_log --------------------------------------------------------
drop policy payments_admin_select on public.payments;
create policy payments_admin_select on public.payments for select to authenticated
  using ((select public.is_admin()));
drop policy payments_admin_update on public.payments;
create policy payments_admin_update on public.payments for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy email_log_admin_select on public.email_log;
create policy email_log_admin_select on public.email_log for select to authenticated
  using ((select public.is_admin()));

-- session_teams: one SELECT policy, separate host writes ----------------------
drop policy session_teams_select on public.session_teams;
drop policy session_teams_admin_write on public.session_teams;
create policy session_teams_select on public.session_teams for select to authenticated
  using (
    (select public.is_admin())
    or exists (
      select 1 from public.sessions s
       where s.id = session_teams.session_id and s.teams_published_at is not null
    )
  );
create policy session_teams_admin_insert on public.session_teams for insert to authenticated
  with check ((select public.is_admin()));
create policy session_teams_admin_update on public.session_teams for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy session_teams_admin_delete on public.session_teams for delete to authenticated
  using ((select public.is_admin()));

-- posts: one SELECT policy, separate host writes -------------------------------
drop policy posts_select on public.posts;
drop policy posts_admin_write on public.posts;
create policy posts_select on public.posts for select to anon, authenticated
  using (published_at is not null or (select public.is_admin()));
create policy posts_admin_insert on public.posts for insert to authenticated
  with check ((select public.is_admin()));
create policy posts_admin_update on public.posts for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy posts_admin_delete on public.posts for delete to authenticated
  using ((select public.is_admin()));

-- Foreign-key indexes ----------------------------------------------------------
-- "My sign-ups" and the registrations RLS check filter on profile_id.
create index registrations_profile_idx on public.registrations (profile_id);
-- Deleting a team sets team_id to null on its players.
create index registrations_team_idx on public.registrations (team_id) where team_id is not null;
-- Looking up / cascading payments and email logs by registration.
create index payments_registration_idx on public.payments (registration_id) where registration_id is not null;
create index email_log_registration_idx on public.email_log (registration_id) where registration_id is not null;
create index posts_author_idx on public.posts (author_id) where author_id is not null;

-- Trigger-only function: nobody calls it directly ------------------------------
revoke execute on function public.clear_team_on_instructional() from public, anon, authenticated;
