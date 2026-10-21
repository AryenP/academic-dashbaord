# Decisions

Changes from `docs/SPEC.md` and `docs/BUILD_PROMPT.md`, with the reason for each.

- **2026-10-20 · Sync calls Deploy directly (`workflow_call`) instead of Deploy listening for `workflow_run`.** Pushes made with `GITHUB_TOKEN` don't trigger other workflows, and calling it only when the plan changed avoids a rebuild every 15 minutes.
- **2026-10-20 · The build bundles a copy of `public/data.json`.** The runway draws instantly and offline, then the page fetches the live file, like the old inline snapshot did.
- **2026-10-20 · Build-time config comes from repo secrets** (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SPOTIFY_CLIENT_ID`), the same secrets the sync uses, so there's one place to set them. All three are public by design; they're secrets only for convenience.
- **2026-10-20 · Screenshots are written for review, not diffed.** `tests/e2e/screens.spec.ts` saves them to `tests/e2e/__screenshots__/` (git-ignored). Pixel diffs across OS font rendering would be noise in CI.
- **2026-10-20 · Added `.github/workflows/ci.yml`** to run `npm run check` on every push, so the Deploy workflow only needs lint, unit tests and the build.
- **2026-10-20 · Tests run in Pacific time** (`TZ` for Vitest, `timezoneId` for Playwright). The plan's day boundaries are Pacific, and CI runners are UTC.
