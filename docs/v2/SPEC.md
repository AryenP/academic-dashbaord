# Runway v2 — product spec

_v2 · 2026-10-21 · owner: Aryen Palkar · builds on `docs/SPEC.md` (v1) and `docs/v2/BRAINSTORM.md`_

## One line

Sign up, connect your calendar, and Runway reads it: it finds your courses, classes, exams and deadlines, drafts a study plan toward each exam, runs your sessions with phone-verified focus, and tells you how ready you are.

## What changes from v1

v1 is one person's cockpit: the plan is a JSON file built from Aryen's calendar and committed to a public repo, the first account is "the owner", and visitors see the owner's runway. v2 keeps every v1 feature (sessions, breaks, log, stats, weekly review, phone focus, Spotify, offline) and makes three things true:

1. **Every account has its own data.** No owner. Row Level Security on every table. Deleting the account deletes everything.
2. **The plan comes from the user's own sources**, synced server-side: an iCal address (Google, iCloud, Outlook), a Canvas calendar feed, an uploaded `.ics`, or the optional browser extension for Gradescope. `public/data.json` and the GitHub sync retire.
3. **The AI does the part Aryen did by hand**: classify events, group them into courses, draft study blocks before each exam. The user confirms before anything becomes a plan.

## Decisions (made 2026-10-21, see the end of BRAINSTORM)

| # | Decision | Choice |
|---|---|---|
| 1 | Name | **Runway.** The repo slug and Pages URL stay; a custom domain is a later, cosmetic step. |
| 2 | Who first | **Any student, launched to UCSD first.** Nothing school-specific in code: schools are rows in a table (email domain → Canvas URL). UCSD is the first row and the first users are classmates. |
| 3 | Aryen's schedule | **Private.** The public portfolio becomes the demo landing page. An opt-in share page (`#/u/<handle>`) exists for anyone, off by default; Aryen can turn his on if he wants the old link to keep showing something real. |
| 4 | AI model | **Opus 5.5 everywhere to start.** The model is one env var per task (classify, plan, import, review). Haiku 5.5 is tried for classification only after the eval exists, and switched on only if it clears the same 95 % bar. |
| 5 | Landing page | **Prerendered inside the Vite app, still on GitHub Pages.** The build renders the landing page to static HTML in `index.html` (react-dom/server at build time), so crawlers and link previews get real markup and the SPA hydrates over it. No hosting move. |
| 6 | Google verification | **Start now, in parallel, blocking nothing.** Phase 0 ships "Continue with Google" with identity scopes (no review needed). Google's calendar-scope review needs a public privacy page and a homepage, so Aryen submits it after Phase 0 lands those. Calendar OAuth itself is Phase 4. |
| 7 | Money | **Free while small.** A per-user monthly AI budget with a hard stop, and a global monthly cap. No pricing page. Cost per student per term is measured in Phase 2 before any tier is promised. |
| 8 | Gradescope | **The browser extension is the Gradescope route, and it's optional.** It ships in Phase 3 next to the planner. Without it, deadlines still come from the Canvas feed and the "Submitted" tick is manual. Paste/screenshot import is dropped from the plan: too much hassle for the student. |
| 9 | Grades | **Tracked through the extension, private, optional, off by default.** The extension reads released scores on Gradescope and Canvas pages; the student turns "send my grades" on in the extension. The "how did the prep go" view is Phase 4. Never shown on share pages. |
| 11 | Classmates | **Opt-in, course by course.** Runway already knows each student's school, course codes and term, so it can show who else in DSC 140A uses Runway without reading a roster. Visible only after you turn it on; stats compare only at the level each person shares. Phase 4. |
| 10 | Life outside class | **Work, research, internships and other commitments are a first-class kind.** The classifier labels them, the runway shows them as neutral blocks, and the planner never schedules over them. They come from the same calendar sources, or are added by hand ("Research lab, Tue/Thu 2–5 PM, until Dec 12"). |

## Users

- **Student (signed in):** connects sources, confirms what the AI found, runs sessions, sees readiness. Everything they have is theirs alone.
- **Visitor (signed out):** sees the landing page with a demo runway, and any share page a student has turned on. Never a real schedule by accident.

## Principles (v1's five still hold, plus)

