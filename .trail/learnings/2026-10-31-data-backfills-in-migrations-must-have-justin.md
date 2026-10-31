---
title: "Data backfills in migrations must have a WHERE clause, enforced by a repo rule"
author: Justin
date: 2026-10-31
standing: true
id: l-06cc00a8
scope: repo
status: active
src: init-sessions
touches:
  - "src/components/timing-preview.tsx#TimingPreview.update"
---

## Watch out
- A new migration's backfill update had no WHERE clause and failed the migration rules check. It was fixed in place because the migration had not been applied anywhere yet.
- In the code: Always add a WHERE condition on `update` statements in `supabase/migrations/*.sql`. The migration-rules test catches it; run the full vitest suite before applying.

_From past Claude sessions here, Oct 25._
