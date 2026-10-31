---
title: Changing the shared Google account password can silently stop payment matching
author: Justin
date: 2026-10-31
standing: true
id: l-5448015c
scope: repo
status: active
src: init-sessions
touches:
  - scripts/gmail-ingest.gs
  - "tests/db.test.ts#setup"
  - "tests/db.test.ts#setup~2"
---

## Watch out
- The Gmail script uses Google's own Apps Script authorization, and Google often revokes those grants after a password change. The five-minute job then fails without telling anyone and e-transfers stop auto-confirming.
- In the code: After a password change on the intro2hub account, open the script at script.google.com, run `setup` in `scripts/gmail-ingest.gs` to re-approve Gmail permissions and recreate the trigger, then check the Executions log.

_From past Claude sessions here, Oct 28._
