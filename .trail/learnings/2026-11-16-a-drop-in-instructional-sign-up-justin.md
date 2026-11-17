---
title: A Drop-in + Instructional sign-up keeps its drop-in spot and queues separately for the lesson place
author: Justin
date: 2026-11-16
branch: dev
cost: { minutes: 1, tokens: 3204 }
id: l-892ca4b5
scope: repo
status: active
src: agent
touches:
  - supabase/migrations/20261210000000_lesson_cap_counts_full.sql
  - supabase/migrations/20261101000000_signup_options.sql
  - supabase/migrations/20261118000000_audit_fixes.sql
  - src/lib/options.ts
  - tests/signup-options.test.ts
---

## Decided
- When the lesson is full but drop-in has room, a Full (Instructional + Drop-in) sign-up now gets the drop-in spot immediately and queues separately for the lesson place, instead of waiting as one unit.
- Full price is charged up front, same as a Full sign-up that gets both resources immediately; no extra charge when the lesson place later opens up.
- If the lesson place never opens before the session happens, the instructional portion of what they paid is refunded — they keep only what they actually used (drop-in).
- Lowering a session's lesson cap can only claw back a lesson place from an unpaid (pending_payment) Full sign-up, never a paid/confirmed one — matches the existing "paid players are never bumped" rule, not a new kind of behavior.
- Scoped the player-facing lesson-wait indicator to a boolean flag rather than a live queue position, since only the host roster's ordering needs the merged instructional+full queue position — keeps the feature smaller.

## Tried and ruled out
- A second linked registration row (drop-in spot as one row, a waitlisted instructional row merged back in on promotion): rejected because it breaks "one row per person per session," which roster/CSV counts, the duplicate-signup guard, and block checks all assume.
- Not tracking the lesson wait at all (give them the drop-in spot, let them manually switch to Full later): rejected because it drops them out of the lesson queue entirely, contradicting the Nov 10 fairness decision that a freed lesson place goes to the longest waiter of either option.

## Watch out
- `_instructional_used`, `_fits`'s inline duplicate of that count, and `get_session_counts.lesson` all have to treat a row with `lesson_queued_at` set as NOT holding a lesson place. Miss one and `_promote`/`_bump_overflow`'s exit checks jam at capacity forever, and the UI overstates lesson fullness — the same bug class already fixed for the drop-in banner, just on the lesson side.
- `change_registration_option`'s current body lives in `supabase/migrations/20261210000000_lesson_cap_counts_full.sql`, not the older `20261101000000_signup_options.sql` — that migration already dropped the old same-queue fast path in favor of calling `_fits` uniformly. Building against the stale version would reintroduce a bypassed room-check regression.
- `lesson_queued_at` must carry a player's original `queued_at`/`created_at` through any later promotion or option switch, not reset to `now()`, or their place in the lesson queue resets unfairly.

In the code: `docs/superpowers/specs/2026-11-16-lesson-waitlist-split-design.md` (full design); `supabase/migrations/20261210000000_lesson_cap_counts_full.sql` (`_fits`, `_has_room`, `_promote`, `_bump_overflow`, `get_session_counts`, `change_registration_option`); `supabase/migrations/20261101000000_signup_options.sql` (`register_for_session`, `get_session_attendees`); `supabase/migrations/20261118000000_audit_fixes.sql` (patches `register_for_session`); `src/app/s/[id]/page.tsx` (`MySpot`, `optionDetail.full`); `src/lib/options.ts` (`optionFull`/`lessonFull`); `tests/signup-options.test.ts`.
