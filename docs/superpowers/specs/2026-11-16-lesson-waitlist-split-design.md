# A Drop-in + Instructional sign-up takes an open drop-in spot even when the lesson is full

Date: 2026-11-16 · Status: draft design, awaiting approval

## Why

A registration today is one row with one `status` (`pending_payment` / `confirmed` / `waitlisted` / `expired` / `cancelled`) covering whichever resources its `option` needs. The Nov 10 migration (`20261210000000_lesson_cap_counts_full.sql`) made the lesson cap (`instructional_capacity`) also gate the `full` option (Instructional + Drop-in), so `_fits()` now requires *both* a drop-in spot and a lesson place before a `full` sign-up is confirmed. That's correct when drop-in is also full, but it also means: when drop-in still has room and only the lesson is full, a new `full` sign-up is pushed onto the waitlist **as a whole**, holding no spot at all — even though a drop-in spot was sitting open for them.

This surfaced as a live bug report: a session capped at 18 drop-in / some lower lesson cap had 13/18 drop-in taken, and a player who wanted Instructional + Drop-in landed fully waitlisted instead of playing drop-in while waiting for a lesson place. (A related display bug — the session page telling *everyone* "Drop-in is full" whenever anyone was in that waitlisted bucket — was already fixed separately in `src/app/s/[id]/page.tsx`; not part of this design.)

## Goal

A `full` sign-up's two resources — the drop-in spot and the lesson place — get checked and granted **independently**:
- If drop-in has room, the player gets the drop-in spot right away (confirmed or pending-payment, same as today), regardless of the lesson.
- If the lesson doesn't have room, that same registration also sits in a lesson queue, waiting for a place to open up — *while already playing drop-in games*.
- When a lesson place frees, the longest-waiting lesson-queue entry gets it — whether that's a plain Instructional-only waitlister or one of these drop-in-already-confirmed players. (This keeps the Nov 10 decision: "a freed lesson place goes to the longest waiter of either option.")
- If drop-in itself is full, nothing changes: the whole `full` sign-up still waits as one unit, same as today — there's no drop-in spot to split off.

Decided with the user:
- **Full price charged up front**, same as a `full` sign-up that gets both resources immediately. Nothing extra is charged when the lesson place opens up later; `amount_cents` doesn't change at promotion.
- **One row per registration, no new table and no second linked row.** `registrations` stays "one row = one person's relationship to a session," so pricing, refunds, cancellation, CSV export, and the duplicate-signup guard keep working unchanged.
- **If the lesson place never opens up before the session happens**, the instructional portion of what they paid gets refunded — they only keep what they actually used (drop-in). At session end, a row still carrying `lesson_queued_at` gets flagged `refund_owed` for the instructional share, the same way a deposit session flags its deposit back today.
- **Lowering `instructional_capacity` can only claw back a lesson place from an unpaid (`pending_payment`) `full` row**, never a paid/confirmed one — this matches today's existing rule ("paid players are never bumped") exactly; it is not a new kind of behavior. A paid `full` row keeps its lesson place even if the host lowers the cap afterward.
- **Players see a plain "waiting" flag for the lesson place, not a live queue position.** `get_session_attendees`'s position fix only needs to serve the host roster's ordering; no new player-facing number.

## Approaches considered

1. **Add a lesson-specific queue column to `registrations` (picked).** Keep `status`/`queued_at` meaning "does this row have its drop-in spot" exactly as today (unchanged for `dropin`-only and for a fully-waitlisted `full` row). Add `lesson_queued_at timestamptz`, set only while a row needs a lesson place and doesn't have one yet; cleared once it does. One row, two independent resource clocks.
2. **A second linked registration row** (the drop-in spot as one row, a waitlisted `instructional` row linked to it, merged back in on promotion). Reuses the existing instructional-waitlist promotion path almost unchanged, but breaks "one row per person per session" everywhere else that assumes it (roster/CSV counts, the "already signed up" guard in `register_for_session`, block checks, emails) — more invasive in practice than it first looks.
3. **Don't track the lesson wait at all**: give them the drop-in spot and tell them to switch to `full` manually later via `change_registration_option` if a lesson place opens. Rejected — they'd hold no place in the lesson queue, so a later waiter could get a freed lesson place ahead of them, which contradicts the explicit Nov 10 fairness decision.

Going with **1**.

## Out of scope

- `dropin`-only and `instructional`-only sign-ups: unchanged.
- A `full` sign-up when drop-in itself is full: still waits as one unit (unchanged).
- The pre-existing gap where a player's shown waitlist position already splits instructional-only from everything else (noted in the Nov 10 learning, `2026-11-10-the-instructional-cap-limits-everyone-at-justin.md`). This project touches the same queue, so the builder should make sure it doesn't get worse, but closing that older gap fully is a separate call, not required here.

## Data

- `registrations.lesson_queued_at timestamptz`, nullable. Non-null means "this row needs a lesson place and doesn't have one yet"; the value is *when they first started wanting one* (their original `created_at`/`queued_at`, not the moment of a later partial promotion), so fairness among lesson-waiters doesn't reset just because their drop-in spot was granted later.
  - Set at sign-up for any `full` row that gets a drop-in spot but not a lesson place.
  - Also set (carried forward) on a `full` row that's fully waitlisted, so that when its drop-in spot later frees up and the lesson still doesn't have room, it transitions straight into "has drop-in, waiting on lesson" without losing its place in the lesson queue.
  - Cleared the moment a lesson place is granted.
  - Not used for plain `instructional`-only rows — those keep using `status = 'waitlisted'` + `queued_at` exactly as today; the lesson queue's ordering merges both groups (see below).

## SQL functions touched

