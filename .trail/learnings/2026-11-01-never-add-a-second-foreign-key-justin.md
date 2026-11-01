---
title: Never add a second foreign key from sign-ups to profiles; it silently empties the host pages
author: Justin
date: 2026-11-01
branch: dev
cost: { minutes: 9, tokens: 272472 }
id: l-858032c1
scope: repo
status: active
src: agent
touches:
  - supabase/migrations/20261130000002_drop_no_show_by_fkey.sql
  - src/app/actions.ts
  - src/app/admin/actions.ts
  - "src/app/admin/sessions/[id]/page.tsx"
  - "src/app/admin/sessions/[id]/roster.csv/route.ts"
  - src/app/layout.tsx
  - src/components/no-show-dialog.tsx
  - src/components/no-show-notice.tsx
  - src/components/player-details.tsx
  - src/lib/types.ts
---

## Decided
- Sign-ups (registrations) keep exactly one foreign key to profiles, the player. Columns that point at a host or another person stay plain uuids with no foreign key.
- When something reported as missing "on the site", check prod first: the user means the live site unless they say otherwise.
- In the code: migration `20261130000002_drop_no_show_by_fkey.sql` dropped `registrations_no_show_by_fkey` after `no_show_by` was added in the no-shows migration.

## Tried and ruled out
- Naming the link in every lookup (`profiles!registrations_profile_id_fkey`): slower to ship and prod stayed broken until a deploy, so the foreign key was dropped instead.

## Watch out
- A second foreign key makes every API embed like `profile:profiles(...)` from registrations ambiguous (PostgREST PGRST201). Most pages ignore the error and show an empty list, so it looks like data loss: refunds showed 0 with 26 owed, and the roster, payments, CSV, e-Transfer matching and sign-up emails all broke.
- The PGlite tests query the database directly, not through the API, so they don't catch this. Check `pg_constraint` for foreign keys from registrations to profiles before adding a column that references profiles.
- `git push origin dev:main` ships whatever is on local dev, including the user's own commits made in parallel. Run `git log origin/main..dev` and apply every migration in that list to prod first.
