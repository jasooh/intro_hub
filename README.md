# Intro Hub 🏐

Sign-ups, waitlist, e-Transfer confirmation and emails for a weekly volleyball group. It replaces two Google Forms, checking e-Transfers by hand, and emailing every player by hand. It costs $0/month to run.

## How it works

1. **Players sign in with Google** and tap **Sign up** on the session page.
   - If there's room, the player gets a spot held for _N_ hours and a ref code like `VB-7K3Q`.
   - If the session is full, they join the waitlist.
   - Everyone signed in can see who's coming.
2. **Players e-Transfer the host** with the ref code in the message.
3. **A Google Apps Script** in the host's Gmail forwards each Interac notification to the app every 5 minutes. The app matches it to a sign-up:
   - by ref code, or
   - by sender name + exact amount.
   
   A match confirms the player and emails them.
4. **Every minute**, a Supabase cron job:
   - releases holds that weren't paid in time
   - promotes the next person on the waitlist (and emails them)
   - sends day-before reminders
   - creates next week's session from the weekly schedule
5. **The host's dashboard** (`/admin`) shows:
   - the roster and waitlist
   - payments it couldn't match, so the host can assign them in one click
   - a manual **Mark paid** button
   - refunds owed
   - CSV export
   - player and host management
6. **Dev tools** (`/dev-tools`, only for the account in `DEV_TOOLS_EMAIL` in `src/lib/auth.ts` and `public.is_devtools_user()`; everyone else gets a 404):
   - health checks (cron, stuck holds, Gmail script, settings) and repair buttons (run tick, resend an email)
   - a table editor and a force-status tool for sign-ups
   - view-as-player (read-only)
   - maintenance mode, which pauses sign-ups and shows a banner
   - JSON backup, clean-ups and a database reset (needs a fresh backup and typing `RESET DEV` / `RESET PROD`)
   - every change is written to an audit log with the old values

### Stack

| Part | Choice | Free tier |
|---|---|---|
| App | Next.js 16 (App Router, Server Actions) | Vercel Hobby |
| DB, auth, realtime, cron | Supabase (Postgres, Google OAuth, Realtime, `pg_cron` + `pg_net`) | Supabase Free |
| Email | Gmail SMTP (nodemailer) | ~500/day |
| Payment ingest | Google Apps Script in the host's Gmail | Free |

### Where the logic lives

