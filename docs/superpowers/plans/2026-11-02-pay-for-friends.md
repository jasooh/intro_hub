# Pay for Friends Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A player covers friends' unpaid sign-ups in the same session with one e-Transfer using their own `VB-` code, and the site splits the money.

**Architecture:** A sign-up points at the sign-up paying for it (`registrations.covered_by`). When a transfer matches a payer who covers friends, one SQL function splits it into per-sign-up payment rows (`payments.split_from`), so the existing `paid_cents` trigger, confirmations, refunds and reversals keep working per sign-up. The friend sees a one-time pop-up modelled on the no-show one.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4, Supabase Postgres (plpgsql), Vitest + PGlite.

**Spec:** `docs/superpowers/specs/2026-11-02-pay-for-friends-design.md`

## Global Constraints
- Work on `dev`. One new migration file: `supabase/migrations/20261203000000_pay_for_friends.sql`. Never edit an applied migration; redefine functions with `create or replace`.
- Registrations keep exactly one FK to profiles. `covered_by` references `public.registrations(id)`, never profiles.
- Every state-changing function locks the session row first (`select … from public.sessions where id = … for update`), then the sign-up.
- All functions `security definer set search_path = ''`; revoke from `public, anon`, grant to `authenticated` (player functions) or `service_role` (ingest). Internal helpers revoked from `authenticated` too.
- Max 5 friends per payer (same as `MAX_TEAMMATES` in `src/lib/teams.ts`; reuse that constant in TS).
- Money paths use `registrations.amount_cents - paid_cents` as "still owed".
- Server actions: `flash("success", …)` on success, redirect with `?error=` (through `friendly()` in `src/app/actions.ts`) on failure. No inline notices. Confirmation modals via `SubmitButton confirm`, never `window.confirm`.
- UI follows the "Gym-floor scoreboard" theme in `CLAUDE.md`: `Mark` for status, no pills, `[overflow-wrap:anywhere]` on names, grids get `grid-cols-1`.
- Copy (exact): pop-up title "Your spot is covered"; body "{payer} is paying for your spot at {session}. Nothing to send."; buttons "Got it" and "I'll pay myself". Payer button "Paying for friends too?"; confirmed payer link "Pay for a friend". Host mark "Paid by {payer}" once confirmed, "{payer} is covering" while pending.
- Before each commit: `npx tsc --noEmit`, `npx eslint src`, `npx vitest run`. Stage files by name (the user edits in parallel).

## Review Focus
- **Payer's transfer arrives after a friend already paid themselves:** that friend is skipped and the money goes to the next friend or back to the payer as `refund_owed`. Test in Task 2.
- **Payer sends only their own price with their code while covering friends:** payer is filled first and confirmed, friends stay pending with their own timers. Test in Task 2.
- **Two transfers in one ingest batch for the same group:** the second one must see updated candidate state (friends now confirmed). Test in Task 4.
- **Payer is waitlisted or expired when picking friends:** rejected with `cover_unavailable`. Test in Task 1.
- **Friend's sign-up moved to the waitlist / cancelled after being covered:** the split skips anything not `pending_payment`. Test in Task 2.

---

### Task 1: Cover columns and player functions

**Files:**
- Create: `supabase/migrations/20261203000000_pay_for_friends.sql`
- Test: `tests/pay-for-friends.test.ts` (harness: `createDb`, `createUser`, `createSession`, `asUser`, `asService` from `tests/db-harness.ts`; copy the `startedSignup` style from `tests/no-shows.test.ts`)

