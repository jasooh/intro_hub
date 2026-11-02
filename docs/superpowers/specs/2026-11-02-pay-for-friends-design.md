# Pay for friends in one e-Transfer

Date: 2026-11-02 · Status: approved design, awaiting spec review

## Why
Players want to cover a friend's spot. Today that only works with one e-Transfer per person: A sends B's price with B's `VB-` code, and the matcher matches on the code without looking at the sender. A single transfer for two people fails, because `matchPayment` (`src/lib/matcher.ts`) reads only the first code and a payment row links to one sign-up (`payments.registration_id`). A ends up overpaid and B stays unpaid.

## Goal
Player A picks friends' unpaid sign-ups for the same session, sends **one** transfer with **A's own code**, and the site splits the money. Each friend gets a one-time pop-up saying they're covered.

Decided with the user:
- One code for the group, not several codes typed into the message.
- A can cover anyone with an unpaid sign-up in the same session. No consent step.
- The friend is told with a pop-up like the no-show one.
- No new group code: A's existing `VB-` code covers the group.

Out of scope: covering sign-ups in other sessions, covering waitlisted sign-ups, several codes in one message, extra emails to the friend when they are added.

## Player experience
**Payer (A), on the session page payment panel (`PaymentInstructions`):**
- A "Paying for friends too?" button opens a picker listing the other `pending_payment` sign-ups in that session (avatar + name). Up to 5 friends.
- After saving, the panel shows the total and a breakdown, e.g. *Send $30 (you $15 · Sam $15)*, with the same code as before.
- If A has already paid their own spot, the session page shows a small "Pay for a friend" link that opens the same picker. While A covers anyone, the payment panel stays visible with the friends' total only.
- A can change or clear the list until the transfer arrives.

**Friend (B):**
- On their next page load, a one-time pop-up: "Alex is paying for your spot at Saturday drop-in. Nothing to send." Buttons: **Got it** and **I'll pay myself**, which takes B out of A's group.
- B's payment panel says the same thing and still shows B's own code, in case B pays anyway. If B pays themselves first, they drop out of A's group when A's transfer is split.
- B's hold timer still applies. If it runs out before A pays, B expires as usual and is skipped when the money is split.
- When A's transfer arrives, every covered sign-up is confirmed and gets the normal confirmation email.

**Rules:**
- A sign-up that is covered by someone can't cover others (no chains), and a sign-up is covered by at most one payer.
- If A cancels, their friends are no longer covered (`covered_by` cleared). Their payment panel goes back to the normal instructions with their own code; no extra pop-up.

**Hosts:**
- Roster and player details show a "Paid by Alex" (or "Alex is covering") mark on covered sign-ups.
- The payments inbox shows the split pieces under the original transfer.
- "Mark paid" stays per sign-up.

## Data (one new migration)
- `registrations.covered_by uuid references public.registrations(id) on delete set null`. It points from a sign-up to a sign-up, so registrations keep a single foreign key to profiles (see the learning on the second foreign key).
- `registrations.covered_seen boolean not null default false`: drives the pop-up.
- `payments.split_from uuid references public.payments(id) on delete cascade`: the share of a group transfer that went to another sign-up. The original row keeps the Gmail id and the payer's share. `paid_cents` keeps working through the existing `_sync_paid_cents` trigger unchanged.
- Players can't write any of these columns directly; changes go through the functions below (same reason as the profile change limits: players can reach the API directly).

## SQL functions
- `set_covered_signups(p_registration_id uuid, p_targets uuid[])`, modelled on `set_team_requests`. The caller owns the payer sign-up, which is `pending_payment` or `confirmed` and not itself covered. Targets are `pending_payment`, in the same session, not the caller's, and not covered by another payer. At most 5. Locks the session row first. Removed targets get `covered_by = null`; new targets get `covered_seen = false`.
- `payable_signups(p_session_id uuid)`: id, display name and avatar of other unpaid sign-ups in the session, for the picker (RLS hides other players' rows). Only for a caller with a sign-up in that session.
- `decline_cover(p_registration_id uuid)`: the friend removes themselves.
- `acknowledge_cover(p_registration_id uuid)`: sets `covered_seen`.
- `ingest_apply_group_payment(p_payment_id uuid, p_payer_registration_id uuid, p_matched_by text)`: locks the session, then splits the amount payer first, then friends in the order they were added. Each gets at most what it still owes. Friends get a `split_from` payment row and go through `_apply_payment`; a friend who is no longer `pending_payment` is skipped. A short payment leaves the last friend partly paid (normal partial-payment handling). Anything left over stays on the payer's row, which becomes `refund_owed` as today.
- `_reverse_payment` / `ingest_reverse_payment` (latest version in `20261202000000_cancellation_sender_must_match.sql`): a cancelled group transfer also reverses its split rows, and amount checks compare the full received amount (original plus splits).
- `cancel_registration`: clears `covered_by` on the payer's friends.

## Matching
- `src/lib/matcher.ts`: `Candidate` gains `coveredDue`, what its pending friends still owe. A code hit on a sign-up with covered friends returns `{ kind: "group_match", registrationId, by }`, even when the payer is already confirmed. Name + amount also matches when the amount equals the payer's remaining plus `coveredDue`.
- `src/app/api/payments/ingest/route.ts`: loads `covered_by` with the candidates, calls `ingest_apply_group_payment` for group matches, and updates candidate state for later messages in the same batch.

## UI changes
- `src/components/payment-instructions.tsx`: total with breakdown, the "Paying for friends too?" button, and the covered message for friends.
- New picker component, modelled on the team-request picker.
- New `CoveredNotice` (server) and dialog, modelled on `src/components/no-show-notice.tsx` and `no-show-dialog.tsx`, mounted next to `NoShowNotice`.
- `src/app/actions.ts`: `setCoveredSignups`, `declineCover`, `acknowledgeCover`, using `flash` toasts and `?error=` on failure.
- Host roster (`src/app/admin/sessions/[id]/page.tsx`), player details and payments inbox: covered marks and split rows.
- My sign-ups row (`src/components/signup-row.tsx`): "Covered by Alex" mark.

## Testing (TDD, Vitest + PGlite)
- `tests/matcher.test.ts`: group match by code; by name + group total; payer already confirmed; friend already paid.
- New `tests/pay-for-friends.test.ts`: set, change and clear the list; limit of 5; target in another session, waitlisted, already covered or own sign-up is rejected; no chains; decline; split confirms everyone; short payment fills payer first; overpay sets `refund_owed`; cancelled group transfer reverses every split; friend expired before payment is skipped; payer cancel clears cover; a player can't write `covered_by` or `covered_seen` directly.
- `tests/ingest-route.test.ts`: the route calls the group function for a group match.
- Checks: `npx tsc --noEmit`, `npx eslint src`, `npx vitest run`, `npx next build`. Apply the migration to dev through the Supabase connector, then `npm run db:functions`.