6. **The AI proposes, the person decides.** Nothing the AI produces becomes a course, exam or plan block until the review screen says so.
7. **Setup is part of the product.** Every source has a guide with drawn steps, instant validation and a "this didn't work" path. Everything is skippable and come-back-able.
8. **Send the AI only what it needs.** Titles, times, locations. Never attendees or descriptions, except syllabus PDFs the user uploads for that purpose.
9. **Don't break v1.** Sessions, phone focus, offline queue, Spotify and every existing test keep passing while v2 grows around them.

## The flow

```
Landing ─▶ Sign up ─▶ Connect ─▶ Reading… ─▶ Review ─▶ Runway
(demo)     (Google /   (1 of 3    ("4 courses,  (fix what   (plan, sessions,
           magic link)  screens)   3 midterms")  it got     focus, readiness)
                                                 wrong)
```

Three screens between sign-up and the first runway: connect, review, runway. Break mode, phone, music and share settings are asked later, in context.

## Features by phase

### Phase 0 · Multi-user foundation

**Landing page** (`#/` signed out)
- The hero is a live demo runway with four made-up courses and three exams, counting down from "today". One orchestrated animation (blocks and exams land on the board in sequence), `prefers-reduced-motion` shows the finished state.
- One promise, one CTA, three proof sections (readiness, phone-verified focus, privacy in one line), a footer with Privacy and the GitHub link.
- Prerendered to static HTML at build time. Open Graph and Twitter meta with a static preview image.

**Sign up / sign in** (`#/signin`)
- Continue with Google (Supabase Auth, scopes `openid email profile`), and email magic link. Sign-ups are turned back on in `supabase/config.toml` and pushed in the same change that ships the landing page, never before.
- A profile row is created by the existing trigger; `is_owner` goes away.

**Per-user data**
- Migration `0003_multi_user`: new tables (below), `profiles` gains `handle`, `timezone`, `share_level`, `onboarding`, loses `is_owner`. `sessions.plan_block_id` becomes a nullable uuid foreign key to `plan_blocks`.
- `public_daily_totals()` and `public_prep_minutes()` take a handle and read `share_level` from that profile. Share pages are `#/u/<handle>`.
- Timezone is per profile (v1 hardcodes Pacific in SQL and tests). Day boundaries for totals, streaks and the runway use it.

**Retire `data.json`**
- `usePlan` reads `plan_blocks`, `exams` and `deadlines` for the signed-in user. The `phone-event` function reads the user's `plan_blocks` from the database instead of fetching the Pages URL.
- `sync.yml` stops committing. Its keep-alive ping moves to a `pg_cron` job inside Supabase, so the project stays awake without GitHub.
- `public/data.json` is deleted from the tree. Its git history stays (rewriting history is Aryen's call, not the build's); the file held study blocks and exam times, not secrets.

**Account deletion**
- Settings → "Delete my account": an Edge Function `delete-account` verifies the JWT and deletes the auth user; every table cascades. Vault secrets for the user's sources are removed in the same function.

**Privacy page** (`#/privacy`): what Runway reads, what the AI sees, what's stored, how to delete everything. Plain words. Aryen signs off on the wording.

_Done when:_ two test accounts can't see each other's rows (database tests) or screens (browser tests); signed out shows only the demo; `npm run check`, `test:db`, `test:fn`, `test:e2e:db` pass; the live site works for Aryen's two accounts.

### Phase 1 · Connect and sync

**Sources** (`#/connect`, also Settings → Sources)
- Kinds: `ical` (any secret iCal address), `canvas` (a Canvas calendar feed, which is an iCal address with a known shape), `ics_upload` (one-time snapshot), `extension` (Phase 3). Google OAuth is Phase 4.
- Feed URLs are stored in Supabase Vault; the `calendar_sources` row holds only the Vault secret id, a label and sync state. The URL never returns to the browser after saving.
- **Validation on paste:** the `validate-source` function fetches the feed, parses it, and answers "Found 4 courses and 37 items ✓" or a specific failure: not a calendar, public address instead of secret, cut-off address ending in "…", Canvas feed for a different school, empty feed.
- **School lookup:** `schools(name, email_domains[], lms, calendar_url)`. The Canvas guide deep-links to the student's school's Calendar page from their email domain. Unknown domain → a generic guide and a one-line "tell us your school" field that lands in a table for Aryen to review.
- **Guides:** one screen per source, three numbered steps with drawn SVG diagrams (the v1 phone guide's style), platform notes where steps differ (Google's secret address is web-only), and a "this didn't work" section. Skippable; a "2 of 3 connected" nudge on the runway, never a blocker.

