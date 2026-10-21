# Prompt for the new chat (Runway v2)

Paste everything below the line into a new Claude Code session opened in `~/Downloads/academic-dashbaord`.

---

You're turning **Runway** from a single-user study app into a product anyone can sign up for. The repo is `~/Downloads/academic-dashbaord` (GitHub `AryenP/academic-dashbaord`, live at `https://aryenp.github.io/academic-dashbaord/`). Runway v1 is finished and live. Build on it; don't restart it.

## Read first, in this order

1. `CLAUDE.md`: house rules (they still apply).
2. `docs/v2/BRAINSTORM.md`: **the plan for v2**: the flow, architecture changes, AI choices, design direction, phases and open decisions.
3. `docs/SPEC.md`, `docs/RESEARCH.md`, `docs/DECISIONS.md`: what v1 does and why. DECISIONS has every deviation and its reason; keep adding to it.
4. `README.md`: the stack, tests and how to run things.
5. The code: `src/` (Vite + React + TS, hash routing), `supabase/migrations/` (schema and RLS), `supabase/functions/phone-event/`, `scripts/sync.py`, `.github/workflows/`.

## Where v1 stands (facts, not plans)

- **Frontend:** Vite + React + TypeScript on GitHub Pages, deployed by `.github/workflows/deploy.yml`. Only the runway is in the first bundle; other views lazy-load. The service worker is generated per build (`src/sw/sw.js`, vite plugin). Lighthouse mobile: 96 performance, 100 accessibility.
- **Backend:** Supabase project `uhqurcspebdxtkalbduc`, linked with the CLI (`supabase link` done; you're logged in). Migrations `0001_init`, `0002_public_level` are applied. The `phone-event` Edge Function is deployed. Auth Site URL is the Pages URL, and **sign-ups are off** (`enable_signup = false` in `supabase/config.toml`, pushed). v2 must turn them back on deliberately.
- **Accounts:** `apalkar@ucsd.edu` (owner) and `aryen.ronenpalkar@gmail.com`, both Aryen.
- **Plan data:** `scripts/sync.py` turns Aryen's Google Calendar (repo secret `GCAL_ICS_URL`) into `public/data.json` every 15 minutes. **That file and its git history are public. v2 retires it** (see the brainstorm).
- **Tests:** `npm run check` (lint, format, Vitest, build, Playwright, pytest), `npm run test:db` (RLS against local Supabase), `npm run test:fn` (Deno), `npm run test:e2e:db` (signed-in browser flows, axe, offline, Spotify faked at the network layer). Local Supabase needs Docker: `supabase start`.
- **Spotify:** PKCE remote control is built, but Development Mode caps it at 5 users. No Client ID is set yet.

## How to work

**Start by talking, not building.** Go through "Decisions for Aryen" at the end of `docs/v2/BRAINSTORM.md` with Aryen. Give your recommendation on each in one or two lines, and let him decide. Then write `docs/v2/SPEC.md` (same style as `docs/SPEC.md`) and get a yes before writing code.

Then build in the brainstorm's phases (0 → 4). After each phase:
- Run every test suite that applies, and add tests for new behavior. RLS gets database tests; anything multi-user gets a "user B can't see user A" test.
- Take Playwright screenshots at 390×844 and 1440×900, light and dark. Look at them and fix what's off.
- Commit with a plain conventional message and push to `main`. Pushing deploys. Never break the live site: if Pages or the database setup has to change, do that first.
- Add a line to `docs/DECISIONS.md` for anything that differs from the spec.

**Stop and ask Aryen** only for things only he can do or decide: Google Cloud / OAuth verification, Anthropic API key and billing, a Spotify app, legal and privacy wording sign-off, and anything that deletes real data or rewrites git history.

## Design

- **Load these skills before building UI:** `ui-ux-pro-max` (installed) and Anthropic's official `frontend-design` skill (`anthropics/skills`). Install it if it's missing, after confirming the repo on GitHub.
- **Keep Runway's identity:**
  - the departure-board runway
  - Big Shoulders Display for numbers and dates
  - course colors with their accessible ink and label variants (`src/styles/tokens.css`)
  - red hatched exams
  - a focus screen that's calm and enormous

  Don't adopt the generic palette or layout the design skill suggests by default; take its UX rules.
- **Landing page:** the hero is a live demo runway with made-up courses. One orchestrated animation, `prefers-reduced-motion` respected.
- **Onboarding:** at most three screens before the first runway (connect → review → runway). Ask everything else later, in context.
- **No generic card grids, no gradient washes, no emoji icons** (inline SVG). Touch targets ≥ 44 px, body text ≥ 16 px on phones, 4.5:1 contrast, keyboard-reachable everything. axe must stay clean (`tests/e2e-db/a11y.spec.ts`).

## Schoolwork sources (see BRAINSTORM §3b–3c)

- **Canvas calendar feed** is the default: every student has one. It has no submission status or grades.
- **Canvas API:** don't ask students for personal access tokens. Instructure's policy forbids it for multi-user apps, and many schools block them. Real Canvas OAuth needs each school's admin to enable a developer key, so it's a later, per-school partnership.
- **Gradescope** has no official API. Never store Gradescope passwords. Coverage comes from:
  - a Runway browser extension that reads pages the student is logged into
  - paste/screenshot import read by the AI
  - manual "Submitted" tick-off
- **Setup guides are part of the product:**
  - find the school from the email domain and deep-link to its Canvas calendar
  - three steps per source, with drawn diagrams
  - instant link validation ("Found 4 courses ✓")
  - a "this didn't work" path for common mistakes (the cut-off "…" address is a real one)
  - everything skippable and come-back-able

## AI (Claude API)

- **Calls run server-side only** (Supabase Edge Functions). The Anthropic key lives in Supabase secrets, never in the browser or the repo.
- **Default model:** Claude Opus 5.5 (`claude-opus-5-5`), with structured outputs (`output_config.format`) for classification and plans. Use the `claude-api` skill for current API shapes; don't write API code from memory.
- **Build the eval set before tuning:** Aryen's labeled real calendar. Whether a cheaper model (Claude Haiku 5.5, `claude-haiku-5-5`) handles classification is Aryen's call, made from eval results.
- **Send only what's needed:** titles, times, locations. Classify only new or changed events (hash them). Cache the stable system prompt. Rate-limit per user, with a monthly AI budget and a hard stop.
- **The user confirms before anything becomes a plan.** The AI proposes; the review screen decides.

## Ground rules (unchanged from v1)

- **No AI attribution anywhere:** no `Co-Authored-By` or "Generated with" lines in commits or PRs, and no AI mentions in the UI or README beyond what the product itself does ("Runway reads your calendar"). `.claude/settings.json` already disables attribution; check every commit message anyway.
- **Never commit secrets:**
  - calendar feed URLs, the Supabase secret / service-role key, access tokens, the Anthropic key, phone tokens
  - feed URLs live encrypted in the database (Supabase Vault)

  Public by design: the Supabase URL and publishable key, and the Spotify Client ID.
- **Personal data is private by default and enforced with Row Level Security,** not just the UI. Account deletion removes everything.
- **Don't break what works:** v1's sessions, phone focus, offline queue and tests keep passing while v2 grows around them.
