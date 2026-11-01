---
title: Hosts are picked on every session and weekly schedule; a one-off defaults to its creator
author: Justin
date: 2026-11-01
branch: dev
cost: { minutes: 8, tokens: 288846 }
id: l-fc8b6b4f
scope: repo
status: active
replaces: l-31b3fc86
src: agent
touches:
  - src/app/admin/actions.ts
  - src/app/admin/sessions/new/page.tsx
  - src/app/admin/sessions/session-form.tsx
  - "src/app/admin/templates/[id]/page.tsx"
  - src/app/admin/templates/new/page.tsx
  - src/app/admin/templates/template-form.tsx
  - src/components/host-picker.tsx
  - src/lib/types.ts
  - supabase/migrations/20261130000003_template_hosts.sql
  - tests/template-hosts.test.ts
---

## Decided
- Every session and every weekly schedule has a "Hosted by" picker (hosts only, one or more). The player session page shows "Hosted by" with their photos.
- Sessions created from a weekly schedule start with that schedule's hosts. Changing the schedule later doesn't touch sessions that already exist; change those from the session's own page.
- A new one-off session pre-ticks whoever creates it. They can untick or add others.
- A hosted session that has run counts as one session played for the host, once even if they also signed up for it. Cancelled sessions don't count.
- Players and visitors only ever see a host's name and photo.
- In the code: table `session_hosts`; `session_templates.host_ids` (plain uuid array, no foreign key) copied into `session_hosts` by `create_sessions_from_templates`; shared `HostPicker` component; `getHostChoices` in `src/lib/queries.ts`; migrations `20261129000000_session_hosts.sql` and `20261130000003_template_hosts.sql`.

## Tried and ruled out
- An "I'm hosting" button hosts click themselves on the session page: dropped, the host is chosen up front on the form so the page is right from the start.
- A foreign key on `host_ids`: not possible on an array, and a second link to profiles is not worth it (see the learning on foreign keys from sign-ups to profiles).

## Watch out
- The stats page (new, returning, lapsed players) does not count hosting; that logic is repeated in several SQL functions and was left alone.
- Weekly sessions only inherit hosts when they are created. Existing sessions keep what they had.
- Migrations must go to dev, then prod, before `main` is merged.
