# Decisions

Changes from `docs/SPEC.md` and `docs/BUILD_PROMPT.md`, with the reason for each.

- **2026-10-20 · Sync calls Deploy directly (`workflow_call`) instead of Deploy listening for `workflow_run`.** Pushes made with `GITHUB_TOKEN` don't trigger other workflows, and calling it only when the plan changed avoids a rebuild every 15 minutes.
- **2026-10-20 · The build bundles a copy of `public/data.json`.** The runway draws instantly and offline, then the page fetches the live file, like the old inline snapshot did.
- **2026-10-20 · Build-time config comes from repo secrets** (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SPOTIFY_CLIENT_ID`), the same secrets the sync uses, so there's one place to set them. All three are public by design; they're secrets only for convenience.
- **2026-10-20 · Screenshots are written for review, not diffed.** `tests/e2e/screens.spec.ts` saves them to `tests/e2e/__screenshots__/` (git-ignored). Pixel diffs across OS font rendering would be noise in CI.
- **2026-10-20 · Added `.github/workflows/ci.yml`** to run `npm run check` on every push, so the Deploy workflow only needs lint, unit tests and the build.
- **2026-10-20 · Tests run in Pacific time** (`TZ` for Vitest, `timezoneId` for Playwright). The plan's day boundaries are Pacific, and CI runners are UTC.
- **2026-10-20 · `profiles.is_owner`.** The first account to sign up is the owner, and `public_daily_totals()` shows only the owner's totals. Nobody can change `is_owner` from the client. After signing in once, turn off sign-ups in Supabase (Authentication → Sign In / Providers → "Allow new users to sign up").
- **2026-10-20 · `sessions.paused_at`.** Not in the original schema. Pause is a state, and the timer is derived from timestamps, so the start of the current pause has to be stored. Resuming folds it into `paused_seconds`.
- **2026-10-20 · Session transitions are SQL functions** (`pause_session`, `resume_session`, `start_break`, `end_break`, `end_session`). The web app and the phone function share them, they're atomic, and they use the database clock. They run as the caller, so RLS still applies.
- **2026-10-20 · Only one unfinished session per person** (partial unique index). A second "start" from the phone is a no-op.
- **2026-10-20 · Rate limit uses a `phone_rate` table** (per token hash, per minute) behind a service-role-only function. Supabase has no built-in KV.
- **2026-10-20 · Database and function tests.** `npm run test:db` runs the RLS tests against a local Supabase, and `npm run test:fn` runs the phone-event handler tests in Deno. CI runs both in a `backend` job.
- **2026-10-20 · `session_breaks.paused_before`.** Each break stores how much pause time the session had when the break began, so "time to next break" is exact even when you pause and take breaks in the same session.
- **2026-10-20 · The timer corrects for device clock skew.** It learns the server-minus-device offset from the timestamps the server writes on start and break, so a phone whose clock is off still shows the right time.
- **2026-10-20 · On the public runway, visitors see a daily-total gauge, not time-accurate bars.** `public_daily_totals()` deliberately has no times of day. The owner sees each session at its real time.
- **2026-10-20 · Readiness counts every session for that course before the exam,** not only sessions linked to a plan block. Studying off-plan still counts.
- **2026-10-20 · Stats charts are CSS, not d3.** The bars and heatmap are simple enough that d3 would only add bundle weight.
- **2026-10-20 · Signed-in browser tests** (`npm run test:e2e:db`) run against a local Supabase and sign in by placing a real session in the browser. CI runs them in the `backend` job.
- **2026-10-20 · A pickup is opening a listed app while none is already open.** Switching straight from Instagram to TikTok is one pickup, not two. That matches what "picking up your phone" means. Overlapping app intervals are merged, so phone time is never double-counted.
- **2026-10-20 · Pauses count as focus time in focus %.** Pauses aren't timestamped individually, so the denominator is the session minus breaks, as in the spec. Phone use during a pause counts like any other.
- **2026-10-20 · `src/lib/focus.ts` has no imports**, so the Edge Function imports the same file. Metrics are frozen identically whether a session ends on the web or from the phone.
- **2026-10-20 · The phone-event function answers CORS preflights.** The setup page's "send a test from this browser" needs it. No cookies are involved and every request needs the token, so this exposes nothing.
- **2026-10-20 · The phone token is shown once and held only in memory** for that tab, so the setup guide can fill it in. The database stores its sha256. Losing it means replacing it.
