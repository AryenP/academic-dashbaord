-- Runway v2, step 3: the AI reads the calendar.
--
-- The title rules (sync) read every event for free. The classify-events function sends the ones
-- they were unsure about to Claude and stores the reading on the event. What's drawn follows
-- override > AI reading (for the current hash) > rules. Every call is metered per person per month
-- against caps in app_config, so a bug or a flood can't run up a bill.

-- ── AI reading on events ───────────────────────────────────────────────────────

alter table events
  add column ai_hash text,                 -- the event hash the AI reading applies to
  add column ai_kind text check (ai_kind is null or ai_kind in ('study', 'deadline', 'exam', 'class', 'commitment', 'personal')),
  add column ai_course_code text,
  add column ai_course_name text,
  add column ai_confidence numeric(3, 2),
  add column ai_weight numeric(5, 2),
  add column ai_take_home boolean,
  add column ai_reason text,
  add column ai_at timestamptz;

create index on events (user_id) where deleted_at is null and ai_hash is distinct from hash and confidence < 0.85;

-- Course names the AI found ("Probabilistic Modeling"), on the course row.
-- (courses.name already exists; nothing to add.)

-- ── Config and metering ────────────────────────────────────────────────────────

create table app_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table app_config enable row level security; -- no policies: service role only

insert into app_config (key, value) values
  ('ai_model_classify', '"claude-opus-5-5"'),
  ('ai_user_monthly_cents', '200'),     -- per person per calendar month
  ('ai_global_monthly_cents', '5000'),  -- everyone together
  ('ai_enabled', 'true');

create table ai_usage (
  user_id uuid not null references auth.users on delete cascade,
  month date not null,                   -- first day of the month, UTC
  calls int not null default 0,
  input_tokens bigint not null default 0,
  cached_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  cents numeric(10, 4) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, month)
);
alter table ai_usage enable row level security;
create policy "own usage" on ai_usage for select to authenticated using (auth.uid() = user_id);
revoke all on ai_usage from anon;
revoke insert, update, delete on ai_usage from authenticated;

-- Can this person make another AI call this month? Returns the remaining budgets in cents.
create function ai_budget(p_user uuid)
returns table (enabled boolean, user_left numeric, global_left numeric)
language sql stable security definer set search_path = public as $$
  select
    coalesce((select (value)::boolean from app_config where key = 'ai_enabled'), false),
    coalesce((select (value)::numeric from app_config where key = 'ai_user_monthly_cents'), 0)
      - coalesce((select cents from ai_usage where user_id = p_user and month = date_trunc('month', now())::date), 0),
    coalesce((select (value)::numeric from app_config where key = 'ai_global_monthly_cents'), 0)
      - coalesce((select sum(cents) from ai_usage where month = date_trunc('month', now())::date), 0)
$$;

-- Records one call's usage.
create function ai_record(p_user uuid, p_input bigint, p_cached bigint, p_output bigint, p_cents numeric)
returns void
language sql security definer set search_path = public as $$
  insert into ai_usage (user_id, month, calls, input_tokens, cached_tokens, output_tokens, cents)
  values (p_user, date_trunc('month', now())::date, 1, p_input, p_cached, p_output, p_cents)
  on conflict (user_id, month) do update set
    calls = ai_usage.calls + 1,
    input_tokens = ai_usage.input_tokens + excluded.input_tokens,
    cached_tokens = ai_usage.cached_tokens + excluded.cached_tokens,
    output_tokens = ai_usage.output_tokens + excluded.output_tokens,
    cents = ai_usage.cents + excluded.cents,
    updated_at = now()
$$;

revoke execute on function ai_budget(uuid), ai_record(uuid, bigint, bigint, bigint, numeric) from public, anon, authenticated;
grant execute on function ai_budget(uuid), ai_record(uuid, bigint, bigint, bigint, numeric) to service_role;

-- What a person sees in Settings: this month's spend and the cap.
create function my_ai_usage()
returns table (calls int, cents numeric, cap_cents numeric)
language sql stable security definer set search_path = public as $$
  select coalesce(u.calls, 0), coalesce(u.cents, 0),
         coalesce((select (value)::numeric from app_config where key = 'ai_user_monthly_cents'), 0)
  from (select 1) x
  left join ai_usage u on u.user_id = auth.uid() and u.month = date_trunc('month', now())::date
$$;
revoke execute on function my_ai_usage() from public, anon;
grant execute on function my_ai_usage() to authenticated;

-- ── Applying the person's decisions ────────────────────────────────────────────
-- The review screen writes events.override; the sync rebuilds plan items from it. A person can also
-- rename a course or hide it; both are plain updates the client already has grants for.
grant update (name, color, hidden) on courses to authenticated;
