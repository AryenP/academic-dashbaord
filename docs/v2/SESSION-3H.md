# Runway — a three-hour working session

You are taking over Runway (`/Users/AryenP/Downloads/academic-dashbaord`) for about three hours
while Aryen is away. Work on your own, one item at a time, in the order below. Finish each item
fully (code, tests, docs line, commit, push) before starting the next. If an item can't be finished,
leave the repo green, write what blocked you in the report, and move on.

## Read first (10 minutes)

1. `CLAUDE.md`: the house rules. They win over this file.
2. `docs/v2/BACKLOG.md`: what's done (all twelve agent items as of 2026-10-22) and what only Aryen
   can do. Don't touch the "Needs Aryen" section.
3. `docs/DECISIONS.md`, the last ~20 entries: the state of the live project and the reasoning.
4. `docs/v2/SPEC.md` only when an item below points you at a section.

## Non-negotiables

- **No AI attribution anywhere.** No `Co-Authored-By`, no "Generated with", in commits, PRs, UI or
  docs. Check every commit message before pushing.
- **Never commit secrets**: calendar feed URLs, the service-role key, the Anthropic key, the Google
  client secret, phone/feed/extension/shortcut tokens. `.env.local` and `.env.functions.local` stay
  git-ignored. Never run `supabase config push`.
- **Pushing `main` deploys the live site.** Run `npm run check` before every push. A migration goes
  live with `supabase db push` *before* the code that needs it is pushed. Deploy a changed Edge
  Function with `supabase functions deploy <name> --no-verify-jwt`.
- **Personal data stays private by RLS.** Any new table gets a "user B can't see user A" test in
  `supabase/tests/rls.test.ts`, and account deletion must cascade to it.
- **Every screen**: 375 px wide, light and dark, keyboard-reachable, axe-clean. Keep the runway
  identity. Inline SVG, never emoji.
- **Don't break v1**: sessions, breaks, phone focus, Spotify, offline queue and their tests.
- **One writer per checkout.** Nobody else is editing this repo while you work; don't start any
  background loop or second session that writes to it.
- Commit messages: short, imperative, conventional prefix (`feat:`, `fix:`, `docs:`, `test:`,
  `chore:`). Every deviation from the spec gets a dated line in `docs/DECISIONS.md`.

## Environment (5 minutes)

```bash
cd /Users/AryenP/Downloads/academic-dashbaord && docker info >/dev/null 2>&1 || docker desktop restart
```

```bash
cd /Users/AryenP/Downloads/academic-dashbaord && supabase start && supabase db reset && npm run types && npm run check
```

For the signed-in browser suite, start the functions runtime in the background first:
`supabase functions serve --no-verify-jwt --env-file .env.functions.local` then
`npm run test:e2e:db`. If the runtime logs "Edge Runtime container is no longer available", restart
it; the tests fail for that reason, not yours. Screenshots from the suites land in
`tests/e2e/__screenshots__/` (public) and the db suite's own folder; look at them.

If Docker can't be started, skip items 2, 3 and 7 and say so in the report.

## The work, in order

### 1 · Classification: where the course comes from (45 min)

`npm run eval:classify` reports the title rules at kind 100 %, course 29.2 % over 48 labelled
events (`eval/classify.json`). The misses are events with no course code in the title ("Lab 5
due", "📚 final prep") whose course is only knowable from context: the calendar they came from,
the course's exam on the same day, or the person's course list. The spec's bar is 95 % before the
AI is on by default, and the AI path is what reads these.

- Run the eval against the model too (`npm run eval:classify -- --ai`; the key is in
  `.env.functions.local` as `ANTHROPIC_API_KEY`; it costs cents). Record both numbers.
- Read `supabase/functions/_shared/classify.ts` (`knownCourses`, `matchKnown`) and
  `supabase/functions/_shared/ai.ts`. Improve what the rules can do without guessing: an event
  from a Canvas feed belongs to the course whose code is in that feed's events; a study-looking
  event on the day of, or the day before, a known exam most likely belongs to that exam's course
  (mark it `confidence` low so the AI still reviews it). Don't invent course codes.
- Add eval cases for anything you fix. Re-run both numbers. Target: rules course ≥ 60 %, AI course
  ≥ 95 %. If the AI is under 95 %, improve the context it's given (the person's course list with
  names, the source calendar's name), not the prompt's tone.
- Deno tests for the new rules. `DECISIONS.md` line with before/after numbers.

### 2 · "Download my data" (30 min)

The privacy page promises deletion; it should also offer the data. In Settings → Account add
**Download my data**: a button that fetches the person's own rows under RLS (profile, courses,
plan_items, sessions, session_breaks, phone events if any, signals, weekly_reviews, friends, access
token purposes without hashes, calendar sources without their addresses) and saves one JSON file
`runway-<handle>-<date>.json`. Client-side only; no new function. Add one sentence to
`src/views/PrivacyText.tsx` (it prerenders into `privacy.html` too). A `tests/e2e-db` test that
clicks it and checks the downloaded JSON has the keys and the person's own rows only.

