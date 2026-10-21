import { Link } from 'react-router-dom';
import { hasBackend } from '../lib/supabase';

/** Shown on owner-only views to visitors: what the view is for and the one next step. */
export function SignInNeeded({ what }: { what: string }) {
  return (
    <section className="empty">
      <h1 className="fx-h">Sign in to {what}.</h1>
      {hasBackend ? (
        <p>
          This part of Runway is private. <Link to="/settings">Sign in</Link> with your email and you'll get a
          link.
        </p>
      ) : (
        <p>The backend isn't connected on this copy of the site, so only the runway is available.</p>
      )}
      <p>
        <Link to="/">Back to the runway</Link>
      </p>
    </section>
  );
}
