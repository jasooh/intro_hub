---
title: The host Instructional tile and the player page now show lesson places taken out of the limit
author: Justin
date: 2026-11-10
branch: worktree-lesson-cap-ui
cost: { minutes: 1, tokens: 16517 }
id: l-76413084
scope: repo
status: active
src: agent
touches:
  - "src/app/admin/sessions/[id]/page.tsx"
  - "src/app/s/[id]/page.tsx"
  - src/components/ui.tsx
  - src/app/admin/actions.ts
  - src/app/admin/sessions/session-form.tsx
  - src/app/admin/templates/template-form.tsx
  - src/app/admin/templates/template-row.tsx
  - src/app/faq/page.tsx
  - src/app/sitemap.ts
  - src/components/site-footer.tsx
---

## Decided
- Now that the limit covers everyone at the lesson (Instructional only plus Instructional + Drop-in), the host scoreboard tile reads taken/limit (e.g. 09/12), and the player session page has a "Lesson places" dots row with an open count. Both only appear when the session has a limit.
- This reverses the earlier choice to leave the limit off the host tile. That choice only made sense while the limit capped instructional-only sign-ups.
- The dots show taken places only, because the session counts do not split paid from awaiting payment.

## Watch out
- Waitlist positions shown to players still split instructional-only from everything else.

In the code: the tile is in `src/app/admin/sessions/[id]/page.tsx`; the dots row is in `src/app/s/[id]/page.tsx`; `SpotDots` in `src/components/ui.tsx` takes a `noun` for its hover text.
