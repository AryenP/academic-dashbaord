import { useMemo } from 'react';
import { Runway } from '../components/Runway';
import { Checkpoints } from '../components/Checkpoints';
import { setCourseSlots } from '../lib/courses';
import { daysUntil, isPast } from '../lib/plan';
import { useNow } from '../lib/useNow';
import { GOOGLE_SIGNIN } from '../lib/flags';
import { demoPlan, DEMO_COURSES } from './demo';

// The landing page. Signed-out visitors see this at the site root: the hero is a live demo runway
// with made-up courses, and the rest is three short sections and the sign-up link.
//
// It uses plain anchors, not the router, so it can be rendered on its own without the app bundle
// (src/main.tsx) and to static HTML at build time (scripts/prerender.tsx). With `static`, the board
// is an empty shell of the same height: the live one takes its place when the page loads.

const SIGNUP = '#/signin';

export function Landing({ static: isStatic = false }: { static?: boolean }) {
  const now = useNow(60_000);
  const data = useMemo(() => {
    setCourseSlots(DEMO_COURSES);
    return demoPlan(now);
  }, [now]);
  const next = data.exam_prep.find((x) => !isPast(x, now));
  const n = next ? daysUntil(next.day, new Date(now)) : 0;

  return (
    <div className="ld">
      <header className="ld-top">
        <a href="#/" className="wordmark" aria-label="Runway home">
          Runway
        </a>
        <nav aria-label="Site">
          <a href="#how">How it works</a>
          <a href="privacy.html">Privacy</a>
          <a href={SIGNUP} className="btn btn-quiet">
            Sign in
          </a>
        </nav>
      </header>

      <main>
        <section className="ld-hero" aria-labelledby="ld-h1">
          <div className="ld-hero-text">
            <h1 id="ld-h1" className="ld-h1">
              Your runway to every exam.
            </h1>
            <p className="ld-lede">
              Runway reads your calendar, finds your courses and exams, and plans the studying in between.
              Then it runs each session, checks your focus with your phone, and shows how ready you are.
            </p>
            <p className="ld-cta">
              <a href={SIGNUP} className="btn btn-primary btn-big">
                Sign up with your school email
              </a>
              {GOOGLE_SIGNIN && (
                <a href={SIGNUP} className="ld-more">
                  or continue with Google
                </a>
              )}
              <a href="#/try" className="ld-more">
                See your own runway first
              </a>
              <a href="#how" className="ld-more">
                How it works
              </a>
            </p>
          </div>
          <div className="ld-board" aria-label="A demo runway with made-up courses">
            {isStatic ? (
              <div className="mc-runway ld-board-static" aria-hidden="true" />
            ) : (
              <Runway plan={data.plan} now={now} />
            )}
            <p className="ld-board-note">
              {next
                ? `A demo: ${n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`}, ${next.course} ${next.title}. The courses are made up; yours come from your calendar.`
                : 'A demo. The courses are made up; yours come from your calendar.'}
            </p>
          </div>
        </section>

        <section className="ld-how" id="how" aria-labelledby="ld-how-h">
          <h2 id="ld-how-h" className="mc-h2">
            How it works
          </h2>
          <ol className="ld-steps">
            <li>
              <span>
                <b>Connect your calendar.</b> Paste your Google or Canvas calendar address. Runway finds your
                courses, classes, exams and deadlines, and you fix anything it got wrong.
              </span>
            </li>
            <li>
              <span>
                <b>Get a plan.</b> Study blocks before each exam, sized by its weight and how much time is
                left, around your classes, work and the rest of your life.
              </span>
            </li>
            <li>
              <span>
                <b>Run your sessions.</b> One tap starts the block you should be doing now. Breaks, music, and
                a timer that survives a dead battery.
              </span>
            </li>
            <li>
              <span>
                <b>Let your phone fill in the rest.</b> Once a day an iPhone Shortcut sends last night's
                sleep, your exercise and your steps, nothing finer. Stats says what tends to go with a good
                session.
              </span>
            </li>
          </ol>
        </section>

        <section className="ld-proof" aria-label="What makes it different">
          <div>
            <h2 className="mc-h2">Readiness you can explain</h2>
            {!isStatic && next && (
              <div className="ld-cp">
                <Checkpoints exams={[next]} plan={data.plan} now={now} />
              </div>
            )}
            <p>
              Every exam shows hours studied over hours planned. No mystery score: the formula is one tap
              away, and it counts study you did off the plan too.
            </p>
          </div>
          <div>
            <h2 className="mc-h2">Focus your phone verifies</h2>
            <p className="ld-num">
              <b>87%</b>
              <span>focus, 2 pickups, longest stretch 41 min</span>
            </p>
            <p>
              An iPhone Shortcut pings Runway when you open an app you've marked as distracting. Time in those
              apps during a session is phone time. Everything else is focus.
            </p>
          </div>
          <div>
            <h2 className="mc-h2">Private by default</h2>
            <p>
              Your calendar stays yours. Runway reads titles, times and places, nothing else, and every row in
              the database is locked to your account. Delete your account and everything goes with it.
            </p>
            <p>
              <a href="privacy.html">Read the privacy page</a>
            </p>
          </div>
        </section>

        <section className="ld-end" aria-label="Sign up">
          <p className="ld-end-h">Connect your calendar. See your runway in a minute.</p>
          <p className="ld-cta">
            <a href={SIGNUP} className="btn btn-primary btn-big">
              Sign up with your school email
            </a>
            {GOOGLE_SIGNIN && (
              <a href={SIGNUP} className="ld-more">
                or continue with Google
              </a>
            )}
          </p>
        </section>
      </main>

      <footer className="ld-foot">
        <span>Runway</span>
        <a href="privacy.html">Privacy</a>
        <a href="https://github.com/AryenP/academic-dashbaord">Source on GitHub</a>
      </footer>
    </div>
  );
}
