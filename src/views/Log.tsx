import { useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { Icon } from '../components/Icon';
import { SignInNeeded } from '../components/SignInNeeded';
import { useAuth } from '../lib/auth';
import { COURSES, colorOf } from '../lib/courses';
import { focusSeconds, sessionsCsv, useHistory } from '../lib/history';
import { dayKey, dayName } from '../lib/plan';
import type { Session } from '../lib/supabase';
import { MODES, duration } from '../lib/timer';

const COURSE_OPTIONS = [...COURSES, 'General'];
const pad = (n: number) => String(n).padStart(2, '0');
const localTime = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const at = (day: string, time: string) => new Date(`${day}T${time || '12:00'}`);
// Display times the way the plan writes them: "9:45 AM", "12 PM".
const clockTime = (iso: string) => {
  const d = new Date(iso);
  const h = d.getHours() % 12 || 12;
  const m = d.getMinutes();
  return `${h}${m ? `:${pad(m)}` : ''} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
};
const span = (a: string, b: string) => {
  const [x, y] = [clockTime(a), clockTime(b)];
  // "6:24–7:19 PM" when both are in the same half of the day
  return x.slice(-2) === y.slice(-2) ? `${x.slice(0, -3)}–${y}` : `${x}–${y}`;
};

export function Log() {
  const { user, ready } = useAuth();
  const h = useHistory();
  const [adding, setAdding] = useState(false);
  const byDay = useMemo(() => {
    const m = new Map<string, Session[]>();
    for (const s of h.sessions) {
      const k = dayKey(new Date(s.started_at));
      m.set(k, [...(m.get(k) ?? []), s]);
    }
    return [...m.entries()];
  }, [h.sessions]);

  if (!ready) return null;
  if (!user) return <SignInNeeded what="see your study log" />;

  const download = () => {
    const blob = new Blob([sessionsCsv(h.sessions)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `runway-sessions-${dayKey(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-h">Log</h1>
        <div className="row">
          <button className="btn" onClick={() => setAdding((v) => !v)} aria-expanded={adding}>
            <Icon name="plus" /> Add time
          </button>
          <button className="btn btn-quiet" onClick={download} disabled={!h.sessions.length}>
            <Icon name="download" /> CSV
          </button>
        </div>
      </div>
      {adding && <ManualEntry onDone={() => setAdding(false)} />}
      {!h.loading && !h.sessions.length && !adding && (
        <div className="empty">
          <p>No sessions yet. Start one from the header, or add time you studied away from Runway.</p>
          <button className="btn btn-primary" onClick={() => setAdding(true)}>
            <Icon name="plus" /> Add time
          </button>
        </div>
      )}
      {byDay.map(([day, list]) => {
        const total = list.reduce((s, x) => s + focusSeconds(x), 0);
        return (
          <section key={day} className="log-day" aria-label={dayName(day)}>
            <h2 className="log-day-h">
              <span>{dayName(day)}</span>
              <b>{duration(total)}</b>
            </h2>
            <ul className="log-list">
              {list.map((s) => (
                <LogItem key={s.id} s={s} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function LogItem({ s }: { s: Session }) {
  const [editing, setEditing] = useState(false);
  if (editing) return <EditItem s={s} onDone={() => setEditing(false)} />;
  const mode = s.source === 'manual' ? 'Added by hand' : MODES.find((m) => m.id === s.mode)?.label;
  return (
    <li className="log-item" style={{ '--c': colorOf(s.course) } as CSSProperties}>
      <span className="log-time">{span(s.started_at, s.ended_at!)}</span>
      <div className="log-what">
        <span className="w1">
          <b className="log-course">{s.course}</b> {duration(focusSeconds(s))}
        </span>
        <span className="w2">
          {mode}
          {s.source === 'phone' && ' · started from phone'}
          {s.focus_pct != null && ` · ${Math.round(Number(s.focus_pct))}% focus`}
          {s.pickups != null && ` · ${s.pickups} pickups`}
          {s.rating != null && ` · rated ${s.rating}/5`}
        </span>
        {s.note && <span className="log-note">{s.note}</span>}
      </div>
      <button className="icon-btn" onClick={() => setEditing(true)} aria-label={`Edit ${s.course} session`}>
        <Icon name="edit" size={18} />
      </button>
    </li>
  );
}

function EditItem({ s, onDone }: { s: Session; onDone: () => void }) {
  const h = useHistory();
  const [course, setCourse] = useState(s.course);
  const [day, setDay] = useState(dayKey(new Date(s.started_at)));
  const [time, setTime] = useState(localTime(s.started_at));
  const [minutes, setMinutes] = useState(Math.round(focusSeconds(s) / 60));
  const [rating, setRating] = useState<string>(s.rating == null ? '' : String(s.rating));
  const [note, setNote] = useState(s.note ?? '');
  const [error, setError] = useState<string | null>(null);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const start = at(day, time);
    // Keep pauses and breaks as they were; the focused minutes decide the end time.
    const end = new Date(start.getTime() + (minutes * 60 + s.paused_seconds + s.break_seconds) * 1000);
    try {
      await h.update(s.id, {
        course,
        started_at: start.toISOString(),
        ended_at: end.toISOString(),
        rating: rating ? Number(rating) : null,
        note: note.trim() || null,
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    }
  };

  const remove = async () => {
    if (!confirm(`Delete this ${s.course} session? This can't be undone.`)) return;
    await h.remove(s.id);
  };

  return (
    <li className="log-item is-editing">
      <form className="log-form" onSubmit={save}>
        <CourseSelect value={course} onChange={setCourse} />
        <label className="field">
          <span className="field-label">Date</span>
          <input type="date" required value={day} onChange={(e) => setDay(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Start</span>
          <input type="time" required value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Focused (min)</span>
          <input
            type="number"
            min={1}
            max={1440}
            required
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
          />
        </label>
        <label className="field">
          <span className="field-label">Rating</span>
          <select value={rating} onChange={(e) => setRating(e.target.value)}>
            <option value="">None</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n} / 5
              </option>
            ))}
          </select>
        </label>
        <label className="field wide">
          <span className="field-label">Note</span>
          <textarea rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <div className="row wide">
          <button className="btn btn-primary">
            <Icon name="check" /> Save
          </button>
          <button type="button" className="btn btn-quiet" onClick={onDone}>
            Cancel
          </button>
          <button type="button" className="btn btn-danger push" onClick={remove}>
            <Icon name="trash" /> Delete
          </button>
        </div>
        {error && <p className="form-error wide">{error}</p>}
      </form>
    </li>
  );
}

function ManualEntry({ onDone }: { onDone: () => void }) {
  const h = useHistory();
  const [course, setCourse] = useState(COURSES[0]);
  const [day, setDay] = useState(dayKey(new Date()));
  const [time, setTime] = useState('');
  const [minutes, setMinutes] = useState(60);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    // No start time given: assume it ended now (today) or at noon (another day).
    let start = at(day, time);
    if (!time && day === dayKey(new Date())) start = new Date(Date.now() - minutes * 60_000);
    try {
      await h.addManual({ start, minutes, course, note: note.trim() || null });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    }
  };

  return (
    <form className="log-form card-section" onSubmit={submit} aria-label="Add study time">
      <CourseSelect value={course} onChange={setCourse} />
      <label className="field">
        <span className="field-label">Date</span>
        <input
          type="date"
          required
          value={day}
          max={dayKey(new Date())}
          onChange={(e) => setDay(e.target.value)}
        />
      </label>
      <label className="field">
        <span className="field-label">Start (optional)</span>
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
      </label>
      <label className="field">
        <span className="field-label">Minutes</span>
        <input
          type="number"
          min={1}
          max={1440}
          required
          value={minutes}
          onChange={(e) => setMinutes(Number(e.target.value))}
        />
      </label>
      <label className="field wide">
        <span className="field-label">Note (optional)</span>
        <input type="text" maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="row wide">
        <button className="btn btn-primary">
          <Icon name="check" /> Add
        </button>
        <button type="button" className="btn btn-quiet" onClick={onDone}>
          Cancel
        </button>
      </div>
      {error && <p className="form-error wide">{error}</p>}
    </form>
  );
}

function CourseSelect({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const options = COURSE_OPTIONS.includes(value) ? COURSE_OPTIONS : [value, ...COURSE_OPTIONS];
  return (
    <label className="field">
      <span className="field-label">Course</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>
    </label>
  );
}
