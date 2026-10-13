-- Run once in the Supabase SQL editor AFTER the app is deployed.
-- Calls the app's /api/cron/tick endpoint every minute, which:
--   * creates next week's session from your weekly schedule
--   * expires unpaid holds and promotes the waitlist
--   * sends day-before reminders
--
-- Replace the two placeholder values first.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Store the URL and secret in Vault rather than in the job definition.
select vault.create_secret('https://YOUR-APP.vercel.app', 'intro_hub_app_url');
select vault.create_secret('YOUR_CRON_SECRET', 'intro_hub_cron_secret');

select cron.schedule(
  'intro-hub-tick',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'intro_hub_app_url') || '/api/cron/tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'intro_hub_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

-- Handy checks:
--   select * from cron.job;
--   select * from cron.job_run_details order by start_time desc limit 10;
--   select * from net._http_response order by created desc limit 10;
-- To stop:  select cron.unschedule('intro-hub-tick');
