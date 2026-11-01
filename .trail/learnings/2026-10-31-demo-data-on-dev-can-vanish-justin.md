---
title: Demo data on dev can vanish and cached pages ignore direct database edits
author: Justin
date: 2026-10-31
standing: true
id: l-6e3cfd69
scope: repo
status: active
src: init-sessions
---

## Watch out
- A dev-tools Reset wiped the freshly seeded demo data, and seeding by direct SQL doesn't trigger the app's cache revalidation, so pages showed empty data.
- In the code: Demo seed and clean scripts are `supabase/setup/demo-seed.sql` and `demo-clean.sql`, dev project only, never prod. Re-run the seed after any dev-tools Reset and expect stale cached pages after raw SQL.

_From past Claude sessions here, Oct 19._
