# Runway v2 — open backlog

Phases 0–4 of [SPEC.md](./SPEC.md) are live as of 2026-10-22. This is what's left, highest value first,
written so that one item is one sitting. Tick items with `[x]` and date them under Completed. Every
deviation from the spec still gets a line in [DECISIONS.md](../DECISIONS.md). House rules: `CLAUDE.md`.

## High priority
- [x] 2026-10-22 · `signals` Edge Function: token-authenticated POST of coarse daily rows, validated and upserted, Deno-tested, deployed.
- [x] 2026-10-22 · Connect guide for the iPhone Shortcut: drawn three-step card on Connect (folded) and Settings, own token purpose, received-signals list, e2e-tested.
- [x] 2026-10-22 · Stats "Patterns": `signal_patterns` SQL facts, plain-words sentence builder with thresholds and unit tests, section on Stats.
- [x] 2026-10-22 · Extension packaging: `npm run ext:zip` and `extension/STORE.md` with listing, permissions and privacy answers.
- [ ] New-user path end to end: a `tests/e2e-db` spec that creates a fresh account, lands on Connect, uploads the fixture `.ics`, reaches Courses, accepts a draft plan and sees the runway; also asserts a rejected Google callback (`?error=…`) lands on `#/signin` with the school-email message.

## Medium priority
- [ ] Planner respects signals: `draft-plan` prefers windows that have worked for this student (hours with ≥ 60 % average focus over the last 14 days get a small score bonus in `allocate`); unit test with a seeded focus history; no change when there is no history.
- [ ] Lighthouse: `npm run lighthouse` runs mobile audits on the landing page and `#/signin` from the built `dist/` and fails below performance 90 / accessibility 100; fix whatever it finds.
- [ ] Weekly review mentions signals when present (late nights, sleep hours) with the same "tends to" rule; extend `WeekFacts` and its Deno test.
- [ ] Settings → Account shows which sign-in methods are linked (email, Google) from `app_metadata.providers`, read-only.

## Low priority
- [ ] Share page: a "readiness" share level that shows exam checkpoints without block titles; covered by the share-level RLS tests.
- [ ] Courses: a per-course color override (five slots plus the sixth gray) with an axe-clean picker.

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
