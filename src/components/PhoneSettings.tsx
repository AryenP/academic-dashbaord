import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { SUGGESTED_APPS, freshToken, newToken, sha256Hex } from '../lib/phone';
import { CopyField } from './CopyButton';
import { Icon } from './Icon';

export function PhoneSettings() {
  const { profile, settings, updateProfile, updateSettings } = useAuth();
  const [token, setToken] = useState<string | null>(freshToken.get());
  const [busy, setBusy] = useState(false);
  const on = !!profile?.phone_token_hash;
  const apps = settings.distracting_apps ?? SUGGESTED_APPS.slice(0, 6);

  const create = async () => {
    if (on && !confirm('Replace your phone token? Your Shortcuts stop working until you paste the new one.'))
      return;
    setBusy(true);
    const t = newToken();
    await updateProfile({ phone_token_hash: await sha256Hex(t) });
    if (!settings.distracting_apps) await updateSettings({ distracting_apps: apps });
    freshToken.set(t);
    setToken(t);
    setBusy(false);
  };

  const turnOff = async () => {
    if (!confirm('Turn off phone tracking? Your Shortcuts will be ignored until you make a new token.'))
      return;
    await updateProfile({ phone_token_hash: null });
    freshToken.set(null);
    setToken(null);
  };

  return (
    <section className="card-section" aria-labelledby="phone-h">
      <h2 id="phone-h" className="mc-h2">
        Phone
      </h2>
      <p className="mc-note">
        iPhone Shortcuts tell Runway when you open or close the apps below, so each session gets a focus % and
        a pickup count. They see only these apps, not your other phone use.
      </p>

      <div className="form-row">
        <p className="grow">
          {on ? (
            <>
              <b>Tracking is on.</b> Follow the <Link to="/setup/phone">setup guide</Link> on your iPhone.
            </>
          ) : (
            <>Tracking is off. Make a token to start.</>
          )}
        </p>
        <button className={`btn${on ? '' : ' btn-primary'}`} onClick={create} disabled={busy}>
          <Icon name={on ? 'refresh' : 'phone'} size={18} /> {on ? 'Replace token' : 'Make a token'}
        </button>
        {on && (
          <button className="btn btn-quiet" onClick={turnOff}>
            Turn off
          </button>
        )}
      </div>

      {token && (
        <div className="token-box" role="status">
          <CopyField label="Your phone token" value={token} />
          <p className="field-hint">
            You'll see this once. The <Link to="/setup/phone">setup guide</Link> has it filled in for this
            tab. If you lose it, replace it.
          </p>
        </div>
      )}

      <AppList apps={apps} onChange={(next) => updateSettings({ distracting_apps: next })} />
    </section>
  );
}

function AppList({ apps, onChange }: { apps: string[]; onChange: (a: string[]) => void }) {
  const [name, setName] = useState('');
  const add = (e: FormEvent) => {
    e.preventDefault();
    const n = name.trim().slice(0, 40);
    if (n && !apps.some((a) => a.toLowerCase() === n.toLowerCase())) onChange([...apps, n]);
    setName('');
  };
  const missing = SUGGESTED_APPS.filter((s) => !apps.includes(s));
  return (
    <div className="field">
      <span className="field-label" id="apps-l">
        Distracting apps
      </span>
      <ul className="app-chips" aria-labelledby="apps-l">
        {apps.map((a) => (
          <li key={a}>
            {a}
            <button
              className="icon-btn"
              onClick={() => onChange(apps.filter((x) => x !== a))}
              aria-label={`Remove ${a}`}
            >
              <Icon name="x" size={14} />
            </button>
          </li>
        ))}
      </ul>
      <form className="form-row" onSubmit={add}>
        <label className="field grow">
          <span className="sr-only">App name</span>
          <input
            type="text"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            placeholder="App name, as it appears on your phone"
          />
        </label>
        <button className="btn" disabled={!name.trim()}>
          <Icon name="plus" size={18} /> Add
        </button>
      </form>
      {missing.length > 0 && (
        <p className="field-hint">
          Also common:{' '}
          {missing.map((m, i) => (
            <span key={m}>
              {i > 0 && ', '}
              <button className="link-btn" onClick={() => onChange([...apps, m])}>
                {m}
              </button>
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
