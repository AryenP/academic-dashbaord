# Build prompt for Claude Code

Open this repo in Claude Code and paste everything below the line.

---

You're turning this repo, **Runway** (`AryenP/academic-dashbaord`, served at `https://aryenp.github.io/academic-dashbaord/`), from a single static dashboard into a real study app. Read these first, in order: `CLAUDE.md`, `docs/SPEC.md` (what to build), `docs/RESEARCH.md` (why, and the API limits), `index.html` (the current design, which is the visual reference), and `scripts/sync.py` plus `.github/workflows/sync.yml` (how the plan gets in from Google Calendar).

## Goal

Ship the P0 and P1 features in `docs/SPEC.md`: study sessions with breaks, an hours log, stats with planned-vs-actual and exam readiness, Supabase auth and storage, iPhone phone-focus tracking via Shortcuts, and Spotify remote control. Keep the current runway look; it's the product's signature. Then do P2 if time allows.

## Ground rules

- **No AI attribution anywhere.** No `Co-Authored-By` trailers, no "Generated with" lines in commits or PRs, no AI mention in the UI or README. `.claude/settings.json` already disables attribution; also check every commit message before committing.
- Don't break what works: the 15-minute calendar sync must keep running, and the site must stay public at the same URL.
- Never commit secrets. The Supabase anon key and Spotify client ID are public by design. The calendar iCal URL, Supabase service-role key and access token, and phone tokens must never be committed.
- Personal data stays private. Visitors may see the plan and, if enabled, daily totals. Never session notes, phone events or app names. Enforce this with Row Level Security, not only in the UI.
- Work in the phases below. At the end of each phase, run the tests, run a production build, take Playwright screenshots at 390×844 and 1440×900 in light and dark mode, look at them, fix what's off, and commit with a plain message (`feat: study sessions and breaks`). Push to `main` after each phase.
- If something in the spec turns out to be impossible or worse than an alternative, choose the better option, note the change in `docs/DECISIONS.md` with a one-line reason, and keep going. Ask me only for things only I can do (the setup list at the end).

## Phase 0 — project setup

1. Scaffold **Vite + React + TypeScript** at the repo root. Use hash routing (`/#/focus`) so GitHub Pages needs no rewrites. Set `base: '/academic-dashbaord/'`.
2. Port the design tokens from `index.html` into `src/styles/tokens.css`:
   - the color variables for light and dark
   - the course colors
   - Big Shoulders Display, self-hosted from `@fontsource/big-shoulders-display` weights 600 and 800
   - the system sans stack
3. Port the runway view, checkpoints, today list and agenda into React components, rendering identically to the current page. The current `index.html` is the reference; compare screenshots.
4. Move the plan output to `public/data.json`. Update `scripts/sync.py` (`OUT` path) and `.github/workflows/sync.yml` to match, and keep its tests passing.
5. Add `.github/workflows/deploy.yml`: on push to `main` (and after the sync workflow commits), run `npm ci && npm run build` and deploy `dist/` with `actions/upload-pages-artifact` + `actions/deploy-pages`. I'll switch Pages' source to "GitHub Actions".
6. Tooling:
   - ESLint and Prettier
   - Vitest for logic
   - Playwright for smoke and screenshot tests
   - an `npm run check` that runs all of them
   - Python tests for `scripts/sync.py` (pytest, with a fixture `.ics` covering recurring events, a UTC event, a 24-hour exam and an all-day event)

## Phase 1 — data layer (Supabase)

Create `supabase/migrations/0001_init.sql` with:

```sql
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  public_totals boolean not null default true,
  phone_token_hash text,                -- sha256 of the phone token, never the token
  settings jsonb not null default '{}'  -- break mode, playlists, distracting apps, cues
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  course text not null,
  plan_block_id text,                   -- id from data.json plan, if started from a block
  mode text not null check (mode in ('pomodoro','fifty_ten','custom','flow')),
  source text not null default 'web' check (source in ('web','phone','manual')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  paused_seconds int not null default 0,
  break_seconds int not null default 0,
  focus_pct numeric(5,2),               -- frozen at end
  phone_seconds int,
  pickups int,
  longest_stretch_seconds int,
  rating smallint check (rating between 1 and 5),
  note text
);

create table session_breaks (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions on delete cascade,
  kind text not null check (kind in ('short','long')),
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create table phone_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  app text not null,
  kind text not null check (kind in ('open','close','session_start','session_end')),
  at timestamptz not null default now(),
  received_at timestamptz not null default now()
);
create index on phone_events (user_id, at);
create index on sessions (user_id, started_at desc);
```

