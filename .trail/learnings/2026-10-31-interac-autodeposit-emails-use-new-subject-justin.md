---
title: Interac autodeposit emails use new subject wording the payment script skipped
author: Justin
date: 2026-10-31
standing: true
id: l-160ddfdf
scope: repo
status: active
src: init-sessions
touches:
  - scripts/gmail-ingest.gs
  - tests/gmail-ingest.test.ts
---

## Watch out
- Real autodeposit emails now say the money was received and automatically deposited, which the old subject filter did not match, so such payments would be ignored silently. Separately, the intro2hub inbox was still getting no autodeposit notifications at all, which was unresolved.
- In the code: Subject filter is in `scripts/gmail-ingest.gs`, tested in `tests/gmail-ingest.test.ts` with a fabricated name and reference number. Never put real player names in repo tests. If emails don't arrive, check the host's autodeposit notification method (text vs email) with the bank.

_From past Claude sessions here, Oct 28._
