# Runway — product spec

_v1 · 2026-10-20 · owner: Aryen Palkar_

## One line

A study cockpit that starts from your real calendar and exam dates, runs your study sessions (timer, breaks, music), verifies focus with your phone, and tells you how ready you are for each exam.

## Why it's different

See `docs/RESEARCH.md`. Competitors each own one slice: atmosphere (Flocus, LifeAt), phone discipline (Forest, Opal), measurement (Rize), community (YPT, StudyStream). Runway closes the loop **plan → session → verified focus → exam readiness**, and it is calendar-native: the plan comes from Google Calendar, so "planned vs. actual" is free.

## Users

- **Owner (Aryen):** signs in, runs sessions, logs hours, connects Spotify and phone.
- **Visitors:** anyone with the link sees the runway (plan) and, if the owner allows, daily totals. Never session notes, phone data or app names.

## Principles

1. **One tap to start.** The session picker defaults to the block the calendar says you should be doing now.
2. **Honest numbers.** Every metric is explainable in one sentence and shown with how it was computed.
3. **The plan is the calendar.** Don't build a second planner; read Google Calendar (existing `scripts/sync.py`).
4. **Works on a phone.** Every screen works at 375px; the focus screen is designed phone-first.
5. **Private by default** for anything personal; the public page is opt-in per field.

## Features

### P0 — core (ship first)

**1. Runway (home)**
Keep the current design (day columns, 8 AM–midnight axis, course colors, exam hatch, now-line, checkpoints, today list, agenda). Add:
- **Actual vs. planned:** logged sessions drawn as a thin bar on the right edge of each day column, next to the planned blocks.
- **Exam readiness** on each checkpoint: `actual prep hours / planned prep hours` for that course before the exam, as a ring or bar, with the number.
- A big **Start session** button in the header.

**2. Study sessions**
- Start / pause / resume / end. The course and block default to the current or next planned study block (from `data.json`), and you can change them.
- The timer state lives on the server (`started_at`, breaks), so it survives reloads and shows on every device. The phone and laptop show the same live session.
- **Focus screen:** a full-viewport timer in the display font, the course, the time left in this interval, the next break, and a live **phone time** counter plus pickups (see 7). It's a calm screen with no clutter.
- **End screen:** duration, focus %, pickups, longest unbroken stretch, "How did it go?" 1–5, and an optional note. Save, or discard if it was started by mistake (under 2 minutes).

**3. Breaks**
- Modes: **Pomodoro** (25/5, long 15 after 4), **50/10**, **Custom**, **Flow** (no fixed timer; a gentle nudge at 90 min).
- The break screen has a countdown and one concrete suggestion that rotates: water, stand and stretch, the 20-20-20 eye rule, a short walk. A "Back to work" button. Break time is excluded from focus time.
- Breaks never start automatically while you're mid-thought: the nudge appears, and you start the break with one tap. The auto-start option is off by default.

**4. Hours log**
- Sessions are logged automatically. A **manual entry** (date, course, minutes, note) covers offline study. Entries can be edited and deleted.

**5. Stats**
- Today and this week: hours, total and per course.
- Planned vs. actual per day (bars), from `data.json` plus sessions.
- Focus % trend; pickups per hour.
- A **best hours** heatmap: hour-of-day × weekday by average focus %.
- Streak: days with ≥ 1 completed session.

**6. Auth and data**
- Supabase Auth with an email magic link (Google sign-in optional later). Only the owner can write. Row Level Security on every table.

### P1 — integrations

**7. Phone focus (iPhone Shortcuts)**
- Settings generates a personal **phone token**. Show it once, store only its hash, and allow rotating it.
- A Supabase Edge Function `phone-event` accepts `POST {token, app, kind: "open"|"close", at?}`, validates the token hash, and inserts into `phone_events`. Rate-limit per token (e.g. 120/min).
- A setup guide page with copy buttons:
  - For each distracting app (suggest Instagram, TikTok, YouTube, Snapchat, X, Reddit, Messages, Safari), create two automations: App → *Is Opened* → Get Contents of URL (POST JSON with `kind: "open"`), and *Is Closed* → `kind: "close"`. Set both to **Run Immediately**.
  - Optional "Start studying" Shortcut: Set Focus (Study) + POST to `phone-event` with `kind: "session_start"`, which starts a session on the site.
