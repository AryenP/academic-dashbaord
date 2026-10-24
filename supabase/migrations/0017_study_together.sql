-- Study together, from free time.
--
-- Two students in the same course who both turned on "Show me to classmates" and the second,
-- separate switch "Let classmates who also turn this on find a time with me" can see when they are
-- both free and invite each other. The schedule never leaves the database: the overlap function
-- answers windows, not calendars. An invitation touches nobody's runway until it is accepted; then
-- each person gets a study block in their own copy of the course, linked to the invitation, and
-- cancelling (either side) removes both. Everything cascades from both accounts.

alter table courses add column study_together boolean not null default false;
grant update (name, color, hidden, visible, study_together) on courses to authenticated;

create table study_invites (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references auth.users on delete cascade,
  to_user uuid not null references auth.users on delete cascade,
  course_code text not null check (char_length(course_code) between 1 and 40),
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null default 'proposed' check (status in ('proposed', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (from_user <> to_user),
  check (end_at > start_at and end_at - start_at <= interval '4 hours')
);
create index on study_invites (from_user);
create index on study_invites (to_user);
alter table study_invites enable row level security;
create policy "my invitations" on study_invites for select to authenticated
  using (auth.uid() = from_user or auth.uid() = to_user);
revoke all on study_invites from anon;
revoke insert, update, delete on study_invites from authenticated; -- through the functions below

-- The blocks an accepted invitation puts on each runway. When the invitation goes (cancelled, or an
-- account deleted), the blocks go with it.
alter table plan_items add column study_invite_id uuid references study_invites on delete cascade;
create index on plan_items (study_invite_id);

-- ── Internal helpers ──────────────────────────────────────────────────────────

-- The other person, when both of us opted in to studying together in this course at the same
-- school. Null otherwise, without saying why.
create function study_partner(p_me uuid, p_handle text, p_code text) returns uuid
language sql stable security definer set search_path = public as $$
  select p.id
  from profiles p
  join profiles m on m.id = p_me and m.school_domain = p.school_domain
  where p.handle = lower(p_handle) and p.id <> p_me
    and exists (select 1 from courses c where c.user_id = p_me and c.code = p_code and c.visible and c.study_together)
    and exists (select 1 from courses c where c.user_id = p.id and c.code = p_code and c.visible and c.study_together)
$$;

-- Whether [a, b) sits inside the person's study window (Settings → Planning) on one local day
-- that isn't a day off. Bad or missing settings fall back to the planner's defaults, 9 AM–10 PM.
create function in_study_window(p_user uuid, a timestamptz, b timestamptz) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select (a at time zone s.tz)::date = ((b - interval '1 second') at time zone s.tz)::date
      and (a at time zone s.tz)::time >= s.earliest
      and ((b - interval '1 second') at time zone s.tz)::time < s.latest
      and not (extract(dow from (a at time zone s.tz))::int = any (s.days_off))
    from (
      select coalesce(p.timezone, 'UTC') as tz,
        (case when p.settings #>> '{planning,earliest}' ~ '^\d{2}:\d{2}$'
              then p.settings #>> '{planning,earliest}' else '09:00' end)::time as earliest,
        (case when p.settings #>> '{planning,latest}' ~ '^\d{2}:\d{2}$'
              then p.settings #>> '{planning,latest}' else '22:00' end)::time as latest,
        case when jsonb_typeof(p.settings #> '{planning,days_off}') = 'array'
             then array(select x::int from jsonb_array_elements_text(p.settings #> '{planning,days_off}') x
                        where x ~ '^[0-6]$')
             else '{}'::int[] end as days_off
      from profiles p where p.id = p_user
    ) s
  ), false)
$$;

-- Anything accepted on the person's runway overlapping [a, b), padded 15 minutes like the planner.
create function busy_between(p_user uuid, a timestamptz, b timestamptz) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from plan_items i
    where i.user_id = p_user and i.accepted
      and i.start_at - interval '15 minutes' < b and i.end_at + interval '15 minutes' > a
  )
$$;

revoke execute on function study_partner(uuid, text, text), in_study_window(uuid, timestamptz, timestamptz),
  busy_between(uuid, timestamptz, timestamptz) from public, anon, authenticated;

-- ── What people call ──────────────────────────────────────────────────────────

-- When both of us are free in the next seven days: windows of an hour or more, in half-hour steps,
-- starting at least an hour from now. Empty unless both opted in to studying together in the course.
create function shared_free_time(p_handle text, p_code text)
returns table (start_at timestamptz, end_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); other uuid;
begin
  if me is null then return; end if;
  other := study_partner(me, p_handle, p_code);
  if other is null then return; end if;
  return query
    with grid as (
      select g as a, g + interval '30 minutes' as b
      from generate_series(
        date_trunc('hour', now()) + interval '90 minutes',
        now() + interval '7 days',
        interval '30 minutes') g
    ),
    ok as (
      select grid.a, grid.b from grid
      where in_study_window(me, grid.a, grid.b) and in_study_window(other, grid.a, grid.b)
        and not busy_between(me, grid.a, grid.b) and not busy_between(other, grid.a, grid.b)
    ),
    runs as (
      select ok.a, ok.b, ok.a - (row_number() over (order by ok.a)) * interval '30 minutes' as grp from ok
    )
    select min(runs.a), max(runs.b) from runs
    group by runs.grp
    having max(runs.b) - min(runs.a) >= interval '60 minutes'
    order by 1
    limit 6;
end $$;

-- Invite a study partner to a time inside one of our shared windows.
create function propose_study(p_handle text, p_code text, p_start timestamptz, p_end timestamptz)
returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); other uuid; new_id uuid;
begin
  if me is null then raise exception 'not signed in'; end if;
  other := study_partner(me, p_handle, p_code);
  if other is null then raise exception 'You can only invite a classmate who also turned on studying together in %.', p_code; end if;
  if p_start <= now() or p_end <= p_start or p_end - p_start < interval '30 minutes' or p_end - p_start > interval '4 hours' then
    raise exception 'Pick a time in the future, between 30 minutes and 4 hours long.';
  end if;
  if not exists (select 1 from shared_free_time(p_handle, p_code) w where w.start_at <= p_start and w.end_at >= p_end) then
    raise exception 'That time isn''t free for both of you any more.';
  end if;
  if (select count(*) from study_invites where from_user = me and to_user = other and status = 'proposed' and end_at > now()) >= 3 then
    raise exception 'You already have three open invitations to them. Wait for an answer.';
  end if;
  insert into study_invites (from_user, to_user, course_code, start_at, end_at)
    values (me, other, p_code, p_start, p_end) returning id into new_id;
  return new_id;
end $$;

-- Accept or decline an invitation sent to me. Accepting puts a block on both runways.
create function respond_study(p_id uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); inv study_invites; them profiles; mine profiles;
begin
  if me is null then raise exception 'not signed in'; end if;
  select * into inv from study_invites where id = p_id and to_user = me and status = 'proposed' and start_at > now()
    for update;
  if not found then raise exception 'That invitation is no longer open.'; end if;
  if not p_accept then
    update study_invites set status = 'declined', responded_at = now() where id = p_id;
    return;
  end if;
  select * into them from profiles where id = inv.from_user;
  select * into mine from profiles where id = me;
  if study_partner(me, them.handle, inv.course_code) is null then
    raise exception 'One of you turned off studying together in %.', inv.course_code;
  end if;
  if busy_between(me, inv.start_at, inv.end_at) or busy_between(inv.from_user, inv.start_at, inv.end_at) then
    raise exception 'That time isn''t free for both of you any more.';
  end if;
  update study_invites set status = 'accepted', responded_at = now() where id = p_id;
  insert into plan_items (user_id, course_id, kind, title, start_at, end_at, source, accepted, study_invite_id)
  select u.id, (select c.id from courses c where c.user_id = u.id and c.code = inv.course_code limit 1),
    'study', left('Study with ' || coalesce(nullif(o.display_name, ''), '@' || o.handle), 200),
    inv.start_at, inv.end_at, 'manual', true, inv.id
  from (values (me, inv.from_user), (inv.from_user, me)) as pair(uid, oid)
  join profiles u on u.id = pair.uid
  join profiles o on o.id = pair.oid;
end $$;

-- Either side can call it off; an accepted one takes both blocks with it.
create function cancel_study(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not signed in'; end if;
  update study_invites set status = 'cancelled', responded_at = now()
    where id = p_id and (from_user = me or to_user = me) and status in ('proposed', 'accepted');
  if not found then raise exception 'That invitation is no longer open.'; end if;
  delete from plan_items where study_invite_id = p_id;
end $$;

-- My invitations that still matter, with the other person's name and handle.
create function my_study_invites()
returns table (
  id uuid, direction text, handle text, display_name text, course_code text,
  start_at timestamptz, end_at timestamptz, status text
)
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then return; end if;
  return query
    select i.id, case when i.from_user = me then 'sent' else 'received' end,
      p.handle, p.display_name, i.course_code, i.start_at, i.end_at, i.status
    from study_invites i
    join profiles p on p.id = case when i.from_user = me then i.to_user else i.from_user end
    where (i.from_user = me or i.to_user = me)
      and i.end_at > now()
      and (i.status in ('proposed', 'accepted') or (i.status = 'declined' and i.from_user = me))
    order by i.start_at;
end $$;

revoke execute on function shared_free_time(text, text), propose_study(text, text, timestamptz, timestamptz),
  respond_study(uuid, boolean), cancel_study(uuid), my_study_invites() from public, anon;
grant execute on function shared_free_time(text, text), propose_study(text, text, timestamptz, timestamptz),
  respond_study(uuid, boolean), cancel_study(uuid), my_study_invites() to authenticated;

-- ── Classmates learn whether "Find a time" is possible ──────────────────────────
-- Same as 0009, plus study_together: true only when both of us turned it on for this course.

drop function classmates(text);
create function classmates(p_code text)
returns table (
  handle text, display_name text, share_level text, is_friend boolean,
  week_minutes int, streak int, exam_title text, exam_at timestamptz, studied_min int, planned_min int,
  study_together boolean
)
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); my_domain text; mine boolean; mine_together boolean;
begin
  if me is null then return; end if;
  select school_domain into my_domain from profiles where id = me;
  select c.visible, c.study_together into mine, mine_together from courses c where c.user_id = me and c.code = p_code limit 1;
  if not coalesce(mine, false) then return; end if; -- reciprocity: be visible to see others
  return query
    select p.handle, p.display_name, p.share_level,
      exists (select 1 from friends f where f.status = 'accepted'
              and ((f.user_id = me and f.friend_id = p.id) or (f.user_id = p.id and f.friend_id = me))) as is_friend,
      case when p.share_level = 'totals' then week_minutes(p.id) else null end,
      case when p.share_level in ('totals', 'readiness') then streak_days(p.id) else null end,
      r.exam_title, r.exam_at,
      case when p.share_level in ('totals', 'readiness') then r.studied_min else null end,
      case when p.share_level in ('totals', 'readiness') then r.planned_min else null end,
      coalesce(mine_together, false) and c.study_together
    from courses c
    join profiles p on p.id = c.user_id
    left join lateral course_readiness(p.id, p_code) r on true
    where c.code = p_code and c.visible and c.user_id <> me and p.school_domain = my_domain
      and exists (select 1 from plan_items i where i.user_id = p.id and i.course_id = c.id
                  and i.end_at >= now() - interval '60 days')
    order by p.handle
    limit 200;
end $$;
revoke execute on function classmates(text) from public, anon;
grant execute on function classmates(text) to authenticated;

-- ── What Runway holds about you, now with invitations ─────────────────────────

create or replace function my_footprint() returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'since', (select created_at from profiles where id = auth.uid()),
    'share_level', (select share_level from profiles where id = auth.uid()),
    'timezone', (select timezone from profiles where id = auth.uid()),
    'courses', (select count(*) from courses where user_id = auth.uid()),
    'calendar_sources', (select count(*) from calendar_sources where user_id = auth.uid()),
    'last_synced_at', (select max(last_synced_at) from calendar_sources where user_id = auth.uid()),
    'events', (select count(*) from events where user_id = auth.uid() and deleted_at is null),
    'plan_items', (select count(*) from plan_items where user_id = auth.uid()),
    'sessions', (select count(*) from sessions where user_id = auth.uid()),
    'session_breaks', (select count(*) from session_breaks b join sessions s on s.id = b.session_id where s.user_id = auth.uid()),
    'phone_events', (select count(*) from phone_events where user_id = auth.uid()),
    'signals', (select count(*) from signals where user_id = auth.uid()),
    'weekly_reviews', (select count(*) from weekly_reviews where user_id = auth.uid()),
    'friends', (select count(*) from friends where (user_id = auth.uid() or friend_id = auth.uid()) and status = 'accepted'),
    'study_invites', (select count(*) from study_invites where from_user = auth.uid() or to_user = auth.uid()),
    'tokens', (select coalesce(jsonb_agg(purpose order by purpose), '[]'::jsonb) from access_tokens where user_id = auth.uid()),
    'phone_tracking', (select phone_token_hash is not null from profiles where id = auth.uid()),
    'ai_calls_month', (select coalesce(sum(calls), 0) from ai_usage where user_id = auth.uid() and month = date_trunc('month', now())::date),
    'ai_events_month', (select count(*) from events where user_id = auth.uid() and ai_at >= date_trunc('month', now()))
  )
$$;
