---
title: "The instructional cap limits everyone at the lesson, not just instructional-only sign-ups"
author: Justin
date: 2026-11-10
branch: dev
cost: { minutes: 19, tokens: 265577 }
id: l-c29d16bf
scope: repo
status: active
src: agent
touches:
  - supabase/migrations/20261210000000_lesson_cap_counts_full.sql
  - src/lib/options.ts
  - tests/signup-options.test.ts
---

## Decided
- The cap counts Instructional only plus Instructional + Drop-in. Drop-in only stays out. Last week a session capped at 12 had 20+ at the lesson because the cap ignored Instructional + Drop-in.
- When the lesson is full, a new Instructional + Drop-in sign-up waits even if drop-in spots are free. A waiter blocked only by the lesson doesn't hold up drop-in-only waiters behind them. A freed lesson place goes to the longest waiter of either option.
- The form field is now called "Lesson spots". The column is still `instructional_capacity`.

## Tried and ruled out
- Keeping two separate waitlists (instructional vs drop-in). It can't express a sign-up that needs both a drop-in spot and a lesson place.

## Watch out
- Existing sessions already over their cap keep everyone, so no backfill. A cap set low for "instructional only" now limits the whole lesson, so check upcoming sessions and weekly schedules before applying to prod.
- The migration was written but not applied to dev: the Supabase connector was denied permission on dev, and the CLI push failed over IPv6.
- Waitlist positions shown to players still split into instructional-only vs everything else.

In the code: `supabase/migrations/20261210000000_lesson_cap_counts_full.sql` (`_fits`, `_has_room`, `_promote`, `_bump_overflow`, `change_registration_option`, `get_session_counts.lesson`), `lessonFull` and `optionFull` in `src/lib/options.ts`, tests in `tests/signup-options.test.ts`.
