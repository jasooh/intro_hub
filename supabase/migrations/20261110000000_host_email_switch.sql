-- Host emails get the same shape as the players' email settings: a main switch
-- (host_emails), with the summary and alerts chosen underneath it. Turning it
-- off stops all host emails but keeps the picks for when it's turned back on.
--
-- Also fixes saving those settings: players (hosts included) can only update
-- the profile columns granted to them, and the host email columns never were,
-- so the "Host emails" form failed with "permission denied".

alter table public.profiles add column host_emails boolean not null default true;

grant update (host_emails, host_digest, host_session_day, host_alert_late_cancel, host_alert_unmatched)
  on public.profiles to authenticated;
