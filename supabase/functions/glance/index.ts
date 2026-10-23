// Supabase Edge Function: one line of plain text about right now, for a Shortcut, a watch or a
// Tasker task, with the shortcut token from Settings. GET, header x-runway-token or ?t=. The logic
// is in handler.ts.
import { serviceClient } from '../_shared/auth.ts';
import type { CourseInfo } from '../../../src/lib/courses.ts';
import type { ItemRow } from '../../../src/lib/planBuild.ts';
import { handle } from './handler.ts';

const must = <T>({ data, error }: { data: T; error: unknown }): T => {
  if (error) throw error;
  return data;
};

Deno.serve((req) => {
  const db = serviceClient();
  return handle(req, {
    ownerByTokenHash: async (hash) =>
      (must(await db.rpc('token_owner', { p_purpose: 'shortcut', p_token_hash: hash })) as string | null) ??
      null,
    rateHit: async (key) => {
      const { data } = await db.rpc('phone_rate_hit', { p_token_hash: key });
      return typeof data === 'number' ? data : 0;
    },
    plan: async (userId) => {
      const rows = must(
        await db
          .from('plan_items')
          .select(
            'id, course_id, kind, title, start_at, end_at, location, weight, take_home, accepted, status',
          )
          .eq('user_id', userId)
          .gte('end_at', new Date(Date.now() - 864e5).toISOString())
          .order('start_at')
          .limit(2000),
      ) as ItemRow[];
      const courses = must(
        await db.from('courses').select('id, code, name, color, hidden').eq('user_id', userId),
      ) as CourseInfo[];
      const timezone =
        (
          must(await db.from('profiles').select('timezone').eq('id', userId).maybeSingle()) as {
            timezone: string;
          } | null
        )?.timezone ?? 'UTC';
      return { rows, courses, timezone };
    },
  });
});
