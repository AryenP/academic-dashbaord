-- Runway v2: at the 'readiness' share level the runway's shape and the exam checkpoints are shown,
-- but study blocks lose their titles ("Lectures 1–4 into notes" is the student's business). The
-- 'runway' and 'totals' levels are unchanged: they were chosen with titles in view.

create or replace function share_plan(p_handle text)
returns table (
  id uuid, course text, color smallint, kind text, title text,
  start_at timestamptz, end_at timestamptz, location text, weight numeric, take_home boolean
)
language sql stable security definer set search_path = public as $$
  select i.id, c.code, c.color, i.kind,
         case when p.share_level = 'readiness' and i.kind = 'study' then 'Study' else i.title end,
         i.start_at, i.end_at,
         case when p.share_level = 'readiness' and i.kind = 'study' then '' else i.location end,
         i.weight, i.take_home
  from plan_items i
  join profiles p on p.id = i.user_id and p.handle = lower(p_handle) and p.share_level <> 'off'
  left join courses c on c.id = i.course_id
  where i.accepted and i.kind in ('study', 'deadline', 'exam')
    and i.end_at >= now() - interval '30 days'
  order by i.start_at
  limit 2000
$$;
