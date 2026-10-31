---
title: "Avatars are generated in the database from a style and seed, not stored per player"
author: Justin
date: 2026-10-31
standing: true
id: l-86ffcce8
scope: repo
status: active
src: init-sessions
touches:
  - src/lib/avatars.ts
---

## Decided
- The DiceBear switch kept one avatar URL field that every list already renders, and made the database build it from two player-editable columns. That meant no roster, team or SQL function needed changing.
- In the code: Edit `avatar_style` and `avatar_seed` on `profiles`; a trigger derives `avatar_url` (served from `src/app/api/avatar`). Styles list is in `src/lib/avatars.ts`. Seeds are random, never the player's name, so nothing personal lands in URLs.

_From past Claude sessions here, Oct 25._
