@AGENTS.md

# Intro Hub

Sign-up site for **Intro 2 Volleyball**, a beginner-friendly drop-in at Aaniin Community Centre (Markham), run by a host who used to do everything with Google Forms. Instagram @intro2volleyball, contact intro2volleyball@gmail.com.

## What it does
- **Players** sign in with Google, fill in a one-time profile (name, phone, skill, waiver, media release…), then sign up for a session in one tap.
- **Options per sign-up:** *Instructional + Drop-in* (full price, uses a spot) or *Instructional only* (cheaper, **doesn't use a spot**, never waitlisted). Players can switch before paying.
- **Payment:** Interac e-Transfer with a ref code (`VB-XXXX`). A Gmail Apps Script (`scripts/gmail-ingest.gs`) posts notifications to `/api/payments/ingest`; `src/lib/matcher.ts` matches by ref code or name + exact amount owed.
- **Holds & waitlist:** a spot is held for N hours while unpaid; expired holds free the spot and the waitlist auto-promotes.
- **Hosts (`/admin`):** roster with a player-details modal, mark paid, waitlist order, teams (auto-balanced by skill, publish to players), payments inbox, refunds, players/roles, weekly schedule, songs (players' hype songs for the Spotify playlist), CSV export.

## Stack
Next.js 16 App Router (Cache Components + partial prefetching), React 19, Tailwind v4, shadcn (Radix), Supabase (Postgres, Google OAuth, Realtime, pg_cron), Vercel. Tests: Vitest + PGlite (runs every migration in-memory).

## Where logic lives
- **State changes are Postgres functions** in `supabase/migrations/*.sql` (`register_for_session`, `change_registration_option`, `cancel_registration`, `_promote`, `run_tick`, `admin_*`). Each locks the session row first, so sessions can't be overbooked. They return event lists that `src/lib/registrations.ts` turns into emails.
- RLS on every table; players see only their own rows; teams are readable only once `sessions.teams_published_at` is set.
- Every money path uses `registrations.amount_cents` (not the session price).
- Every-minute job: prod pg_cron calls `/api/cron/tick` (`supabase/setup/cron.sql`); dev runs `run_tick()` in-DB (`cron-dev.sql`).

## Workflow (important)
- **Work on the `dev` branch only.** Merge to `main` only when asked; `main` deploys production.
- Two Supabase projects: **dev** (`goomasgmwhafvkbmheex`: localhost + Vercel previews) and **prod** (`tbxicooonmntknjrrnzh`: live site). New migrations go in a new file, apply to dev immediately, and to prod **right before** merging to main.
- Checks before committing: `npx tsc --noEmit`, `npx eslint src`, `npx vitest run`. `npx next build` catches Cache Components errors (e.g. request data outside `<Suspense>`).
- Previewing signed-in/admin UI: put a throwaway `src/app/zz-*/page.tsx` with fake data, view it, delete it (then `npx next typegen` if tsc complains about stale route types).

## Gotchas
- **Tailwind reload bug:** in `next dev`, edits to `globals.css` and brand-new utility classes don't appear until the dev server is restarted with `.next` deleted. To check styles reliably, `npx next build` then preview with the `intro-hub-prod` launch config (port 3100).
- Request-time values (`Date.now()`, cookies, `usePathname()`) must be inside `<Suspense>` or after `await connection()`; `createClient()` in `src/lib/supabase/server.ts` already calls `connection()`.
- Page files can only export the page; put reusable/previewable pieces in components.
- `SubmitButton` (`src/components/submit-button.tsx`) takes `confirm` to show the shadcn confirmation modal; never use `window.confirm`.

## Frontend theme: "Gym-floor scoreboard"
Light only. A community-centre gym, not a SaaS template.

- **Palette** (`src/app/globals.css`, Tailwind tokens): `maple` #F2E3C6 background with faint plank lines + grain, `maple-deep`, `ink` #1B1612 text/rules, `ink-soft`, `line` #E8541E (the one sharp accent: CTAs, active, focus), `mat` #1E3A8A (waitlist / instructional / secondary), `board` #141210 + `led` #FF6A2B (scoreboard), `ok` / `warn` / `bad`.
- **Fonts:** `font-display` Big Shoulders (condensed caps headings, buttons, labels), `font-score` Doto (dot-matrix numbers: prices, counts, ref codes), `font-sans` Atkinson Hyperlegible Next (body).
- **Shared components (`src/components/ui.tsx`):**
  - `Sheet`: section label as a dark ink tab (orange square + maple caps) sitting on a heavy ink rule, instead of cards
  - `Mark` / `StatusMark`: a court-dot glyph + small caps, instead of pills
  - `SpotDots`: one dot per spot
  - `Scoreboard`: LED panel with an orange offset shadow
  - `PageTitle`: huge condensed heading ending in an orange "."
  - `buttonClass`: square, caps, hard ink shadow that presses in
  - `inputClass`: underline-only "scoresheet" inputs
  - `Notice`, `BackLink`, `EmptyState`, `reveal(i)` (staggered fade-up)
- **Lists are ruled rows** (`divide-y divide-ink/20`), with dates as a `DateBlock` (SAT / 17 / OCT).
- **Motion:** CSS only (`.reveal` stagger, scoreboard flicker, dot fill), disabled under `prefers-reduced-motion`.
- **Banned:** rounded card grids / three-card heroes, icons in tinted square containers, generic pill badges, purple gradients, Inter/Roboto/system fonts.
- **Dark (`board`/`ink`) + orange is for anchors:** section tabs, the admin nav bar (active tab = orange block), the scoreboard, the ref-code panel, the playlist panel and the footer band. Keep content areas light.
- The page header has an orange 3px "court line"; the footer is a dark band (orange top line) with About, Instagram + email. The account dropdown (avatar) holds Account / Admin (hosts) / Sign out.