### 3 · Account deletion cascades to everything new (15 min)

`delete_my_account()` (migration 0003) relies on `on delete cascade`. Extend the RLS test so a
person with rows in every table added since (events, calendar_sources, plan_items, courses,
access_tokens, feed_items if present, friends, signals, weekly_reviews, ai_usage) deletes their
account and every one of those rows is gone, while user B's rows are untouched. If anything
survives, fix the foreign key in a new migration (0016) and push it.

### 4 · Settings → Phone on a phone (20 min)

At 390 px the Phone section's status line ("Tracking is on. Follow the setup guide…") is squeezed
into a narrow column beside the Replace token / Turn off buttons (see
`src/components/PhoneSettings.tsx`, the `form-row` near line 44). Make that row stack on narrow
screens so the text runs full width and the buttons sit below it. Check the other `form-row`
uses in Settings for the same problem and fix them the same way. Verify with the screenshot
suite at 390 × 844, light and dark.

### 5 · Landing page catches up (25 min)

`src/landing/*` still says "Sign up with your school email" only and describes Phases 0–4.
- The sign-up call to action also mentions Google ("or continue with Google").
- "How it works" gets one step for Phase 5 in the same drawn style: the phone sends sleep,
  exercise and steps once a day; Stats says what tends to go with a good session.
- Keep the prerender working (`npm run build` runs it; `tests/e2e/smoke.spec.ts` checks the
  headline is in the HTML before any script). Screenshots at 390 and 1440, light and dark.

### 6 · README for v2 (25 min)

`README.md` describes v1 plus a v2 paragraph. Rewrite "What it does" to match the product as it is
now (school-email or Google sign-up, connect a calendar, the courses review, the AI reading with
confirm, the planner's proposals, the extension for submissions and grades, classmates and
friends, syllabus reading, the weekly review, the iPhone Shortcut signals and Patterns, sharing
levels, delete and download). Keep the "Why I built it" voice: first person, plain, no marketing.
Refresh `docs/screenshots/*.png` from the latest suite screenshots where the view changed (runway,
stats). Add a short "Run it yourself" section with the commands from `CLAUDE.md`.

### 7 · Planner: the model sees the good hours too (20 min)

`allocate` already prefers a student's good hours (planner.ts, `preferredHours`). The Claude path
(`draftWithClaude`) doesn't get them. Pass `preferred_hours` (local hours, e.g. `[9, 15]`) in the
request content and add one rule line to `PLANNER_PROMPT`: prefer those hours when choosing among
free slots, never at the cost of the other rules. Extend the Deno test that checks what is sent.
Deploy `draft-plan`.

### 8 · Close out (10 min)

- `npm run check`, `npm run test:db`, `npm run test:fn`, `npm run test:e2e:db` all green; push.
- `docs/v2/BACKLOG.md`: add a "Session 2026-10-22 evening" block listing what shipped and what
  didn't, with commit hashes.
- Append the report below to `docs/v2/SESSION-3H.md` under "## Report".

## Report format

For each item: done / partly / skipped, the commit hash, what was verified (which suites, which
screenshots), and anything Aryen must do or decide. Then three lines at most on what you'd do
next. No praise, no summary of the rules.
