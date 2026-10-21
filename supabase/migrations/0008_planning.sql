-- Runway v2, step 4: the AI plans it.
--
-- Study blocks the planner proposes are plan_items with accepted = false until the person says yes.
-- Each knows which exam it prepares for. The accepted plan can be subscribed to as a calendar
-- (feed tokens), and deadlines carry a submission status. The browser extension writes through its
-- own source kind and token.

alter table plan_items
  add column for_item_id uuid references plan_items on delete set null,  -- the exam a block prepares for
  add column draft_id uuid;                                               -- one draft = one planner run
create index on plan_items (user_id, accepted);
create index on plan_items (for_item_id);

-- A deadline the student ticked, or that the extension saw as submitted.
alter table plan_items add column submitted_by text
  check (submitted_by is null or submitted_by in ('me', 'extension', 'phone'));

-- Submitted and missed are set by the person (or the extension); 'open' is the default.
-- (status, submitted_at, score, max_score already exist from 0003.)

-- ── Tokens: the plan as a calendar feed, and the browser extension ─────────────

alter table calendar_sources drop constraint calendar_sources_kind_check;
alter table calendar_sources add constraint calendar_sources_kind_check
  check (kind in ('ical', 'canvas', 'ics_upload', 'extension'));

create table access_tokens (
  user_id uuid not null references auth.users on delete cascade,
  purpose text not null check (purpose in ('feed', 'extension')),
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  primary key (user_id, purpose)
);
alter table access_tokens enable row level security;
create policy "own tokens" on access_tokens for select to authenticated using (auth.uid() = user_id);
create policy "drop own tokens" on access_tokens for delete to authenticated using (auth.uid() = user_id);
revoke all on access_tokens from anon;
revoke insert, update on access_tokens from authenticated;

-- Makes (or replaces) a token and returns it once; only its sha256 is stored.
create function make_access_token(p_purpose text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare tok text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  tok := encode(gen_random_bytes(24), 'hex');
  insert into access_tokens (user_id, purpose, token_hash)
    values (auth.uid(), p_purpose, encode(digest(tok, 'sha256'), 'hex'))
    on conflict (user_id, purpose) do update
      set token_hash = excluded.token_hash, created_at = now(), last_used_at = null;
  return tok;
end $$;
revoke execute on function make_access_token(text) from public, anon;
grant execute on function make_access_token(text) to authenticated;

-- Who a token belongs to (service role only). Touches last_used_at.
create function token_owner(p_purpose text, p_token_hash text) returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  update access_tokens set last_used_at = now()
    where purpose = p_purpose and token_hash = p_token_hash
    returning user_id into uid;
  return uid;
end $$;
revoke execute on function token_owner(text, text) from public, anon, authenticated;
grant execute on function token_owner(text, text) to service_role;

-- ── The accepted plan, for the feed (service role) ─────────────────────────────

create function feed_items(p_user uuid)
returns table (
  id uuid, course text, kind text, title text, start_at timestamptz, end_at timestamptz,
  location text, status text, updated_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select i.id, c.code, i.kind, i.title, i.start_at, i.end_at, i.location, i.status, i.updated_at
  from plan_items i left join courses c on c.id = i.course_id
  where i.user_id = p_user and i.accepted and i.kind in ('study', 'exam', 'deadline')
    and i.end_at >= now() - interval '30 days'
  order by i.start_at
  limit 2000
$$;
revoke execute on function feed_items(uuid) from public, anon, authenticated;
grant execute on function feed_items(uuid) to service_role;

-- ── Hours studied per course, for the planner (service role) ───────────────────

create function prep_hours_by_course(p_user uuid)
returns table (course text, hours numeric)
language sql stable security definer set search_path = public as $$
  select s.course,
         round(sum(greatest(0, extract(epoch from (s.ended_at - s.started_at)) - s.paused_seconds - s.break_seconds)) / 3600, 1)
  from sessions s
  where s.user_id = p_user and s.ended_at is not null and s.started_at >= now() - interval '120 days'
  group by s.course
$$;
revoke execute on function prep_hours_by_course(uuid) from public, anon, authenticated;
grant execute on function prep_hours_by_course(uuid) to service_role;
