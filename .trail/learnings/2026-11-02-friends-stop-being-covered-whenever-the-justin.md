---
title: "Friends stop being covered whenever the payer loses their spot, not only when the payer cancels"
author: Justin
date: 2026-11-02
branch: dev
cost: { minutes: 21, tokens: 224860 }
id: l-75bce5fe
scope: repo
status: active
src: agent
touches:
  - supabase/README.md
  - src/app/admin/payments/page.tsx
  - src/app/admin/payments/payment-row.tsx
  - "src/app/admin/sessions/[id]/page.tsx"
  - src/lib/pay-for-friends.ts
  - tests/host-pages.test.ts
  - src/app/layout.tsx
  - "src/app/s/[id]/page.tsx"
  - src/components/covered-dialog.tsx
  - src/components/covered-notice.tsx
---

## Decided
- When a payer's sign-up leaves pending or confirmed for any reason (they cancel, their hold expires, or their e-Transfer is taken back), every friend still waiting to pay is un-covered and goes back to paying with their own code.
- This is done with a database trigger on the sign-up's status, so every path that changes status gets it.

## Tried and ruled out
- Clearing it only inside the cancel function (the original plan): a payer whose hold ran out, or whose payment was cancelled, would leave friends thinking someone else was paying until their own hold expired.

## Watch out
- A friend who was already confirmed through the payer keeps the link, so hosts and the friend still see "Paid by …".
- In the code: trigger registrations_release_covered → public._release_covered() in supabase/migrations/20261203000000_pay_for_friends.sql; the test is "the payer's hold running out un-covers their friends" in tests/pay-for-friends.test.ts.