| Path | What |
|---|---|
| `supabase/migrations/…_init.sql` | Schema, RLS, and **all registration state changes** as Postgres functions. Each one locks the session row, so 50 people clicking at once can't overbook |
| `src/lib/registrations.ts` | Turns the events those functions return (`signed_up`, `promoted`, `confirmed`, …) into emails, deduped via `email_log` |
| `src/lib/matcher.ts` | Decides which sign-up an e-Transfer belongs to |
| `src/app/api/payments/ingest` | HMAC-signed webhook the Apps Script posts to |
| `src/app/api/cron/tick` | Endpoint pg_cron calls every minute |
| `scripts/gmail-ingest.gs` | The Apps Script the host pastes into script.google.com |
| `src/proxy.ts` | Session refresh + optimistic route gating (Next 16's renamed middleware) |

**Registration lifecycle:**
- `waitlisted` → `pending_payment` (promoted) → `confirmed`
- `pending_payment` → `expired` (hold ran out), and the next waitlister is promoted
- any active status → `cancelled`. Cancelling a confirmed spot before the cutoff puts it on the refunds list.
- Free sessions skip straight to `confirmed`.

---

## Environments

There are two Supabase projects, so testing never touches real players' data:

| Where | Git branch | Supabase project | Config |
|---|---|---|---|
| `localhost` | `dev` | `intro-hub-dev` | `.env.local` |
| Vercel preview deploys | `dev` | `intro-hub-dev` | Vercel env vars, **Preview** scope |
| Production (`intro-hub-eight.vercel.app`) | `main` | `intro-hub` | Vercel env vars, **Production** scope |

- Work happens on `dev`. It's merged into `main` to release.
- Each project has its own accounts, sessions, payments and admins. Sign in once on each to create your account there.
- **Every database change has to be applied to both projects**: add a new file in `supabase/migrations/` and run it on dev first, then on prod after merging.
- Both projects run an every-minute job:
  - **Prod** (`supabase/setup/cron.sql`) calls the live site's `/api/cron/tick`, which does the timed work and sends the emails.
  - **Dev** (`supabase/setup/cron-dev.sql`) runs the same timed work directly in the database, because it can't reach localhost or the login-protected previews. No emails are produced for those automatic events on dev. To see them, trigger a tick through the app instead:
    `curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/tick`

---

## Setup

### 1. Supabase
1. Create a free project at [supabase.com](https://supabase.com).
2. In **SQL Editor**, run `supabase/migrations/20261012000000_init.sql`. Alternatively, run `npx supabase link` and then `npx supabase db push`.
3. **Authentication → Providers → Google**: enable it, then paste a Google OAuth client ID and secret.
   - Create the client in [Google Cloud Console](https://console.cloud.google.com/apis/credentials) under **OAuth client ID → Web application**.
   - Set its authorized redirect URI to `https://<project-ref>.supabase.co/auth/v1/callback`.
4. **Authentication → URL Configuration**:
   - Set **Site URL** to your app URL.
   - Add `http://localhost:3000/**` and `https://YOUR-APP.vercel.app/**` to the redirect URLs.

### 2. Environment
Copy `.env.example` to `.env.local` and fill it in:
- Supabase keys are under **Project Settings → API**.
- `ADMIN_EMAILS` is the host's Google address. That account becomes a host the first time it signs in, and more hosts can be added later from **Admin → Players**.
- `SPOTIFY_PLAYLIST_URL` (optional) is the host's Spotify playlist link. When set, the home page embeds it, and **Admin → Songs** lists players' hype songs to add to it.
- `CRON_SECRET` and `INGEST_SECRET` are random strings. Generate each with `openssl rand -hex 32`.
- **Email**: the simplest free option is Gmail SMTP from the host's account.
  1. Turn on 2-Step Verification.
  2. Create an [App Password](https://myaccount.google.com/apppasswords).
  3. Set `GMAIL_USER` and `GMAIL_APP_PASSWORD`.
  

### 3. Run locally
```bash
npm install
npm run dev        # http://localhost:3000
npm test           # 49 tests: DB functions + RLS (in-memory Postgres), matcher, parser, emails, ingest route
```
With no email settings configured, emails are printed to the terminal instead of sent.

### 4. Deploy to Vercel
1. Push the repo to GitHub and import it in Vercel.
2. Add every variable from `.env.local`, with `APP_URL` set to the Vercel URL.
3. Deploy, then sign in once with the host's Google account.

### 5. Turn on the every-minute job
Edit the two placeholders in `supabase/setup/cron.sql` (app URL and `CRON_SECRET`), then run it in the SQL editor.

### 6. Payment auto-matching (Apps Script)
1. While signed in to the **host's** Google account, open [script.google.com](https://script.google.com) and create a new project. Paste in `scripts/gmail-ingest.gs`.
2. **Project Settings → Script properties**: add `APP_URL` and `INGEST_SECRET`, using the same values as the app.
3. Run `testParseRecent` and check the log. It shows what the parser extracts from your recent Interac emails. Banks word these emails slightly differently, so adjust the regexes in `parseInteracEmail` if something comes out `null`.
4. Run `setup` once and approve the permissions. The script then checks Gmail every 5 minutes.

**Testing without a bank:** add a Script property `TEST_SENDER` set to your own address. An email from that address whose subject starts with `TEST INTERAC e-Transfer:` is then treated like a real notification (other mail from it is ignored). Edit the name/amount/code in `sendTestEmail` and run it, or send the email yourself. Use the code from your own test sign-up, since the app treats it as a real payment. Remove `TEST_SENDER` when you're done.

The script only trusts an email whose actual address is Interac's **and** that Gmail verified (DMARC/DKIM pass), so nobody can fake a payment by putting Interac's address in their display name or forging the sender. `testParseRecent` logs VERIFIED or IGNORED for each recent email. After updating `scripts/gmail-ingest.gs`, paste the new version into the Apps Script project.

Keep **Autodeposit** on for the host's email so money lands without anyone answering security questions. Anything the matcher can't place shows up under **Admin → Payments**.

### 7. Set the weekly schedule
In **Admin → Weekly schedule**, add e.g. "Saturdays 18:00, 12 spots, $10, sign-ups open 120h before". The next session is created right away, and every week after that.

---

## Notes & limits
- **Interac has no API** for personal accounts. Auto-matching works by parsing the notification emails, so if Interac changes its email wording, payments land in the "needs attention" inbox until the regexes are updated. Nothing gets lost.
- **Late payments**: if someone pays after their hold expired, the payment shows as unmatched. Use **Paid late? Re-add** on the session page, or assign the payment from the Payments page.
- **Free-tier limits**:
  - Supabase pauses a free project after 7 days without activity, but the per-minute cron job keeps it awake.
  - Gmail SMTP allows about 500 emails a day, far more than a weekly game needs.
  - Vercel Hobby is for non-commercial use, which fits a friends' group.
- `npm test` runs the real migration in PGlite (Postgres compiled to WASM) with a small stand-in for Supabase's `auth` schema. Real concurrency is guaranteed by the `SELECT … FOR UPDATE` session lock, but PGlite runs on a single connection. So the 50-sign-up "burst" test checks the counting logic, not true parallelism.
