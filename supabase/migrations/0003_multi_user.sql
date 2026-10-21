-- Runway v2, step 1: every account has its own plan.
--
-- v1 had one owner whose plan came from a JSON file. Now each person has courses and plan items
-- (study blocks, deadlines, exams, classes, commitments) in the database, all owner-only through
-- Row Level Security. Sharing is opt-in per profile, by handle. New accounts must use a school email.

-- ── School email ───────────────────────────────────────────────────────────────

-- .edu, or the international forms: .edu.<cc> and .ac.<cc>.
create function is_school_email(e text) returns boolean
language sql immutable as $$
  select lower(e) ~ '\.(edu|edu\.[a-z]{2}|ac\.[a-z]{2})$'
$$;

create function check_school_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email is null or not is_school_email(new.email) then
    raise exception 'Runway is for students: sign up with your school email.' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger on_auth_user_school before insert on auth.users
  for each row execute function check_school_email();

-- ── Profiles ───────────────────────────────────────────────────────────────────

drop function public_daily_totals(int);
drop function public_prep_minutes(jsonb);

alter table profiles
  drop column is_owner,
  drop column public_level,
  add column handle text unique check (handle ~ '^[a-z0-9_]{3,24}$'),
  add column timezone text not null default 'America/Los_Angeles',
  add column share_level text not null default 'off'
    check (share_level in ('off', 'runway', 'readiness', 'totals')),
  add column school_domain text,
  add column onboarding jsonb not null default '{}';

-- Everyone who already has an account keeps it private: v1's public page is now the demo landing page.
update profiles set school_domain = split_part(u.email, '@', 2)
  from auth.users u where u.id = profiles.id;

grant update (display_name, handle, timezone, share_level, onboarding, phone_token_hash, settings)
  on profiles to authenticated;

-- A handle from the email's local part, with a number added if it's taken.
create function make_handle(email text) returns text
language plpgsql security definer set search_path = public as $$
declare base text; h text; n int := 0;
begin
  base := left(regexp_replace(lower(split_part(email, '@', 1)), '[^a-z0-9_]', '', 'g'), 20);
  if char_length(base) < 3 then base := 'student'; end if;
  h := base;
  while exists (select 1 from profiles where handle = h) loop
    n := n + 1;
    h := base || n;
  end loop;
  return h;
end $$;

update profiles set handle = make_handle(u.email)
  from auth.users u where u.id = profiles.id and profiles.handle is null;

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name, handle, school_domain)
  values (new.id, split_part(new.email, '@', 1), make_handle(new.email), split_part(new.email, '@', 2));
  return new;
end $$;

-- ── Courses and plan items ─────────────────────────────────────────────────────

create table courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  code text not null check (char_length(code) between 1 and 40),   -- 'DSC 140A'
  name text,
  color smallint not null default 1 check (color between 1 and 6), -- --course-N in tokens.css
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, code)
);

-- One table for everything on the runway: it's drawn as one list, and later phases add columns
-- (status, score, reason) rather than tables.
create table plan_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  course_id uuid references courses on delete cascade,
  kind text not null check (kind in ('study', 'deadline', 'exam', 'class', 'commitment')),
  title text not null check (char_length(title) between 1 and 200),
  start_at timestamptz not null,
  end_at timestamptz not null,
  location text not null default '' check (char_length(location) <= 200),
  weight numeric(5, 2) check (weight is null or (weight >= 0 and weight <= 100)),
  take_home boolean not null default false,
  status text not null default 'open' check (status in ('open', 'submitted', 'missed')),
  submitted_at timestamptz,
  score numeric(7, 2),
  max_score numeric(7, 2),
  reason text,
  source text not null default 'manual' check (source in ('manual', 'calendar', 'ai', 'extension')),
  accepted boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at > start_at)
);

create index on plan_items (user_id, start_at);
create index on courses (user_id);

create function touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger plan_items_touch before update on plan_items
  for each row execute function touch_updated_at();

-- A plan item belongs to a course of the same person.
create function plan_item_course_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.course_id is not null
     and not exists (select 1 from courses c where c.id = new.course_id and c.user_id = new.user_id) then
    raise exception 'course belongs to someone else';
  end if;
  return new;
