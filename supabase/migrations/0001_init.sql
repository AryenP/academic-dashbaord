-- Runway schema: profiles, study sessions, breaks and phone events.
-- Everything personal is owner-only through Row Level Security. Visitors get one thing:
-- daily totals per course, through public_daily_totals(), and only if the owner allows it.

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  public_totals boolean not null default true,
  phone_token_hash text unique,         -- sha256 of the phone token, never the token
  settings jsonb not null default '{}', -- break mode, playlists, distracting apps, cues
  is_owner boolean not null default false,
  created_at timestamptz not null default now()
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  course text not null,
  plan_block_id text,                   -- id from data.json plan, if started from a block
  mode text not null check (mode in ('pomodoro','fifty_ten','custom','flow')),
  source text not null default 'web' check (source in ('web','phone','manual')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  paused_at timestamptz,                -- set while paused; folded into paused_seconds on resume
  paused_seconds int not null default 0,
  break_seconds int not null default 0,
  focus_pct numeric(5,2),               -- frozen at end
  phone_seconds int,
  pickups int,
  longest_stretch_seconds int,
  rating smallint check (rating between 1 and 5),
  note text,
  check (ended_at is null or ended_at >= started_at),
  check (paused_seconds >= 0 and break_seconds >= 0)
);

create table session_breaks (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions on delete cascade,
  kind text not null check (kind in ('short','long')),
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create table phone_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  app text not null check (char_length(app) between 1 and 40),
  kind text not null check (kind in ('open','close','session_start','session_end')),
  at timestamptz not null default now(),
  received_at timestamptz not null default now()
);

-- Per-token request counter for the phone-event function's rate limit (one row per token per minute).
create table phone_rate (
  token_hash text not null,
  minute timestamptz not null,
  hits int not null default 0,
  primary key (token_hash, minute)
);

create index on phone_events (user_id, at);
create index on sessions (user_id, started_at desc);
create index on session_breaks (session_id, started_at);
-- At most one live (unfinished) session per person; manual entries are always finished.
create unique index sessions_one_open on sessions (user_id) where ended_at is null;

-- ── Row Level Security ─────────────────────────────────────────────────────────

alter table profiles enable row level security;
alter table sessions enable row level security;
alter table session_breaks enable row level security;
alter table phone_events enable row level security;
alter table phone_rate enable row level security; -- no policies: service role only

create policy "own profile" on profiles
  for all to authenticated using (auth.uid() = id) with check (auth.uid() = id);

create policy "own sessions" on sessions
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own breaks" on session_breaks
  for all to authenticated
  using (exists (select 1 from sessions s where s.id = session_id and s.user_id = auth.uid()))
  with check (exists (select 1 from sessions s where s.id = session_id and s.user_id = auth.uid()));

-- Phone events are written by the phone-event function (service role). The owner can read and delete them.
create policy "read own phone events" on phone_events
  for select to authenticated using (auth.uid() = user_id);
create policy "delete own phone events" on phone_events
  for delete to authenticated using (auth.uid() = user_id);

-- Nobody but the database decides who the owner is: profiles are created by the trigger below,
-- and people can update only these columns of their own row. (A column-level revoke wouldn't
-- override the table-level grant, so the grant is narrowed instead.)
revoke insert, update on profiles from authenticated, anon;
grant update (display_name, public_totals, phone_token_hash, settings) on profiles to authenticated;

-- ── New users ──────────────────────────────────────────────────────────────────

-- Every sign-up gets a profile. The first one becomes the owner, whose totals the public page shows.
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name, is_owner)
  values (new.id, split_part(new.email, '@', 1), not exists (select 1 from profiles where is_owner));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- ── Public totals ──────────────────────────────────────────────────────────────

-- Focused minutes per day and course for the owner, over the last `days` days (Pacific days).
-- Returns nothing when the owner has turned public totals off. No notes, no phone data.
create function public_daily_totals(days int default 14)
returns table (day date, course text, minutes int)
language sql stable security definer set search_path = public as $$
  select (s.started_at at time zone 'America/Los_Angeles')::date as day,
         s.course,
         greatest(0, round(sum(
           extract(epoch from (s.ended_at - s.started_at)) - s.paused_seconds - s.break_seconds
         ) / 60))::int as minutes
  from sessions s
  join profiles p on p.id = s.user_id and p.is_owner and p.public_totals
  where s.ended_at is not null
    and s.started_at >= now() - make_interval(days => least(greatest(days, 1), 366))
  group by 1, 2
  order by 1, 2
