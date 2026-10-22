-- Runway v2, Phase 5: the facts behind the "Patterns" sentences on Stats. Sessions and signals of
-- the last 60 days, in the person's timezone, grouped the few ways the sentences need. Numbers
-- only; the words are built in the app (src/lib/patterns.ts), which also decides when there is
-- too little data to say anything. Private: a person can only ask about themself.

create function signal_patterns(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  tz text;
  since timestamptz := now() - interval '60 days';
  result jsonb;
begin
  if p_user is null or p_user is distinct from auth.uid() then
    raise exception 'patterns are private' using errcode = '42501';
  end if;
  select coalesce(timezone, 'UTC') into tz from profiles where id = p_user;
  tz := coalesce(tz, 'UTC');

  with s as (
    select (started_at at time zone tz)::date as day,
           extract(hour from (started_at at time zone tz)) as hr,
           focus_pct,
           greatest(0, extract(epoch from (ended_at - started_at)) - paused_seconds - break_seconds) / 3600.0 as hours
    from sessions
    where user_id = p_user and ended_at is not null and started_at >= since
  ),
  sig as (
    select day, kind, value, label from signals where user_id = p_user and day >= since::date
  ),
  days as (select count(distinct day) as n from s),
  late as (
    select count(*) filter (where hr >= 23 and focus_pct is not null) as n,
           avg(focus_pct) filter (where hr >= 23) as avg,
           count(*) filter (where hr < 23 and focus_pct is not null) as other_n,
           avg(focus_pct) filter (where hr < 23) as other_avg
    from s
  ),
  sleep as (
    select count(*) filter (where v.value >= 7 and s.focus_pct is not null) as good_n,
           avg(s.focus_pct) filter (where v.value >= 7) as good_avg,
           count(*) filter (where v.value < 7 and s.focus_pct is not null) as poor_n,
           avg(s.focus_pct) filter (where v.value < 7) as poor_avg
    from s join sig v on v.day = s.day and v.kind = 'sleep_h'
  ),
  by_day as (select day, sum(hours) as hours from s group by day),
  exercise as (
    select count(*) filter (where v.value >= 30) as active_days,
           avg(d.hours) filter (where v.value >= 30) as active_hours,
           count(*) filter (where v.value < 30) as rest_days,
           avg(d.hours) filter (where v.value < 30) as rest_hours
    from by_day d join sig v on v.day = d.day and v.kind = 'exercise_min'
  ),
  places as (
    select v.label, count(*) as n, avg(s.focus_pct) as avg
    from s join sig v on v.day = s.day and v.kind = 'place'
    where s.focus_pct is not null
    group by v.label
    having count(*) >= 3
    order by avg desc
    limit 3
  )
  select jsonb_build_object(
    'days', days.n,
    'late', jsonb_build_object('n', late.n, 'avg', late.avg, 'other_n', late.other_n, 'other_avg', late.other_avg),
    'sleep', jsonb_build_object('good_n', sleep.good_n, 'good_avg', sleep.good_avg,
                                'poor_n', sleep.poor_n, 'poor_avg', sleep.poor_avg),
    'exercise', jsonb_build_object('active_days', exercise.active_days, 'active_hours', exercise.active_hours,
                                   'rest_days', exercise.rest_days, 'rest_hours', exercise.rest_hours),
    'places', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'n', n, 'avg', avg)) from places), '[]'::jsonb)
  ) into result
  from days, late, sleep, exercise;
  return result;
end $$;
revoke execute on function signal_patterns(uuid) from public, anon;
grant execute on function signal_patterns(uuid) to authenticated;
