# Supabase

Two projects: **dev** (`goomasgmwhafvkbmheex`: localhost and Vercel previews) and **prod** (`tbxicooonmntknjrrnzh`: the live site). Their schemas are meant to be identical; they differ only in cron setup (`setup/cron-dev.sql` runs `run_tick()` in the database, `setup/cron.sql` calls the app's `/api/cron/tick`).

## Adding a migration

1. Add `migrations/<next number>_<name>.sql`. The number is the file's version everywhere (repo, dev, prod), so keep them in order. Never edit a migration that has been applied; write a new one.
2. To change a function, `create or replace` the **whole** function in the new file (copy the current version from the file listed below).
3. `npx vitest run`: the tests replay every migration in memory (PGlite).
4. Apply to **dev**: `supabase db push --db-url "$DEV_DB_URL"`. Try it.
5. `npm run db:status -- --drift`: shows what is still pending on dev and prod and whether the two have drifted.
6. Right before merging to `main`, apply to **prod**: `supabase db push --db-url "$PROD_DB_URL"`. Don't use the Supabase MCP `apply_migration` for this: it stamps its own version number, which is how the histories got out of step.
7. `npm run db:functions` to refresh the table below, and commit it with the migration.

`DEV_DB_URL` / `PROD_DB_URL` are the projects' connection strings (Project Settings > Database), kept in `.env.local`.

## Where each function lives now

Open the file listed for the current version; older copies in earlier migrations are history.

| Function | Latest version in | Times defined |
|---|---|---|
| `_apply_payment` | `20261026000000_partial_payments.sql` | 2 |
| `_bump_overflow` | `20261104000000_capacity_overflow.sql` | 1 |
| `_bump_schedule_revision` | `20261118000000_audit_fixes.sql` | 1 |
| `_claim_regular` | `20261101000000_signup_options.sql` | 1 |
| `_compute_session_stats` | `20261113000000_stats.sql` | 1 |
| `_devtools_guard` | `20261023000000_dev_tools.sql` | 1 |
| `_devtools_log` | `20261023000000_dev_tools.sql` | 1 |
| `_devtools_table` | `20261023000000_dev_tools.sql` | 1 |
| `_fill_stats` | `20261113000000_stats.sql` | 1 |
| `_fit_capacity` | `20261101000000_signup_options.sql` | 1 |
| `_has_room` | `20261101000000_signup_options.sql` | 1 |
| `_instructional_used` | `20261101000000_signup_options.sql` | 1 |
| `_is_first_timer` | `20261028000000_bring_a_friend_and_deposits.sql` | 1 |
| `_lock_attended_before` | `20261029000000_attended_before_locked.sql` | 1 |
| `_log_registration_activity` | `20261106000000_host_notifications.sql` | 1 |
| `_log_unmatched_payment` | `20261106000000_host_notifications.sql` | 1 |
| `_maintenance_guard` | `20261117000000_maintenance_guard_comment.sql` | 2 |
| `_option_offered` | `20261101000000_signup_options.sql` | 1 |
| `_owe_late_deposit` | `20261111000000_deposit_late_payments.sql` | 1 |
| `_profile_complete` | `20261119000000_soft_profile_extras.sql` | 3 |
| `_promote` | `20261101000000_signup_options.sql` | 4 |
| `_refunded_cents` | `20261113000000_stats.sql` | 1 |
| `_release_regular` | `20261101000000_signup_options.sql` | 2 |
| `_reprice` | `20261028000000_bring_a_friend_and_deposits.sql` | 1 |
| `_reset_hold_nudge` | `20261031000000_host_tools.sql` | 1 |
| `_reverse_payment` | `20261107000000_payment_cancellations.sql` | 1 |
| `_signup_price` | `20261101000000_signup_options.sql` | 2 |
| `_spots_used` | `20261101000000_signup_options.sql` | 2 |
| `_sync_holds_to_session` | `20261019000000_holds_follow_session.sql` | 1 |
| `_sync_paid_cents` | `20261107000000_payment_cancellations.sql` | 2 |
| `_use_rejoin_credit` | `20261030000000_rejoin_credit_any_amount.sql` | 3 |
| `admin_add_player` | `20261101000000_signup_options.sql` | 1 |
| `admin_assign_payment` | `20261027000000_assign_to_active_signup.sql` | 2 |
| `admin_cancel_session` | `20261026000000_partial_payments.sql` | 4 |
| `admin_dismiss_cancellation` | `20261107000000_payment_cancellations.sql` | 1 |
| `admin_mark_paid` | `20261101000000_signup_options.sql` | 4 |
| `admin_merge_guest` | `20261118000000_audit_fixes.sql` | 1 |
| `admin_move_waitlist` | `20261101000000_signup_options.sql` | 2 |
| `admin_nudge_player` | `20261105000000_owed_reminders.sql` | 1 |
| `admin_nudge_unpaid` | `20261031000000_host_tools.sql` | 1 |
| `admin_promote` | `20261104000000_capacity_overflow.sql` | 2 |
| `admin_remove_friend_discount` | `20261028000000_bring_a_friend_and_deposits.sql` | 1 |
| `admin_reprice_session` | `20261028000000_bring_a_friend_and_deposits.sql` | 1 |
| `admin_reverse_payment` | `20261107000000_payment_cancellations.sql` | 1 |
| `admin_set_role` | `20261012000000_init.sql` | 1 |
| `admin_stats` | `20261113000000_stats.sql` | 4 |
| `bump_roster_version` | `20261012000000_init.sql` | 1 |
| `cancel_registration` | `20261028000000_bring_a_friend_and_deposits.sql` | 4 |
| `change_registration_option` | `20261101000000_signup_options.sql` | 4 |
| `clear_team_on_instructional` | `20261015000000_teams.sql` | 1 |
| `create_sessions_from_templates` | `20261101000000_signup_options.sql` | 3 |
| `devtools_backup` | `20261118000000_audit_fixes.sql` | 4 |
| `devtools_clear` | `20261023000000_dev_tools.sql` | 1 |
| `devtools_delete_row` | `20261023000000_dev_tools.sql` | 1 |
| `devtools_force_status` | `20261023000000_dev_tools.sql` | 1 |
| `devtools_get_row` | `20261023000000_dev_tools.sql` | 1 |
| `devtools_health` | `20261025000000_match_schedule.sql` | 2 |
| `devtools_release_email` | `20261023000000_dev_tools.sql` | 1 |
| `devtools_reset` | `20261121000000_reset_all_tables.sql` | 7 |
| `devtools_rows` | `20261023000000_dev_tools.sql` | 1 |
| `devtools_set_maintenance` | `20261023000000_dev_tools.sql` | 1 |
| `devtools_table_columns` | `20261023000000_dev_tools.sql` | 1 |
| `devtools_update_row` | `20261023000000_dev_tools.sql` | 1 |
| `gen_ref_code` | `20261012000000_init.sql` | 1 |
| `get_session_attendees` | `20261101000000_signup_options.sql` | 4 |
| `get_session_counts` | `20261101000000_signup_options.sql` | 3 |
| `handle_new_user` | `20261012000000_init.sql` | 1 |
| `ingest_apply_payment` | `20261012000000_init.sql` | 1 |
| `ingest_reverse_payment` | `20261108000000_cancellation_ref_code.sql` | 2 |
| `is_admin` | `20261012000000_init.sql` | 1 |
| `is_devtools_user` | `20261023000000_dev_tools.sql` | 1 |
| `register_for_session` | `20261101000000_signup_options.sql` | 6 |
| `run_tick` | `20261113000000_stats.sql` | 7 |
| `set_brought_by` | `20261101000000_signup_options.sql` | 2 |
| `set_team_requests` | `20261022000000_team_requests.sql` | 1 |
| `touch_registration` | `20261012000000_init.sql` | 1 |
