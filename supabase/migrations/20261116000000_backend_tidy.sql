-- Backend tidy-up:
--  * index the foreign keys Supabase's performance advisor flagged
--  * prune pg_cron / pg_net history daily (the per-minute tick job adds ~1,440 rows a day)

create index if not exists feedback_profile_idx on public.feedback (profile_id);
create index if not exists host_activity_session_idx on public.host_activity (session_id);
create index if not exists host_activity_registration_idx on public.host_activity (registration_id);
create index if not exists host_activity_payment_idx on public.host_activity (payment_id);
create index if not exists host_activity_cancellation_idx on public.host_activity (cancellation_id);
create index if not exists payment_cancellations_payment_idx on public.payment_cancellations (payment_id);
create index if not exists player_ratings_updated_by_idx on public.player_ratings (updated_by);
create index if not exists session_messages_sent_by_idx on public.session_messages (sent_by);
create index if not exists song_checklist_checked_by_idx on public.song_checklist (checked_by);

-- Daily at 03:15 UTC: keep a week of job history. Skipped where pg_cron isn't installed (e.g. the test database).
do $$
declare
  v_cmd text := 'delete from cron.job_run_details where end_time < now() - interval ''7 days''';
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return;
  end if;
  if exists (select 1 from pg_namespace where nspname = 'net') then
    v_cmd := v_cmd || '; delete from net._http_response where created < now() - interval ''7 days''';
  end if;
  perform cron.schedule('intro-hub-prune-cron', '15 3 * * *', v_cmd);
end $$;