- During a session, a separate **phone timer** shows minutes in distracting apps, plus a pickup count and the current app if one is open ("Instagram open · 1:12").
- Focus formula (documented in the UI behind an info button):
  - `focus_seconds = session wall time − break time`
  - `phone_seconds` = overlap of distracting-app open→close intervals with focus time. An open with no close is capped at the session end and at 10 min per interval.
  - `focus_pct = clamp(0, 100, 100 × (1 − phone_seconds / focus_seconds))`
  - `pickups` = number of distracting-app opens during focus time.
- On session end, store `focus_pct`, `phone_seconds`, `pickups` and `longest_stretch_seconds` on the session row, so history doesn't depend on recomputing.
- Desktop tab visibility (Page Visibility API) is recorded as **info only**, never counted against focus. Reading a PDF in another tab is studying.

**8. Spotify**
- Connect with Authorization Code **+ PKCE** (no client secret). Scopes: `user-read-playback-state user-modify-playback-state user-read-currently-playing playlist-read-private`.
- A **now-playing card**: cover, title, artist, play/pause, previous/next, volume, and a device picker (transfer playback).
- Settings: pick a **focus playlist** and a **break playlist** from your own playlists.
- **Session cues** (each can be toggled): start → play the focus playlist on the active device; break → switch to the break playlist or pause; back to work → resume focus; end → pause.
- Errors handled in plain words:
  - 401: refresh the token.
  - 403 `PREMIUM_REQUIRED`: "Spotify control needs Premium".
  - 404 `NO_ACTIVE_DEVICE`: "Open Spotify on your phone or laptop, then tap retry".
  - 429: back off using `Retry-After`.
- Do **not** depend on the Web Playback SDK (reported broken in Development Mode since Mar 2026). Fallback with no login: a Spotify embed iframe of a chosen playlist.

### P2 — polish

- **PWA:** installable, offline shell, queued writes while offline. Break-end notifications (on iPhone these need the PWA added to the Home Screen).
- **Weekly review** page: hours vs. plan, best and worst focus blocks, exam readiness change, streak.
- **Keyboard shortcuts:** `S` start/end, `B` break, `Space` play/pause music, `?` help.
- **Public profile toggles:** show totals / hide totals / hide everything except the runway.
- Later, out of scope for now: a native iOS companion using Screen Time (DeviceActivity) for total phone use, and an Android route (Tasker/Automate HTTP POST).

## Architecture

- **Frontend:** Vite + React + TypeScript. CSS variables carry the current design tokens (Big Shoulders Display for dates and numbers, system sans for body, course colors, light/dark). Charts use d3 (already used). State: React context + a small store (Zustand OK). Views: `/` Runway, `/focus` session, `/stats`, `/log`, `/settings`, `/setup/phone`. Use hash routing so GitHub Pages needs no server rewrites.
- **Plan data:** `scripts/sync.py` keeps producing the plan JSON from the calendar's secret iCal feed every 15 minutes. Move the output to `public/data.json` so Vite serves it.
- **Backend:** Supabase (Postgres + Auth + Edge Functions). The schema is in the build prompt. The free tier pauses after 7 days idle, so the sync Action pings the REST endpoint each run to keep it awake.
- **Hosting:** GitHub Pages deployed by a GitHub Actions workflow (`vite build` → `actions/deploy-pages`). Pages source = "GitHub Actions". Base path `/academic-dashbaord/`.
- **Config:** `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (public by design, protected by RLS), and `VITE_SPOTIFY_CLIENT_ID` (public). Spotify redirect URIs: `https://aryenp.github.io/academic-dashbaord/` and `http://127.0.0.1:5173/` (Spotify requires a loopback IP rather than `localhost` for local redirects; re-check in the Spotify dashboard).

## Success measures

- Starting a session takes ≤ 2 taps from the home screen, on a phone.
- Focus % is shown for every session where phone tracking is set up, with the formula one tap away.
- Planned vs. actual hours and exam readiness are visible for every exam without leaving the home view.
- Lighthouse ≥ 90 for accessibility and performance on mobile.
