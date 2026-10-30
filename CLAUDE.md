@AGENTS.md

# Intro Hub

Sign-up site for **Intro 2 Volleyball**, a beginner-friendly drop-in at Aaniin Community Centre (Markham), run by a host who used to do everything with Google Forms. Instagram @intro2volleyball, contact intro2volleyball@gmail.com.

## What it does
- **Players** sign in with Google, fill in a one-time profile (name, phone, skill, waiver, media release…), then sign up for a session in one tap. Their account area (`/me`) has Profile and My sign-ups (`/me/signups`: Upcoming/Past/Cancelled tabs, option filter, search) behind a small tab bar.
- **Avatars:** no Google photos. Each profile has a DiceBear `avatar_style` + random `avatar_seed` (players pick a style and shuffle in the profile form, `AvatarPicker`); a trigger builds `avatar_url` = `/api/avatar/<style>/<seed>`, an SVG route using `@dicebear/core`. Styles live in `src/lib/avatars.ts` and must match the SQL check.
- **Options per sign-up:** *Instructional + Drop-in* (full price, uses a spot) or *Instructional only* (cheaper, **doesn't use a spot**, never waitlisted). Players can switch before paying.
- **Payment:** Interac e-Transfer with a ref code (`VB-XXXX`). A Gmail Apps Script (`scripts/gmail-ingest.gs`) posts notifications to `/api/payments/ingest`; `src/lib/matcher.ts` matches by ref code or name + exact amount owed.
- **Team requests:** drop-in players can ask to be teamed with up to 5 other signed-up drop-in players (`MAX_TEAMMATES`) (at sign-up or later from the session page; `set_team_requests()`, table `team_requests`). One-way is enough; `balanceTeams` places requested groups first and never splits them, then balances everyone else around them and hosts see a handshake mark.
- **Holds & waitlist:** a spot is held for N hours while unpaid; expired holds free the spot and the waitlist auto-promotes.
- **Pricing:** every sign-up's price comes from `_signup_price()`. **Bring a Friend:** a first-timer (`_is_first_timer`: profile says new + no past confirmed spot) picks who brought them (`set_brought_by`), and both pay half; hosts can undo it from the roster. **Refundable deposits:** a session with `deposit_cents` is free but everyone pays the deposit; `run_tick` marks it owed back after the session (Refunds → Deposit). Partial payments add up in `registrations.paid_cents`; refunds follow what was actually paid.
- **Updates board:** hosts write posts in a Tiptap rich text editor (`/admin/updates`); HTML is sanitized with `sanitizePostHtml` (`src/lib/rich-text.ts`) on save and render. Published posts show at `/updates` (public). One post can be featured on the home page (`FeaturedPost`, above the next session, no divider; DB enforces one). A per-post checkbox emails it once to players with `profiles.announcement_emails` and `email_updates` on (the profile form's "Email me about the club" switch, with a dropdown for which optional emails: updates, sign-ups open, day-before reminders) via `src/lib/announcements.ts`.
- **Messages (inbox):** two-way threads between a player and the hosts (`message_threads` + `messages`; players `/me/messages`, hosts `/admin/messages`). Either side can start one; a host can message one player (from the player's details) or a session's groups (one private thread each). The host inbox is shared: any host reads/replies, replies are marked Host. All writes are SQL functions (`host_start_threads`, `player_start_thread`, `post_message`, `mark_thread_read`, `unread_message_count`), players are rate-limited. `src/lib/messages.ts` emails the other side (players: `email_messages`, unsubscribe kind `messages`; hosts: `host_alert_messages`); unread badges on the account tab, avatar menu and host nav; `LiveThread` refreshes an open thread via Realtime.
- **Hosts (`/admin`):** roster with a player-details modal, mark paid, waitlist order, teams (auto-balanced by skill, publish to players), payments inbox, refunds, players/roles, weekly schedule, songs (players' hype songs for the Spotify playlist), CSV export.
- **Safety & privacy:** profiles require an emergency contact and an "I'm 18 or older" tick (`_profile_complete` + `profileComplete`). `/legal/privacy` explains what's kept; players can delete their own account from `/me` (`deleteMyAccount`).
- **Optional emails** (updates, sign-ups open, reminders, host emails) carry a signed unsubscribe link (`src/lib/unsubscribe.ts`, `/unsubscribe` asks first; `/api/unsubscribe` is the RFC 8058 one-click POST) and `List-Unsubscribe` headers.
- **Session changes:** editing a session's date, time or place bumps `sessions.schedule_revision` (trigger) and `updateSession` emails everyone signed up or waiting (`session_changed`); `.ics` files carry it as `SEQUENCE`.
- **Host moderation:** hosts can block a player from signing up (`player_blocks`, hosts only; `register_for_session` raises `blocked`) and link a host-added guest to the account they make later (`admin_merge_guest`).
- **Monitoring:** `run_tick` writes `app_settings.last_tick`; `TickHealthBanner` warns hosts after 10 quiet minutes and emails the dev account once. Server errors go to `app_errors` via `src/instrumentation.ts` (dev tools only, kept 30 days); `src/app/error.tsx` / `global-error.tsx` are the error pages. Security headers live in `next.config.ts`.
- **Dev tools (`/dev-tools`):** only abuyuanjustin@gmail.com (`DEV_TOOLS_EMAIL` + `public.is_devtools_user()`), not hosts. Health/repairs, table editor, view-as-player, maintenance mode, backup, clean-ups/reset. All writes go through `devtools_*` SQL functions that check `is_devtools_user()` and log to `devtools_audit`.

## Stack
Next.js 16 App Router (Cache Components + partial prefetching), React 19, Tailwind v4, shadcn (Radix), Supabase (Postgres, Google OAuth, Realtime, pg_cron), Vercel. Tests: Vitest + PGlite (runs every migration in-memory).

## Where logic lives
- **State changes are Postgres functions** in `supabase/migrations/*.sql` (`register_for_session`, `change_registration_option`, `cancel_registration`, `_promote`, `run_tick`, `admin_*`). Each locks the session row first, so sessions can't be overbooked. They return event lists that `src/lib/registrations.ts` turns into emails.
- RLS on every table; players see only their own rows; teams are readable only once `sessions.teams_published_at` is set.
- Every money path uses `registrations.amount_cents` (not the session price).
- Every-minute job: prod pg_cron calls `/api/cron/tick` (`supabase/setup/cron.sql`); dev runs `run_tick()` in-DB (`cron-dev.sql`).

## Workflow (important)
- **Work on the `dev` branch only.** Merge to `main` only when asked; `main` deploys production.
- Two Supabase projects: **dev** (`goomasgmwhafvkbmheex`: localhost + Vercel previews) and **prod** (`tbxicooonmntknjrrnzh`: live site). New migrations go in a new file (never edit an applied one), apply to dev immediately, and to prod **right before** merging to main. Use `supabase db push --db-url "$DEV_DB_URL"` / `"$PROD_DB_URL"` (URLs in `.env.local`), not the Supabase MCP `apply_migration`, which stamps its own version numbers and put the dev, prod and repo histories out of step. Run `npm run db:status -- --drift` before merging to confirm nothing is pending or drifted, and `npm run db:functions` after adding a migration. Full steps and a map of where each function lives: `supabase/README.md`.
- Checks before committing: `npx tsc --noEmit`, `npx eslint src`, `npx vitest run`. `npx next build` catches Cache Components errors (e.g. request data outside `<Suspense>`).
- Previewing signed-in/admin UI: put a throwaway `src/app/zz-*/page.tsx` with fake data, view it, delete it (then `npx next typegen` if tsc complains about stale route types).

## Gotchas
- **Tailwind reload bug:** in `next dev`, edits to `globals.css` and brand-new utility classes don't appear until the dev server is restarted with `.next` deleted. To check styles reliably, `npx next build` then preview with the `intro-hub-prod` launch config (port 3100).
- Request-time values (`Date.now()`, cookies, `usePathname()`) must be inside `<Suspense>` or after `await connection()`; `createClient()` in `src/lib/supabase/server.ts` already calls `connection()`.
- Page files can only export the page; put reusable/previewable pieces in components.
- **Mobile overflow:** a `grid` with only `sm:grid-cols-*` gets an `auto` track on phones that stretches to its widest child; always add `grid-cols-1`. Inputs/selects in flex rows need `min-w-0` (`inputClass` has it). Long user text (emails, team names) gets `[overflow-wrap:anywhere]`. `body { overflow-x: clip }` is only a safety net (never put it on `html` too: that breaks the sticky header whenever a Radix menu/dialog locks scrolling). Check at 320px and 360px.
- **Toasts:** server actions call `flash("success", msg)` (`src/lib/flash.ts`, a one-shot cookie); failures keep redirecting with `?error=`. `FlashToaster` (in the root layout) shows both and cleans up. Forms without a `SubmitButton` need `<FlashOnSettle />` inside the form. Don't add inline success/error notices.
- **Edit forms:** give the Save `SubmitButton` `requireChange` so it stays disabled until a field changes (re-baselines after each save). Not for create forms or one-shot actions.
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
- **Teams** render as `TeamBlocks` (`src/components/team-blocks.tsx`): one bordered block per team (dark header + LED count), roster in 1–2 columns via container queries, blocks 2-across from `md`. Never scroll sideways. Host view adds skill dots, a skill tally and a Move picker; players never see skill.
- **Lists are ruled rows** (`divide-y divide-ink/20`), with dates as a `DateBlock` (SAT / 17 / OCT).
- **Motion:** CSS only (`.reveal` stagger, scoreboard flicker, dot fill), disabled under `prefers-reduced-motion`.
- **Banned:** rounded card grids / three-card heroes, icons in tinted square containers, generic pill badges, purple gradients, Inter/Roboto/system fonts.
- **Dark (`board`/`ink`) + orange is for anchors:** section tabs, the admin nav bar (active tab = orange block), the scoreboard, the ref-code panel, the playlist panel and the footer band. Keep content areas light.
- The page header has an orange 3px "court line"; the footer (`src/components/site-footer.tsx`) is a dark band (orange top line) with the club blurb and Resources / Keep in touch / Legal stacks; waiver and media release have pages under `/legal`. The account dropdown (avatar) holds Account / Admin (hosts) / Sign out.
