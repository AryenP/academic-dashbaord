import { useState, type FormEvent } from 'react';
import { PhoneSettings } from '../components/PhoneSettings';
import { SpotifySettings } from '../components/SpotifySettings';
import { useAuth } from '../lib/auth';
import { hasBackend } from '../lib/supabase';
import { MODES, type Mode } from '../lib/timer';

export function Settings() {
  const { user, ready } = useAuth();
  if (!ready) return null;
  return (
    <div className="page">
      <h1 className="page-h">Settings</h1>
      {!user ? (
        <SignIn />
      ) : (
        <>
          <Account />
          <Breaks />
          <Privacy />
          <PhoneSettings />
          <SpotifySettings />
        </>
      )}
    </div>
  );
}

function SignIn() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  if (!hasBackend)
    return (
      <p className="muted">
        The backend isn't connected on this copy of the site, so there's nothing to sign in to.
      </p>
    );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setState('sending');
    const err = await signIn(email.trim());
    setError(err);
    setState(err ? 'idle' : 'sent');
  };

  return (
    <section className="card-section" aria-labelledby="signin-h">
      <h2 id="signin-h" className="mc-h2">
        Sign in
      </h2>
      {state === 'sent' ? (
        <p>
          Check <b>{email}</b> for a sign-in link. Open it on this device.
        </p>
      ) : (
        <form className="form-row" onSubmit={submit}>
          <label className="field grow">
            <span className="field-label">Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@ucsd.edu"
            />
          </label>
          <button className="btn btn-primary" disabled={state === 'sending'}>
            {state === 'sending' ? 'Sending…' : 'Email me a link'}
          </button>
        </form>
      )}
      {error && <p className="form-error">{error}</p>}
    </section>
  );
}

function Account() {
  const { user, signOut } = useAuth();
  return (
    <section className="card-section" aria-labelledby="acct-h">
      <h2 id="acct-h" className="mc-h2">
        Account
      </h2>
      <div className="form-row">
        <p className="grow">
          Signed in as <b>{user!.email}</b>
        </p>
        <button className="btn btn-quiet" onClick={signOut}>
          Sign out
        </button>
      </div>
    </section>
  );
}

function Breaks() {
  const { settings, updateSettings } = useAuth();
  const mode = (settings.break_mode as Mode) || 'pomodoro';
  return (
    <section className="card-section" aria-labelledby="breaks-h">
      <h2 id="breaks-h" className="mc-h2">
        Breaks
      </h2>
      <div className="field">
        <span className="field-label" id="dmode-l">
          Default mode for new sessions
        </span>
        <div className="chips" role="radiogroup" aria-labelledby="dmode-l">
          {MODES.map((m) => (
            <button
              key={m.id}
              role="radio"
              aria-checked={mode === m.id}
              className="chip"
              onClick={() => updateSettings({ break_mode: m.id })}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="field-hint">{MODES.find((m) => m.id === mode)?.hint}</p>
      </div>
      <div className="form-row">
        <label className="field">
          <span className="field-label">Custom focus (min)</span>
          <input
            type="number"
            min={1}
            max={240}
            inputMode="numeric"
            defaultValue={settings.custom_work_min ?? 40}
            onBlur={(e) => updateSettings({ custom_work_min: Number(e.target.value) || 40 })}
          />
        </label>
        <label className="field">
          <span className="field-label">Custom break (min)</span>
          <input
            type="number"
            min={1}
            max={60}
            inputMode="numeric"
            defaultValue={settings.custom_break_min ?? 8}
            onBlur={(e) => updateSettings({ custom_break_min: Number(e.target.value) || 8 })}
          />
        </label>
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={!!settings.auto_break}
          onChange={(e) => updateSettings({ auto_break: e.target.checked })}
        />
        <span>
          Start breaks automatically when they're due
          <span className="field-hint"> Off by default, so a break never cuts you off mid-thought.</span>
        </span>
      </label>
      <BreakNotify />
    </section>
  );
}

const LEVELS = [
  {
    id: 'totals',
    label: 'Daily totals and exam readiness',
    hint: 'How long you studied each day, per course.',
  },
  { id: 'readiness', label: 'Exam readiness only', hint: 'Prep hours per exam, no daily totals.' },
  { id: 'runway', label: 'Just the runway', hint: 'Your plan and nothing else.' },
];

function BreakNotify() {
  const { settings, updateSettings } = useAuth();
  const supported = typeof Notification !== 'undefined';
  const [denied, setDenied] = useState(supported && Notification.permission === 'denied');
  const toggle = async (on: boolean) => {
    if (on && supported && Notification.permission !== 'granted') {
      const p = await Notification.requestPermission();
      if (p !== 'granted') {
        setDenied(true);
        return;
      }
    }
    await updateSettings({ break_notify: on });
  };
  return (
    <label className="check">
      <input
        type="checkbox"
        checked={!!settings.break_notify && !denied}
        disabled={!supported || denied}
        onChange={(e) => toggle(e.target.checked)}
      />
      <span>
        Notify me when a break ends
        <span className="field-hint">
          {' '}
          {!supported
            ? 'This browser has no notifications. On iPhone, add Runway to your Home Screen first (Share → Add to Home Screen).'
            : denied
              ? 'Notifications are blocked for this site in your browser settings.'
              : 'On iPhone this works once Runway is on your Home Screen.'}
        </span>
      </span>
    </label>
  );
}

function Privacy() {
  const { profile, updateProfile } = useAuth();
  const level = profile?.public_level ?? 'totals';
  return (
    <section className="card-section" aria-labelledby="priv-h">
      <h2 id="priv-h" className="mc-h2">
        What visitors see
      </h2>
      <p className="mc-note">
        Anyone with the link sees the runway (your plan). Session notes, phone data and app names are never
        public.
      </p>
      <fieldset className="field">
        <legend className="sr-only">Also show visitors</legend>
        {LEVELS.map((l) => (
          <label key={l.id} className="check">
            <input
              type="radio"
              name="public-level"
              checked={level === l.id}
              onChange={() => updateProfile({ public_level: l.id })}
            />
            <span>
              {l.label}
              <span className="field-hint"> {l.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
    </section>
  );
}