**Interfaces:**
- Produces columns: `registrations.covered_by uuid null`, `registrations.covered_seen boolean not null default false`, `payments.split_from uuid null references public.payments(id) on delete cascade`; index on `registrations(covered_by)`.
- Produces: `public.set_covered_signups(p_registration_id uuid, p_targets uuid[]) returns void`
- Produces: `public.payable_signups(p_session_id uuid) returns table (registration_id uuid, display_name text, avatar_url text, owed_cents int)`
- Produces: `public.decline_cover(p_registration_id uuid) returns void`
- Produces: `public.acknowledge_cover(p_registration_id uuid) returns void`
- Produces: `cancel_registration` (redefined from `20261130000000_no_cancel_after_session.sql`) also runs `update public.registrations set covered_by = null where covered_by = <cancelled id>`.

- [ ] **Step 1: Write failing tests** in `tests/pay-for-friends.test.ts`, `describe("covering friends")`:
  - `sets and clears the list`: A and B register `'full'` in one session; A calls `set_covered_signups(regA, [regB])` → `regB.covered_by = regA`, `covered_seen = false`; calling with `'{}'` → `covered_by` null.
  - `rejects bad targets`: B in another session, B waitlisted, A's own id, B already covered by C → each throws `cover_unavailable`; 6 targets → throws `too_many_friends`.
  - `rejects a payer who can't pay`: A waitlisted or expired → `cover_unavailable`; A covered by C → `cover_unavailable` (no chains); session started → `session_started`.
  - `only the owner sets it`: B calling `set_covered_signups(regA, …)` → `forbidden`.
  - `players can't write the columns`: `asUser(B, update public.registrations set covered_by = null …)` changes 0 rows (or throws); same for `covered_seen`.
  - `payable_signups`: lists other `pending_payment` sign-ups with `owed_cents = amount_cents - paid_cents`, excludes the caller and confirmed ones; a caller with no sign-up in the session gets 0 rows.
  - `decline and acknowledge`: B's `decline_cover(regB)` clears `covered_by`; `acknowledge_cover(regB)` sets `covered_seen`; A calling either on regB → `forbidden`.
  - `payer cancel clears cover`: A `cancel_registration(regA)` → `regB.covered_by` null.
- [ ] **Step 2: Run** `npx vitest run tests/pay-for-friends.test.ts` → FAIL (functions missing).
- [ ] **Step 3: Write the migration.** Model `set_covered_signups` on `set_team_requests` (`20261022000000_team_requests.sql`): payer status in `('pending_payment','confirmed')` and `covered_by is null`; targets distinct, `pending_payment`, same session, `covered_by is null or covered_by = payer`, and not themselves covering anyone. Clear removed targets, set new ones with `covered_seen = false`. `payable_signups` checks `exists(caller's sign-up in session)` and joins profiles for `display_name`, `avatar_url`. Copy the latest `cancel_registration` body and add the clearing line. Add the new error codes to `friendly()` in `src/app/actions.ts`: `cover_unavailable` → "That sign-up can't be covered right now.", `too_many_friends` → "You can pay for up to 5 friends.".
- [ ] **Step 4: Run** the test file → PASS; then `npx vitest run tests/migrations.test.ts tests/db.test.ts` → PASS.
- [ ] **Step 5: Commit** migration, test, `src/app/actions.ts` — "Let players pick friends' sign-ups to pay for".

### Task 2: Split a group payment, and reverse it

**Files:**
- Modify: `supabase/migrations/20261203000000_pay_for_friends.sql`
- Test: `tests/pay-for-friends.test.ts` (`describe("group payments")`)

**Interfaces:**
- Consumes: Task 1 columns; existing `public._apply_payment(p_payment_id uuid, p_registration_id uuid, p_matched_by text, p_require_pending boolean) returns jsonb` (`20261026000000_partial_payments.sql`).
- Produces: `public.ingest_apply_group_payment(p_payment_id uuid, p_payer_registration_id uuid, p_matched_by text) returns jsonb` (events array, same shape as `ingest_apply_payment`), granted to `service_role` only.
- Produces: `_reverse_payment` redefined: when reversing a payment, also reverses every row with `split_from = p.id` (each through the same per-sign-up logic, events concatenated).
- Produces: `ingest_reverse_payment` redefined: amount comparisons use `p.amount_cents + coalesce((select sum(amount_cents) from public.payments c where c.split_from = p.id), 0)`; split rows (`split_from is not null`) are never candidates themselves.

