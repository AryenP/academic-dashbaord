# Runway runbook

What to do at 2 AM when something is wrong. Short on purpose; the reasons are in
`docs/DECISIONS.md`. Project ref `uhqurcspebdxtkalbduc` (Supabase, us-east-1, free tier); the site
is GitHub Pages from `main`.

## First look, in order

1. `https://aryenp.github.io/academic-dashbaord/` loads and shows the demo runway. If not: the last
   Deploy run under Actions → Deploy.
2. `curl -s -X OPTIONS https://uhqurcspebdxtkalbduc.supabase.co/functions/v1/phone-event -o /dev/null -w '%{http_code}'`
   answers `204`. A `503` with `{"message":"name resolution failed"}` is the gateway spell (below).
3. The last run of Actions → "Sync calendars" is green and printed `due N done N`. If it has not
   run in an hour, see "The sync stopped".
4. `supabase db remote commit --dry-run` style checks are not needed: migrations are applied by
   hand (`supabase db push`), and `supabase migration list` shows local and remote side by side.

## The gateway answers 503 "name resolution failed"

Seen 2026-10-21 after deleting a function, and again after each `functions deploy` and
`secrets set` for a while. Kong can't resolve the project's Edge Functions upstream for 20–40
minutes. Nothing we do fixes it faster; restarts did not help.

- Do: wait, and don't deploy again in the meantime (each deploy seemed to restart the clock).
- Tell: the support ticket draft is `docs/support-ticket-2026-10-21.md` (git-ignored, local).
- Meanwhile the site still works for everything that does not call a function: the runway,
  sessions, breaks, the log, stats. Calendar syncs queue up and run when the gateway is back
  (`next_sync_at` keeps its schedule; backoff only doubles on real failures).

## A deployed function reads a stale secret

Seen 2026-10-21: the hosted runtime served an old `SYNC_KEY` for hours after `secrets set`. That
is why shared secrets live in Vault and functions read them per call (`appSecret`). The `diag`
function reports the lengths of what each path sees:

```
curl -s https://uhqurcspebdxtkalbduc.supabase.co/functions/v1/diag \
  -H "Authorization: Bearer <anon key>" -H "x-sync-key: <the key>"
```

`match: true` means the Vault copy equals the header. Set a Vault secret with
`select set_app_secret('SYNC_KEY', '…')` as the service role (SQL editor), never in the repo.
The Anthropic key is set only by Aryen with `scripts/set-ai-key.sh`.

## The sync stopped

The sync is a GitHub Actions cron (`.github/workflows/sync.yml`, every 15 minutes). GitHub
disables scheduled workflows after 60 days without a push to the repo, and skips the run when
the `SYNC_KEY` repo secret is missing. The runway now says "Your calendars haven't been read for N
h" after two hours of silence, with a "Read them now" button that calls the function with the
person's own session.

- Check Actions → Sync calendars → the last run. "SYNC_KEY is not set; skipping" means the repo
  secret; a red run with a curl error means the gateway (above).
- Re-enable a disabled schedule from the workflow's page ("Enable workflow"), or push any commit.
- One source on demand: Settings → Calendars → Sync now, or `POST /functions/v1/sync-sources`
  with the person's JWT and `{"source_id": "…"}`.

## The local Edge runtime dies

`supabase functions serve` logs "Edge Runtime container is no longer available" and every local
function call fails. It is the runtime, not the code: stop it and start it again
(`supabase functions serve --no-verify-jwt --env-file .env.functions.local`). It also needs a
restart to pick up a new function folder.

## A function won't bundle on deploy

`failed to bundle function: exit 1` with no detail: run the deploy with `--debug` and look for
`Module not found … Maybe add a '.ts' extension`. Browser modules a function imports must use
explicit `.ts` imports (`CLAUDE.md`); local `deno test` resolves extension-less imports and hides
this.

## Sign-in trouble

- Magic-link emails stop: Supabase's built-in sender has a low hourly cap. The fix is an SMTP
  provider under Authentication → SMTP (Aryen's account).
- A Google sign-in that lands on the sign-in screen with a message: the message is Supabase's
  `?error=` explained (`src/lib/callbackError.ts`); a non-school Google account is refused by the
  `is_school_email` trigger while `app_config.school_email_only` is true.
- Dashboard changes to auth take about a minute to reach the auth server. Never
  `supabase config push` without `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET` in the shell, or the
  Google provider is pushed without its secret.
- The app opening as signed out after four seconds is the fallback for a session check that never
  resolved (a stuck tab holding supabase-js's lock); it catches up on the next auth event.

## The AI budget

`app_config` holds `ai_user_monthly_cents` and the global cap; `ai_usage` holds the spend. Over the
cap, functions answer "Runway's AI budget for this month is used up" and the rules keep working.
To raise a cap: update `app_config` as the service role. To see one person's month: they see it
themselves in Settings; the service role can read `ai_usage`.

## Rolling back

- The site: revert the commit on `main` and push; Deploy rebuilds from the tree.
- A function: `supabase functions deploy <name> --no-verify-jwt` from the previous commit.
- A migration: write the inverse as a new migration and `supabase db push`; never edit an applied
  one. Migrations so far only add tables, columns and functions.

## What there is no log for

This project's `function_logs` tables are missing (part of the 2026-10-21 incident). Debug a
function locally with `supabase functions serve` and a curl, or with the `diag` function. The
browser suites (`npm run test:e2e:db`) are the closest thing to a production trace.
