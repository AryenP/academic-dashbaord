import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { hasBackend, supabase } from '../lib/supabase';

import { isSchoolEmail } from '../lib/email';

const GOOGLE = import.meta.env.VITE_GOOGLE_SIGNIN === 'true';

export function SignIn() {
  const { user, ready, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  if (!ready) return null;
  if (user) return <Navigate to="/" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const addr = email.trim();
    if (!isSchoolEmail(addr)) {
      setError('Runway is for students: use your school email, the one ending in .edu.');
      return;
    }
    setError(null);
    setState('sending');
    const err = await signIn(addr);
    setError(err);
    setState(err ? 'idle' : 'sent');
  };

  const google = async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}${import.meta.env.BASE_URL}` },
    });
    if (error) setError(error.message);
  };

  return (
    <div className="page page-narrow">
      <h1 className="page-h">Sign in</h1>
      {!hasBackend ? (
        <p className="muted">
          The backend isn't connected on this copy of the site, so there's nothing to sign in to.
        </p>
      ) : state === 'sent' ? (
        <section className="card-section">
          <p>
            Check <b>{email}</b> for a sign-in link. Open it on this device. New here? The same link signs you
            up.
          </p>
        </section>
      ) : (
        <section className="card-section" aria-labelledby="signin-h">
          <h2 id="signin-h" className="mc-h2">
            With your school email
          </h2>
          <p className="mc-note">
            No password. You'll get a link by email; the same link signs you up the first time.
          </p>
          <form className="form-row" onSubmit={submit}>
            <label className="field grow">
              <span className="field-label">School email</span>
              <input
                type="email"
                required
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@ucsd.edu"
              />
            </label>
            <button className="btn btn-primary" disabled={state === 'sending'}>
              {state === 'sending' ? 'Sending…' : 'Email me a link'}
            </button>
          </form>
          {GOOGLE && (
            <p className="signin-or">
              <button type="button" className="btn btn-quiet" onClick={google}>
                Continue with Google
              </button>
              <span className="field-hint">Use your school Google account.</span>
            </p>
          )}
          {error && <p className="form-error">{error}</p>}
          <p className="field-hint">
            Why school email only? It keeps Runway to students, and it's how Runway finds your school's Canvas
            and, later, your classmates. See the <Link to="/privacy">privacy page</Link>.
          </p>
        </section>
      )}
    </div>
  );
}
