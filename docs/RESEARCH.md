# Research: study apps and technical limits

_Compiled 2026-10-20. Facts that can change (APIs, pricing, limits) carry their source; re-check them before building on them._

## 1. What the competition does

| Product | Core idea | What it does well | Gap Runway can fill |
|---|---|---|---|
| **Forest** | Grow a tree while you stay off your phone; leaving the app kills it | Strong loss-aversion hook; Deep Focus blocks non-allowed apps; "Plant Together" rooms; basic stats (focus time, streaks, tags) free, deeper breakdowns on Plus | Knows nothing about your courses, exams or calendar; phone-only view of focus |
| **YPT (Yeolpumta)** | Study timer + study groups + leaderboards | Social accountability, daily study totals per subject | Timer is manual; no plan vs. actual, no exam awareness |
| **Opal** | Screen-time control | App blocking ("Focus Rules", Hard Mode), Focus Timer with soundscapes, a combined "Opal Score" with history, milestone gems for focus hours | Uses Apple's Screen Time API (native app + entitlement); not tied to study plans |
| **Rize** | Automatic desktop time tracking | Per-session focused vs. distracted split, context-switch counts, which apps broke flow, break nudges | Desktop only; paid; no phone signal, no exam planning |
| **Flocus / StudyWithMe.io / LifeAt** | Aesthetic study rooms in the browser | Pomodoro, ambient sound, themes, Spotify playlist widgets, to-dos; Flocus tracks focus patterns and streaks; LifeAt adds 100+ scenes, calendars, shared spaces | Mostly atmosphere; stats are shallow; music is an embed, not control |
| **StudyStream / Study Together** | Live group study | Community, leaderboards, streaks, study partners | No personal plan or exam readiness |

**Takeaway.** Every tool owns one slice: atmosphere (Flocus, LifeAt), phone discipline (Forest, Opal), measurement (Rize), or community (YPT, StudyStream). None of them starts from *your actual calendar and exam dates* and closes the loop: **plan → session → verified focus → exam readiness**. That loop is Runway's position.

## 2. Spotify control from a web page (state as of 2026)