- [ ] **Step 1: Write failing tests** (helper: insert a payments row with a `gmail_message_id` and `amount_cents`, then `asService(select public.ingest_apply_group_payment($1,$2,'ref'))`; price $15 = 1500):
  - `confirms everyone`: A covers B; 3000 → A and B `confirmed`, B has a payment with `split_from` = original and `amount_cents = 1500`, original's `amount_cents = 1500`; events include `confirmed` for both.
  - `payer first on a short payment`: A covers B and C; 2000 → A confirmed, B `pending_payment` with `paid_cents = 500` (event `partial_payment`), C untouched.
  - `payer only`: 1500 → A confirmed, B still pending, no split row.
  - `already-confirmed payer`: A confirmed, covers B; 1500 → B confirmed; A's `paid_cents` unchanged.
  - `friend paid themselves first`: B confirmed before; 3000 → B gets no split, A `refund_owed = true`, A `paid_cents = 3000`.
  - `friend expired/cancelled is skipped`: same expectation as above.
  - `cancelled group transfer reverses every share`: after `confirms everyone`, insert a `payment_cancellations` row with the same `reference` in `raw` and `amount_cents = 3000`, run `ingest_reverse_payment` → original and split both have `reversed_at`, A and B back to `pending_payment` (or `expired` if past window), as in `tests/payment-cancellations.test.ts`.
  - `cancellation matched by full amount`: no reference, `amount_cents = 3000`, same `sent_on` and sender → reverses both.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `ingest_apply_group_payment`: lock session, then payer; compute payer due (0 if confirmed); set original row's `amount_cents` to `least(total, payer_due)` only after friends are allocated, i.e. allocate in this order:

```
remaining := payment.amount_cents
payer_share := least(remaining, payer_due); remaining -= payer_share
for f in friends (covered_by = payer, status = 'pending_payment', order by created_at):
  share := least(remaining, f.amount_cents - f.paid_cents); exit when share = 0
  insert split row (split_from = payment.id, gmail_message_id null, sender_name, memo, received_at copied, amount_cents = share)
  events ||= _apply_payment(split_id, f.id, p_matched_by, true); remaining -= share
update original set amount_cents = payer_share + remaining   -- leftover stays with payer
events ||= _apply_payment(payment.id, payer.id, p_matched_by, false)  -- confirmed payer: overpay → refund_owed
```

Split rows must not trip the `gmail_message_id` uniqueness (null) and must be excluded from the Payments "unmatched" views later (Task 6 handles display). Then redefine `_reverse_payment` and `ingest_reverse_payment` as in Interfaces (copy the latest bodies from `20261202000000_cancellation_sender_must_match.sql`).
- [ ] **Step 4: Run** `npx vitest run tests/pay-for-friends.test.ts tests/payment-cancellations.test.ts tests/payments.test.ts tests/refunds.test.ts` → PASS.
- [ ] **Step 5: Commit** — "Split one e-Transfer across the sign-ups it covers".

### Task 3: Matcher recognises group payments

**Files:**
- Modify: `src/lib/matcher.ts`
- Test: `tests/matcher.test.ts`

**Interfaces:**
- Produces: `Candidate.coveredDueCents?: number` (sum still owed by its pending friends).
- Produces: `MatchResult` gains `{ kind: "group_match"; registrationId: string; by: "ref" | "name_amount" }`.

- [ ] **Step 1: Write failing tests** in `describe("group payments")`:
  - code on a pending payer with `coveredDueCents: 1000` → `{ kind: "group_match", registrationId: "r1", by: "ref" }`.
  - code on a **confirmed** payer with `coveredDueCents: 1000` → `group_match`; confirmed payer with no `coveredDueCents` → still `unmatched` as today.
  - no code, sender "Jane Doe", amount 2000 (owed 1000 + covered 1000) → `group_match` by `name_amount`; amount 1000 → plain `match` as today.
  - existing tests unchanged.
