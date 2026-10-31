---
title: "Apply production migrations before pushing main, because main deploys production"
author: Justin
date: 2026-10-31
standing: true
id: l-7569269c
scope: repo
status: active
src: init-sessions
---

## Decided
- Pushing main triggers the Vercel production deploy, so code that expects new columns would break if the database is behind. The team applied all pending migrations in one all-or-nothing step and checked history first.
- In the code: Order: check prod's migration history against `supabase/migrations`, apply the pending ones in one transaction on prod, verify, then `git push origin dev:main`. Dev and prod histories must both match the repo.

_From past Claude sessions here, Oct 25._
