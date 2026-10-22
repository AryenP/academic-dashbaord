# Ralph Fix Plan

All paths are relative to the app repo `APP/` = `/Users/AryenP/Downloads/academic-dashbaord`.
One item = one sitting. When an item is done: tick it here, tick and date it in `APP/docs/v2/BACKLOG.md`,
and add a line to `APP/docs/DECISIONS.md` for any deviation from the spec. Order within High matters
(the table comes before the function, the function before the guide).

## High Priority
- [ ] Phase 5 schema: `supabase/migrations/0012_signals.sql` creating `signals(user_id uuid references auth.users on delete cascade, day date, kind text check in ('sleep_h','exercise_min','steps','place'), value numeric, label text, source text)`, unique `(user_id, day, kind)`, RLS on with own-rows policies; add "user B can't see user A" (and cascade-on-delete) to `supabase/tests/rls.test.ts`; `npm run types`; `npm run test:db`
- [ ] `signals` Edge Function (`supabase/functions/signals/`): POST one coarse summary, per-user token resolved like `import-items` (sha256 → `token_owner`); validate `day`, `kind` and ranges (sleep 0–24, exercise 0–1440, steps integer 0–200 000, place needs a label ≤ 80 chars); upsert on `(user_id, day, kind)`; 401/400/405 paths; OPTIONS + token header added to the CORS allow-list in `_shared/auth.ts`; Deno tests (bad token, bad kind/range, insert, same-day update); `npm run test:fn`
- [ ] Connect guide "Runway nightly": a card under Connect explaining step by step how to build the iPhone Shortcut (*Find Health Samples* for sleep / exercise minutes / steps → JSON body → *Get Contents of URL* POST to the signals function with the token from Settings → Extension → nightly personal automation), SVG diagrams in the style of `src/connect/guides.tsx`; 375 px, light/dark, keyboard, axe-clean; screenshots at 390×844 and 1440×900 in light and dark
- [ ] Stats "Patterns": SQL function `signal_patterns(p_user)` (new migration, own data only) correlating signals with session focus % and hours (late-night focus, mornings after a workout, sleep vs. next-day focus), ≥ 7 days of data before a fact is returned; pure sentence builder in `src/lib/` producing "tends to" sentences (never "because"); vitest unit tests for the builder; Patterns section on Stats that shows nothing until there's enough data
- [ ] Extension packaging: `npm run ext:zip` script building `extension/dist/runway-extension-<version>.zip` from `extension/manifest.json` version (exclude tests/dev files; git-ignore `extension/dist/`); `extension/STORE.md` with listing text, single-purpose description, one justification per permission (`storage`, Gradescope/Canvas/Supabase hosts, optional `https://*/*`), privacy answers (no remote code, data only to the user's own Runway account, grades off by default)
- [ ] New-user e2e: `tests/e2e-db/newuser.spec.ts` — fresh account → lands on Connect → uploads the fixture `.ics` → reaches Courses → accepts a draft plan → sees the runway; second case: Google callback with `?error=…` lands on `#/signin` with the school-email message; `npm run test:e2e:db`

## Medium Priority
- [ ] Planner respects signals: `draft-plan` passes a per-hour focus history; `allocate` in `supabase/functions/_shared/planner.ts` gives hours with ≥ 60 % average focus over the last 14 days a small score bonus; identical output when there is no history; unit test in `planner.test.ts` with seeded focus history
- [ ] Lighthouse: `npm run lighthouse` runs mobile audits on the landing page and `#/signin` served from built `dist/`, exits non-zero below performance 90 / accessibility 100; fix whatever it finds
- [ ] Weekly review mentions signals: extend `WeekFacts` in `_shared/weekly.ts` with late nights and sleep hours when present, "tends to" wording only; `weekly-review` loads the week's signals; extend the WeekFacts Deno test (currently in `_shared/syllabus.test.ts`)
- [ ] Settings → Account: read-only list of linked sign-in methods (email, Google) from `app_metadata.providers`; inline SVG icons; axe-clean

## Low Priority
- [ ] Share page "readiness" level: shows exam checkpoints without block titles; new migration extending the share-level SQL functions (0009); covered by the share-level RLS tests
- [ ] Courses: per-course color override (five slots plus the sixth gray) persisted on `courses`, axe-clean keyboard-operable picker, works with ink/on variants in light and dark

## Completed
- [x] Project initialization
- [x] 2026-10-21 · Phases 0–4: multi-user, sources and sync, AI reading, planner and extension, classmates, friends, syllabus reading, weekly review
- [x] 2026-10-22 · Google sign-in live; sign-up rule switchable; failed OAuth callbacks explained on the sign-in page; the app no longer hangs on a dead session; adding a calendar can't get stuck; extension CORS fixed

## Notes
- House rules live in `APP/CLAUDE.md`: no AI attribution in commits, never commit secrets, RLS test for every new table, account deletion cascades, every screen 375 px / light+dark / keyboard / axe-clean, inline SVG icons never emoji, don't break v1 (sessions, breaks, phone focus, Spotify, offline queue).
- Do not deploy: no `git push` to `main`, no `supabase db push`, no `supabase config push` (needs `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`). Commit locally; Aryen applies migrations and pushes.
- DB, function and e2e-db tests need Docker + `supabase start`; if unavailable, write the tests, record it here, and report `TESTS_STATUS: NOT_RUN`.
- Function log tables are missing on the live project (`uhqurcspebdxtkalbduc`): debug Edge Functions locally with `supabase functions serve` or the `diag` function.
- Signals are coarse daily summaries only — no raw health samples, no precise location.
- Needs Aryen (not for Ralph; kept as plain notes without checkboxes so they don't block exit): turn the school-email rule back on (`update app_config set value = 'true' where key = 'school_email_only'`); SMTP provider for Supabase Auth; Supabase support ticket for gateway 503s (`docs/support-ticket-2026-10-21.md`, git-ignored); Google brand verification or custom auth domain; Google Calendar read-only scope review and the OAuth calendar path; Chrome Web Store developer account and zip upload; wearable OAuth apps (Fitbit, Oura); Runway v3 native iOS wrapper (HealthKit, Screen Time, Live Activities).
