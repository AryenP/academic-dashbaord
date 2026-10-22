# Technical Specifications — Runway v2 open backlog

Source: `BACKLOG.md` (mirrors `docs/v2/BACKLOG.md` in the app repo). Phases 0–4 of `docs/v2/SPEC.md` are
live as of 2026-10-22. This document covers what is left: Phase 5 (signals), extension packaging, an
end-to-end new-user test, quality gates, and small UI items.

## 0. Where the code lives

- App repo (separate git repo, the one that deploys): `/Users/AryenP/Downloads/academic-dashbaord`
  (referred to below as `APP/`). All implementation work happens there.
- This Ralph workspace: `APP/BACKLOG/` (its own git repo, holds only `.ralph/` and the backlog).
- House rules: `APP/CLAUDE.md`. Specs: `APP/docs/v2/SPEC.md` (current), `APP/docs/SPEC.md` (v1).
  Decisions log: `APP/docs/DECISIONS.md` — one line per deviation from the spec.
- Backlog to tick: `APP/docs/v2/BACKLOG.md` (tick `[x]` and date under Completed) and
  `.ralph/fix_plan.md` here.

## 1. System architecture (existing, do not break)

- Frontend: React 19 + Vite 8 + TypeScript, PWA, prerendered landing (`scripts/prerender.tsx`).
  Hash routes (`#/signin`, Connect, Courses, Stats, Settings, Share).
- Backend: Supabase (Postgres with RLS, Auth with magic link + Google, Vault, Edge Functions on Deno).
  Live project ref `uhqurcspebdxtkalbduc`. Pushing `main` deploys.
- Edge Functions in `supabase/functions/`: `classify-events`, `diag`, `draft-plan`, `import-items`,
  `phone-event`, `plan-feed`, `read-syllabus`, `sync-sources`, `validate-source`, `weekly-review`.
  Shared code in `supabase/functions/_shared/` (`auth.ts` holds the shared CORS headers,
  `planner.ts` holds `allocate`, `weekly.ts` holds `WeekFacts`).
- Migrations `supabase/migrations/0001…0011`; next is `0012`.
- Per-user tokens: `token_owner(p_purpose text, p_token_hash text) returns uuid` (migration 0008,
  service_role only), used by `import-items` for the browser extension.
- AI calls are server-side only (Claude, metered in `ai_usage`); user confirms before AI proposals become a plan.
- v1 features must keep passing: sessions, breaks, phone focus, Spotify, offline queue.

## 2. Data models

### 2.1 `signals` (new, migration `0012_signals.sql`)

| column    | type        | notes |
|-----------|-------------|-------|
| `user_id` | uuid        | references `auth.users(id)` **on delete cascade** |
| `day`     | date        | the local day the summary describes |
| `kind`    | text        | check `kind in ('sleep_h','exercise_min','steps','place')` |
| `value`   | numeric     | nullable for `place` if only a label is sent |
| `label`   | text        | free text, e.g. a coarse place name |
| `source`  | text        | e.g. `shortcut` |

- Unique per `(user_id, day, kind)` so the function can upsert per day.
- RLS enabled; own-rows policies only (`user_id = auth.uid()`) for select/insert/update/delete.
- Account deletion cascades.
- Test in `supabase/tests/rls.test.ts`: user B cannot see user A's signals.
- After the migration: `npm run types` (regenerates `src/lib/database.types.ts`).

### 2.2 Share level "readiness" (low priority)

- New share level that exposes exam checkpoints but no block titles. Extend the share-level SQL
  (migration 0009 functions) and the share-level RLS tests.

### 2.3 Course color override (low priority)

- Per-course color choice among the five course slots plus the sixth gray; persisted on `courses`.

## 3. API specifications

### 3.1 `signals` Edge Function (new)

- `POST /functions/v1/signals`, one coarse daily summary per call.
- Auth: per-user token in a header, resolved with the same lookup as `import-items`
  (hash the token, call `token_owner`). Token is the one shown in Settings → Extension.
- Body (JSON): `{ day: 'YYYY-MM-DD', kind, value?, label?, source? }` (accept a small array of these
  if convenient, but one row is the contract).
- Validation:
  - `kind` ∈ {`sleep_h`, `exercise_min`, `steps`, `place`}; otherwise 400.
  - Ranges: `sleep_h` 0–24, `exercise_min` 0–1440, `steps` 0–200000 (integer), `place` needs a
    short `label` (cap length, e.g. 80 chars). Reject NaN/negative.
  - `day` is a valid date, not far in the future.
- Upsert on `(user_id, day, kind)`.
- CORS: the token header is added to the shared allow-list in `supabase/functions/_shared/auth.ts`
  (`Access-Control-Allow-Headers`); OPTIONS handled like the other functions.
- Deno tests (`npm run test:fn`): bad token → 401, bad kind/range → 400, good row → upserted, second
  post same day → updated not duplicated.

