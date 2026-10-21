# Runway

I plan my weeks in Google Calendar: study blocks, deadlines, midterms. Runway turns that calendar into a study app. It lays the plan out as a runway to each exam, runs my study sessions with breaks and music, checks my focus with my phone, and tells me how ready I actually am for each midterm.

**Live:** https://aryenp.github.io/academic-dashbaord/

![The runway: two weeks of study blocks, deadlines and exams, with time actually studied drawn beside each day](docs/screenshots/runway.png)

## Why I built it

Every study app I tried owned one slice. Forest and Opal keep you off your phone. Flocus and LifeAt are nice rooms to sit in. Rize measures your time. YPT has leaderboards. None of them knew what I was supposed to be studying, or when my exams were, so none could tell me whether I was on track.

Runway starts from the plan I already keep and closes the loop: **plan → session → verified focus → exam readiness**. "Planned vs. actual" comes for free, because the plan is the calendar.

## What it does

- **Runway.** Every day from now to the last exam, 8 AM to midnight, with study blocks in course colors and exams hatched in red. Time I actually studied is drawn as a thin bar beside the plan. Each exam shows a countdown and a readiness score: hours studied for that course before the exam ÷ hours planned.
- **Sessions.** One tap starts a session on whatever the calendar says I should be doing now. The timer is derived from timestamps in the database, never ticked, so it's right after a reload, after the laptop sleeps, and on my phone and laptop at the same time.
- **Breaks.** Pomodoro, 50/10, custom, or flow (no timer, a nudge at 90 minutes). The break screen gives one concrete thing to do: water, stretch, the 20-20-20 eye rule.
- **Phone focus.** iPhone Shortcuts automations ping Runway when I open or close an app I've marked as distracting. During a session that becomes phone time, pickups, and focus % = 1 − phone time ÷ focus time. Breaks don't count.
- **Music.** Spotify follows the session: the focus playlist on start, the break playlist on breaks, pause at the end. It remote-controls the Spotify app already running on my phone or laptop.
- **Log, stats, weekly review.** Every session, editable, with manual entries and CSV export. Planned vs. actual per day, focus % over time, pickups per hour, and a heatmap of my best hours.
- **Works offline.** It installs to the Home Screen. A whole session works without a connection, then syncs with the right times when it's back.

| Focus | Break | Stats |
| --- | --- | --- |
| ![Focus screen with a big countdown, live phone time and pickups, and the Spotify card](docs/screenshots/focus.png) | ![Break screen with a countdown and one suggestion](docs/screenshots/break.png) | ![Stats: totals, planned vs. actual, focus by session, best-hours heatmap](docs/screenshots/stats.png) |

## How it works

```
Google Calendar ──iCal──▶ scripts/sync.py ──▶ public/data.json ──▶ the site (GitHub Pages)
   (every 15 min, GitHub Actions)                                     │
                                                                      ▼
iPhone Shortcuts ──POST──▶ Edge Function phone-event ──▶ Supabase Postgres ◀── sessions, breaks
                                                         (Row Level Security)
Spotify app on phone/laptop ◀── Web API (PKCE) ── the site
```

- **Frontend:** Vite, React, TypeScript, hash routing. The runway's design carried over from the first version: Big Shoulders Display for numbers, course colors, theme-following light and dark.
- **Plan:** `scripts/sync.py` reads my calendar's private iCal feed and keeps only study blocks (📚 prefix), deadlines and midterms. Nothing else from my calendar is published.
- **Backend:** Supabase. Every table has Row Level Security; visitors can call exactly two functions, which return daily totals or prep minutes, and only if I've chosen to share them. Session state changes are SQL functions, so the web app and the phone go through the same code.
- **Phone:** a personal token (only its hash is stored), rate-limited to 120 requests a minute. Shortcuts can't read Screen Time, and a website can't either, so this is the honest version: it sees only the apps I list.
- **Spotify:** Authorization Code with PKCE and the player endpoints. No Web Playback SDK; it's been unreliable for Development Mode apps since March 2026 (see `docs/RESEARCH.md`).

Design decisions and the reasons for each are in [`docs/DECISIONS.md`](docs/DECISIONS.md). The spec is [`docs/SPEC.md`](docs/SPEC.md).

## Tests

- **Unit** (Vitest): the timer, the focus formula, stats, the offline queue, the Spotify client.
- **Database** (Vitest against a local Supabase): RLS. Another account can't read or change my rows; visitors get only what I share.
- **Edge Function** (Deno): validation, rate limiting, starting and ending sessions from the phone.
- **Browser** (Playwright): the public site, plus signed-in flows against a local Supabase with Spotify faked at the network layer: sessions, breaks, phone tracking, offline sync, and an axe accessibility check of every view in light and dark.
- **Python** (pytest): the calendar sync, with a fixture covering recurring, UTC, all-day and 24-hour events.

Lighthouse on mobile: 96 performance, 100 accessibility.

## Run it yourself

```sh
npm install
npm run dev          # http://127.0.0.1:5173/academic-dashbaord/  (runway only, no backend needed)
npm run check        # lint, format, unit tests, build, browser tests, Python tests
```

With the backend (needs Docker and the Supabase CLI):

```sh
supabase start                          # local Postgres, Auth, Realtime
supabase functions serve --no-verify-jwt
# put the local URL and anon key in .env.local as VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run test:db && npm run test:fn && npm run test:e2e:db
```

### Deploying your own

1. **Calendar.** Add your calendar's "secret address in iCal format" as the repo secret `GCAL_ICS_URL`.
2. **Supabase.** Create a free project and run `supabase link` and `supabase db push`, then `supabase functions deploy phone-event --no-verify-jwt`. Add `SUPABASE_URL` and `SUPABASE_ANON_KEY` as repo secrets. Under Authentication → URL Configuration, set the Site URL to your Pages URL. Sign in once, then turn off new sign-ups: the first account is the owner.
3. **Pages.** Settings → Pages → Source: GitHub Actions.
4. **Spotify (optional, needs Premium).** Create an app at developer.spotify.com with the redirect URIs `https://<you>.github.io/academic-dashbaord/spotify.html` and `http://127.0.0.1:5173/academic-dashbaord/spotify.html`, and add its Client ID as the repo secret `SPOTIFY_CLIENT_ID`.
5. **iPhone.** Make a token in Settings → Phone and follow the setup guide it links to.
