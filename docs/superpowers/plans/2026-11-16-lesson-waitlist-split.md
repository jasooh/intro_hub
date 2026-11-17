# Lesson Waitlist Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Drop-in + Instructional ("full") sign-up grabs an open drop-in spot immediately even when the lesson is full, and queues separately for the lesson place, instead of waiting as one atomic unit.

**Architecture:** Add `registrations.lesson_queued_at`, a per-row clock independent of `status`/`queued_at` (which keep governing the drop-in resource exactly as today). Two new fit-predicates (`_dropin_fits`, `_lesson_fits`) replace the combined `_fits`/`_has_room` check wherever a `full` sign-up's two resources need to be granted independently: at fresh sign-up, at option switch, at promotion (now two FIFO passes — drop-in, then lesson), at demotion, and at session end for the never-promoted refund case.

**Tech Stack:** Postgres (Supabase migrations, PL/pgSQL), Next.js/TypeScript, Vitest + PGlite.

**Spec:** `docs/superpowers/specs/2026-11-16-lesson-waitlist-split-design.md`

## Global Constraints

- Full price charged up front for a `full` sign-up; no extra charge when the lesson place later opens.
- One row per registration — no new table, no second linked row.
- The partial-grant path only exists when `sessions.dropin_price_cents is not null` (needed to compute the refund if the lesson place never opens — see Task 6). If a session doesn't offer standalone drop-in pricing, a `full` sign-up stays atomic exactly as today.
- Lowering `instructional_capacity` can only claw back a lesson place from an unpaid (`pending_payment`) `full` row, never a paid/confirmed one.
- Players see a plain "waiting on a lesson place" flag; no live queue number is exposed to players — only the host roster's ordering needs to be accurate.
- The freed drop-in spot goes to whoever has waited longest for a drop-in resource (`full` or `dropin`), full stop — a `full` waiter still stuck on the lesson is **not** skipped in favor of a newer drop-in-only waiter. (Confirmed with the user; this reverses the Nov 10 migration's "doesn't block a drop-in only waiter" rule, which existed only because the old atomic model made a lesson-blocked `full` grant useless — that reason no longer applies.)
- `lesson_queued_at` always carries a row's *original* lesson-wait start (never resets to `now()` on a later promotion or switch), so fairness in the merged lesson queue doesn't reset just because a row's drop-in side changed.

## Review Focus

- A `full` sign-up on a session with `dropin_price_cents is null` (no standalone drop-in pricing) must stay fully atomic — confirm it isn't silently given a partial grant it can never be priced for a refund on.
- A session with no lesson cap at all (`instructional_capacity is null`): every `full`/`instructional` sign-up must behave exactly as today (always "lesson fits"), never pick up a spurious `lesson_queued_at`.
- A `full` row that's still `pending_payment` with `lesson_queued_at` set and whose hold expires: the existing hold-expiry step (`run_tick` step 1) must still expire it and free the drop-in spot — confirm `lesson_queued_at` is cleared too, so a later `_instructional_used`/merged-queue query never counts a cancelled/expired row.
- Cancelling a `full` row that currently holds a drop-in spot but is still waiting on the lesson must free the drop-in spot (dropin pass) **and** drop it out of the lesson queue — not leave a phantom `lesson_queued_at` entry other waiters queue behind.
- A `full` row promoted into the drop-in resource by `_promote`'s dropin pass, where the lesson also happens to have room at that exact moment: it should get the **full** grant (`lesson_queued_at = null`) in the same pass, not a partial grant immediately followed by a second lesson-pass promotion (which would otherwise still produce the right end state, but emitting two "promoted" events for one player is a visible bug — the lesson pass must only find rows that still need it).

---

## File Structure

- `supabase/migrations/20261211000000_lesson_wait_partial_grant.sql` — **new.** All SQL changes (Tasks 1–6) land in this one file, consistent with the repo's convention of bundling one feature's capacity-logic changes into a single migration (see `20261210000000_lesson_cap_counts_full.sql`). Built up across tasks' commits before it's ever applied to dev; `tests/signup-options.test.ts` runs it in-memory via PGlite at every step, so nothing needs to be live to test it.
- `tests/signup-options.test.ts` — modified. Several existing assertions change (documented per task); new `it(...)` blocks added.
- `tests/db-harness.ts` — modified. `reg()` helper's `select` list gains `lesson_queued_at`.
- `src/lib/options.ts` — modified. `optionFull`/`lessonFull` split to mirror the new SQL.
- `src/app/s/[id]/page.tsx` — modified. `MySpot`'s `optionDetail.full` copy and the signed-up view gain the "waiting on lesson" case.
- `src/app/admin/sessions/[id]/page.tsx` — modified. Roster row gains an "Instructional: waiting" tag.

---

### Task 1: Schema + fit-predicates + sign-up partial grant

**Files:**
- Create: `supabase/migrations/20261211000000_lesson_wait_partial_grant.sql`
- Modify: `tests/db-harness.ts` (`reg()` helper, currently defined around the test file's own `reg()` — the shared one lives in `db-harness.ts`; confirm and extend its `select` list there)
- Test: `tests/signup-options.test.ts`

**Interfaces:**
- Produces: `public._dropin_fits(s public.sessions, p_exclude uuid) returns boolean`; `public._lesson_fits(s public.sessions, p_exclude uuid) returns boolean`; `public._instructional_used(p_session_id uuid, p_exclude uuid default null) returns int` (signature change — drop and recreate); `registrations.lesson_queued_at timestamptz`; `get_session_counts`'s `lesson` column now excludes partial `full` rows (Task 5 adds the separate `instructional_waitlisted` fix on top of this). Tasks 2–6 all call `_dropin_fits`/`_lesson_fits`/`_instructional_used`.

- [ ] **Step 1: Write the failing tests**

In `tests/signup-options.test.ts`, under `describe("instructional limit", ...)`:

```ts
it("a Full sign-up takes the open drop-in spot when only the lesson is full", async () => {
  const sid = await createSession(db, { capacity: 10, instructionalPriceCents: 1000 });
  await setSession(sid, `instructional_capacity = 1, dropin_price_cents = 800`);
  const [a, c] = await users(2);
  await signUp(a, sid, "instructional"); // takes the one lesson place
  await signUp(c, sid, "full");
  expect(await reg(c, sid)).toMatchObject({ status: "pending_payment", option: "full" });
  expect((await reg(c, sid)).lesson_queued_at).not.toBeNull();
});

it("a Full sign-up stays fully waitlisted when drop-in itself is also full", async () => {
  const sid = await createSession(db, { capacity: 1, instructionalPriceCents: 1000 });
  await setSession(sid, `instructional_capacity = 1, dropin_price_cents = 800`);
  const [a, b, c] = await users(3);
  await signUp(a, sid, "dropin");
  await signUp(b, sid, "instructional");
  await signUp(c, sid, "full");
  expect(await reg(c, sid)).toMatchObject({ status: "waitlisted" });
  expect((await reg(c, sid)).lesson_queued_at).not.toBeNull();
});

it("a Full sign-up stays fully atomic when the session has no drop-in price", async () => {
  const sid = await createSession(db, { capacity: 10, instructionalPriceCents: 1000 });
  await setSession(sid, `instructional_capacity = 1`); // dropin_price_cents stays null
  const [a, c] = await users(2);
  await signUp(a, sid, "instructional");
  await signUp(c, sid, "full");
  expect((await reg(c, sid)).status).toBe("waitlisted"); // no partial grant possible: can't price a refund
});
```

Update the existing assertions that this task's behavior change breaks:
- `"waitlists past the cap and promotes in order when a place frees up"` (currently expects `c`'s status `"waitlisted"` **twice** — once right after the three sign-ups, and again after `a`'s cancellation promotes `b`): change **both** occurrences to `expect(await reg(c, sid)).toMatchObject({ status: "pending_payment" }); expect((await reg(c, sid)).lesson_queued_at).not.toBeNull();` — `c` never changes state in this test; it's partially granted from the start and stays that way throughout, since the freed lesson place goes to `b` (waiting longer), not `c`. (Capacity is 10 in this test, well above 1, so `dropin_price_cents` must be set via `setSession` for the partial grant to apply — add `dropin_price_cents = 800` to that test's `setSession` call.) The rest of the test (the cancellation promoting `b`, not `c`) is unaffected and needs no change — at this point in the sequence `_promote` is still today's single loop, which only ever scans `status = 'waitlisted'` rows, and `c` is no longer one of those, so it's correctly out of contention without needing Task 3's rewrite yet.
- `"counts Instructional + Drop-in toward the cap; Drop-in only stays out of it"` (currently expects `d`'s status `"waitlisted"`): this test already sets `dropin_price_cents = 800`. Change to `expect(await reg(d, sid)).toMatchObject({ status: "pending_payment", option: "full" }); expect((await reg(d, sid)).lesson_queued_at).not.toBeNull();` — the `counts` assertion two lines later (`{ lesson: 2, instructional: 1, dropin: 1 }`) keeps the same expected numbers, but only holds true once Step 3 below also fixes `get_session_counts`'s `lesson` column (see note there) — without that fix, `d`'s partial grant would inflate `lesson` to 3. Don't skip that part of Step 3 on the theory that `get_session_counts` is "Task 5's job" — the `instructional_waitlisted` addition is Task 5's; this `lesson`-column fix has to land here, in the same task that first makes a `pending_payment`/`confirmed` `full` row possible without a lesson place.

- [ ] **Step 2: Run tests to verify the new ones fail and the two updated ones fail against current behavior**

Run: `npx vitest run tests/signup-options.test.ts -t "instructional limit"`
Expected: FAIL (new tests: function/column doesn't exist yet or old atomic behavior; updated tests: still asserting old `"waitlisted"`).

- [ ] **Step 3: Write the migration**

In the new migration file:

```sql
alter table public.registrations add column lesson_queued_at timestamptz;
```

Drop and recreate `_instructional_used` with an optional exclusion, excluding rows that don't actually hold a lesson place yet:

```sql
drop function public._instructional_used(uuid);
create function public._instructional_used(p_session_id uuid, p_exclude uuid default null) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.registrations
   where session_id = p_session_id
     and option in ('full', 'instructional')
     and status in ('pending_payment', 'confirmed')
     and lesson_queued_at is null
     and id is distinct from p_exclude;
$$;
```

New predicates (signatures only — bodies are one `select`, direct translations of the counts above):
- `_dropin_fits(s public.sessions, p_exclude uuid) returns boolean`: true iff the count of rows with `option in ('full','dropin')` and `status in ('pending_payment','confirmed')` and `id is distinct from p_exclude` is less than `s.capacity`.
- `_lesson_fits(s public.sessions, p_exclude uuid) returns boolean`: true iff `s.instructional_capacity is null or public._instructional_used(s.id, p_exclude) < s.instructional_capacity`.

`_fits` (current body in `20261210000000_lesson_cap_counts_full.sql:23-36`) gets `create or replace`d to call through these two instead of duplicating the counts inline: `select (p_option = 'instructional' or public._dropin_fits(s, p_exclude)) and (p_option = 'dropin' or public._lesson_fits(s, p_exclude))`. (`_has_room` is unchanged by this step — Task 2 replaces its one remaining caller.)

Also `create or replace` `get_session_counts` (current body: `supabase/migrations/20261210000000_lesson_cap_counts_full.sql:238-256`, same signature — a plain `create or replace` is enough, no `drop function` needed since no column is added or retyped here) with one change: the `lesson` column's filter gains `and r.lesson_queued_at is null`, so a partial `full` row (which holds a drop-in spot, not a lesson place) stops being counted as occupying one. This has to happen in this task, not later: this task is what first makes a `pending_payment`/`confirmed` `full` row without a lesson place possible at all, and Step 1's own test (the updated `"counts Instructional + Drop-in..."` test) depends on it. Task 5 does its own later `create or replace` of this same function, restating this filter unchanged and adding the separate `instructional_waitlisted` fix.

- [ ] **Step 4: Rewrite `register_for_session`'s grant decision for `p_option = 'full'`**

Current body: `supabase/migrations/20261101000000_signup_options.sql:258-352`, patched by `20261118000000_audit_fixes.sql`. In the new migration, patch it in place the same way (`pg_get_functiondef` + `replace` + `execute`, matching the style at `20261118000000_audit_fixes.sql:60-76` and `20261118000000_audit_fixes.sql:124-141`) to replace the existing block:

```sql
v_amount := public._signup_price(s, p_option, false);
if public._has_room(s, p_option) then
  v_status := case when v_amount = 0 then 'confirmed' else 'pending_payment' end;
else
  v_status := 'waitlisted';
end if;
```

with logic that branches on `p_option`:
- `dropin` / `instructional`: unchanged — still `_has_room(s, p_option)` (Task 2 leaves `_has_room` as the single-resource check for these two; no change needed here since `_has_room` already reduces to the single relevant resource for them via `_fits`).
- `full`: compute `v_dropin_ok := public._dropin_fits(s, null)` and `v_lesson_ok := public._lesson_fits(s, null)`.
  - Both ok → today's behavior (`v_status` from amount; `v_lesson_queued_at := null`).
  - `v_dropin_ok` and not `v_lesson_ok` and `s.dropin_price_cents is not null` → `v_status` from amount (same as the "both ok" branch — they get the drop-in resource); `v_lesson_queued_at := now()`.
  - Otherwise → `v_status := 'waitlisted'`; `v_lesson_queued_at := now()` (carried for later, per the Global Constraints rule).

Set `lesson_queued_at = v_lesson_queued_at` in the `insert` a few lines below (currently `20261101000000_signup_options.sql:323-339`).

- [ ] **Step 5: Extend `reg()` in `tests/db-harness.ts` to select `lesson_queued_at` and `queued_at`**

Add both to its column list and return type (`Date | null` each) — `queued_at` isn't selected today and Task 2's carry-forward test needs to read it directly.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/signup-options.test.ts`
Expected: PASS (all of `describe("instructional limit", ...)`, plus no regressions elsewhere in the file).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20261211000000_lesson_wait_partial_grant.sql tests/signup-options.test.ts tests/db-harness.ts
git commit -m "feat: a Full sign-up takes an open drop-in spot even when only the lesson is full"
```

---

### Task 2: Option-switch partial grant

**Files:**
- Modify: `supabase/migrations/20261211000000_lesson_wait_partial_grant.sql` (append)
- Test: `tests/signup-options.test.ts`

**Interfaces:**
- Consumes: `_dropin_fits`, `_lesson_fits` from Task 1.

- [ ] **Step 1: Write the failing tests**

Update the existing test `"switching to Instructional + Drop-in when the lesson is full joins the waitlist"` (currently expects `b`'s status `"waitlisted"` after switching `dropin → full`): the scenario already sets `dropin_price_cents = 800` and `capacity: 5` (plenty of drop-in room), so under the new behavior `b` keeps its drop-in spot. Rename the test and change its body:

```ts
it("switching Drop-in to Instructional + Drop-in when the lesson is full keeps the drop-in spot and waits on the lesson", async () => {
  const sid = await createSession(db, { capacity: 5, instructionalPriceCents: 1000 });
  await setSession(sid, `instructional_capacity = 1, dropin_price_cents = 800`);
  const [a, b] = await users(2);
  await signUp(a, sid, "instructional");
  await signUp(b, sid, "dropin");
  await asUser(db, b, `select public.change_registration_option($1, 'full')`, [(await reg(b, sid)).id]);
  expect(await reg(b, sid)).toMatchObject({ status: "pending_payment", option: "full" });
  expect((await reg(b, sid)).lesson_queued_at).not.toBeNull();
});
```

Add a new test for the carry-forward case itself (switching from a waitlisted `instructional` row, which already has a `queued_at`, into `full`) — scoped to what Task 2 alone can prove, without relying on `_promote`'s merged-queue ordering, which doesn't exist until Task 3:

```ts
it("switching a waitlisted Instructional sign-up to Full carries its lesson-queue place forward, not now()", async () => {
  const sid = await createSession(db, { capacity: 10, instructionalPriceCents: 1000 });
  await setSession(sid, `instructional_capacity = 1, dropin_price_cents = 800`);
  const [a, b] = await users(2);
  await signUp(a, sid, "instructional"); // takes the lesson place
  await signUp(b, sid, "instructional"); // waitlisted
  const beforeQueuedAt = (await reg(b, sid)).queued_at;
  await asUser(db, b, `select public.change_registration_option($1, 'full')`, [(await reg(b, sid)).id]);
  const after = await reg(b, sid);
  expect(after).toMatchObject({ status: "pending_payment", option: "full" });
  expect(after.lesson_queued_at?.getTime()).toBe(beforeQueuedAt?.getTime());
});
```

(This needs `queued_at` added to `reg()`'s select list too — see Task 1 Step 5, extend it there alongside `lesson_queued_at` rather than adding a second helper change here.)

Don't test the "who gets the freed lesson place after this switch" fairness question here — that needs `_promote`'s merged-queue ordering, which Task 3 adds; a premature version of that test here would run against the *old* single-loop `_promote` (which only scans `status = 'waitlisted'` rows, so it would never even see `b` once `b` is `pending_payment`) and assert the wrong winner. Task 3 adds that test once the mechanism it depends on exists.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/signup-options.test.ts -t "switching"`
Expected: FAIL.

- [ ] **Step 3: Rewrite `change_registration_option`'s grant branch**

Current body: `supabase/migrations/20261210000000_lesson_cap_counts_full.sql:162-234` (the version that dropped the old same-queue fast path — this is the one to extend, not the older body in `20261101000000_signup_options.sql:359-434`). `create or replace` it in the new migration with the same structure, replacing:

```sql
if public._fits(s, p_option, r.id) then
  ... (grant)
elsif r.status = 'waitlisted' then
  ... (stays waitlisted, just changes option/amount)
else
  ... (becomes waitlisted)
end if;
```

with the same three-way split as Task 1's `register_for_session` change (don't collapse it into a single combined condition — see the note below on exactly why), parameterized by the *existing* row `r` instead of a fresh insert:
- `v_dropin_ok := public._dropin_fits(s, r.id)`; `v_lesson_ok := public._lesson_fits(s, r.id)`.
- `v_lesson_queued_at` for the new row: `null` if the option doesn't need a lesson (`dropin`) or it just got one (`v_lesson_ok` true for `instructional`/`full`); otherwise `coalesce(r.lesson_queued_at, case when r.option = 'instructional' and r.status = 'waitlisted' then r.queued_at else now() end)` — carries the row's own prior lesson-wait start (if it had one) or its original `queued_at` if it was already an instructional waiter, never resetting to `now()` in that case.
- Grant branch taken when: `p_option in ('dropin','instructional')` and the single relevant resource fits, **or** `p_option = 'full'` and `v_dropin_ok` and (`v_lesson_ok` **or** `s.dropin_price_cents is not null`). The `or` matters: a true full grant (`v_dropin_ok and v_lesson_ok`) must always be taken regardless of `dropin_price_cents` — that precondition only gates the *partial* case (`v_dropin_ok` and not `v_lesson_ok`). Writing the condition as just `v_dropin_ok and s.dropin_price_cents is not null` (dropping the `v_lesson_ok or`) would wrongly force an atomic-only session's switch to waitlist even when both resources already fit — the same class of bug Task 1's implementer found and fixed in `register_for_session` (see that task's report): the `dropin_price_cents` precondition belongs on the partial branch only, never on the full-grant branch.
- Set `lesson_queued_at = v_lesson_queued_at` in both the grant branch's `update` and the two non-grant branches' `update`s.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/signup-options.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261211000000_lesson_wait_partial_grant.sql tests/signup-options.test.ts
git commit -m "feat: switching to Instructional + Drop-in can also take a partial grant"
```

---

### Task 3: Promotion — two FIFO passes

**Files:**
- Modify: `supabase/migrations/20261211000000_lesson_wait_partial_grant.sql` (append)
- Test: `tests/signup-options.test.ts`

**Interfaces:**
- Consumes: `_dropin_fits`, `_lesson_fits`, `_instructional_used` from Task 1.

- [ ] **Step 1: Write the failing tests**

Rename and rewrite `"a waiter stuck on the lesson cap doesn't block a drop-in only waiter from a free drop-in spot"` to match the confirmed fairness rule (FIFO on the drop-in resource wins regardless of lesson status):

```ts
it("a freed drop-in spot goes to the longest-waiting drop-in waiter, even if they're still stuck on the lesson", async () => {
  const sid = await createSession(db, { capacity: 1, instructionalPriceCents: 1000 });
  await setSession(sid, `instructional_capacity = 1, dropin_price_cents = 800`);
  const [a, b, c, d] = await users(4);
  await signUp(a, sid, "dropin");
  await signUp(b, sid, "instructional");
  await signUp(c, sid, "full"); // behind on both, but asks before d
  await signUp(d, sid, "dropin");
  expect((await reg(c, sid)).status).toBe("waitlisted");
  expect((await reg(d, sid)).status).toBe("waitlisted");

  await asUser(db, a, `select public.cancel_registration($1)`, [(await reg(a, sid)).id]);
  expect(await reg(c, sid)).toMatchObject({ status: "pending_payment", option: "full" }); // c, not d: waited longer for drop-in
  expect((await reg(c, sid)).lesson_queued_at).not.toBeNull(); // still stuck on the lesson
  expect((await reg(d, sid)).status).toBe("waitlisted");
});
```

(This test also doubles as the regression test for a window the task-reviewer flagged on Task 1's diff: before this task's `_promote` rewrite exists, a later-arriving sign-up could jump an earlier fully-waitlisted `full` row for a freed drop-in spot, since `register_for_session`'s new predicates drop `_has_room`'s old anti-jump guard and nothing yet replaces it. This test proves that window is closed once this task's dropin-FIFO pass lands — no separate test needed for it.)

Add a test for a fully-waitlisted `full` row promoted into a **true full grant** (both resources free at the same moment) — the task-reviewer flagged that Task 1's diff alone leaves a stale `lesson_queued_at` in exactly this case, since the pre-Task-3 `_promote` never clears it, which is a real (if intentional, plan-sequenced) overbooking window this task's rewrite is what actually closes:

```ts
it("promoting a fully-waitlisted Full row into a full grant clears its lesson clock", async () => {
  const sid = await createSession(db, { capacity: 1, instructionalPriceCents: 1000 });
  await setSession(sid, `instructional_capacity = 1, dropin_price_cents = 800`);
  const [a, c] = await users(2);
  await signUp(a, sid, "full"); // holds both the drop-in spot and the lesson place
  await signUp(c, sid, "full"); // fully waitlisted: blocked on both
  await asUser(db, a, `select public.cancel_registration($1)`, [(await reg(a, sid)).id]);
  expect(await reg(c, sid)).toMatchObject({ status: "pending_payment", option: "full" });
  expect((await reg(c, sid)).lesson_queued_at).toBeNull(); // both resources freed together: a full grant, not partial
});
```

Add a test for the lesson pass correctly skipping a `full` row that doesn't yet hold its drop-in spot (Review Focus item: no double-promotion):

```ts
it("the lesson pass only considers Full rows that already hold their drop-in spot", async () => {
  const sid = await createSession(db, { capacity: 1, instructionalPriceCents: 1000 });
  await setSession(sid, `instructional_capacity = 1, dropin_price_cents = 800`);
  const [a, b, c] = await users(3);
  await signUp(a, sid, "dropin"); // holds the one drop-in spot
  await signUp(b, sid, "instructional"); // holds the one lesson place
  await signUp(c, sid, "full"); // fully waitlisted: blocked on both
  const res = await asUser<{ events: Event[] }>(db, b, `select public.cancel_registration($1) as events`, [(await reg(b, sid)).id]);
  // b's cancellation frees the lesson place only (b never held a drop-in spot); c still can't use it without a drop-in spot too.
  expect(res.rows[0].events).toEqual([]);
  expect((await reg(c, sid)).status).toBe("waitlisted");
});
```

Add the fairness test deferred from Task 2 (it needs this task's merged-queue ordering in `_promote`'s lesson pass to be meaningful — see the note in Task 2's test section for why it couldn't live there):

```ts
it("a freed lesson place respects a partial grant's original wait, from before it switched into Full", async () => {
  const sid = await createSession(db, { capacity: 10, instructionalPriceCents: 1000 });
  await setSession(sid, `instructional_capacity = 1, dropin_price_cents = 800`);
  const [a, b, c] = await users(3);
  await signUp(a, sid, "instructional"); // takes the lesson place
  await signUp(b, sid, "instructional"); // waitlisted first
  await signUp(c, sid, "instructional"); // waitlisted second
  await asUser(db, b, `select public.change_registration_option($1, 'full')`, [(await reg(b, sid)).id]);

  await asUser(db, a, `select public.cancel_registration($1)`, [(await reg(a, sid)).id]);
  expect(await reg(b, sid)).toMatchObject({ status: "pending_payment", option: "full" });
  expect((await reg(b, sid)).lesson_queued_at).toBeNull(); // b, not c, gets the freed lesson place: b was waiting first
  expect((await reg(c, sid)).status).toBe("waitlisted");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/signup-options.test.ts -t "freed drop-in spot\|lesson pass only\|respects a partial grant"`
Expected: FAIL.

- [ ] **Step 3: Rewrite `_promote` as two passes**

Current body: `supabase/migrations/20261210000000_lesson_cap_counts_full.sql:52-99`. `create or replace` it, replacing the single loop with two, each keeping the existing per-row confirm/pending/brought-by logic (lines 74-95 of the current body) unchanged in shape:

- **Pass 1 (drop-in):** `select w.* from registrations w where w.session_id = s.id and w.status = 'waitlisted' and w.option in ('full','dropin') and public._dropin_fits(s, w.id) and (w.option = 'dropin' or s.dropin_price_cents is not null or public._lesson_fits(s, w.id)) order by w.queued_at, w.created_at limit 1 for update` — loop until none found. The trailing `and (...)` clause matters only for a `full` row: on a session with no standalone drop-in price (`dropin_price_cents is null`), it must stay fully atomic even at promotion time (same reasoning as `register_for_session`'s "otherwise" branch — see Task 1's implementation report for the overbooking bug this guards against), so such a row is only a Pass 1 candidate once **both** resources genuinely fit, same as today's single-loop `_fits`; on a session that does offer a drop-in price, a `full` row is a candidate on drop-in room alone, same as a plain `dropin` row. For each found row: if `w.option = 'full'` and `not public._lesson_fits(s, w.id)` (only reachable when `dropin_price_cents is not null`, per the guard above), this is a **partial** grant — same confirm/pending status update as today, but `lesson_queued_at` is left untouched (it's already set from whenever the row first signed up or switched). Otherwise it's a **full** grant — same as today, and additionally set `lesson_queued_at = null`.
- **Pass 2 (lesson):** `select w.* from registrations w where w.session_id = s.id and ((w.option = 'full' and w.status in ('pending_payment','confirmed') and w.lesson_queued_at is not null) or (w.option = 'instructional' and w.status = 'waitlisted')) and public._lesson_fits(s, w.id) order by coalesce(w.lesson_queued_at, w.queued_at) limit 1 for update` — loop until none found. (Note the `lesson_queued_at is not null` check is scoped to the `full` branch only — a plain `instructional`-waitlisted row never has `lesson_queued_at` set and must still be found by its own branch; don't AND that check across both, and order by `coalesce(w.lesson_queued_at, w.queued_at)` so each row sorts by whichever clock it actually uses.) For an `instructional` row: same confirm/pending logic as today's single loop. For a `full` row: it already holds its drop-in spot — just `update ... set lesson_queued_at = null`, and still emit a `'confirmed'` event (the player gets the email that tells them their lesson place opened up; reusing today's email path for a `'confirmed'` event is enough — exact copy for that email is left to the builder if it needs to read differently for this case).

Exit conditions (`now() >= s.starts_at`, `s.status <> 'scheduled'`) stay as a single check before both passes, same as today.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/signup-options.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261211000000_lesson_wait_partial_grant.sql tests/signup-options.test.ts
git commit -m "feat: promote drop-in and lesson queues independently"
```

---

### Task 4: Demotion — partial, unpaid only

**Files:**
- Modify: `supabase/migrations/20261211000000_lesson_wait_partial_grant.sql` (append)
- Test: `tests/signup-options.test.ts`

**Interfaces:**
- Consumes: `_instructional_used` from Task 1.

- [ ] **Step 1: Write the failing tests**

Add both inside the existing `describe("lowering a limit", ...)` block (`tests/signup-options.test.ts`) — it already has the `promote()` helper these call, in scope by closure; don't redefine it.

```ts
it("lowering the lesson cap demotes an unpaid Full row to drop-in-only, waiting on the lesson", async () => {
  const sid = await createSession(db, { capacity: 10, instructionalPriceCents: 1000 });
  const host = await createUser(db, "Host", { admin: true });
  await setSession(sid, `dropin_price_cents = 800`);
  const [a, b] = await users(2);
  await signUp(a, sid, "instructional");
  await signUp(b, sid, "full");
  await db.query(`update public.sessions set instructional_capacity = 1 where id = $1`, [sid]);

  await asUser(db, host, `select public.admin_promote($1)`, [sid]);
  expect(await reg(b, sid)).toMatchObject({ status: "pending_payment", option: "full" }); // keeps the drop-in spot
  expect((await reg(b, sid)).lesson_queued_at).not.toBeNull(); // but loses the lesson place
});

it("never claws back a lesson place from a paid Full row", async () => {
  const sid = await createSession(db, { capacity: 10, instructionalPriceCents: 1000 });
  const host = await createUser(db, "Host", { admin: true });
  await setSession(sid, `dropin_price_cents = 800`);
  const [a, b] = await users(2);
  await signUp(a, sid, "instructional");
  await signUp(b, sid, "full");
  await asUser(db, host, `select public.admin_mark_paid($1)`, [(await reg(b, sid)).id]);
  await db.query(`update public.sessions set instructional_capacity = 1 where id = $1`, [sid]);

  await asUser(db, host, `select public.admin_promote($1)`, [sid]);
  expect(await reg(b, sid)).toMatchObject({ status: "confirmed", option: "full" });
  expect((await reg(b, sid)).lesson_queued_at).toBeNull();
});
```

(`admin_promote` is confirmed as the existing `"lowering a limit"` describe block's `promote()` helper target — reuse that helper, don't redefine it.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/signup-options.test.ts -t "demotes an unpaid Full\|claws back"`
Expected: FAIL.

- [ ] **Step 3: Extend `_bump_overflow`'s lesson pass to allow a partial demotion**

Current body: `supabase/migrations/20261210000000_lesson_cap_counts_full.sql:104-158`. `create or replace` it. The existing structure already loops twice (`foreach v_lesson in array[false, true]`) and, for the lesson pass (`v_lesson = true`), picks the newest unpaid `pending_payment` row with `option = any (array['full','instructional'])`, ordered to send the right one back. **Add `and lesson_queued_at is null` to that selection** — an already-partial `full` row (one that's already lost its lesson place to an earlier demotion or never had one from a partial grant) doesn't hold a lesson place to give up, so picking it again would reset its wait clock to `now()` for nothing (violating the Global Constraint that `lesson_queued_at` never resets) without actually freeing any lesson capacity, silently skipping past the real holder the exit condition is waiting to find. Keep everything else about the selection unchanged; change what happens to the chosen row when it's `full` **and `s.dropin_price_cents is not null`**: instead of always setting `status = 'waitlisted'`, set `lesson_queued_at = now()` and leave `status`/drop-in fields untouched (the row keeps its drop-in spot). A `full` row on a session with no drop-in price (`dropin_price_cents is null`) still becomes fully `waitlisted` exactly as today — same reasoning as the `dropin_price_cents` guard in Task 1's `register_for_session` fix and Task 3's Pass 1 (see Task 1's implementation report): that session type has no partial state to demote into at all. An `instructional` row (which has no drop-in spot to keep, regardless of `dropin_price_cents`) also still becomes fully `waitlisted` as today. Emit the same `'waitlisted'` event either way (today's event shape doesn't distinguish full-vs-partial waitlisting elsewhere either, e.g. Task 1's sign-up path reuses `'waitlisted'` for a fully-blocked `full` row) — reusing it here for a demotion-into-partial-state keeps one event name per transition type, simplest for the email template to key off of; if that reads wrong once written, a distinct event name is a one-line change, not a design question.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/signup-options.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261211000000_lesson_wait_partial_grant.sql tests/signup-options.test.ts
git commit -m "feat: lowering the lesson cap only demotes unpaid Full rows to drop-in-only"
```

---

### Task 5: Reporting — counts and waitlist position

**Files:**
- Modify: `supabase/migrations/20261211000000_lesson_wait_partial_grant.sql` (append)
- Test: `tests/signup-options.test.ts`

**Interfaces:**
- Consumes: nothing new; reads `lesson_queued_at` directly.
- Produces: `get_session_counts`'s `instructional_waitlisted` and `lesson` columns now also reflect partial `full` rows; `get_session_attendees`'s `waitlist_position` now covers them too (host-roster-facing only — see Global Constraints).

- [ ] **Step 1: Write the failing tests**

```ts
it("instructional_waitlisted counts a partially-granted Full row too", async () => {
  const sid = await createSession(db, { capacity: 10, instructionalPriceCents: 1000 });
  await setSession(sid, `instructional_capacity = 1, dropin_price_cents = 800`);
  const [a, c] = await users(2);
  await signUp(a, sid, "instructional");
  await signUp(c, sid, "full");
  const counts = await db.query(`select * from public.get_session_counts(array[$1::uuid])`, [sid]);
  expect(counts.rows[0]).toMatchObject({ lesson: 1, instructional_waitlisted: 1 });
});

it("waitlist position covers the merged lesson queue", async () => {
  const sid = await createSession(db, { capacity: 10, instructionalPriceCents: 1000 });
  await setSession(sid, `instructional_capacity = 1, dropin_price_cents = 800`);
  const [a, b, c] = await users(3);
  await signUp(a, sid, "instructional");
  await signUp(b, sid, "full"); // partial grant, waits on lesson, asks before c
  await signUp(c, sid, "instructional"); // fully waitlisted
  const rows = await asUser<{ registration_id: string; waitlist_position: number | null }>(
    db,
    a,
    `select registration_id, waitlist_position from public.get_session_attendees($1)`,
    [sid],
  );
  const byId = (id: string) => rows.rows.find((r) => r.registration_id === id)?.waitlist_position;
  expect(byId((await reg(b, sid)).id)).toBe(1);
  expect(byId((await reg(c, sid)).id)).toBe(2);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/signup-options.test.ts -t "instructional_waitlisted counts\|merged lesson queue"`
Expected: FAIL.

- [ ] **Step 3: Update `get_session_counts`**

Current body: by this point, Task 1's own `create or replace` (not the original `20261210000000_lesson_cap_counts_full.sql:237-256`) — build on that version, which already excludes `lesson_queued_at is not null` rows from the `lesson` column; restate that filter unchanged. Change the `instructional_waitlisted` column expression from `count(...) filter (where r.option = 'instructional' and r.status = 'waitlisted')` to also include `r.lesson_queued_at is not null and r.option = 'full'` (i.e. `where (r.option = 'instructional' and r.status = 'waitlisted') or (r.option = 'full' and r.lesson_queued_at is not null)`). Don't touch `lesson` here — Task 1 already fixed it; this step only adds the `instructional_waitlisted` change.

- [ ] **Step 4: Update `get_session_attendees`'s `waitlist_position`**

Current body: `supabase/migrations/20261101000000_signup_options.sql:835-869`. `create or replace` it. The existing `waitlist_position` expression (`case when r.status = 'waitlisted' then row_number() over (partition by r.status, r.option = 'instructional' order by r.queued_at, r.created_at) end`) covers the two drop-in-side queues (`full`/`dropin`-waitlisted, and `instructional`-waitlisted) — leave that `when` branch exactly as-is. Add a second `when` branch for the merged lesson queue, keyed on a single boolean so both kinds of lesson-queue row share one numbering sequence instead of two separate ones:

```sql
when (r.option = 'instructional' and r.status = 'waitlisted') or (r.option = 'full' and r.lesson_queued_at is not null)
  then row_number() over (
         partition by ((r.option = 'instructional' and r.status = 'waitlisted') or (r.option = 'full' and r.lesson_queued_at is not null))
         order by coalesce(r.lesson_queued_at, r.queued_at)
       )
```

Put this branch **after** the existing drop-in-side `when` in the `case`, so a `full`-waitlisted row (which matches the first branch, drop-in side) isn't also claimed by this one — `case` takes the first matching branch, and a fully-waitlisted `full` row's drop-in-queue position is still what matters most to show. The partition key must be the exact same boolean expression in both the `when` and the `partition by` (not `r.lesson_queued_at is not null` alone) — that boolean is what merges the two row shapes into one shared sequence; partitioning on `lesson_queued_at is not null` alone would wrongly split them into two separately-numbered groups.

Also note (non-goal, don't implement): `admin_move_waitlist` (`supabase/migrations/20261101000000_signup_options.sql:872-908`) only reorders rows with `status = 'waitlisted'`, so it silently no-ops on a partial `full` row (it isn't `status = 'waitlisted'`) — hosts can't manually reorder the lesson queue's partial entries. That's an acceptable, pre-existing-shaped limitation per the design doc's out-of-scope list, not a regression to fix here.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/signup-options.test.ts`
Expected: PASS — full suite, no regressions.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261211000000_lesson_wait_partial_grant.sql tests/signup-options.test.ts
git commit -m "feat: counts and waitlist position cover the merged lesson queue"
```

---

### Task 6: Session-end refund for a never-promoted lesson wait

**Files:**
- Modify: `supabase/migrations/20261211000000_lesson_wait_partial_grant.sql` (append)
- Test: `tests/signup-options.test.ts`

**Interfaces:**
- Consumes: nothing new.

- [ ] **Step 1: Write the failing test**

```ts
it("refunds the instructional portion if the lesson place never opens up", async () => {
  const sid = await createSession(db, { capacity: 10, priceCents: 1500, instructionalPriceCents: 1000 });
  await setSession(sid, `instructional_capacity = 1, dropin_price_cents = 800`);
  const host = await createUser(db, "Host", { admin: true });
  const [a, c] = await users(2);
  await signUp(a, sid, "instructional");
  await signUp(c, sid, "full");
  await asUser(db, host, `select public.admin_mark_paid($1)`, [(await reg(c, sid)).id]);
  await db.query(`update public.sessions set ends_at = now() - interval '1 hour' where id = $1`, [sid]);

  await asService(db, `select public.run_tick()`);
  expect(await reg(c, sid)).toMatchObject({ status: "confirmed", amount_cents: 800, refund_owed: true });
});
```

(Extend `reg()`'s select list again, this time with `refund_owed`, if it isn't already selected — check Task 1's Step 5 change.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/signup-options.test.ts -t "refunds the instructional portion"`
Expected: FAIL.

- [ ] **Step 3: Add a new step to `run_tick`**

Current body: `supabase/migrations/20261113000000_stats.sql:150-...` (latest definition; it's further patched in place by `20261118000000_audit_fixes.sql` for the heartbeat and by `20261122000000_rate_limits.sql` — read the live function via `pg_get_functiondef('public.run_tick()'::regprocedure)` in a scratch query against the dev DB, or build this step the same patch-in-place way those two migrations do, anchoring on a string that's unique in the function, e.g. the deposit-release step's closing `end loop;` right after it (step 4, `supabase/migrations/20261113000000_stats.sql:206-217`), so this works regardless of exactly what the two later patches inserted elsewhere in the function).

New step, modeled directly on the existing deposit-release step 4 (same `for v_sid in update ... returning id loop` shape, so it only ever runs once per session):

```sql
-- X. Full sign-ups still waiting on a lesson place once the session is over:
--    refund the instructional portion — they only used the drop-in spot.
for v_sid in
  update public.sessions
     set <some per-session "lesson refunds done" marker — or just select distinct session ids below;
       no new session column needed if the update below is naturally idempotent (see note)>
   where ends_at < now()
  returning id
loop
  update public.registrations
     set amount_cents = s.dropin_price_cents,
         refund_owed = (paid_cents > s.dropin_price_cents)
    from public.sessions s
   where registrations.session_id = v_sid and s.id = v_sid
     and registrations.lesson_queued_at is not null
     and registrations.status = 'confirmed';
end loop;
```

This step is naturally idempotent without a new "done" marker column: once it runs, the matching rows have `lesson_queued_at` cleared below — add `, lesson_queued_at = null` to the `set` list so a second run of `run_tick` for the same ended session finds no matching rows and does nothing. (Don't reuse the existing `deposits_released_at`-style per-session marker column pattern here; it isn't needed once the row-level `lesson_queued_at is not null` condition is itself the "not done yet" marker.) Iterate ended sessions the same way the deposit step does (`where ... ends_at < now()`), but without a `deposits_released_at`-equivalent column to filter re-runs at the session level — the row-level condition already makes it a no-op the second time, so a plain `select distinct session_id from registrations where lesson_queued_at is not null and status = 'confirmed' and session_id in (select id from sessions where ends_at < now())` loop (or an equivalent single `update ... from sessions` without the outer loop at all, since nothing else in this step needs a per-session action) is simpler than copying the deposit step's shape — use whichever reads more simply; the loop in the sketch above is illustrative, not prescriptive.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/signup-options.test.ts`
Expected: PASS — full suite.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261211000000_lesson_wait_partial_grant.sql tests/signup-options.test.ts
git commit -m "feat: refund the instructional portion when a lesson place never opens up"
```

---

### Task 7: Apply the migration to dev

**Files:** none (operational step).

- [ ] **Step 1: Run the full test suite one more time**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit && npx eslint src`
Expected: no errors (this task's changes are SQL-only so far; this is a sanity check before the next tasks touch `src/`).

- [ ] **Step 3: Apply the migration to the dev Supabase project**

Per the project's workflow and the user's standing preference (`supabase-connector-migrations` memory): apply via the Supabase connector's `execute_sql` + a migration-history row, not `supabase db push` (which fails over IPv6) and not the MCP `apply_migration` tool (which stamps its own version numbers, putting dev/prod/repo histories out of step). Verify live on dev afterward (e.g. `select lesson_queued_at from registrations limit 1` succeeds).

- [ ] **Step 4: Run `npm run db:functions`**

Regenerates the function-location map the repo keeps for `supabase/README.md`.

- [ ] **Step 5: Commit**

```bash
git add supabase/README.md  # or wherever db:functions writes its output — check its diff
git commit -m "chore: update function map after lesson-wait migration"
```

(Skip this commit if `db:functions` produces no diff.)

---

### Task 8: Frontend — options.ts split + player-facing copy

**Files:**
- Modify: `src/lib/options.ts`
- Modify: `src/app/s/[id]/page.tsx`
- Test: none (no existing test file covers `src/lib/options.ts` directly — if adding one, it's a plain Vitest unit test, not a DB test; skip unless the executor judges it cheap, since this plan doesn't require one to prove the behavior change, which is covered by the SQL tests above mirroring the same logic)

**Interfaces:**
- Consumes: `SessionCounts.instructional_waitlisted`/`.lesson` (already updated by Task 5) via the existing `optionFull(session, option, counts)` signature — unchanged.
- Produces: `optionFull` gains a third return shape (see Step 1) that `MySpot` consumes.

- [ ] **Step 1: Change `optionFull`'s `full` case**

Current body (`src/lib/options.ts`):
```ts
export function optionFull(session: Session, option: SignupOption, counts?: SessionCounts) {
  const dropInFull = (counts?.confirmed ?? 0) + (counts?.holding ?? 0) >= session.capacity;
  if (option === "instructional") return lessonFull(session, counts);
  if (option === "dropin") return dropInFull;
  return dropInFull || lessonFull(session, counts);
}
```
This boolean can no longer tell "fully waitlisted" apart from "partial grant, drop-in now + lesson later" for `full`. Change its return type for the `full` case to `"full" | "partial" | "ok"` (keep `dropin`/`instructional` returning the existing `boolean`, or change the whole function's return type to a union and update call sites — the one existing call site is `MySpot`'s `fullFor`, below): `dropInFull` → `"full"` (drop-in itself has no room, matches today's "if drop-in itself is full, nothing changes" rule — there's no partial case for a session with no `dropin_price_cents` either, since `session.dropin_price_cents == null` also means no partial grant; check for that too) → `lessonFull(session, counts) && session.dropin_price_cents != null` → `"partial"`; otherwise `"ok"`.

- [ ] **Step 2: Update `MySpot`'s `optionDetail.full` and the "Drop-in is full" banner**

`src/app/s/[id]/page.tsx:274-287` (`fullFor`/`optionDetail`). Change the `full` entry's third line from `fullFor("full") ? "joins the waitlist" : null` to a three-way message matching the new return: `"full"` → `"joins the waitlist"` (unchanged copy); `"partial"` → something like `"takes a drop-in spot now; lesson place pending"`; `"ok"` → `null` (unchanged).

- [ ] **Step 3: Add the signed-up player's "waiting on lesson" flag**

Find the branch of `MySpot` that renders when `reg` is not null (the player has already signed up — not shown in the excerpt already read; read `src/app/s/[id]/page.tsx` around where `reg.status`/`reg.option` drive the signed-up view to find the right spot). Add a plain-text flag (no live number, per Global Constraints) shown when `reg.option === 'full'` and the row's `lesson_queued_at` is non-null — this requires `getMySpot`/the query backing `reg` to also select `lesson_queued_at`; find that query (likely in `src/lib/registrations.ts`, alongside `getMySpot`) and extend its select list the same way Task 1 extended the test harness's.

- [ ] **Step 4: Manual check**

Per `CLAUDE.md`'s "Gotchas" section, this repo doesn't rely on the dev server's live-reload for style changes, and this task has no UI-test harness — build and preview: `npx next build` and check `/s/[id]` for a session with the lesson full and drop-in open, as both a fresh visitor (unsigned-up copy) and a signed-up player (flag). Use a throwaway `src/app/zz-*/page.tsx` with fake data if a real session in that exact state isn't available on dev.

- [ ] **Step 5: Commit**

```bash
git add src/lib/options.ts "src/app/s/[id]/page.tsx" src/lib/registrations.ts
git commit -m "feat: player-facing copy for a partial Full grant"
```

---

### Task 9: Frontend — host roster tag

**Files:**
- Modify: `src/app/admin/sessions/[id]/page.tsx`

**Interfaces:**
- Consumes: `lesson_queued_at` on each roster row (the roster query will need to select it — find where it currently selects registration columns for the roster list and extend it).

- [ ] **Step 1: Add the "Instructional: waiting" tag**

Next to a roster row where `option === 'full'` and `lesson_queued_at` is non-null, add a small tag matching the existing `Mark`/`StatusMark` component conventions used elsewhere on this page (see `addFull`'s usage and the scoreboard rendering already on this page for the house style — no new component needed, reuse `Mark`).

- [ ] **Step 2: Manual check**

Same build-and-preview approach as Task 8, viewed as a host on the roster page for a session in the partial-grant state.

- [ ] **Step 3: Commit**

```bash
git add "src/app/admin/sessions/[id]/page.tsx"
git commit -m "feat: host roster shows who's waiting on a lesson place"
```
