import { useState, type FormEvent, type ReactNode } from 'react';
import { useAuth } from '../lib/auth';
import { hasBackend } from '../lib/supabase';
import { MODES, type Mode } from '../lib/timer';

export function Settings({ children }: { children?: ReactNode }) {
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
          {children}
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
    </section>
  );
}

function Privacy() {
  const { profile, updateProfile } = useAuth();
  return (
    <section className="card-section" aria-labelledby="priv-h">
      <h2 id="priv-h" className="mc-h2">
        What visitors see
      </h2>
      <p className="mc-note">
        Anyone with the link sees the runway (your plan). Session notes, phone data and app names are never
        public.
      </p>
      <label className="check">
        <input
          type="checkbox"
          checked={profile?.public_totals ?? true}
          onChange={(e) => updateProfile({ public_totals: e.target.checked })}
        />
        <span>Show my daily study totals per course on the public runway</span>
      </label>
    </section>
  );
}