end $$;
create trigger plan_items_course_owner before insert or update on plan_items
  for each row execute function plan_item_course_owner();

alter table courses enable row level security;
alter table plan_items enable row level security;

create policy "own courses" on courses
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own plan items" on plan_items
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- v1 linked sessions to blocks of the JSON plan by its ids. Those blocks no longer exist as rows;
-- readiness never depended on the link (it counts every session for the course), so it's dropped.
alter table sessions drop column plan_block_id;
alter table sessions add column plan_item_id uuid references plan_items on delete set null;

-- ── Sharing, by handle ─────────────────────────────────────────────────────────
-- Nothing below returns anything unless that person turned sharing on.

create function share_profile(p_handle text)
returns table (handle text, display_name text, share_level text, timezone text)
language sql stable security definer set search_path = public as $$
  select p.handle, p.display_name, p.share_level, p.timezone
  from profiles p where p.handle = lower(p_handle) and p.share_level <> 'off'
$$;

create function share_plan(p_handle text)
returns table (
  id uuid, course text, color smallint, kind text, title text,
  start_at timestamptz, end_at timestamptz, location text, weight numeric, take_home boolean
)
language sql stable security definer set search_path = public as $$
  select i.id, c.code, c.color, i.kind, i.title, i.start_at, i.end_at, i.location, i.weight, i.take_home
  from plan_items i
  join profiles p on p.id = i.user_id and p.handle = lower(p_handle) and p.share_level <> 'off'
  left join courses c on c.id = i.course_id
  where i.accepted and i.kind in ('study', 'deadline', 'exam')
    and i.end_at >= now() - interval '30 days'
  order by i.start_at
  limit 2000
$$;

-- Focused minutes per day and course, in that person's timezone. Only at the 'totals' level.
create function public_daily_totals(p_handle text, days int default 14)
returns table (day date, course text, minutes int)
language sql stable security definer set search_path = public as $$
  select (s.started_at at time zone p.timezone)::date as day,
         s.course,
         greatest(0, round(sum(
           extract(epoch from (s.ended_at - s.started_at)) - s.paused_seconds - s.break_seconds
         ) / 60))::int as minutes
  from sessions s
  join profiles p on p.id = s.user_id and p.handle = lower(p_handle) and p.share_level = 'totals'
  where s.ended_at is not null
    and s.started_at >= now() - make_interval(days => least(greatest(days, 1), 366))
  group by 1, 2
  order by 1, 2
$$;

-- Prep minutes per exam. At the 'totals' or 'readiness' level.
create function public_prep_minutes(p_handle text, p_exams jsonb)
returns table (course text, before timestamptz, minutes int)
language sql stable security definer set search_path = public as $$
  select e.course,
         e.before,
         coalesce(greatest(0, round(sum(
           extract(epoch from (s.ended_at - s.started_at)) - s.paused_seconds - s.break_seconds
         ) / 60)), 0)::int as minutes
  from jsonb_to_recordset(p_exams) as e(course text, before timestamptz)
  join profiles p on p.handle = lower(p_handle) and p.share_level in ('totals', 'readiness')
  left join sessions s
    on s.user_id = p.id and s.course = e.course and s.ended_at is not null and s.started_at < e.before
  group by e.course, e.before
  limit 50
$$;

revoke execute on function share_profile(text), share_plan(text),
  public_daily_totals(text, int), public_prep_minutes(text, jsonb) from public;
grant execute on function share_profile(text), share_plan(text),
  public_daily_totals(text, int), public_prep_minutes(text, jsonb) to anon, authenticated;

-- ── Account deletion ───────────────────────────────────────────────────────────
-- Deletes the signed-in person's auth user; every table cascades from it.

create function delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  delete from auth.users where id = auth.uid();
end $$;

revoke execute on function delete_my_account() from public, anon;
grant execute on function delete_my_account() to authenticated;

-- Helpers are internal.
revoke execute on function make_handle(text), is_school_email(text) from public, anon, authenticated;