**Sync**
- `sync-sources` Edge Function on `pg_cron` every 15 minutes: for each source due, fetch the feed with `If-None-Match` / `If-Modified-Since`, expand recurrences for the window (30 days back, 180 ahead), upsert `events` by `(source_id, uid, recurrence_id)` with a content hash, mark missing ones deleted. Backoff doubles on failure up to 24 h; the source row shows `last_error` in Settings.
- **De-duplication across sources:** the same assignment from Canvas and from Google (same title, same due time within 5 minutes) becomes one deadline with two source links.
- Events are raw; classification (Phase 2) is a separate pass over new or changed hashes. Until Phase 2 ships, a title-rule classifier (v1's rules, generalized: `📚` prefix, "midterm" / "final" / "exam", course-code regex per school) fills `kind` and `course` so Phase 1 is usable on its own.

**Aryen's migration:** his Google secret address becomes his first source; the runway he sees must match v1's within the window on the day this ships.

_Done when:_ Aryen's calendar and Canvas sync into his account; a classmate connects Canvas in under two minutes from the guide alone (timed, no help); the sync job survives a bad URL without affecting other users.

### Phase 2 · The AI reads it

**Classification** (`classify-events` Edge Function)
- Input: the user's new or changed events (title, start, end, location, all-day flag), plus the course list so far. Output, with structured outputs: for each event `kind ∈ {class, exam, deadline, study, office_hours, commitment, personal}` (a commitment is work, research, an internship, a club or anything else fixed that isn't a course), `course` (existing id or a proposed new code and name), `confidence`, and for exams `weight` if the title says it and `take_home`.
- A long, stable system prompt (rules and worked examples), cached. Events go after the cache breakpoint. At most 200 events per call; more are batched.
- Hashed: an event is re-sent only when its hash changes. Results are stored on the event row; the user's edits are stored as overrides and never overwritten by a later pass.
- **Progress shown live:** "Found 4 courses · 3 midterms · 11 deadlines" with chips filling in, from Realtime on the `courses` and `events` tables.

**Review screen** (`#/review-plan`, second onboarding screen)
- One card per course: code, name, color (changeable), classes, exams, deadlines. Each item editable inline; "Not a course" removes one; "Merge into…" joins two. Items under 0.8 confidence are flagged with "Is this right?" and a one-tap yes.
- A **Commitments** card lists work, research, internships and clubs the AI found, each with its hours per week. Add one by hand here with a title, days, times and an end date. Move an item between a course and commitments in one tap.
- A "Personal (ignored)" fold shows what was skipped, in case something was missed.
- Confirm writes `courses`, `exams`, `deadlines`; nothing is written before.

**Eval set**
- `eval/` holds Aryen's real Fall 2026 feed as a fixture with hand-labeled expected output (titles only, no descriptions; it is still private data, so the fixture is git-ignored and lives in Supabase Storage for CI). Classmates' feeds are added if they agree in writing.
- `npm run eval:classify` scores per-event kind accuracy and course-grouping accuracy per model. The bar is 95 % on both before a model is used by default.

**Budget**
- `ai_usage(user_id, month, calls, input_tokens, output_tokens, cost_cents)`. Per-user monthly cap (default 200 ¢) and a global cap, both in `app_config`. Over the cap, functions answer "Runway's AI budget for this month is used up" and the title-rule classifier keeps working.
- Per-user rate limit: 10 AI calls per minute, in the existing `phone_rate` style.

_Done when:_ ≥ 95 % on the labeled set; the review screen fixes the rest in under a minute for Aryen's calendar; cost per student per term is written down in DECISIONS.

### Phase 3 · The AI plans it, and the extension tracks what's submitted

**Plan drafts** (`draft-plan` Edge Function)
- Inputs: exams (date, weight, take-home), hours already studied per course (v1 readiness), busy times (classes, commitments like work and research, existing events), settings (hours per day, earliest and latest study time, block length, days off).
- Output, structured: study blocks per exam with `reason` ("3 h for 140A: 25 % of the grade, 6 days out"), never overlapping anything, respecting the settings. Shown on the runway as proposed (dashed) until accepted; accept all, or per block.
- **Re-plans:** when actual hours fall more than 2 h behind plan for an exam under 10 days out, the runway offers one sentence and one tap: "You're 4 h behind on 140A. Move Thursday's 151A block?"
- **The plan as a feed:** `plan-feed` Edge Function serves `webcal://…/plan-feed/<token>.ics` of the user's accepted blocks, exams and deadlines. One subscribe in Google, Apple or Outlook calendar. The token is per user, rotatable, and only its hash is stored.

