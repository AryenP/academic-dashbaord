import { useEffect } from 'react';
import { useAuth } from '../lib/auth';
import { useLiveSession } from '../lib/liveSession';
import { timerState } from '../lib/timer';

/**
 * "Break's over" notification, if you turned it on in Settings. Shown through the service worker
 * when there is one (needed on iPhone, where it works only for Runway added to the Home Screen).
 * Browsers may delay timers in a background tab, so it can arrive a little late.
 */
export function BreakAlarm() {
  const { settings } = useAuth();
  const live = useLiveSession();
  const s = live.session;
  const open = live.breaks.find((b) => !b.ended_at);

  useEffect(() => {
    if (!s || !open || !settings.break_notify || typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;
    const st = timerState(s, live.breaks, Date.now() + live.skewMs, settings);
    const left = st.breakLeftSec ?? 0;
    if (left <= 0) return;
    const t = setTimeout(async () => {
      const title = "Break's over";
      const options = { body: `Back to ${s.course}.`, tag: 'runway-break', icon: 'icons/icon-192.png' };
      try {
        const reg = await navigator.serviceWorker?.getRegistration();
        if (reg) await reg.showNotification(title, options);
        else new Notification(title, options);
      } catch {
        // notifications blocked after all: the focus screen still shows the overrun
      }
    }, left * 1000);
    return () => clearTimeout(t);
    // Re-arm only when the break itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s?.id, open?.id, open?.started_at, settings.break_notify]);

  return null;
}