### 3.2 `signal_patterns(p_user uuid)` SQL function (new)

- Returns facts correlating signals with session focus % and hours (e.g. focus by hour band after
  11 PM; focus on mornings after a workout vs. not; sleep hours vs. next-day focus).
- Returns nothing for a pattern until there are at least 7 days of data behind it.
- Callable only for the caller's own data (security definer with `p_user = auth.uid()` check, or
  invoker with RLS).

### 3.3 `draft-plan` and `allocate` (medium priority)

- Hours of day with ≥ 60 % average focus over the last 14 days get a small score bonus in
  `allocate` (`supabase/functions/_shared/planner.ts`).
- No behaviour change when there is no history. Unit test with a seeded focus history.

### 3.4 `weekly-review` (medium priority)

- Extend `WeekFacts` (`_shared/weekly.ts`) with signal facts (late nights, sleep hours) when present;
  same "tends to" wording rule; extend its Deno test (the `WeekFacts` /
  `writeWeekly` test currently lives in `_shared/syllabus.test.ts`).

## 4. User interface requirements

All screens: work at 375 px wide, light and dark, keyboard-reachable, axe-clean. Keep the runway
identity (Big Shoulders Display numerals, course colors with ink/on variants, red hatched exams,
calm focus screen). Inline SVG icons, never emoji.

- **Connect → "Runway nightly" Shortcut guide**: a card under Connect, step-by-step, SVG diagrams in
  the style of `src/connect/guides.tsx`. Steps: create Shortcut, *Find Health Samples* (sleep,
  exercise minutes, steps), build the JSON body, *Get Contents of URL* POST to the signals function
  with the token header (token from Settings → Extension), set a nightly personal automation.
  Screenshots at 390×844 and 1440×900, light and dark.
- **Stats → "Patterns"**: plain-words sentences from `signal_patterns`, e.g. "focus after 11 PM tends
  to average 40 %", "mornings after a workout tend to run 20 points higher". Wording always
  "tends to", never "because". Nothing shown until 7 days of data. Sentence builder is a pure
  function with unit tests (vitest).
- **Settings → Account**: read-only list of linked sign-in methods (email, Google) from
  `app_metadata.providers`.
- **Courses**: per-course color picker (five slots + gray), axe-clean, keyboard operable.
- **Share page**: "readiness" level option.

## 5. Tooling and packaging

- `npm run ext:zip`: builds `extension/dist/runway-extension-<version>.zip`, version read from
  `extension/manifest.json`. Exclude tests and dev files. `extension/dist/` git-ignored.
- `extension/STORE.md`: Chrome Web Store listing text, single-purpose description, permission
  justifications (one per permission in the manifest), privacy answers: no remote code, data sent
  only to the user's own Runway account, grades off by default.
- `npm run lighthouse`: mobile audits of the landing page and `#/signin` served from built `dist/`;
  exits non-zero below performance 90 or accessibility 100. Fix whatever it finds.

## 6. Testing requirements

- `npm run check` (lint, format, unit, build with prerender, public browser tests) must pass.
- With Docker and `supabase start`: `npm run test:db`, `npm run test:fn`, and
  `supabase functions serve --no-verify-jwt` then `npm run test:e2e:db`.
- New-user e2e (`tests/e2e-db/`): fresh account → lands on Connect → uploads fixture `.ics` → reaches
  Courses → accepts a draft plan → sees the runway. Also: a rejected Google callback (`?error=…`)
  lands on `#/signin` with the school-email message.
- Do not modify existing tests except to extend them as specified above.

## 7. Security and privacy

- Personal data private by default, enforced by RLS, not the UI. Every new table gets a
  "user B can't see user A" test. Account deletion cascades.
- Signals are coarse daily summaries only — no raw health samples, no precise location.
- Never commit secrets (feed URLs, service-role key, access token, Anthropic key, phone/feed tokens).
  Public by design: Supabase URL, publishable key, Spotify client ID.
- Tokens are stored hashed; lookups go through `token_owner`.
- New accounts need a school email (`is_school_email` in DB, `src/lib/email.ts` in UI).

## 8. Operational notes

- Apply migrations (`supabase db push`) before pushing code that needs them; pushing `main` deploys.
- Function log tables are missing on the live project: debug Edge Functions locally
  (`supabase functions serve`) or with the `diag` function.
- Dashboard saves take about a minute to reach the auth server.
- Never run `supabase config push` without `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET` in the shell.

## 9. Out of scope for autonomous work (needs Aryen)

Turning the school-email rule back on, SMTP provider, Supabase support ticket, Google brand
verification / custom auth domain, Google Calendar scope review and OAuth calendar path, Chrome Web
Store developer account and upload, wearable OAuth apps (Fitbit, Oura), Runway v3 native iOS wrapper.