(Current definitions: `_fits`, `_has_room`, `_promote`, `_bump_overflow`, `get_session_counts`, and the current `change_registration_option` all in `supabase/migrations/20261210000000_lesson_cap_counts_full.sql` — that migration redefines `change_registration_option` too, dropping the old same-queue fast path in favor of calling `_fits` uniformly; build on that version, not the older body in `20261101000000_signup_options.sql`. `register_for_session`'s latest body is in `20261101000000_signup_options.sql`, patched by `20261118000000_audit_fixes.sql`; `get_session_attendees` in `20261101000000_signup_options.sql`.)

- **`_instructional_used`** (used by `_promote`'s and `_bump_overflow`'s exit conditions) becomes the single source of truth for "lesson places currently in use": redefined to count only rows that actually hold a lesson place (exclude any row with `lesson_queued_at` set, even if `status` is confirmed/pending). `_fits`'s inline duplicate of this count and `get_session_counts.lesson` both call through it instead of re-deriving it, so there's one place that knows what "using a lesson place" means. Without this, a freshly-granted partial row (drop-in yes, lesson pending) would immediately count as occupying a lesson place it doesn't have, jamming `_promote`/`_bump_overflow`'s exit checks at capacity forever and overstating lesson fullness in the UI — the same class of bug already fixed for the drop-in banner, just on the lesson side.
- **`_fits`**: split into two independent checks (drop-in room, lesson room) that callers can ask about separately, instead of one boolean that ANDs them for `full`.
- **`register_for_session`**: for `p_option = 'full'`, check drop-in and lesson room independently. Drop-in has room, lesson doesn't → insert `confirmed`/`pending_payment` (full price) with `lesson_queued_at` set. Neither has room → insert `waitlisted` as today, with `lesson_queued_at` also set (carried for later). Both have room → today's behavior, unchanged.
- **`change_registration_option`**: switching into `full` (from `dropin` or from a waitlisted `instructional`) goes through the same split check rather than the current all-or-nothing `_fits`. When a waitlisted `instructional` row switches to `full` and drop-in now has room (lesson still doesn't), `lesson_queued_at` carries forward that row's original `queued_at` — not `now()` — so the switch doesn't reset their place in the lesson queue, consistent with the fairness rule above.
- **`_promote`**: gains a second loop (or a merged query) that fills freed lesson places from *both* plain `instructional`-waitlisted rows and `full` rows with `lesson_queued_at` set, ordered by whichever timestamp represents "since when did they want a lesson place" — oldest first, across both groups. The existing drop-in promotion loop is otherwise unchanged.
- **`_bump_overflow`**: lowering `instructional_capacity` needs to be able to push an unpaid (`pending_payment`) `full` row back into "has drop-in, waiting on lesson" (setting `lesson_queued_at`) without touching its drop-in status, where today it only ever moves whole rows to `waitlisted`. Confirmed/paid `full` rows are left alone, same as today's existing rule.
- **`get_session_counts`**: `instructional_waitlisted` (or a new count) needs to include `full` rows with `lesson_queued_at` set, not just plain `instructional`-waitlisted rows, so the lesson queue size shown to hosts/players is accurate.
- **`get_session_attendees`**: waitlist position needs to reflect the merged lesson-queue order for a player in this partial state (they're not in the main `waitlisted` bucket, but they are "waiting" in the lesson sense) — this feeds the host roster's ordering only; players get a flag, not this number (see UI).
- **`run_tick`** (session-end handling): a row still carrying `lesson_queued_at` once the session ends gets its instructional share flagged `refund_owed`, the same pattern used for deposit refunds today.

## UI

- Host roster (`src/app/admin/sessions/[id]/page.tsx`): show something like "Instructional: waiting" next to a player who has their drop-in spot but `lesson_queued_at` is set, instead of the current binary confirmed/waitlisted read. The host roster's own ordering (not a number shown to the player) uses the `get_session_attendees` position fix.
- The player's own session page (`src/app/s/[id]/page.tsx`, `MySpot`): a plain "waiting on a lesson place" flag, no live queue number.
- `optionDetail.full` in `MySpot` (`src/app/s/[id]/page.tsx:276-280`) currently says "joins the waitlist" when `fullFor("full")` is true. That copy needs to distinguish "you'll get a drop-in spot now, and wait for the lesson" (drop-in has room) from "you'll wait for everything" (drop-in is also full) — these are different promises to make to someone before they sign up.
- `src/lib/options.ts`'s `optionFull`/`lessonFull` helpers mirror `_fits` for the UI; they'll need the same split so the per-option messaging can tell these two cases apart.

## Tests

`tests/signup-options.test.ts` has existing cases pinning today's atomic behavior (e.g. "the lesson is full, and Instructional + Drop-in includes it" expecting the whole row `waitlisted`). Those expectations are intentionally changing — update them to expect a confirmed/pending drop-in spot with a pending lesson place instead, and add cases for: drop-in full regardless of lesson room (unchanged, still fully waitlisted — there's no drop-in spot to split off), both full (unchanged, fully waitlisted), a freed lesson place going to the longest lesson-waiter across both groups, `_bump_overflow` partially demoting an *unpaid* `full` row when the lesson cap drops (and leaving a *paid* one alone), and `run_tick` flagging the instructional share `refund_owed` for a row whose session ended still carrying `lesson_queued_at`.

## What's left to the builder

- Exact SQL for the merged lesson-queue ordering in `_promote` and `get_session_attendees` (a `UNION`/`COALESCE` on the two groups' timestamps vs. restructuring the query another way).
- Exact copy for the new "waiting on lesson" UI states.
- Whether `_bump_overflow`'s existing two-pass loop (drop-in pass, lesson pass) can be reused as-is for the lesson pass once rows can be partially demoted, or needs restructuring.
