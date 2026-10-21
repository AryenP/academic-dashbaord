# Runway — working notes for coding agents

Runway is a study app anyone with a school email can sign up for: connect a calendar, see a runway to every exam, run sessions with phone-verified focus. v1 (single user) is done; v2 is being built in phases. Specs: `docs/v2/SPEC.md` (current), `docs/SPEC.md` (v1). Plan: `docs/v2/BRAINSTORM.md`. Research: `docs/RESEARCH.md`. Decisions log: `docs/DECISIONS.md` (add a line for every deviation from the spec).

## Rules

- No AI attribution: no `Co-Authored-By` or "Generated with" lines in commits or PRs, no AI mentions in the UI or README beyond what the product does. Check every commit message.
- Never commit secrets (calendar feed URLs, Supabase service-role key or access token, the Anthropic key, phone or feed tokens). Public by design: Supabase URL and publishable key, Spotify client ID.
- Personal data is private by default and enforced with Row Level Security, not the UI. Every new table gets a "user B can't see user A" test in `supabase/tests/rls.test.ts`. Account deletion cascades.
- New accounts need a school email (`is_school_email` in the database, `src/lib/email.ts` in the UI).
- AI calls run server-side only (Supabase Edge Functions); the key lives in Supabase secrets. The user confirms before anything the AI proposes becomes a plan.
- Every screen works at 375px wide, light and dark, keyboard-reachable, axe-clean. Keep the runway identity: Big Shoulders Display numerals, course colors with ink/on variants, red hatched exams, a calm focus screen. Inline SVG icons, never emoji.
- Don't break v1: sessions, breaks, phone focus, Spotify, offline queue and their tests keep passing.
- Commit messages: short, imperative, conventional prefix (`feat:`, `fix:`, `docs:`, `chore:`). Pushing to `main` deploys; apply database changes (`supabase db push`) before pushing code that needs them.

## Plan data

The plan is per user in the database: `courses` and `plan_items` (kind: study, deadline, exam, class, commitment), built into the runway's shape by `src/lib/planBuild.ts` in the person's timezone. The landing page draws a demo plan (`src/landing/demo.ts`). The v1 calendar sync (`scripts/sync.py`, `public/data.json`) is retired; calendar sources come back server-side in Phase 1.

## Tests

`npm run check` (lint, format, unit, build with prerender, public browser tests). With Docker and `supabase start`: `npm run test:db`, `npm run test:fn`, `supabase functions serve --no-verify-jwt` then `npm run test:e2e:db`. Regenerate types after a migration: `npm run types`.
