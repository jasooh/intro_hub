---
title: "Players can't cancel once a session is over; they get a thank-you with feedback links"
author: Justin
date: 2026-11-01
branch: dev
cost: { minutes: 5, tokens: 52010 }
id: l-7d6ceb4c
scope: repo
status: active
src: agent
touches:
  - src/app/actions.ts
  - "src/app/admin/sessions/[id]/page.tsx"
  - src/app/me/signups/page.tsx
  - "src/app/s/[id]/page.tsx"
  - src/components/signup-row.tsx
  - src/lib/queries.ts
  - supabase/migrations/20261130000000_no_cancel_after_session.sql
  - tests/cancel-after-session.test.ts
  - src/app/admin/actions.ts
  - src/app/admin/sessions/new/page.tsx
---

## Decided
- Once a session's end time has passed, a player can't cancel or leave the waitlist. Hosts still can, from the roster.
- Instead of the cancel buttons, a confirmed player sees "Thank you for coming" with links to the feedback page (anonymous option) and to message the host. Unpaid or waitlisted players see "This session is over" with the same links.
- The host scoreboard has a single "Instructional" tile counting everyone at the lesson (Instructional + Drop-in plus Instructional only). It deliberately doesn't show the instructional-only limit, since that limit only caps instructional-only sign-ups.
- In the code: `cancel_registration` raises `session_over` (migration `20261130000000_no_cancel_after_session.sql`); `getMySpot` returns `ended`; `SignupRow` takes `ended`; the player-facing feedback page is `/contact`.

## Tried and ruled out
- "At the lesson" as a second tile next to "Instr. only": dropped, the user wanted one count of everyone attending the instructional.

## Watch out
- The user edits files in parallel, so `git add <file>` can sweep their unfinished hunks into your commit. Stage only your own hunks (`git apply --cached` on a filtered diff) and check `git show --stat` before pushing.
