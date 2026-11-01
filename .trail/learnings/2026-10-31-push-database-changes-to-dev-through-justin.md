---
title: "Push database changes to dev through the Supabase connector, not the CLI"
author: Justin
date: 2026-10-31
standing: true
id: l-1bafd155
scope: repo
status: active
src: init-sessions
---

## Watch out
- The CLI push kept failing because the dev database host is IPv6-only and the network refuses it. Declaring the work done with the migration unapplied caused a runtime 'column not found' error on localhost.
- In the code: Don't rely on `supabase db push`. Use the Supabase connector `execute_sql` in one transaction, insert the row into the migration history under the repo's version, then reload the API schema cache (PostgREST) so new columns are visible. Verify the column on dev before saying it's done.

_From past Claude sessions here, Oct 25._
