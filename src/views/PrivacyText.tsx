// The privacy page's words, with plain anchors so the same component renders inside the app and
// as a static page (dist/privacy.html, for crawlers and Google's reviewers). Keep it true: update it
// in the same change as anything that changes what's collected.

export function PrivacyText({ home = '#/' }: { home?: string }) {
  return (
    <>
      <h1 className="page-h">Privacy</h1>
      <p className="muted">Last changed October 23, 2026.</p>

      <h2 className="mc-h2">What Runway reads</h2>
      <p>
        Your plan: the courses, classes, exams, deadlines and study blocks you add, or that come from a
        calendar you connect. From a calendar, Runway keeps event titles, times and places. It does not keep
        attendees, descriptions or anything from events it doesn't need.
      </p>
      <p>
        Your sessions: when you studied, for which course, breaks, your rating and note. If you set up phone
        tracking, the names of the apps you listed as distracting and when they opened and closed during a
        session. Nothing else from your phone.
      </p>

      <h2 className="mc-h2">Who can see it</h2>
      <p>
        You. Every row in the database is locked to your account by the database itself, not just by the app.
        Nobody else sees your plan, sessions, notes or phone data unless you turn on sharing in Settings, and
        then only at the level you pick: your plan, your exam readiness, or your daily totals. Notes, phone
        data and app names are never shared at any level.
      </p>

      <h2 className="mc-h2">What's stored where</h2>
      <p>
        Runway runs on Supabase (a hosted Postgres database) in the United States. Calendar addresses are
        secrets, so they're stored encrypted and never sent back to your browser once saved. If you try Runway
        with your calendar before signing up, it reads the address once to draw the preview and stores
        nothing; the address waits in your own browser, for a day at most, until you sign up. Runway sets no
        advertising cookies and uses no analytics service.
      </p>

      <h2 className="mc-h2">Why a school email</h2>
      <p>
        Runway is for students, so sign-up needs a school address. The domain tells Runway which school you're
        at, which is how it will find your school's Canvas and, if you choose, your classmates.
      </p>

      <h2 className="mc-h2">Deleting everything</h2>
      <p>
        Settings → Account → Download my data saves everything Runway holds about you as one JSON file, to
        read or to take elsewhere. Settings → Delete my account removes your account and every row tied to it,
        at once. There's no waiting period and nothing kept.
      </p>

      <h2 className="mc-h2">Questions</h2>
      <p>
        Runway is open source:{' '}
        <a href="https://github.com/AryenP/academic-dashbaord">the code is on GitHub</a>, including the
        database rules this page describes. Open an issue there.
      </p>
      <p>
        <a href={home}>Back to Runway</a>
      </p>
    </>
  );
}
