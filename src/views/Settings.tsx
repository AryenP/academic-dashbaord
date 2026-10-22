import { useEffect, useState } from 'react';
import { PhoneSettings } from '../components/PhoneSettings';
import { ExtensionSettings, FeedSettings, PlanningSettings } from '../components/PlanningSettings';
import { SignalsSetup } from '../components/SignalsSetup';
import { SourcesSettings } from '../components/SourcesSettings';
import { SpotifySettings } from '../components/SpotifySettings';
import { useAuth } from '../lib/auth';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { MODES, type Mode } from '../lib/timer';

export function Settings() {
  const { user, ready } = useAuth();
  if (!ready) return null;
  return (
    <div className="page">
      <h1 className="page-h">Settings</h1>
      {!user ? (
        <p>
          <Link to="/signin">Sign in</Link> to see your settings.
        </p>
      ) : (
        <>
          <Account />
          <SourcesSettings />
          <PlanningSettings />
          <FeedSettings />
          <ExtensionSettings />
          <SignalsSetup where="settings" />
          <AiUsage />
          <Breaks />
          <Sharing />
          <PhoneSettings />
          <SpotifySettings />
          <DeleteAccount />
        </>
      )}
    </div>
  );
}

const METHOD_NAMES: Record<string, string> = { email: 'email link', google: 'Google' };
/** The ways this account can sign in, in plain words, from what Supabase records on the user. */
export function signInMethods(providers: unknown): string[] {
  const list = Array.isArray(providers) ? providers.filter((p): p is string => typeof p === 'string') : [];
  const names = list.map((p) => METHOD_NAMES[p] ?? p);
  return names.length ? names : ['email link'];
}

const ZONES: string[] = (() => {
  try {
    return (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf('timeZone');
  } catch {
    return ['America/Los_Angeles', 'America/Denver', 'America/Chicago', 'America/New_York', 'UTC'];
  }
})();

function Account() {
  const { user, profile, signOut, updateProfile } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const save = async (patch: Parameters<typeof updateProfile>[0]) => {
    setError(null);
    try {
      await updateProfile(patch);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    }
  };
  return (
    <section className="card-section" aria-labelledby="acct-h">
      <h2 id="acct-h" className="mc-h2">
        Account
      </h2>
      <div className="form-row">
        <p className="grow">
          Signed in as <b>{user!.email}</b>
          <span className="field-hint">
            {' '}
            Sign-in methods: {signInMethods(user!.app_metadata?.providers).join(', ')}.
          </span>
        </p>
        <button className="btn btn-quiet" onClick={signOut}>
          Sign out
        </button>
      </div>
      <div className="form-row">
        <label className="field">
          <span className="field-label">Name</span>
          <input
            type="text"
            maxLength={60}
            defaultValue={profile?.display_name ?? ''}
            onBlur={(e) =>
              e.target.value !== (profile?.display_name ?? '') && save({ display_name: e.target.value })
            }
          />
        </label>
        <label className="field">
          <span className="field-label">Handle</span>
          <input
            type="text"
            pattern="[a-z0-9_]{3,24}"
            maxLength={24}
            defaultValue={profile?.handle ?? ''}
            onBlur={(e) =>
              e.target.value !== profile?.handle && save({ handle: e.target.value.toLowerCase() })
            }
          />
          <span className="field-hint">Letters, numbers and _ only. It's your share-page address.</span>
        </label>
        <label className="field">
          <span className="field-label">Time zone</span>
          <select value={profile?.timezone ?? 'UTC'} onChange={(e) => save({ timezone: e.target.value })}>
            {ZONES.map((z) => (
              <option key={z}>{z}</option>
            ))}
          </select>
        </label>
      </div>
      {error && <p className="form-error">{error}</p>}
    </section>
  );
}

const LEVELS = [
  { id: 'off', label: 'Nobody', hint: 'Your runway is private. The default.' },
  { id: 'runway', label: 'Just the runway', hint: 'Your plan and nothing else.' },
  {
    id: 'readiness',
    label: 'Runway and exam readiness',
    hint: 'Prep hours per exam, no daily totals; study blocks show without their titles.',
  },
  {
    id: 'totals',
    label: 'Runway, readiness and daily totals',
    hint: 'How long you studied each day, per course.',
  },
];

function Sharing() {
  const { profile, updateProfile } = useAuth();
  const level = profile?.share_level ?? 'off';
  const url = `${location.origin}${location.pathname}#/u/${profile?.handle ?? ''}`;
  return (
    <section className="card-section" aria-labelledby="share-h">
      <h2 id="share-h" className="mc-h2">
        Sharing
      </h2>
      <p className="mc-note">
        Off by default. Session notes, phone data and app names are never shared at any level.
      </p>
      <fieldset className="field">
        <legend className="sr-only">Who can see your runway</legend>
        {LEVELS.map((l) => (
          <label key={l.id} className="check">
            <input
              type="radio"
              name="share-level"
              checked={level === l.id}
              onChange={() => updateProfile({ share_level: l.id })}
            />
            <span>
              {l.label}
              <span className="field-hint"> {l.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {level !== 'off' && (
        <p>
          Your share page: <Link to={`/u/${profile?.handle ?? ''}`}>{url}</Link>
        </p>
      )}
    </section>
  );
}

function AiUsage() {
  const [u, setU] = useState<{ calls: number; cents: number; cap_cents: number } | null>(null);
  useEffect(() => {
    supabase
      ?.rpc('my_ai_usage')
      .then(
        ({ data }) =>
          data?.[0] &&
          setU({ calls: data[0].calls, cents: Number(data[0].cents), cap_cents: Number(data[0].cap_cents) }),
      );
  }, []);
  if (!u) return null;
  return (
    <section className="card-section" aria-labelledby="ai-h">
      <h2 id="ai-h" className="mc-h2">
        Reading your calendar
      </h2>
      <p className="mc-note">
        Runway's AI reads the events the title rules were unsure about. It sees titles, times and places,
        nothing else. This month: {u.calls} {u.calls === 1 ? 'read' : 'reads'},{' '}
        {u.cents < 1 ? 'under 1¢' : `${Math.round(u.cents)}¢`} of a{' '}
        {Math.round((u.cap_cents / 100) * 100) / 100 >= 1
          ? `$${(u.cap_cents / 100).toFixed(2)}`
          : `${u.cap_cents}¢`}{' '}
        allowance. <Link to="/courses">See what it found.</Link>
      </p>
    </section>
  );
}

function DeleteAccount() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const del = async () => {
    const { error } = await supabase!.rpc('delete_my_account');
    if (error) {
      setError(error.message);
      return;
    }
    await signOut();
    navigate('/');
  };
  return (
    <section className="card-section" aria-labelledby="del-h">
      <h2 id="del-h" className="mc-h2">
        Delete my account
      </h2>
      <p className="mc-note">
        Removes your account and everything tied to it: plan, sessions, notes, phone events, settings. At
        once, and for good.
      </p>
      {!confirm ? (
        <button className="btn btn-danger" onClick={() => setConfirm(true)}>
          Delete my account…
        </button>
      ) : (
        <div className="row">
          <button className="btn btn-danger" onClick={del}>
            Yes, delete everything
          </button>
          <button className="btn btn-quiet" onClick={() => setConfirm(false)}>
            Keep it
          </button>
        </div>
      )}
      {error && <p className="form-error">{error}</p>}
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