**Submissions and grades**
- `deadlines` gain `status ∈ {open, submitted, missed}`, `submitted_at`, `score` (nullable, private), `max_score`. A "Submitted" tick on each deadline on the runway and in the Today list; the phone Shortcut can post `kind: "submitted"` with a deadline id.
- **Auto-ask:** when a deadline passes and a "work on" block for it was run, the next visit asks once: "Did you submit HW 2?"
- Deadlines draw green when submitted, red when missed. Weekly review counts on-time vs late. Readiness adds a small term for "homework done" on the exam's course.

**Runway browser extension (optional)**
- A Chrome and Firefox extension (Manifest V3) in `extension/`. It reads Gradescope and Canvas pages the student is logged into and sends deadlines, submission status and, if the student turns it on, released scores to the `import-items` Edge Function with the student's Runway token. Background check every 30 minutes on pages it has permission for. No passwords or cookies leave the browser.
- Items arrive as proposals: new deadlines land in a confirm list on the runway ("3 new from Gradescope"), submission status and scores apply straight to matching deadlines. Matching is by course and title; unmatched items wait in the confirm list.
- Settings → Extension shows the install link, a 20-second clip of what it does and can't see, the token, and a "grades: on/off" switch mirrored in the extension.
- Its own unit tests on saved page fixtures; the store review is Aryen's step.

**Commitments on the runway**
- Work, research and internship blocks draw in a neutral slate on the runway, under the course blocks visually, with the title. They are busy time for the planner and the "free hours this week" number subtracts them.
- Stats gain "hours by kind" (study, class, work/research) so a heavy week shows why.

_Done when:_ a student with no study blocks gets a sensible plan in under a minute that avoids their shifts; subscribing the feed shows the plan in Google Calendar; with the extension installed, Gradescope deadlines, submissions and scores show on the runway without typing anything.

### Phase 4 · Grow

- **Google Calendar OAuth** after verification: live sync without an address, and writing accepted plan blocks straight to a "Runway" calendar.
- **Syllabus PDFs** as document input: exam dates, weights and topics with page citations shown on the review screen.
- **AI weekly review:** three sentences, what went to plan, what didn't, one change for next week.
- **Grades feedback:** when scores exist (from the extension), the review shows prep hours next to the result for each exam, private.
- **Share pages** polished: the demo runway's design with the student's real plan at their chosen level.
- **Classmates.** A course card gains "3 classmates on Runway" once the student turns on *Show me to classmates* for that course (off by default, per course). Matching is school + course code + term from the student's own data; the extension can confirm the Canvas course id so sections match exactly, but it never reads a roster. Classmates see each other's first name, course and, at each person's chosen share level, hours this week, readiness and streak. A per-course board ("who's most ready for the midterm") and a friendly nudge ("4 classmates studied today"). Friends: add by handle or from a course; a friend sees your share-level stats across courses. Never notes, phone data or grades. Each setting is a row in `course_visibility(user_id, course_id, visible)` and `friends(user_id, friend_id, status)`, both under RLS, with a "user B can't see user A unless A opted in" test.

_Done when:_ five classmates use it for a full exam cycle, and at least two of them find each other on a course card.

### Phase 5 · Signals (later, after five classmates have used Phases 0–4)