- RLS: enable on all four tables. The owner (`auth.uid() = user_id`, or `= id` for profiles) gets full access. No anon policies on these tables.
- Public totals: a `security definer` function `public_daily_totals(days int)` returning `(day date, course text, minutes int)` only when that owner's `public_totals` is true. Grant execute to `anon`.
- Edge Function `supabase/functions/phone-event`:
  - `POST` JSON `{token, app, kind, at?}`.
  - Hash the token, look up the profile, insert the event with the service role.
  - `session_start` creates a session (course = the current plan block's course if one is active, else "General"); `session_end` ends the open one.
  - Validate inputs and limit `app` to 40 chars.
  - Rate-limit to 120 requests/min per token (a table- or KV-based counter is fine).
  - Respond `204`. CORS isn't needed, since Shortcuts isn't a browser.
- A typed client in `src/lib/supabase.ts` and generated types.
- Keep-alive: in `sync.yml`, add a step that `curl`s the Supabase REST health endpoint using the `SUPABASE_URL` and `SUPABASE_ANON_KEY` repo secrets, so the free project never hits the 7-day pause.

## Phase 2 — sessions, breaks, hours log

Build features 2–4 from the spec.

- **Timer:** the timer state is derived, never ticked. `elapsed = now − started_at − paused − breaks`. This keeps it correct across reloads, sleep and devices. Use Supabase Realtime on `sessions` and `session_breaks`, so the phone and laptop stay in sync.
- **Focus screen:** phone-first and full viewport. The timer is set in the display font at clamp(5rem, 22vw, 12rem). Show the course and the time to the next break. The phone timer and pickups sit beneath it.
- **Breaks:** the break nudge and the break screen as specced. The break suggestions rotate. Long break after 4 intervals in Pomodoro.
- **End screen:** rating, note, save/discard. Discard is auto-offered under 2 min.
- **`/log` view:**
  - all sessions grouped by day, editable
  - a manual entry form
  - CSV export
- **Runway:** add the actual-time bar per day column and exam readiness on the checkpoints.

## Phase 3 — phone focus

- Settings → "Phone": generate or rotate the token (show it once), and list distracting apps (editable). Store the app list in `profiles.settings.distracting_apps`.
- `/setup/phone`: a step-by-step iPhone guide with screenshots-as-diagrams (draw them; no real screenshots needed).
  - It covers one "Is Opened" and one "Is Closed" automation per app, each running **Get Contents of URL** with method POST and a JSON body `{token, app, kind}`, set to **Run Immediately**.
  - Each step has a copy button: the endpoint URL, the JSON body for open and close, and the token.
  - A "Send test event" check: the page listens via Realtime and turns green when the first event arrives.
  - Also explain the optional "Start studying" Shortcut (Set Focus + POST `session_start`).
- Implement `computeFocus(sessionWindow, breaks, events, now)` in `src/lib/focus.ts`, exactly per the formula in the spec:
  - Unit-test it with Vitest: overlapping opens, an open with no close (cap at 10 min and at the session end), events during breaks (ignored), close without open (ignored), clock skew (clamp `at` to `received_at` ± 2 min), and zero-length sessions.
- Live phone timer on the focus screen; freeze the metrics on session end.
- Stats: a focus % trend, pickups/hour, and a best-hours heatmap.

## Phase 4 — Spotify

- PKCE auth in `src/lib/spotify.ts`:
  - The token and refresh token go in `localStorage`, behind a small wrapper with try/catch. Spotify tokens are per-device and that's fine.
  - Redirect URI: the site root, plus `http://127.0.0.1:5173/` in dev.
- Now-playing card on the focus screen and in the header (compact):
  - poll `GET /me/player` every 5 s while visible, and pause polling when hidden
  - controls, volume, and a device picker (`PUT /me/player` to transfer)
- Settings: pick the focus and break playlists from `GET /me/playlists`.
- Session cues as specced. Handle the error cases exactly as the spec lists them. Don't use the Web Playback SDK. Add the iframe embed fallback.

## Phase 5 — polish (P2)

PWA (manifest, service worker, offline queue), weekly review, keyboard shortcuts, public-visibility toggles, empty states with a clear next action, an accessibility pass (focus rings, labels, reduced motion, contrast ≥ 4.5:1), and a Lighthouse run (target ≥ 90 for accessibility and performance on mobile). Update `README.md`: what Runway is, screenshots, the stack, and setup steps. Write it as a portfolio project, in Aryen's voice, plain and specific, with no AI mention.

## Design direction

Keep the identity: the departure-board runway, Big Shoulders Display for numbers and dates, theme-following colors, course colors, red hatched exams. The focus screen should feel calm and enormous: one number, lots of space. No generic card grids, no gradient washes, no emoji icons (use inline SVG icons), and no all-caps eyebrows. One orchestrated animation per view at most, and respect `prefers-reduced-motion`.

## Things only I (Aryen) can do — ask me for them when you reach that phase, with exact click paths

1. **Supabase:** create a free project.
   - Give Claude Code the project URL, the anon key and a personal access token for the CLI (or run `supabase link` and `supabase db push` myself).
   - Add `SUPABASE_URL` and `SUPABASE_ANON_KEY` as GitHub repo secrets.
   - Set the Auth Site URL and redirect URLs to the Pages URL.
2. **GitHub Pages:** Settings → Pages → Source: **GitHub Actions**.
3. **Spotify:**
   - Create an app at developer.spotify.com/dashboard (Web API), add both redirect URIs, and give Claude Code the Client ID.
   - It needs Premium on my account, and I can add up to 5 users.
4. **iPhone:** build the Shortcuts automations by following `/setup/phone`.