$$;

revoke execute on function public_daily_totals(int) from public;
grant execute on function public_daily_totals(int) to anon, authenticated;

-- Counts one request for a token in the current minute and returns the count so far.
-- Only the phone-event function (service role) calls this.
create function phone_rate_hit(p_token_hash text) returns int
language sql security definer set search_path = public as $$
  with del as (delete from phone_rate where minute < date_trunc('minute', now()) - interval '5 minutes')
  insert into phone_rate (token_hash, minute, hits)
  values (p_token_hash, date_trunc('minute', now()), 1)
  on conflict (token_hash, minute) do update set hits = phone_rate.hits + 1
  returning hits
$$;

revoke execute on function phone_rate_hit(text) from public, anon, authenticated;
grant execute on function phone_rate_hit(text) to service_role;

-- ── Session state changes ──────────────────────────────────────────────────────
-- One function per transition, so the web app and the phone function change state the same way
-- and atomically. They run as the caller (security invoker), so RLS still applies to web calls.
-- Times default to the database clock; every device derives its timer from these timestamps.

-- Closes an open break (adding its length to break_seconds) and returns the session row.
create function end_break(p_session uuid, p_at timestamptz default now()) returns sessions
language plpgsql security invoker set search_path = public as $$
declare b session_breaks; s sessions;
begin
  update session_breaks set ended_at = greatest(p_at, started_at)
    where session_id = p_session and ended_at is null
    returning * into b;
  update sessions set break_seconds = break_seconds
      + coalesce(extract(epoch from (b.ended_at - b.started_at))::int, 0)
    where id = p_session returning * into s;
  return s;
end $$;

-- Starts a break. Resumes first if paused, since a break replaces a pause.
create function start_break(p_session uuid, p_kind text default 'short', p_at timestamptz default now())
returns session_breaks
language plpgsql security invoker set search_path = public as $$
declare b session_breaks;
begin
  perform resume_session(p_session, p_at);
  if exists (select 1 from session_breaks where session_id = p_session and ended_at is null) then
    select * into b from session_breaks where session_id = p_session and ended_at is null;
    return b;
  end if;
  insert into session_breaks (session_id, kind, started_at) values (p_session, p_kind, p_at) returning * into b;
  return b;
end $$;

create function pause_session(p_session uuid, p_at timestamptz default now()) returns sessions
language sql security invoker set search_path = public as $$
  update sessions set paused_at = p_at
  where id = p_session and ended_at is null and paused_at is null
  returning *
$$;

create function resume_session(p_session uuid, p_at timestamptz default now()) returns sessions
language plpgsql security invoker set search_path = public as $$
declare s sessions;
begin
  update sessions
    set paused_seconds = paused_seconds + greatest(0, extract(epoch from (p_at - paused_at))::int),
        paused_at = null
    where id = p_session and paused_at is not null
    returning * into s;
  if s.id is null then select * into s from sessions where id = p_session; end if;
  return s;
end $$;

-- Ends a session: closes any open break, folds any pause, sets ended_at.
create function end_session(p_session uuid, p_at timestamptz default now()) returns sessions
language plpgsql security invoker set search_path = public as $$
declare s sessions;
begin
  perform end_break(p_session, p_at);
  perform resume_session(p_session, p_at);
  update sessions set ended_at = greatest(p_at, started_at)
    where id = p_session and ended_at is null returning * into s;
  if s.id is null then select * into s from sessions where id = p_session; end if;
  return s;
end $$;

-- ── Realtime ───────────────────────────────────────────────────────────────────
-- Live session state across phone and laptop, and live phone events on the focus screen.
-- Realtime respects RLS, so each person only receives their own rows.

alter publication supabase_realtime add table sessions, session_breaks, phone_events;
