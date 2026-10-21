import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CopyButton, CopyField } from '../components/CopyButton';
import { Icon } from '../components/Icon';
import { SignInNeeded } from '../components/SignInNeeded';
import { useAuth } from '../lib/auth';
import { PHONE_ENDPOINT, SUGGESTED_APPS, freshToken, shortcutBody, usePhoneEvents } from '../lib/phone';

export function PhoneSetup() {
  const { user, ready, profile, settings } = useAuth();
  const token = freshToken.get();
  const apps = settings.distracting_apps ?? SUGGESTED_APPS.slice(0, 6);
  const [app, setApp] = useState(apps[0] ?? 'Instagram');
  // Listen for events from the moment the page opened: the first one turns the check green.
  const [openedAt] = useState(() => new Date(Date.now() - 5_000).toISOString());
  const events = usePhoneEvents(user ? openedAt : null);
  const first = useMemo(() => events.find((e) => e.kind === 'open' || e.kind === 'close'), [events]);

  if (!ready) return null;
  if (!user) return <SignInNeeded what="set up phone tracking" />;

  const tok = token ?? 'YOUR_TOKEN';
  return (
    <div className="page setup">
      <div>
        <p className="muted small">
          <Link to="/settings">Settings</Link> / Phone
        </p>
        <h1 className="page-h">Set up your iPhone</h1>
      </div>
      <p className="lede">
        Each distracting app gets two Shortcuts automations: one when it opens, one when it closes. Both send
        a small message to Runway. It takes about two minutes per app, once.
      </p>

      <Step n={1} title="Have your token ready">
        {!profile?.phone_token_hash ? (
          <p>
            You don't have a token yet. <Link to="/settings">Make one in Settings</Link>, then come back here.
          </p>
        ) : token ? (
          <CopyField label="Your phone token" value={token} />
        ) : (
          <p>
            Your token was shown once when you made it. If you don't have it,{' '}
            <Link to="/settings">replace it in Settings</Link> and this page will fill it in.
          </p>
        )}
        <p className="field-hint">Treat it like a password: anyone with it can send events as you.</p>
      </Step>

      <Step n={2} title="Pick an app to set up">
        <div className="chips" role="radiogroup" aria-label="App">
          {apps.map((a) => (
            <button key={a} role="radio" aria-checked={app === a} className="chip" onClick={() => setApp(a)}>
              {a}
            </button>
          ))}
        </div>
        <p className="field-hint">
          Repeat steps 3 and 4 for each one. Edit the list in <Link to="/settings">Settings</Link>.
        </p>
      </Step>

      <Step n={3} title={`When ${app} opens`}>
        <ol className="howto">
          <li>
            Open <b>Shortcuts</b>, go to <b>Automation</b>, tap <b>+</b>, then <b>App</b>.
          </li>
          <li>
            Choose <b>{app}</b>, tick <b>Is Opened</b> (only), and pick <b>Run Immediately</b>. Turn off{' '}
            <b>Notify When Run</b> if you see it. Tap <b>Next</b>.
          </li>
          <li>
            Tap <b>New Blank Automation</b>, add the action <b>Get Contents of URL</b>, and paste the URL.
          </li>
          <li>
            Tap the arrow to show more: set <b>Method</b> to <b>POST</b>, <b>Request Body</b> to <b>JSON</b>,
            and add three Text fields: <code>token</code>, <code>app</code>, <code>kind</code>.
          </li>
        </ol>
        <ShortcutDiagram app={app} kind="open" token={tok} />
        <div className="copy-grid">
          <CopyField label="URL" value={PHONE_ENDPOINT} />
          <CopyField label="token" value={tok} />
          <CopyField label="app" value={app} />
          <CopyField label="kind" value="open" />
        </div>
        <details>
          <summary>The same body as raw JSON</summary>
          <div className="copy-row">
            <code>{shortcutBody('open', app, token)}</code>
            <CopyButton text={shortcutBody('open', app, token)} />
          </div>
        </details>
      </Step>

      <Step n={4} title={`When ${app} closes`}>
        <p>
          Make a second automation exactly like the first, but tick <b>Is Closed</b> and set <code>kind</code>{' '}
          to <code>close</code>. The quickest way: long-press the first one, <b>Duplicate</b>, then change
          those two things.
        </p>
        <ShortcutDiagram app={app} kind="close" token={tok} />
        <CopyField label="kind" value="close" />
      </Step>

      <Step n={5} title="Check it works">
        <p>
          Open {app} on your phone, then close it. Your iPhone may show a small banner when an automation
          runs; that's normal.
        </p>
        <div className={`test-check${first ? ' is-ok' : ''}`} role="status" aria-live="polite">
          <span className="test-dot" aria-hidden="true">
            {first && <Icon name="check" size={16} />}
          </span>
          {first ? (
            <span>
              Got it: <b>{first.app}</b> {first.kind === 'open' ? 'opened' : 'closed'} at{' '}
              {new Date(first.at).toLocaleTimeString([], {
                hour: 'numeric',
                minute: '2-digit',
                second: '2-digit',
              })}
              . You're set up.
            </span>
          ) : (
            <span>Waiting for the first event from your phone…</span>
          )}
        </div>
        {token && <SendTest token={token} app={app} />}
      </Step>

      <Step n={6} title="Optional: a “Start studying” Shortcut">
        <p>
          One tap on your Home Screen (or a Focus mode) starts a Runway session on whatever the calendar says
          you should be studying.
        </p>
        <ol className="howto">
          <li>
            In <b>Shortcuts</b>, make a new shortcut called <b>Start studying</b>.
          </li>
          <li>
            Add <b>Set Focus</b>: turn <b>Do Not Disturb</b> (or your Study focus) <b>On</b>.
          </li>
          <li>
            Add <b>Get Contents of URL</b> with the same URL, POST, JSON, fields <code>token</code> and{' '}
            <code>kind</code> = <code>session_start</code>.
          </li>
          <li>
            Make a <b>Stop studying</b> shortcut the same way with <code>session_end</code>, and turn the
            Focus off.
          </li>
        </ol>
        <div className="copy-grid">
          <CopyField label="kind (start)" value="session_start" />
          <CopyField label="kind (stop)" value="session_end" />
        </div>
        <p className="field-hint">
          Or make it automatic: an automation on your Study Focus turning on and off, running these two.
        </p>
      </Step>

      <section className="card-section">
        <h2 className="mc-h2">What Runway does with this</h2>
        <p className="mc-note">
          During a session, time with a listed app open counts as phone time, and opening one counts as a
          pickup. Focus % = 1 − phone time ÷ focus time. Breaks don't count. Events are visible only to you
          and never appear on the public page. If an app never sends a close, it counts for at most 10
          minutes.
        </p>
      </section>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="step card-section" aria-labelledby={`step-${n}`}>
      <h2 id={`step-${n}`} className="step-h">
        <span className="step-n">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function SendTest({ token, app }: { token: string; app: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const send = async () => {
    setState('sending');
    try {
      const r = await fetch(PHONE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: shortcutBody('close', app, token),
      });
      setState(r.status === 204 ? 'sent' : 'error');
    } catch {
      setState('error');
    }
  };
  return (
    <p className="field-hint">
      No phone handy?{' '}
      <button className="link-btn" onClick={send} disabled={state === 'sending'}>
        Send a test from this browser
      </button>{' '}
      to check the URL and token.
      {state === 'error' && <span className="form-error"> That didn't go through. Check the token.</span>}
    </p>
  );
}

/** A drawing of the finished automation, in the shape the Shortcuts app shows it. */
function ShortcutDiagram({ app, kind, token }: { app: string; kind: 'open' | 'close'; token: string }) {
  const short = token.length > 14 ? `${token.slice(0, 10)}…` : token;
  return (
    <figure
      className="sc"
      aria-label={`Diagram: automation for ${app} ${kind === 'open' ? 'opening' : 'closing'}`}
    >
      <div className="sc-phone">
        <div className="sc-card sc-when">
          <span className="sc-k">When</span>
          <span>
            <b>{app}</b> is {kind === 'open' ? 'opened' : 'closed'}
          </span>
          <span className="sc-toggle">
            Run Immediately <i aria-hidden="true" />
          </span>
        </div>
        <div className="sc-arrow" aria-hidden="true" />
        <div className="sc-card sc-do">
          <span className="sc-k">Get Contents of URL</span>
          <span className="sc-url">…/functions/v1/phone-event</span>
          <dl>
            <dt>Method</dt>
            <dd>POST</dd>
            <dt>Request Body</dt>
            <dd>JSON</dd>
            <dt>token</dt>
            <dd>{short}</dd>
            <dt>app</dt>
            <dd>{app}</dd>
            <dt>kind</dt>
            <dd>
              <b>{kind}</b>
            </dd>
          </dl>
        </div>
      </div>
    </figure>
  );
}
