import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useLiveSession } from '../lib/liveSession';
import { player } from '../lib/spotify';
import { timerState } from '../lib/timer';
import { usePlan } from '../lib/usePlan';
import { useQuickStart } from '../lib/useQuickStart';
import { useSpotify } from '../lib/useSpotify';

const KEYS = [
  { key: 'S', what: 'Start a session, or end the one running' },
  { key: 'B', what: 'Start a break, or go back to work' },
  { key: 'Space', what: 'Play or pause music (Spotify)' },
  { key: '?', what: 'Show these shortcuts' },
];

/** Ignore keys typed into fields, and keys on buttons (Space should press the button). */
const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A', 'SUMMARY'].includes(t.tagName));

export function Shortcuts() {
  const { user, settings } = useAuth();
  const live = useLiveSession();
  const sp = useSpotify();
  const { plan } = usePlan();
  const quickStart = useQuickStart(plan);
  const navigate = useNavigate();
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
      if (e.key === '?') {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (!user) return;
      const k = e.key.toLowerCase();
      if (k === 's') {
        e.preventDefault();
        if (live.session) {
          navigate('/focus');
          void live.end();
        } else void quickStart();
      } else if (k === 'b' && live.session) {
        e.preventDefault();
        const st = timerState(live.session, live.breaks, Date.now() + live.skewMs, settings);
        void (st.phase === 'break' ? live.endBreak() : live.startBreak(st.nextBreak));
      } else if (e.key === ' ' && sp.connected) {
        e.preventDefault();
        void sp.run('Play/pause', sp.state?.is_playing ? player.pause : () => player.play());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [user, live, sp, settings, quickStart, navigate]);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog ref={dialog} className="keys" onClose={() => setOpen(false)} aria-labelledby="keys-h">
      <h2 id="keys-h" className="mc-h2">
        Keyboard shortcuts
      </h2>
      <dl>
        {KEYS.map((k) => (
          <div key={k.key}>
            <dt>
              <kbd>{k.key}</kbd>
            </dt>
            <dd>{k.what}</dd>
          </div>
        ))}
      </dl>
      <form method="dialog">
        <button className="btn">Close</button>
      </form>
    </dialog>
  );
}
