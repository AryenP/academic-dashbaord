-- What Runway holds about you: the person's own counts, read under their own policies.
--
-- Runs as the caller (security invoker), so every number comes through the same Row Level
-- Security that keeps the app honest: a count here is a count of rows the person could select.
-- No new table; nothing written.

create function my_footprint() returns jsonb
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
    'tokens', (select coalesce(jsonb_agg(purpose order by purpose), '[]'::jsonb) from access_tokens where user_id = auth.uid()),
    'phone_tracking', (select phone_token_hash is not null from profiles where id = auth.uid()),
    'ai_calls_month', (select coalesce(sum(calls), 0) from ai_usage where user_id = auth.uid() and month = date_trunc('month', now())::date),
    'ai_events_month', (select count(*) from events where user_id = auth.uid() and ai_at >= date_trunc('month', now()))
  )
$$;
revoke execute on function my_footprint() from public, anon;
grant execute on function my_footprint() to authenticated;
