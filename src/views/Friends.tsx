import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { SignInNeeded } from '../components/SignInNeeded';
import { useAuth } from '../lib/auth';
import { name, removeFriend, requestFriend, respondFriend, useFriends } from '../lib/social';
import { duration } from '../lib/timer';

export function Friends() {
  const { user, ready, profile } = useAuth();
  const { friends, refresh } = useFriends();
  const [handle, setHandle] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  if (!ready) return null;
  if (!user) return <SignInNeeded what="see your friends" />;

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      await requestFriend(handle.trim().replace(/^@/, '').toLowerCase());
      setHandle('');
      await refresh();
      setMsg('Asked.');
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Could not add them.');
    }
  };

  const received = (friends ?? []).filter((f) => f.status === 'requested' && f.direction === 'received');
  const sent = (friends ?? []).filter((f) => f.status === 'requested' && f.direction === 'sent');
  const accepted = (friends ?? []).filter((f) => f.status === 'accepted');

  return (
    <div className="page page-narrow">
      <h1 className="page-h">Friends</h1>
      <p className="mc-note">
        Friends see your hours, readiness and streak at your <Link to="/settings">sharing level</Link>, and
        which courses you've made visible. Your handle is <b>@{profile?.handle}</b>; find classmates on the{' '}
        <Link to="/courses">Courses</Link> page or add anyone by handle.
      </p>
      <form className="form-row" onSubmit={add} aria-label="Add a friend">
        <label className="field grow">
          <span className="field-label">Handle</span>
          <input
            type="text"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="@handle"
            required
          />
        </label>
        <button className="btn btn-primary">Add friend</button>
      </form>
      {msg && (
        <p className="field-hint" role="status">
          {msg}
        </p>
      )}

      {received.length > 0 && (
        <section className="card-section" aria-labelledby="fr-req">
          <h2 id="fr-req" className="mc-h2">
            Requests
          </h2>
          <ul className="cm-rows">
            {received.map((f) => (
              <li key={f.handle} className="cm-row">
                <span className="cm-name">
                  {name(f)} <span className="muted">@{f.handle}</span>
                </span>
                <span className="row">
                  <button
                    className="btn btn-small btn-primary"
                    onClick={() => respondFriend(f.handle, true).then(refresh)}
                  >
                    Accept
                  </button>
                  <button
                    className="btn btn-small btn-quiet"
                    onClick={() => respondFriend(f.handle, false).then(refresh)}
                  >
                    Decline
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card-section" aria-labelledby="fr-list">
        <h2 id="fr-list" className="mc-h2">
          Your friends
        </h2>
        {friends === null ? null : accepted.length === 0 ? (
          <p className="field-hint">No friends yet.</p>
        ) : (
          <ul className="cm-rows">
            {accepted.map((f) => (
              <li key={f.handle} className="cm-row">
                <span className="cm-name">
                  {name(f)} <span className="muted">@{f.handle}</span>
                  {f.courses.length > 0 && <span className="cm-courses">{f.courses.join(' · ')}</span>}
                </span>
                <span className="cm-stats">
                  {f.week_minutes != null ? (
                    <span>{duration(f.week_minutes * 60)} this week</span>
                  ) : (
                    <span className="muted">shares nothing yet</span>
                  )}
                  {f.streak != null && f.streak > 0 && <span>{f.streak}-day streak</span>}
                </span>
                <button className="btn btn-link" onClick={() => removeFriend(f.handle).then(refresh)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        {sent.length > 0 && (
          <p className="field-hint">Waiting on: {sent.map((f) => `@${f.handle}`).join(', ')}</p>
        )}
      </section>
    </div>
  );
}
