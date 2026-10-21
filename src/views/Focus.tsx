import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { NowPlaying } from '../components/NowPlaying';
import { FocusFormula, PhoneMeter } from '../components/PhoneMeter';
import { SignInNeeded } from '../components/SignInNeeded';
import { useAuth } from '../lib/auth';
import { courseVars, inkOf } from '../lib/courses';
import { useLiveSession } from '../lib/liveSession';
import { currentOrNextStudy, dayKey, timePart, type PlanItem } from '../lib/plan';
import type { Session } from '../lib/supabase';
import {
  MODES,
  breakIdea,
  clock,
  duration,
  planFor,
  timerState,
  type Mode,
  type TimerState,
} from '../lib/timer';
import { useNow, usePlan } from '../lib/usePlan';

export function Focus() {
  const { user, ready } = useAuth();
  const live = useLiveSession();
  if (!ready || (user && live.loading)) return <div className="fx fx-loading" aria-busy="true" />;
  if (!user) return <SignInNeeded what="run study sessions" />;
  if (live.ended) return <EndScreen session={live.ended} />;
  if (!live.session) return <StartScreen />;
  return <Running />;
}

function StartScreen() {
  const { plan } = usePlan();
  const { settings } = useAuth();
  const live = useLiveSession();
  const now = useNow();
  const block = useMemo(() => currentOrNextStudy(plan, now), [plan, now]);
  const today = dayKey(new Date(now));
  const { courses: planCourses } = usePlan();
  const codes = planCourses.map((c) => c.code);
  const [course, setCourse] = useState(block?.course ?? codes[0] ?? 'General');
  const [mode, setMode] = useState<Mode>((settings.break_mode as Mode) || 'pomodoro');
  const courses = [...codes, 'General'];
  const linked = block && block.course === course && block.day === today ? block : null;

  return (
    <section className="fx fx-start" aria-labelledby="fx-start-h">
      <h1 id="fx-start-h" className="fx-h">
        What are you studying?
      </h1>
      {block && <PlannedNow block={block} now={now} />}
      <div className="field">
        <span className="field-label" id="course-l">
          Course
        </span>
        <div className="chips" role="radiogroup" aria-labelledby="course-l">
          {courses.map((c) => (
            <button
              key={c}
              role="radio"
              aria-checked={course === c}
              className="chip"
              style={{ ...courseVars(c) } as CSSProperties}
              onClick={() => setCourse(c)}
            >
              {c}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span className="field-label" id="mode-l">
          Breaks
        </span>
        <div className="chips" role="radiogroup" aria-labelledby="mode-l">
          {MODES.map((m) => (
            <button
              key={m.id}
              role="radio"
              aria-checked={mode === m.id}
              className="chip"
              onClick={() => setMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="field-hint">{MODES.find((m) => m.id === mode)?.hint}</p>
      </div>
      <button
        className="btn btn-primary btn-big"
        onClick={() => live.start({ course, plan_item_id: linked?.id ?? null, mode })}
      >
        <Icon name="play" /> Start
      </button>
      {live.error && <p className="form-error">{live.error}</p>}
    </section>
  );
}

function PlannedNow({ block, now }: { block: PlanItem; now: number }) {
  const happening = Date.parse(block.start) <= now;
  return (
    <p className="fx-planned" style={{ ...courseVars(block.course) } as CSSProperties}>
      <i aria-hidden="true" />
      <span>
        {happening ? 'On the plan now' : 'Next on the plan'}: <b>{block.course}</b>, {block.title}
        <span className="muted"> · {block.day === dayKey(new Date(now)) ? timePart(block) : block.when}</span>
      </span>
    </p>
  );
}

function Running() {
  const live = useLiveSession();
  const { settings } = useAuth();
  const s = live.session!;
  const now = useNow(1000) + live.skewMs;
  const st = timerState(s, live.breaks, now, settings);
  const plan = planFor(s.mode, settings);
  const [snoozed, setSnoozed] = useState(-1); // the interval (breaksTaken) whose nudge was dismissed
  const autoStarted = useRef(-1);

  // Tab title shows the timer, so it's visible from other tabs.
  useEffect(() => {
    const prev = document.title;
    return () => {
      document.title = prev;
    };
  }, []);
  useEffect(() => {
    document.title =
      st.phase === 'break'
        ? `Break ${clock(st.breakLeftSec ?? 0)} · Runway`
        : `${clock(plan.timed ? (st.toBreakSec ?? 0) : st.focusSec)} · ${s.course}`;
  });

  // Optional: start the break automatically when it's due (off by default).
  useEffect(() => {
    if (st.breakDue && settings.auto_break && autoStarted.current !== st.breaksTaken) {
      autoStarted.current = st.breaksTaken;
      live.startBreak(st.nextBreak);
    }
  }, [st.breakDue, st.breaksTaken, st.nextBreak, settings.auto_break, live]);

  if (st.phase === 'break') return <BreakScreen st={st} />;

  const showNudge = st.breakDue && snoozed !== st.breaksTaken;
  const breakLen = plan.breakSec(st.nextBreak) / 60;
  const main = plan.timed ? Math.max(0, st.toBreakSec ?? 0) : st.focusSec;

  return (
    <section
      className="fx fx-run"
      style={{ ...courseVars(s.course) } as CSSProperties}
      aria-label="Study session"
    >
      <p className="fx-course">
        <b>{s.course}</b>
        <span className="muted"> · {MODES.find((m) => m.id === s.mode)?.label}</span>
      </p>
      <div
        className={`fx-timer${st.phase === 'paused' ? ' is-paused' : ''}`}
        role="timer"
        aria-label={plan.timed ? `${clock(main)} until your break` : `${clock(main)} focused`}
      >
        {clock(main)}
      </div>
      <p className="fx-sub">
        {st.phase === 'paused' ? (
          <>Paused. {duration(st.focusSec)} focused so far.</>
        ) : plan.timed ? (
          st.breakDue ? (
            <>
              Break due. {duration(st.focusSec)} focused, {st.breaksTaken}{' '}
              {st.breaksTaken === 1 ? 'break' : 'breaks'}.
            </>
          ) : (
            <>
              until a {breakLen}-minute {st.nextBreak} break · {duration(st.focusSec)} focused
            </>
          )
        ) : (
          <>focused · nudge at 90 min without a break</>
        )}
      </p>

      <PhoneMeter session={s} breaks={live.breaks} now={now} />

      {showNudge && (
        <div className="fx-nudge" role="status">
          <p>
            {plan.timed
              ? `Time for a ${breakLen}-minute break.`
              : `You've been at it ${duration(st.intervalSec)} without a break.`}
          </p>
          <div className="row">
            <button className="btn btn-primary" onClick={() => live.startBreak(st.nextBreak)}>
              <Icon name="coffee" /> Start break
            </button>
            <button className="btn btn-quiet" onClick={() => setSnoozed(st.breaksTaken)}>
              Keep going
            </button>
          </div>
        </div>
      )}

      <div className="fx-controls">
        {st.phase === 'paused' ? (
          <button className="btn btn-primary" onClick={live.resume}>
            <Icon name="play" /> Resume
          </button>
        ) : (
          <button className="btn" onClick={live.pause}>
            <Icon name="pause" /> Pause
          </button>
        )}
        {!showNudge && (
          <button className="btn" onClick={() => live.startBreak(st.nextBreak)}>
            <Icon name="coffee" /> Break
          </button>
        )}
        <button className="btn" onClick={live.end}>
          <Icon name="stop" /> End
        </button>
      </div>
      {live.error && <p className="form-error">{live.error}</p>}
      <OfflineNote />
      <NowPlaying />
    </section>
  );
}

/** Shown while session actions are waiting for a connection. */
function OfflineNote() {
  const { pending } = useLiveSession();
  if (!pending) return null;
  return (
    <p className="fx-offline" role="status">
      Offline. {pending} {pending === 1 ? 'change' : 'changes'} will sync when you're back online.
    </p>
  );
}

function BreakScreen({ st }: { st: TimerState }) {
  const live = useLiveSession();
  const left = st.breakLeftSec ?? 0;
  const over = left < 0;
  return (
    <section className="fx fx-break" aria-label="Break">
      <p className="fx-course">
        <b>{st.currentBreak?.kind === 'long' ? 'Long break' : 'Break'}</b>
      </p>
      <div className={`fx-timer${over ? ' is-over' : ''}`} role="timer">
        {clock(Math.abs(left))}
      </div>
      <p className="fx-sub">{over ? 'over your break' : 'left'}</p>
      <p className="fx-idea">{breakIdea(st.breaksTaken - 1)}</p>
      <div className="fx-controls">
        <button className="btn btn-primary btn-big" onClick={live.endBreak}>
          <Icon name="play" /> Back to work
        </button>
      </div>
      <OfflineNote />
      <NowPlaying />
    </section>
  );
}

function EndScreen({ session }: { session: Session }) {
  const live = useLiveSession();
  const { settings } = useAuth();
  const st = timerState(session, [], Date.parse(session.ended_at!), settings);
  const short = st.focusSec < 120;
  const [rating, setRating] = useState<number | null>(null);
  const [note, setNote] = useState('');

  return (
    <section className="fx fx-end" aria-labelledby="fx-end-h">
      <h1 id="fx-end-h" className="fx-h">
        {short ? 'That was short.' : 'Session done.'}
      </h1>
      <dl className="fx-stats">
        <div>
          <dt>Focused</dt>
          <dd>{duration(st.focusSec)}</dd>
        </div>
        <div>
          <dt>Course</dt>
          <dd style={{ color: inkOf(session.course) }}>{session.course}</dd>
        </div>
        {session.focus_pct != null && (
          <>
            <div>
              <dt>Focus</dt>
              <dd>{Math.round(Number(session.focus_pct))}%</dd>
            </div>
            <div>
              <dt>Pickups</dt>
              <dd>{session.pickups ?? 0}</dd>
            </div>
          </>
        )}
        {session.longest_stretch_seconds != null && session.longest_stretch_seconds >= 60 && (
          <div>
            <dt>Longest unbroken</dt>
            <dd>{duration(session.longest_stretch_seconds)}</dd>
          </div>
        )}
      </dl>
      {session.focus_pct != null && (
        <details className="formula-details">
          <summary>How focus is measured</summary>
          <FocusFormula />
        </details>
      )}
      {short && (
        <div className="fx-nudge" role="status">
          <p>Under 2 minutes. Started by mistake?</p>
          <div className="row">
            <button className="btn btn-primary" onClick={live.discard}>
              <Icon name="trash" /> Discard it
            </button>
          </div>
        </div>
      )}
      <fieldset className="field">
        <legend className="field-label">How did it go?</legend>
        <div className="rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              aria-pressed={rating === n}
              aria-label={`${n} out of 5`}
              onClick={() => setRating(rating === n ? null : n)}
            >
              {n}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="field">
        <span className="field-label">Note (only you see this)</span>
        <textarea
          rows={3}
          value={note}
          maxLength={2000}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What you covered, what to pick up next time"
        />
      </label>
      <div className="fx-controls">
        <button
          className="btn btn-primary btn-big"
          onClick={() => live.finish({ rating, note: note.trim() || null })}
        >
          <Icon name="check" /> Save
        </button>
        {!short && (
          <button className="btn btn-quiet" onClick={live.discard}>
            Discard
          </button>
        )}
      </div>
      {live.error && <p className="form-error">{live.error}</p>}
      <OfflineNote />
      <p className="muted small">
        Saved sessions show up in the <Link to="/log">log</Link>.
      </p>
    </section>
  );
}
