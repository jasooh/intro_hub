-- Run once in the DEV project's SQL editor (intro-hub-dev). Production uses cron.sql.
--
-- Dev can't reach localhost or the login-protected Vercel previews over HTTP,
-- so instead of calling /api/cron/tick it runs the same timed work directly in
-- the database: expire unpaid holds, promote the waitlist, mark reminders,
-- create sessions from weekly templates. The emails for those events are not
-- produced on dev (dev doesn't send real email anyway).

create extension if not exists pg_cron;

select cron.schedule('intro-hub-tick-dev', '* * * * *', $$ select public.run_tick(); $$);

-- Handy checks:
--   select * from cron.job;
--   select * from cron.job_run_details order by start_time desc limit 10;
-- To stop:  select cron.unschedule('intro-hub-tick-dev');
