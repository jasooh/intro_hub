---
title: A cancelled e-Transfer only matches a payment from the same sender
author: Justin
date: 2026-11-02
branch: dev
cost: { minutes: 12, tokens: 98307 }
id: l-fd95f7fc
scope: repo
status: active
src: agent
touches:
  - supabase/migrations/20261202000000_cancellation_sender_must_match.sql
  - tests/payment-cancellations.test.ts
---

## Decided
A cancelled e-Transfer is matched to a payment by amount and the day it was sent. When the email names the sender, the payment must come from that same sender. The reference number and the VB- code in the message still match on their own, without a name check.

## Tried and ruled out
Using the sender name only to break ties between several matches. With one match left, it let one sender's cancellation reverse another sender's only payment of that amount that day. That cost a player their spot.

## Watch out
- In the code: `ingest_reverse_payment` in `supabase/migrations/20261202000000_cancellation_sender_must_match.sql`. Regression test in `tests/payment-cancellations.test.ts`.
- Applied to dev and prod on Nov 2. Migrations before this one are not edited.
- The fix does not undo a reversal that already happened. A host must restore the payment by hand, and the cancellation row still points at the wrong payment until they do.
