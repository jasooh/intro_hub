-- Players choose which optional emails they get. profiles.announcement_emails
-- stays the main switch ("email me about the club"); under it:
--   email_updates       posts from the hosts (Updates board)
--   email_session_open  "sign-ups are open" for new sessions
--   email_reminders     day-before reminder for sessions they're signed up for
-- Emails about their own sign-ups and payments always go out.

alter table public.profiles
  add column email_updates boolean not null default true,
  add column email_session_open boolean not null default true,
  add column email_reminders boolean not null default true;

-- Players save these from their profile form (column-level grant, like announcement_emails).
grant update (email_updates, email_session_open, email_reminders) on public.profiles to authenticated;
