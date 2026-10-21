# Supabase support ticket · 2026-10-21

Paste this at https://supabase.com/dashboard/support/new (category: Edge Functions, severity: high). Delete this file once the ticket is filed.

---

**Project:** `uhqurcspebdxtkalbduc` (us-east-1, free tier)

**Subject:** All Edge Function invocations return 503 "name resolution failed" from Kong since a function was deleted

**Update, 10:10 UTC:** the gateway recovered on its own about 40 minutes after the restart, then went back to the same 503 immediately after three `supabase functions deploy` calls and a `supabase secrets set`. So it looks like every deploy or secret change re-provisions the project's Edge Functions service and Kong can't resolve the upstream for 20–40 minutes each time, rather than the delete being the cause.

**What happened**

At about 08:25 UTC on 2026-10-21 I deleted an Edge Function with `supabase functions delete env-probe` (CLI 2.121.0). Since then every `POST` to `https://uhqurcspebdxtkalbduc.supabase.co/functions/v1/<any-function>` returns:

```
HTTP/1.1 503 Service Temporarily Unavailable
Server: kong/2.8.1
{"message":"name resolution failed"}
```

This includes `phone-event`, which was not changed, with a body that would make it answer 400 before any outbound call, so the failure is in front of the function. `OPTIONS` requests do get answered (through the path marked `sb-gateway-version: 1`), including the function's own CORS headers.

The three remaining functions (`phone-event`, `sync-sources`, `validate-source`) show `ACTIVE` in `supabase functions list` and in `GET /v1/projects/{ref}/functions`.

**Already tried**

- Redeploying with the CLI bundler and with `--use-api`: deploys succeed, invocations still 503.
- `POST /v1/projects/{ref}/restart`: RESTARTING → ACTIVE_HEALTHY, still 503.
- `GET /v1/projects/{ref}/health`: auth, db, rest, realtime, storage, pooler all ACTIVE_HEALTHY.
- The logs endpoint answers `Table "function_logs" does not exist.` and `Table "function_edge_logs" does not exist.` for this project, which looks like the project's Edge Functions service was de-provisioned by the delete.
- status.supabase.com shows no incident.

**Ask:** please re-provision the Edge Functions service and Kong's upstream for this project.