- **Health and activity from the phone, not a native app.** An iOS Shortcut ("Runway nightly") reads the day's workouts, exercise minutes, steps and sleep hours with *Find Health Samples* and POSTs one summary row to a `signals` Edge Function with the phone token. A workout-ended automation can post at once. Always coarse: minutes and hours, never heart-rate traces.
- **Places, by label only.** Optional arrive/leave Shortcuts for two or three places the student names ("library", "gym"). Runway receives the label and a time, never coordinates.
- **Wearables with real APIs** (Fitbit, Oura, Garmin, Whoop) through OAuth and a server-side poll. Android's Health Connect is native-only, so the Shortcuts route stays iPhone-only.
- **A native iOS app is the real version of this.** HealthKit (workouts, sleep, HRV), Screen Time's DeviceActivity (total phone use, not just listed apps) and Live Activities for the session timer are only reachable from an app in the App Store. The web app stays the product; the iOS app wraps it (the same React views in a WebView, native modules for Health and Screen Time, the same Supabase backend). Runway v3.
- **What it's for:** correlate sleep, exercise and place with session focus %, hours and submission times (from the extension). Stats shows patterns in plain words ("focus after 11 PM averages 40 %"; "mornings after a workout run 20 points higher"), and the planner can prefer windows that have worked for this student. The wording is always "tends to", never "because": a few weeks of one person's data is a pattern, not proof.
- Private like everything else; never on share pages; deleted with the account. Schema room is left now: `signals(user_id, day, kind, value, source)`.

## Architecture

**Frontend:** unchanged stack (Vite, React, TypeScript, hash routing, GitHub Pages). New views lazy-load like v1's. The landing page is prerendered at build time. Design tokens and the runway components stay; course colors are assigned per user from the same five slots, by course order, with a sixth gray for overflow and a per-course override.

**Schema (migration `0003_multi_user` and on):**

| Table | Holds | RLS |
|---|---|---|
| `profiles` | `handle`, `timezone`, `share_level ∈ {off, runway, readiness, totals}`, `onboarding` jsonb, `settings` | own row; `handle` and `share_level` readable by anyone through the share functions only |
| `schools` | name, email domains, LMS, calendar URL | readable by all; written by service role |
| `calendar_sources` | kind, label, `secret_id` (Vault), window, `last_synced_at`, `last_error`, `backoff_until`, `etag` | own rows; `secret_id` never selected by the client (column grant) |
| `events` | `source_id`, `uid`, `recurrence_id`, hash, title, start, end, all-day, location, `kind`, `course_id`, `confidence`, `override` jsonb, `deleted_at` | own rows |
| `courses` | code, name, color slot, hidden | own rows |
| `commitments` | title, kind ∈ {work, research, internship, club, other}, event (nullable, when it came from a source), rrule or weekday/time, until | own rows |
| `exams` | course, event, title, start, end, location, weight, take-home | own rows |
| `deadlines` | course, event, title, due, status, submitted_at, score, max_score, source links | own rows |
| `plan_blocks` | course, exam, start, end, reason, `source ∈ {ai, calendar, manual}`, `accepted` | own rows |
| `ai_usage` | per user per month | own rows read-only; written by service role |
| `app_config` | global caps, model ids | service role only |
| `feed_tokens` | hash of the plan-feed token | own rows |
| `signals` | per user per day: kind (sleep_h, exercise_min, steps, place), value, source (Phase 5) | own rows; written by service role |

Everything personal cascades from `auth.users`. Every new table gets a "user B can't see user A" test in `supabase/tests/rls.test.ts`.

**Edge Functions:** `phone-event` (v1, now reads `plan_blocks`), `validate-source`, `sync-sources` (cron), `classify-events`, `draft-plan`, `import-items`, `plan-feed`, `delete-account`. The Anthropic key, the service-role key and Vault access live in Supabase secrets. AI calls use the current API shapes from the `claude-api` skill, never from memory.

**Jobs:** `pg_cron` runs `sync-sources` every 15 minutes, a nightly `classify-events` pass over anything unclassified, and a daily keep-alive. The GitHub `sync.yml` workflow is deleted.

**Secrets and keys:** public by design: Supabase URL, publishable key, Spotify Client ID. Never in the repo: feed URLs, service-role key, Anthropic key, phone and feed tokens.

**Spotify:** the playlist embed is the default for everyone. Remote control stays a beta behind an allowlist of up to 5 accounts in `app_config`.

## Success measures

- Sign-up to first runway in under 3 minutes for a student with a Canvas feed, with no help.
- Classification ≥ 95 % on the labeled eval before the AI is on by default; every AI proposal passes through a confirm.
- Zero cross-user reads: database tests prove it for every table and function.
- Lighthouse mobile ≥ 90 performance and 100 accessibility on the landing page and the runway; axe clean on every view.
- v1's test suites keep passing at every phase.

## Out of scope for v2

Native iOS or Android apps (v3, see Phase 5), Canvas API partnerships, paid tiers, group study, anything that stores a Gradescope or Canvas password.
