---
title: "Limit profile changes in the database, since players can bypass the app"
author: Justin
date: 2026-10-31
standing: true
id: l-659d644d
scope: repo
status: active
src: init-sessions
touches:
  - src/app/actions.ts
---

## Decided
- Players can update their own profile directly through the Supabase API, so an app-only cooldown on name and avatar changes would be skipped. The limit is 3 changes per 24 hours and exempts onboarding and host or system edits.
- In the code: Cooldown lives in migration `20261126000000_identity_change_limit.sql` (trigger on profiles). Don't move it into server actions in `src/app/actions.ts`. Tests in `tests/avatar*.test.ts` cover it.

_From past Claude sessions here, Oct 25._
