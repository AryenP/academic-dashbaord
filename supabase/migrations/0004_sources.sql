-- Runway v2, step 2: calendar sources.
--
-- A person connects a calendar by its secret address (Google, iCloud, Outlook, or a Canvas calendar
-- feed) or uploads an .ics file. Addresses are secrets (whoever has one can read the calendar), so
-- they live in Supabase Vault and never return to the browser. The sync function (service role)
-- reads them, fetches the feed, and writes `events`; from events it builds the person's plan items.

-- ── Schools ────────────────────────────────────────────────────────────────────
-- Found from the email domain, so the Canvas guide can deep-link to the right calendar page.

create table schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  domains text[] not null,
  lms text not null default 'canvas',
  canvas_url text,
  created_at timestamptz not null default now()
);
create index on schools using gin (domains);

insert into schools (name, domains, canvas_url) values
  ('UC San Diego', '{ucsd.edu}', 'https://canvas.ucsd.edu'),
  ('UC Berkeley', '{berkeley.edu}', 'https://bcourses.berkeley.edu'),
  ('Stanford', '{stanford.edu}', 'https://canvas.stanford.edu'),
  ('MIT', '{mit.edu}', 'https://canvas.mit.edu'),
  ('Harvard', '{harvard.edu,college.harvard.edu,g.harvard.edu}', 'https://canvas.harvard.edu'),
  ('Carnegie Mellon', '{cmu.edu,andrew.cmu.edu}', 'https://canvas.cmu.edu'),
  ('University of Washington', '{uw.edu,washington.edu}', 'https://canvas.uw.edu'),
  ('UC Santa Cruz', '{ucsc.edu}', 'https://canvas.ucsc.edu');

alter table schools enable row level security;
create policy "schools are public" on schools for select to anon, authenticated using (true);

-- "Tell us your school": a row per request, for review. Nobody reads these from the client.
create table school_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  domain text not null,
  school_name text,
  canvas_url text,
  created_at timestamptz not null default now()
);
alter table school_requests enable row level security;
create policy "add a school request" on school_requests
  for insert to authenticated with check (auth.uid() = user_id);

-- ── Sources ────────────────────────────────────────────────────────────────────

create table calendar_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  kind text not null check (kind in ('ical', 'canvas', 'ics_upload')),
  label text not null check (char_length(label) between 1 and 80),
  secret_id uuid,                                  -- vault.secrets.id; service role only
  host text,                                       -- the address's host, for display
  status text not null default 'pending' check (status in ('pending', 'ok', 'error')),
  last_synced_at timestamptz,
  last_error text,
  next_sync_at timestamptz not null default now(),
  backoff_minutes int not null default 15,
  etag text,
  last_modified text,
  event_count int not null default 0,
  created_at timestamptz not null default now()
);
create index on calendar_sources (user_id);
create index on calendar_sources (next_sync_at) where status <> 'error' or backoff_minutes < 1440;

alter table calendar_sources enable row level security;
create policy "own sources" on calendar_sources
  for select to authenticated using (auth.uid() = user_id);
create policy "rename own sources" on calendar_sources
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "remove own sources" on calendar_sources
  for delete to authenticated using (auth.uid() = user_id);

-- The client never sees secret_id, and can change only the label. Inserts go through
-- add_calendar_source so the address lands in Vault, never in a column.
revoke all on calendar_sources from authenticated, anon;
grant select (id, user_id, kind, label, host, status, last_synced_at, last_error, next_sync_at,
              event_count, created_at) on calendar_sources to authenticated;
grant update (label) on calendar_sources to authenticated;
grant delete on calendar_sources to authenticated;

-- A sane address: https (or http to a local host, for tests), a host, no spaces or an ellipsis
-- from a cut-off copy.
create function is_feed_url(u text) returns boolean
language sql immutable as $$
  select u ~ '^(https://[^\s/]+|http://(127\.0\.0\.1|host\.docker\.internal|localhost)(:\d+)?)/\S*$'
     and u !~ '…' and u !~ '\.\.\.$'
$$;

create function add_calendar_source(p_kind text, p_label text, p_url text)
returns calendar_sources
language plpgsql security definer set search_path = public, vault as $$
declare src calendar_sources; sid uuid; h text; u text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if (select count(*) from calendar_sources where user_id = auth.uid()) >= 10 then
    raise exception 'That''s the limit of 10 calendars per account.';
  end if;
  if p_kind = 'ics_upload' then
    insert into calendar_sources (user_id, kind, label, status)
      values (auth.uid(), 'ics_upload', p_label, 'ok') returning * into src;
    return src;
  end if;
  u := regexp_replace(trim(p_url), '^webcal://', 'https://');
  if not is_feed_url(u) then raise exception 'That doesn''t look like a calendar address.'; end if;
  h := substring(u from '^https?://([^/]+)');
  sid := vault.create_secret(u, 'calendar_source:' || gen_random_uuid()::text);
  insert into calendar_sources (user_id, kind, label, secret_id, host)
    values (auth.uid(), p_kind, p_label, sid, h) returning * into src;
  return src;
