-- Runway v2, step 5: classmates and friends.
--
-- A student can show themself to classmates course by course (off by default). Runway already
-- knows each person's school (email domain) and course codes, so "who else in DSC 140A uses
-- Runway" needs no roster. What a classmate sees of you follows your share level: your name and
-- course always (once you're visible), hours this week, readiness and streak only at the levels
-- you chose. Friends are added by handle and accepted; a friend sees your share-level stats across
-- courses. Nothing here ever returns notes, phone data or grades.

alter table courses add column visible boolean not null default false;
grant update (name, color, hidden, visible) on courses to authenticated;

create table friends (
  user_id uuid not null references auth.users on delete cascade,
  friend_id uuid not null references auth.users on delete cascade,
  status text not null check (status in ('requested', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);
create index on friends (friend_id);
alter table friends enable row level security;
create policy "my friendships" on friends for select to authenticated
  using (auth.uid() = user_id or auth.uid() = friend_id);
revoke all on friends from anon;
revoke insert, update, delete on friends from authenticated; -- through the functions below

-- ── Stats helpers (internal) ───────────────────────────────────────────────────

-- Focused minutes in the last 7 days.
create function week_minutes(p_user uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(greatest(0, round(sum(
    extract(epoch from (s.ended_at - s.started_at)) - s.paused_seconds - s.break_seconds
  ) / 60)), 0)::int
  from sessions s
  where s.user_id = p_user and s.ended_at is not null and s.started_at >= now() - interval '7 days'
$$;

-- Days in a row (in the person's timezone) with a finished session, ending today or yesterday.
create function streak_days(p_user uuid) returns int
language plpgsql stable security definer set search_path = public as $$
declare tz text; d date; n int := 0;
begin
  select timezone into tz from profiles where id = p_user;
  tz := coalesce(tz, 'UTC');
  d := (now() at time zone tz)::date;
  if not exists (select 1 from sessions s where s.user_id = p_user and s.ended_at is not null
                 and (s.started_at at time zone tz)::date = d) then
    d := d - 1;
  end if;
  while exists (select 1 from sessions s where s.user_id = p_user and s.ended_at is not null
                and (s.started_at at time zone tz)::date = d) loop
    n := n + 1;
    d := d - 1;
    exit when n > 365;
  end loop;
  return n;
end $$;

-- Prep for the person's next exam in a course: minutes studied so far and minutes planned, both
-- before the exam. Null when there is no upcoming exam.
create function course_readiness(p_user uuid, p_code text)
returns table (exam_title text, exam_at timestamptz, studied_min int, planned_min int)
language sql stable security definer set search_path = public as $$
  with x as (
    select i.title, i.start_at
    from plan_items i join courses c on c.id = i.course_id
    where i.user_id = p_user and c.code = p_code and i.kind = 'exam' and i.accepted and i.start_at > now()
    order by i.start_at limit 1
  )
  select x.title, x.start_at,
    (select coalesce(greatest(0, round(sum(extract(epoch from (s.ended_at - s.started_at)) - s.paused_seconds - s.break_seconds) / 60)), 0)::int
       from sessions s where s.user_id = p_user and s.course = p_code and s.ended_at is not null and s.started_at < x.start_at),
    (select coalesce(round(sum(extract(epoch from (i.end_at - i.start_at)) / 60)), 0)::int
       from plan_items i join courses c on c.id = i.course_id
       where i.user_id = p_user and c.code = p_code and i.kind = 'study' and i.accepted and i.end_at <= x.start_at)
  from x
$$;

revoke execute on function week_minutes(uuid), streak_days(uuid), course_readiness(uuid, text) from public, anon, authenticated;

-- ── Classmates ─────────────────────────────────────────────────────────────────

-- People at my school who made this course visible, if I did too. Stats follow their share level.
create function classmates(p_code text)
returns table (
  handle text, display_name text, share_level text, is_friend boolean,
  week_minutes int, streak int, exam_title text, exam_at timestamptz, studied_min int, planned_min int
)
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); my_domain text; mine boolean;
begin
  if me is null then return; end if;
  select school_domain into my_domain from profiles where id = me;
  select c.visible into mine from courses c where c.user_id = me and c.code = p_code limit 1;
  if not coalesce(mine, false) then return; end if; -- reciprocity: be visible to see others
  return query
    select p.handle, p.display_name, p.share_level,
      exists (select 1 from friends f where f.status = 'accepted'
              and ((f.user_id = me and f.friend_id = p.id) or (f.user_id = p.id and f.friend_id = me))) as is_friend,
      case when p.share_level = 'totals' then week_minutes(p.id) else null end,
      case when p.share_level in ('totals', 'readiness') then streak_days(p.id) else null end,
      r.exam_title, r.exam_at,
      case when p.share_level in ('totals', 'readiness') then r.studied_min else null end,
      case when p.share_level in ('totals', 'readiness') then r.planned_min else null end
    from courses c
    join profiles p on p.id = c.user_id
    left join lateral course_readiness(p.id, p_code) r on true
    where c.code = p_code and c.visible and c.user_id <> me and p.school_domain = my_domain
      and exists (select 1 from plan_items i where i.user_id = p.id and i.course_id = c.id
                  and i.end_at >= now() - interval '60 days')
    order by p.handle
    limit 200;
end $$;

-- How many classmates (across my visible courses) finished a session today.
create function classmate_pulse() returns int
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); my_domain text; tz text; n int;
begin
  if me is null then return 0; end if;
  select school_domain, timezone into my_domain, tz from profiles where id = me;
  select count(distinct c2.user_id) into n
  from courses c1
  join courses c2 on c2.code = c1.code and c2.visible and c2.user_id <> me
  join profiles p on p.id = c2.user_id and p.school_domain = my_domain and p.share_level = 'totals'
  where c1.user_id = me and c1.visible
    and exists (select 1 from sessions s where s.user_id = c2.user_id and s.ended_at is not null
                and (s.started_at at time zone coalesce(tz, 'UTC'))::date = (now() at time zone coalesce(tz, 'UTC'))::date);
  return coalesce(n, 0);
end $$;

-- ── Friends ────────────────────────────────────────────────────────────────────

create function request_friend(p_handle text) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); other uuid;
begin
  if me is null then raise exception 'not signed in'; end if;
  select id into other from profiles where handle = lower(p_handle);
  if other is null then raise exception 'No one with that handle.'; end if;
  if other = me then raise exception 'That''s you.'; end if;
  if exists (select 1 from friends where user_id = other and friend_id = me) then
    -- they asked first: accept
    update friends set status = 'accepted' where user_id = other and friend_id = me;
    return;
  end if;
  insert into friends (user_id, friend_id, status) values (me, other, 'requested')
    on conflict do nothing;
end $$;

create function respond_friend(p_handle text, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); other uuid;
begin
  if me is null then raise exception 'not signed in'; end if;
  select id into other from profiles where handle = lower(p_handle);
  if p_accept then
    update friends set status = 'accepted' where user_id = other and friend_id = me and status = 'requested';
  else
    delete from friends where user_id = other and friend_id = me;
  end if;
end $$;

create function remove_friend(p_handle text) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); other uuid;
begin
  if me is null then raise exception 'not signed in'; end if;
  select id into other from profiles where handle = lower(p_handle);
  delete from friends where (user_id = me and friend_id = other) or (user_id = other and friend_id = me);
end $$;

-- Friends and requests, with each friend's share-level stats.
create function friends_overview()
returns table (
  handle text, display_name text, status text, direction text, share_level text,
  week_minutes int, streak int, courses text[]
)
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then return; end if;
  return query
    select p.handle, p.display_name, f.status,
      case when f.user_id = me then 'sent' else 'received' end as direction,
      p.share_level,
      case when f.status = 'accepted' and p.share_level = 'totals' then week_minutes(p.id) else null end,
      case when f.status = 'accepted' and p.share_level in ('totals', 'readiness') then streak_days(p.id) else null end,
      case when f.status = 'accepted' then
        (select coalesce(array_agg(c.code order by c.code), '{}') from courses c where c.user_id = p.id and c.visible)
      else '{}' end
    from friends f
    join profiles p on p.id = case when f.user_id = me then f.friend_id else f.user_id end
    where f.user_id = me or f.friend_id = me
    order by f.status, p.handle;
end $$;

revoke execute on function classmates(text), classmate_pulse(), request_friend(text), respond_friend(text, boolean),
  remove_friend(text), friends_overview() from public, anon;
grant execute on function classmates(text), classmate_pulse(), request_friend(text), respond_friend(text, boolean),
  remove_friend(text), friends_overview() to authenticated;