- [ ] **Step 2: Run** `npx vitest run tests/matcher.test.ts` → FAIL.
- [ ] **Step 3: Implement** in `matchPayment`: after the ref lookup, return `group_match` when `byRef.coveredDueCents > 0` and status is `pending_payment` or `confirmed`. In the name filter, also accept `amountCents === remaining + coveredDueCents` (remaining = owed − paid, or 0 if confirmed for a confirmed candidate with cover), and return `group_match` when that branch matched.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — "Match e-Transfers that pay for a group".

### Task 4: Ingest route applies group payments

**Files:**
- Modify: `src/app/api/payments/ingest/route.ts`
- Test: `tests/ingest-route.test.ts`

**Interfaces:**
- Consumes: `ingest_apply_group_payment` (Task 2), `group_match` (Task 3).

- [ ] **Step 1: Write failing tests** (extend the existing Supabase stub's registrations rows with `covered_by`):
  - a message with payer's code and a covered friend → `state.rpcCalls` contains `{ fn: "ingest_apply_group_payment", args: { p_payment_id, p_payer_registration_id: "reg-1", p_matched_by: "ref" } }`, response `matched: 1`.
  - two messages in one batch for the same group: second one sees the friend as confirmed (stub returns `confirmed` events) and matches as a plain payment or overpay, not a second group split for the friend.
- [ ] **Step 2: Run** `npx vitest run tests/ingest-route.test.ts` → FAIL.
- [ ] **Step 3: Implement**: select `covered_by` in the candidate query; compute each candidate's `coveredDueCents` from rows with `covered_by = id and status = 'pending_payment'`; on `group_match`, call the group RPC; after it, mark candidates confirmed from returned `confirmed` events (by `registration_id`), bump `paidCents`, and recompute `coveredDueCents` for the payer.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — "Apply group e-Transfers in the payments ingest".

### Task 5: Server actions and types

**Files:**
- Modify: `src/app/actions.ts`, `src/lib/types.ts`
- Test: covered by Task 1 SQL tests; `npx tsc --noEmit`.

**Interfaces:**
- Produces: `Registration.covered_by: string | null`, `Registration.covered_seen: boolean`; `Payment.split_from: string | null`.
- Produces: `setCoveredSignups(registrationId: string, sessionId: string, formData: FormData): Promise<void>` (reads `formData.getAll("friends")`, dedupe, cap `MAX_TEAMMATES`; flash "Saved who you're paying for"). Model on `setTeammates`, including `playerLimit`.
- Produces: `declineCover(registrationId: string, sessionId: string): Promise<void>` (flash "You'll pay for your own spot").
- Produces: `acknowledgeCover(registrationId: string): Promise<void>` (no flash; like `acknowledgeNoShows`).

- [ ] **Step 1:** Add the types and the three actions; each revalidates `/s/{sessionId}`, `/me/signups`, `/admin/sessions/{sessionId}`.
- [ ] **Step 2: Run** `npx tsc --noEmit && npx eslint src` → clean.
- [ ] **Step 3: Commit** — "Add actions for paying for friends".

### Task 6: Payer and friend UI

**Files:**
- Modify: `src/components/payment-instructions.tsx`, `src/app/s/[id]/page.tsx`, `src/components/signup-row.tsx`, `src/app/layout.tsx`
- Create: `src/components/friend-pay-picker.tsx` (client; reuses `TeammatePicker` from `src/components/teammate-picker.tsx` with `name="friends"`), `src/components/covered-notice.tsx` (server), `src/components/covered-dialog.tsx` (client, modelled on `no-show-dialog.tsx`)
- Test: `tests/pay-for-friends-ui.test.tsx` (render with `@testing-library/react`, like `tests/audit-fixes.test.tsx`)

**Interfaces:**
- Produces: `PaymentInstructions` props gain `covering?: { name: string; dueCents: number }[]` and `coveredBy?: string | null` (payer's display name).
- Produces: `FriendPayPicker({ registrationId, sessionId, options, selected }: { registrationId: string; sessionId: string; options: { id: string; name: string }[]; selected: string[] })`.
- Produces: `CoveredNotice()` (no props, reads the signed-in profile's pending sign-ups with `covered_by` set and `covered_seen = false`, shows the first) and `CoveredDialog({ registrationId, sessionId, payerName, sessionTitle }: {…})`.

- [ ] **Step 1: Write failing tests**:
  - `PaymentInstructions` with own due 1500 and `covering=[{name:"Sam", dueCents:1500}]` shows "$30.00" and "you $15.00 · Sam $15.00" and the payer's code.
  - with own spot paid (`paid_cents = amount_cents`) and covering Sam → shows "$15.00" and no "you" part.
  - with `coveredBy="Alex"` → shows "Alex is paying for your spot" and still shows the friend's own code.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**: panel total = own due + sum of covering; breakdown line only when covering is non-empty. On `/s/[id]`: load `payable_signups` and the friends currently covered (`covered_by = reg.id`, names via the RPC or the existing query), render the panel when `pending_payment` **or** (`confirmed` and covering non-empty), render `FriendPayPicker` behind a "Paying for friends too?" button (pending) or "Pay for a friend" link (confirmed). Friend view passes `coveredBy`. `CoveredDialog` "Got it" calls `acknowledgeCover`; "I'll pay myself" submits `declineCover` (then also acknowledges). Mount `<CoveredNotice />` next to `<NoShowNotice />` in `src/app/layout.tsx` inside the same `Suspense`. `SignupRow`: `Mark` "Covered by {payer}" when `covered_by` is set.
- [ ] **Step 4: Run** the UI test → PASS; `npx next build` → succeeds (Cache Components check).
- [ ] **Step 5: Commit** — "Show pay-for-friends on the session page and tell covered friends".

### Task 7: Host views

**Files:**
- Modify: `src/app/admin/sessions/[id]/page.tsx`, `src/components/player-details.tsx`, `src/app/admin/payments/page.tsx`
- Test: `tests/host-pages.test.ts` (extend existing render tests)

**Interfaces:**
- Consumes: `Registration.covered_by`, `Payment.split_from` (Task 5).

- [ ] **Step 1: Write failing tests**: roster row for a covered pending friend shows "Alex is covering"; once confirmed with a split payment shows "Paid by Alex"; payments page lists a split row indented under its original with the friend's name, and split rows never appear in the "Needs attention" tab.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**: look up the payer's name by `covered_by` from the roster rows already loaded (same session). Payments page: query `split_from` and group children under parents in memory; exclude `split_from is not null` from `paymentStatus` counts. Cancellation picker (`CancellationRow`) lists only originals.
- [ ] **Step 4: Run** `npx vitest run` → all PASS.
- [ ] **Step 5: Commit** — "Show who is covering whom to hosts".

### Task 8: Ship to dev

- [ ] **Step 1:** Apply `20261203000000_pay_for_friends.sql` to dev through the Supabase connector (`execute_sql` with the file, then insert the history row), per the repo learning. Expected: no error; `select covered_by from public.registrations limit 1` works on dev.
- [ ] **Step 2:** `npm run db:functions` and `npm run db:status -- --drift` → nothing pending on dev, no drift.
- [ ] **Step 3:** `npx tsc --noEmit && npx eslint src && npx vitest run && npx next build` → all pass.
- [ ] **Step 4:** `trail check` → no conflicts. Commit any `db:functions` output — "Apply pay-for-friends migration to dev".