end $$;

-- Removing a source removes its secret too.
create function drop_source_secret() returns trigger
language plpgsql security definer set search_path = public, vault as $$
begin
  if old.secret_id is not null then delete from vault.secrets where id = old.secret_id; end if;
  return old;
end $$;
create trigger calendar_sources_drop_secret after delete on calendar_sources
  for each row execute function drop_source_secret();

-- The address, for the sync function only.
create function source_url(p_source uuid) returns text
language sql stable security definer set search_path = public, vault as $$
  select s.decrypted_secret from calendar_sources c
  join vault.decrypted_secrets s on s.id = c.secret_id
  where c.id = p_source
$$;

-- Sources whose turn it is, oldest first.
create function due_sources(p_limit int default 50)
returns setof calendar_sources
language sql stable security definer set search_path = public as $$
  select * from calendar_sources
  where kind <> 'ics_upload' and next_sync_at <= now()
  order by next_sync_at
  limit least(greatest(p_limit, 1), 500)
$$;

revoke execute on function add_calendar_source(text, text, text), is_feed_url(text) from public, anon;
grant execute on function add_calendar_source(text, text, text) to authenticated;
revoke execute on function source_url(uuid), due_sources(int) from public, anon, authenticated;
grant execute on function source_url(uuid), due_sources(int) to service_role;

-- ── Events ─────────────────────────────────────────────────────────────────────
-- What the feed said, one row per occurrence, plus how it was read (kind, course). The sync
-- function writes these; the person reads them and can override the reading.

create table events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  source_id uuid not null references calendar_sources on delete cascade,
  uid text not null,
  recurrence_id text not null default '',
  hash text not null,                              -- of title, times, location: changed means re-read
  title text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  all_day boolean not null default false,
  location text not null default '',
  kind text not null default 'unknown'
    check (kind in ('study', 'deadline', 'exam', 'class', 'commitment', 'personal', 'unknown')),
  course_code text,
  confidence numeric(3, 2) not null default 0,
  classifier text not null default 'rules',        -- 'rules' now, 'ai' in Phase 2
  override jsonb,                                  -- {kind, course_code} the person chose
  plan_item_id uuid references plan_items on delete set null,
  first_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (source_id, uid, recurrence_id)
);
create index on events (user_id, start_at);
create index on events (plan_item_id);

alter table events enable row level security;
create policy "own events" on events for select to authenticated using (auth.uid() = user_id);
create policy "override own events" on events
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
revoke all on events from authenticated, anon;
grant select on events to authenticated;
grant update (override) on events to authenticated;

-- Plan items know where they came from, so a sync can update or remove them.
alter table plan_items add column source_id uuid references calendar_sources on delete cascade;
create index on plan_items (source_id);

-- ── Sync bookkeeping (service role) ────────────────────────────────────────────

-- Records a sync result and schedules the next one: 15 minutes normally, doubling on failure
-- up to a day.
create function finish_sync(p_source uuid, p_ok boolean, p_error text, p_count int,
                            p_etag text, p_last_modified text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_ok then
    update calendar_sources set
      status = 'ok', last_synced_at = now(), last_error = null, backoff_minutes = 15,
      next_sync_at = now() + interval '15 minutes', event_count = coalesce(p_count, event_count),
      etag = coalesce(p_etag, etag), last_modified = coalesce(p_last_modified, last_modified)
    where id = p_source;
  else
    update calendar_sources set
      status = 'error', last_error = left(p_error, 300),
      backoff_minutes = least(backoff_minutes * 2, 1440),
      next_sync_at = now() + make_interval(mins => least(backoff_minutes * 2, 1440))
    where id = p_source;
  end if;
end $$;

-- "Sync now" from Settings: the person brings their own source forward.
create function request_sync(p_source uuid) returns void
language sql security definer set search_path = public as $$
  update calendar_sources set next_sync_at = now() where id = p_source and user_id = auth.uid()
$$;

revoke execute on function finish_sync(uuid, boolean, text, int, text, text) from public, anon, authenticated;
grant execute on function finish_sync(uuid, boolean, text, int, text, text) to service_role;
revoke execute on function request_sync(uuid) from public, anon;
grant execute on function request_sync(uuid) to authenticated;
