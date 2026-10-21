-- Public visibility in three steps instead of on/off:
--   'totals'    visitors see daily study totals on the runway and exam readiness
--   'readiness' visitors see exam readiness only (prep minutes per exam), no daily totals
--   'runway'    visitors see the plan and nothing else

alter table profiles
  add column public_level text not null default 'totals'
  check (public_level in ('totals', 'readiness', 'runway'));

update profiles set public_level = case when public_totals then 'totals' else 'runway' end;

-- Drop the old flag (and the function that read it) before recreating with the new level.
drop function public_daily_totals(int);
alter table profiles drop column public_totals;

grant update (display_name, public_level, phone_token_hash, settings) on profiles to authenticated;

create function public_daily_totals(days int default 14)
returns table (day date, course text, minutes int)
language sql stable security definer set search_path = public as $$
  select (s.started_at at time zone 'America/Los_Angeles')::date as day,
         s.course,
         greatest(0, round(sum(
           extract(epoch from (s.ended_at - s.started_at)) - s.paused_seconds - s.break_seconds
         ) / 60))::int as minutes
  from sessions s
  join profiles p on p.id = s.user_id and p.is_owner and p.public_level = 'totals'
  where s.ended_at is not null
    and s.started_at >= now() - make_interval(days => least(greatest(days, 1), 366))
  group by 1, 2
  order by 1, 2
$$;

revoke execute on function public_daily_totals(int) from public;
grant execute on function public_daily_totals(int) to anon, authenticated;

-- Prep minutes per exam: for each {course, before} in p_exams, the owner's focused minutes on that
-- course in sessions that started before `before`. Shown when the level is 'totals' or 'readiness'.
create function public_prep_minutes(p_exams jsonb)
returns table (course text, before timestamptz, minutes int)
language sql stable security definer set search_path = public as $$
  select e.course,
         e.before,
         coalesce(greatest(0, round(sum(
           extract(epoch from (s.ended_at - s.started_at)) - s.paused_seconds - s.break_seconds
         ) / 60)), 0)::int as minutes
  from jsonb_to_recordset(p_exams) as e(course text, before timestamptz)
  join profiles p on p.is_owner and p.public_level in ('totals', 'readiness')
  left join sessions s
    on s.user_id = p.id and s.course = e.course and s.ended_at is not null and s.started_at < e.before
  group by e.course, e.before
  limit 50
$$;

revoke execute on function public_prep_minutes(jsonb) from public;
grant execute on function public_prep_minutes(jsonb) to anon, authenticated;
