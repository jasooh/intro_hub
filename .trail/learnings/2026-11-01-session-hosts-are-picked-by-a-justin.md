---
title: "Session hosts are picked by a host on the session form, and hosting counts as a session played"
author: Justin
date: 2026-11-01
branch: dev
cost: { minutes: 6, tokens: 67027 }
id: l-31b3fc86
scope: repo
status: active
src: agent
touches:
  - src/app/admin/actions.ts
  - "src/app/admin/sessions/[id]/page.tsx"
  - src/app/admin/sessions/new/page.tsx
  - src/app/admin/sessions/session-form.tsx
  - "src/app/s/[id]/page.tsx"
  - src/components/hosted-by.tsx
  - src/lib/public-data.ts
  - src/lib/queries.ts
  - src/lib/types.ts
  - supabase/migrations/20261129000000_session_hosts.sql
---

## Decided
- A host picks who hosts each session with checkboxes on the session form (one or more hosts, hosts only). The player session page then shows "Hosted by" with their photos.
- A hosted session that has run counts as one session played for the host, once even if they also signed up for it. Cancelled sessions don't count.
- Players and visitors only ever see a host's name and photo, never the rest of the profile.
- In the code: table `session_hosts`, functions `admin_set_session_hosts` and `get_session_hosts` (migration `20261129000000_session_hosts.sql`); `getPlayerHistory` in `src/lib/queries.ts` adds hosted sessions to Played; `HostedBy` component; `getPublicSessionHosts` in `src/lib/public-data.ts`.

## Tried and ruled out
- A "I'm hosting" button hosts click themselves on the session page: dropped, because the host should be chosen up front on the session form so the page is right from the start.

## Watch out
- The stats page (new, returning, lapsed players) does not count hosting; that logic is repeated in several SQL functions and was left alone.
- Weekly templates have no default host, so auto-created sessions start with none.
- The migration must be applied to dev, then prod before merging to main.
