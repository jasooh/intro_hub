---
title: No-show counts are visible to hosts only; players just get a one-time polite pop-up
author: Justin
date: 2026-11-01
branch: dev
cost: { minutes: 9, tokens: 57121 }
id: l-794eff17
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
- Hosts mark a player as a no-show on the session host page, only once the session has started, and can undo it. Each mark adds 1 to a count on the player's profile that only hosts see. The player gets a one-time pop-up asking them to cancel early next time, so the spot can go to someone on the waitlist.
- No automatic consequence for no-shows (no warning threshold, no auto-block). Hosts can already block a player by hand.

## Tried and ruled out
- Showing the count to the player on their own profile: dropped, hosts-only was the user's pick. Players only see the pop-up, never a number.
- Letting hosts mark no-shows at any time: dropped, so nobody is marked by accident before the session.
- Warning hosts at a threshold such as 3 no-shows: dropped, just count it.

## Watch out
- In the code: the mark is stored on each sign-up (`registrations.no_show_at`), which is the source of truth, and `profiles.no_show_count` is the running total. Players can't write either column. Changes go through `admin_mark_no_show` and `acknowledge_no_shows` in `supabase/migrations/20261130000001_no_shows.sql`, same reason as the identity-change limit.
- The pop-up shows while `no_show_count` is above `no_show_seen`; undoing a mark lowers `no_show_seen` too, so a later no-show pops up again.
