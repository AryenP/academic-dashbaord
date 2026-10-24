# Runway v2 — open backlog

Phases 0–4 of [SPEC.md](./SPEC.md) are live as of 2026-10-22. This is what's left, highest value first,
written so that one item is one sitting. Tick items with `[x]` and date them under Completed. Every
deviation from the spec still gets a line in [DECISIONS.md](../DECISIONS.md). House rules: `CLAUDE.md`.

## High priority
- [x] 2026-10-22 · `signals` Edge Function: token-authenticated POST of coarse daily rows, validated and upserted, Deno-tested, deployed.
- [x] 2026-10-22 · Connect guide for the iPhone Shortcut: drawn three-step card on Connect (folded) and Settings, own token purpose, received-signals list, e2e-tested.
- [x] 2026-10-22 · Stats "Patterns": `signal_patterns` SQL facts, plain-words sentence builder with thresholds and unit tests, section on Stats.
- [x] 2026-10-22 · Extension packaging: `npm run ext:zip` and `extension/STORE.md` with listing, permissions and privacy answers.
- [x] 2026-10-22 · New-user path end to end: fresh account → Connect → upload → Courses → draft and accept → runway; rejected Google callback lands on sign-in with the reason.

## Medium priority
- [x] 2026-10-22 · Planner respects signals: `preferredHours` from two weeks of focus history; good hours get first pick within a day; Deno-tested; no change without history.
- [x] 2026-10-22 · Lighthouse: `npm run lighthouse` (mobile, landing + sign-in, bars 90/100); first run 99/100 and 97/100.
- [x] 2026-10-22 · Weekly review mentions signals when present, "tends to" only; WeekFacts extended; Deno test added.
- [x] 2026-10-22 · Settings → Account shows the linked sign-in methods.

## Low priority
- [x] 2026-10-22 · Share page: at the readiness level study blocks show without titles (migration 0015), covered by the share-level RLS test.
- [x] 2026-10-22 · Courses: the per-course color picker was already there; swatches now have spoken color names.

## Session 2026-10-22 evening
Worked from [SESSION-3H.md](./SESSION-3H.md); the report is at the end of that file.
- [x] Classification from context: rules course 29.2 % → 66.7 %, Opus 50.0 % → 98.0 % (`3e3f5f9`).
- [x] Download my data as one JSON file, under RLS, e2e-tested (`bfb9198`).
- [x] Account deletion checked against every table since v1; nothing survived, no migration needed (`2a700be`).
- [x] Settings rows stack on a phone (`1531a85`).
- [x] Landing page: Google in the call to action, a Phase 5 step, no sideways scroll at 390 px (`07b0149`).
- [x] README for v2 with fresh screenshots (`f94c69d`).
- [x] The model planner gets the student's good hours (`964c6e5`).
- [x] Dream phase: `#/now` second screen, the week in words, the forecast line (`7fc86b5`); the rest in [IDEAS.md](./IDEAS.md).

## Session 2026-10-22 night
Worked from [SESSION-10H.md](./SESSION-10H.md); the thinking is in [JOURNAL-10H.md](./JOURNAL-10H.md), the one page in [VISION.md](./VISION.md), the report at the end of the plan file.
- [x] The pace line under each exam checkpoint (`74c9c04`).
- [x] "What Runway holds about you" in Settings, migration 0016 live (`725a688`).
- [x] The runway's first sentence knows the hour (`242d077`).
- [x] Overfull days in the forecast and the week in words (`0f17b2c`).
- [x] The `glance` Edge Function, deployed; the Shortcut guide says so; shared plan modules use `.ts` imports (`42abed7`).
- [x] `docs/ANDROID.md` (`fea8d8b`).
- [x] The stale-sync footer with "Read them now" (`842d12a`).
- [x] `docs/RUNBOOK.md` and the CORS preflight test (`1eaf560`).
- [x] Hour three on the focus screen (`c93c66b`).
- [x] The runway prints (`551fefe`).
- Cut: nothing from the ranked list. Dropped after looking: the agenda "clip" at 375 px is a keyboard-focusable scroll region, not a bug.
- Next (see VISION.md): study together from free time; the last day ("your term, wrapped"); a sync that reports its own silence to Aryen and a deploy that checks the live functions first.
- Needs Aryen: nothing new; the existing items below (SMTP, the school-email switch, the store listing) matter more now that the first minute is good.

## Session 2026-10-23
Continued from the ten-hour session, taking VISION.md's three next things in order. Report: the "Continued" section at the end of [SESSION-10H.md](./SESSION-10H.md).
- [x] Study together from shared free time, migration 0017 live (`8ad8eaa`).
- [x] The term in the student's own numbers at `#/term` (`e0cdf31`).
- [x] The sync fails its run when calendars are overdue; a smoke job after each deploy; `sync-sources` deployed (`86fd714`).
- Next (VISION.md): the first minute (read a calendar before the account exists), learn from the planner's discards, a forecast you can drag.

## Needs Aryen (accounts, money, or sign-off)
- [ ] Turn the school-email rule back on before launch: `update app_config set value = 'true' where key = 'school_email_only'`.
- [ ] SMTP provider in Supabase Auth so magic-link emails stop hitting the built-in cap.
- [ ] Supabase support ticket for the function gateway 503 spells (draft in `docs/support-ticket-2026-10-21.md`, git-ignored).
- [ ] Google brand verification or a custom auth domain so the consent screen says "Runway" instead of the Supabase hostname.
- [ ] Google Calendar read-only scope and its review, then the OAuth calendar path.
- [ ] Chrome Web Store developer account; upload the zip from the packaging task.
- [ ] Wearable OAuth apps (Fitbit, Oura) before any wearable sync is built.
- [ ] Runway v3: native iOS wrapper (HealthKit, Screen Time, Live Activities).

## Completed
- [x] 2026-10-21 · Phases 0–4: multi-user, sources and sync, AI reading, planner and extension, classmates, friends, syllabus reading, weekly review.
- [x] 2026-10-22 · Google sign-in live; sign-up rule switchable; failed OAuth callbacks explained on the sign-in page; the app no longer hangs on a dead session; adding a calendar can't get stuck; extension CORS fixed.

## Notes for whoever picks this up
- Live project ref `uhqurcspebdxtkalbduc`; pushing `main` deploys. Apply migrations (`supabase db push`) before pushing code that needs them.
- Function log tables are missing on this project: debug Edge Functions locally (`supabase functions serve`) or with the `diag` function.
- Dashboard saves take about a minute to reach the auth server. Never run `supabase config push` without `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET` in the shell.
- [x] 2026-10-22 · Phase 5 schema: `signals` table (migration 0012) with own-rows RLS, range checks, cascade on account delete and RLS tests.
