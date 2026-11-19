---
title: "The host Instructional tile only gets its lesson count fixed, not a live wait indicator"
author: Justin
date: 2026-11-19
branch: worktree-we-need-to-address-enchanted-catmull
cost: { minutes: 1, tokens: 1446 }
id: l-0a18fa3e
scope: repo
status: active
src: agent
touches:
  - src/lib/options.ts
---

## Decided
- The host roster's Instructional scoreboard tile stops counting a Full sign-up that holds its drop-in spot but is still queued for a lesson place. The tile just shows the corrected number (e.g. 10/12 instead of 12/12), no added UI.

## Tried and ruled out
- A second number next to the tile (e.g. "10/12" plus "2 waiting on a lesson place"): dropped as redundant with the roster's existing per-row "waiting on a lesson place" mark.

## Watch out
- If a future change wants the wait count surfaced at the tile level too, aggregate the roster's existing per-row mark (`reg.option === "full" && reg.lesson_queued_at != null`, `src/app/admin/sessions/[id]/page.tsx`) rather than writing a new query.

In the code: `src/lib/options.ts` (`usesLessonPlace`), `src/app/admin/sessions/[id]/page.tsx` (`lessonCount`).