- Since **11 Feb 2026** new Development Mode apps (and since **9 Mar 2026** existing ones) run under tighter limits: the **app owner must have an active Premium subscription**, **5 users per app**, 1 Client ID per developer (25 from July 2026). Several catalogue endpoints were removed (batch `GET /tracks` etc., browse/new-releases, artist top tracks, other users' playlists); search `limit` max is now 10; playlist reads only for playlists the user owns or collaborates on; `/playlists/{id}/tracks` → `/playlists/{id}/items`. [Spotify migration guide], [TechCrunch].
- The migration guide does **not** list the Player endpoints (play/pause/next/previous/volume/transfer, currently playing, devices) as removed. Playback control requires Premium on the controlling account.
- **Web Playback SDK** (playing audio inside the browser tab) has an open report from 31 Mar 2026 that `player.connect()` never resolves in Development Mode, with no reply. [Spotify community thread]. Treat in-browser playback as unreliable.
- Extended quota (to go beyond 5 users) requires a registered business and 250k MAU, so this stays a personal tool. [TechCrunch]

**Design consequence:** use Authorization Code **with PKCE** (no client secret, works on a static site) and the **Web API Player endpoints to remote-control the Spotify app already running on the phone or laptop**. Fallback with zero auth: the Spotify embed iframe for a chosen playlist.

## 3. Phone screen time from a web page

- A website cannot read iOS Screen Time. Real Screen Time numbers need a native app using Apple's FamilyControls / DeviceActivity frameworks (what Opal does) and an Apple entitlement.
- **Workable route: iOS Shortcuts personal automations.** The "App" trigger fires when a chosen app **Is Opened** / **Is Closed**; an automation can be set to **Run Immediately** (iOS 17+ shows a notification for these). The one sec app uses exactly this pattern: one automation per app, "Is Closed" logs the close time. [one sec tutorial], [Apple Shortcuts guide], [Cassinelli on Run Immediately].
- So: one automation per distracting app (open + close) → `Get Contents of URL` POST to a small endpoint with a secret token. Automations are per-device and don't sync between devices. [Apple Shortcuts guide]
- Limits to be honest about: it only sees the apps you list, not total phone use; you must create the automations once by hand; notifications appear when they run.
- Android equivalent (later): Tasker/Automate HTTP POST on app foreground change.

## 4. Measuring focus

- Rize's model: per session, split time into focused vs. distracted, count context switches, name the apps that broke flow, nudge breaks. No public formula. [Ness Labs on Rize]
- Runway's formula (transparent, explainable):
  - `session_seconds` = wall time of the session minus planned breaks
  - `phone_seconds` = overlap of distracting-app open→close intervals with the session's focus time (unclosed opens are capped at the session end, and at 10 min max per interval)
  - `focus_pct = 1 − phone_seconds / session_seconds`, clamped to 0–100
  - Also show **pickups** (number of distracting-app opens) and **longest unbroken stretch**.

## 5. Backend choice

- Supabase free tier (as of May 2026): 2 projects, 500 MB Postgres, 50k auth MAU, 500k Edge Function invocations/month, 5 GB bandwidth; **free projects pause after 7 days with no API requests**. [Automation Atlas]
- The repo's existing 15-minute GitHub Action can ping the project, which keeps it awake for free.

## Sources

- [Spotify: February 2026 Web API Dev Mode Changes – Migration Guide](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide)
- [TechCrunch: Spotify changes developer mode API to require premium accounts, limits test users (2026-02-06)](https://techcrunch.com/2026/02/06/spotify-changes-developer-mode-api-to-require-premium-accounts-limits-test-users/)
- [Spotify community: Web Playback SDK player.connect() never resolves in Development Mode (2026-03-31)](https://community.spotify.com/t5/Spotify-for-Developers/Web-Playback-SDK-player-connect-never-resolves-in-Development/td-p/7392190)
- [one sec: intentional app switching with Shortcuts](https://tutorials.one-sec.app/intentional-app-switching)
- [Apple: Intro to personal automation in Shortcuts (iOS 26)](https://support.apple.com/en-ca/guide/shortcuts/apd690170742/9.0/ios/26)
- [Matthew Cassinelli: automations now run immediately](https://matthewcassinelli.com/sirishortcuts/automations)
- [Forest: product overview](https://forestapp.cc/llms-full.txt)
- [Opal](https://opalapp.com/)
- [Gridfiti: aesthetic study websites (Jan 2026)](https://gridfiti.com/aesthetic-study-websites/)
- [Ness Labs: how Rize quantifies focus](https://nesslabs.com/rize-featured-tool)
- [Automation Atlas: Supabase free tier limits 2026](https://automationatlas.io/answers/supabase-free-tier-limits-2026/)
- [YPT on the App Store](https://apps.apple.com/us/app/-/id1441909643)

[Spotify migration guide]: https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide
[TechCrunch]: https://techcrunch.com/2026/02/06/spotify-changes-developer-mode-api-to-require-premium-accounts-limits-test-users/
[Spotify community thread]: https://community.spotify.com/t5/Spotify-for-Developers/Web-Playback-SDK-player-connect-never-resolves-in-Development/td-p/7392190
[one sec tutorial]: https://tutorials.one-sec.app/intentional-app-switching
[Apple Shortcuts guide]: https://support.apple.com/en-ca/guide/shortcuts/apd690170742/9.0/ios/26
[Cassinelli on Run Immediately]: https://matthewcassinelli.com/sirishortcuts/automations
[Ness Labs on Rize]: https://nesslabs.com/rize-featured-tool
[Automation Atlas]: https://automationatlas.io/answers/supabase-free-tier-limits-2026/
