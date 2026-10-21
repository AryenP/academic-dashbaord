import { useNavigate } from 'react-router-dom';
import { useAuth } from './auth';
import { useLiveSession } from './liveSession';
import { currentOrNextStudy, type PlanItem } from './plan';
import type { Mode } from './timer';

/**
 * One tap from anywhere: start a session for the block the calendar says you should be doing now
 * (or the next one), in your usual break mode, and open the focus screen. The session is linked to
 * the block only if the block is today.
 */
export function useQuickStart(plan: PlanItem[]) {
  const live = useLiveSession();
  const { settings } = useAuth();
  const navigate = useNavigate();
  return async () => {
    if (!live.session) {
      const block = currentOrNextStudy(plan);
      const sameDay = block && block.day === new Date().toLocaleDateString('en-CA');
      await live.start({
        course: block ? block.course : 'General',
        plan_item_id: block && sameDay ? block.id : null,
        mode: (settings.break_mode as Mode) || 'pomodoro',
      });
    }
    navigate('/focus');
  };
}
