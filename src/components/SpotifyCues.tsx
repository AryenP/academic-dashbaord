import { useEffect, useRef } from 'react';
import { useAuth } from '../lib/auth';
import { useLiveSession } from '../lib/liveSession';
import { player } from '../lib/spotify';
import { useSpotify } from '../lib/useSpotify';

type Phase = 'none' | 'focus' | 'paused' | 'break' | 'ended';

/**
 * Session cues: music follows the session. Start → focus playlist; break → break playlist (or
 * pause); back to work → focus playlist; end → pause. Each can be turned off in Settings.
 * Fires on transitions this device sees, including ones made on another device or the phone.
 */
export function SpotifyCues() {
  const live = useLiveSession();
  const sp = useSpotify();
  const { settings } = useAuth();
  const prev = useRef<{ id: string | null; phase: Phase } | null>(null);

  const s = live.session;
  const phase: Phase = live.ended
    ? 'ended'
    : !s
      ? 'none'
      : live.breaks.some((b) => !b.ended_at)
        ? 'break'
        : s.paused_at
          ? 'paused'
          : 'focus';
  const id = s?.id ?? live.ended?.id ?? null;

  useEffect(() => {
    // Until the first load finishes, a running session would look like it "just started".
    if (live.loading) return;
    const before = prev.current;
    prev.current = { id, phase };
    if (!before || !sp.connected) return; // first render: don't react to a session already running
    if (before.phase === phase && before.id === id) return;
    const cues = {
      start: true,
      break: true,
      resume: true,
      end: true,
      break_action: 'playlist',
      ...settings.cues,
    };
    const focusUri = settings.focus_playlist?.uri;
    const breakUri = settings.break_playlist?.uri;

    if (before.phase === 'none' && phase === 'focus' && cues.start && focusUri)
      void sp.run('Play focus music', () => player.play({ context_uri: focusUri }));
    else if (phase === 'break' && before.phase !== 'break' && cues.break)
      void sp.run('Switch to break music', () =>
        cues.break_action === 'playlist' && breakUri
          ? player.play({ context_uri: breakUri })
          : player.pause(),
      );
    else if (before.phase === 'break' && phase === 'focus' && cues.resume && focusUri)
      void sp.run('Back to focus music', () => player.play({ context_uri: focusUri }));
    else if (
      (phase === 'ended' || phase === 'none') &&
      (before.phase === 'focus' || before.phase === 'break' || before.phase === 'paused') &&
      cues.end
    )
      void sp.run('Pause music', () => player.pause());
  }, [id, phase, sp, settings, live.loading]);

  return null;
}
