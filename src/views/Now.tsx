import { useEffect, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { SignInNeeded } from '../components/SignInNeeded';
import { useAuth } from '../lib/auth';
import { boardAt, countdown } from '../lib/board';
import { courseVars } from '../lib/courses';
import { timePart } from '../lib/plan';
import { useNow, usePlan } from '../lib/usePlan';

// The second screen: no navigation, the block happening now, the time left in it, what comes
// next and the next exam, in the runway's numerals. For an iPad on the desk or a browser on a
// TV. It is the same plan the runway draws, read once a second.

export function Now() {
  const { user, ready } = useAuth();
  const data = usePlan();
  const now = useNow(1000);
  const b = boardAt(data.plan, data.exam_prep, now);
  const focus = b.current ?? b.next;
  useEffect(() => {
    document.title = b.seconds == null ? 'Runway' : `${countdown(b.seconds)} · ${focus?.course ?? 'Runway'}`;
    return () => {
      document.title = 'Runway';
    };
  }, [b.seconds, focus?.course]);

  if (!ready || (user && data.loading)) return <div className="fx fx-loading" aria-busy="true" />;
  if (!user) return <SignInNeeded what="see your second screen" />;

  return (
    <section
      className="ks"
      aria-labelledby="ks-h"
      style={focus ? (courseVars(focus.course) as CSSProperties) : undefined}
    >
      <h1 id="ks-h" className="sr-only">
        Now
      </h1>
      {focus ? (
        <>
          <p className="ks-what">
            <b className="ks-course">{focus.course}</b>
            <span className="ks-title">{focus.title}</span>
            <span className="ks-when">
              {b.current
                ? 'until ' + timePart(focus).split('–').pop()
                : `${timePart(focus).split('–')[0]}, ${focus.kind.toLowerCase()}`}
            </span>
          </p>
          <p
            className={`ks-num${b.current ? '' : ' is-ahead'}`}
            aria-live="off"
            aria-label={
              b.current
                ? `${countdown(b.seconds ?? 0)} left in ${focus.title}`
                : `${countdown(b.seconds ?? 0)} until ${focus.title}`
            }
          >
            {countdown(b.seconds ?? 0)}
          </p>
          <p className="ks-sub">{b.current ? 'left in this block' : 'until the next block'}</p>
        </>
      ) : (
        <>
          <p className="ks-num is-ahead">—</p>
          <p className="ks-sub">
            {data.plan.length ? 'The plan is finished.' : 'Nothing on the runway yet.'}
          </p>
        </>
      )}
      {b.current && b.next && (
        <p className="ks-next">
          Next: <b>{b.next.course}</b> {b.next.title}, {timePart(b.next).split('–')[0]}
        </p>
      )}
      {b.exam && (
        <p className="ks-exam" style={courseVars(b.exam.course) as CSSProperties}>
          <span className="ks-exam-n">
            {b.daysToExam <= 0 ? 'Today' : b.daysToExam === 1 ? 'Tomorrow' : `${b.daysToExam} days`}
          </span>
          <span>
            {b.daysToExam > 1 ? 'to ' : ''}
            <b>{b.exam.course}</b> {b.exam.title}, {b.exam.when}
            {b.exam.location ? `, ${b.exam.location}` : ''}
          </span>
        </p>
      )}
      <p className="ks-foot">
        <Link to="/">Back to the runway</Link>
      </p>
    </section>
  );
}
