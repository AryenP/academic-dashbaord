import { useState, type FormEvent } from 'react';
import { usePlan, type NewItem } from '../lib/usePlan';
import { Icon } from './Icon';

// Adds one thing to the runway by hand: a study block, deadline, exam, class or commitment.

const KINDS: { id: NewItem['kind']; label: string }[] = [
  { id: 'study', label: 'Study block' },
  { id: 'exam', label: 'Exam' },
  { id: 'deadline', label: 'Deadline' },
  { id: 'class', label: 'Class' },
  { id: 'commitment', label: 'Work or other' },
];

const todayKey = () => new Date().toLocaleDateString('en-CA');

export function AddItem({ onDone }: { onDone: () => void }) {
  const plan = usePlan();
  const [kind, setKind] = useState<NewItem['kind']>('exam');
  const [course, setCourse] = useState(plan.courses[0]?.code ?? '');
  const [title, setTitle] = useState('');
  const [day, setDay] = useState(todayKey());
  const [start, setStart] = useState('17:00');
  const [end, setEnd] = useState('18:00');
  const [location, setLocation] = useState('');
  const [weight, setWeight] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const s = new Date(`${day}T${start}:00`);
    const en = new Date(`${day}T${end}:00`);
    if (!(en > s)) {
      setError('The end has to be after the start.');
      return;
    }
    setBusy(true);
    try {
      await plan.addItem({
        kind,
        course: kind === 'commitment' ? null : course.trim() || null,
        title: title.trim() || KINDS.find((k) => k.id === kind)!.label,
        start_at: s.toISOString(),
        end_at: en.toISOString(),
        location,
        weight: kind === 'exam' && weight !== '' ? Number(weight) : null,
      });
      setTitle('');
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="log-form card-section add-item" onSubmit={submit} aria-label="Add to the runway">
      <div className="field wide">
        <span className="field-label" id="kind-l">
          What is it?
        </span>
        <div className="chips" role="radiogroup" aria-labelledby="kind-l">
          {KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              role="radio"
              aria-checked={kind === k.id}
              className="chip"
              onClick={() => setKind(k.id)}
            >
              {k.label}
            </button>
          ))}
        </div>
      </div>
      {kind !== 'commitment' && (
        <label className="field">
          <span className="field-label">Course</span>
          <input
            type="text"
            list="course-codes"
            required
            maxLength={40}
            placeholder="DSC 140A"
            value={course}
            onChange={(e) => setCourse(e.target.value)}
          />
          <datalist id="course-codes">
            {plan.courses.map((c) => (
              <option key={c.id} value={c.code} />
            ))}
          </datalist>
        </label>
      )}
      <label className="field grow">
        <span className="field-label">Title</span>
        <input
          type="text"
          maxLength={200}
          placeholder={
            kind === 'exam' ? 'Midterm 1' : kind === 'commitment' ? 'Research lab' : 'Lectures 4–6'
          }
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label className="field">
        <span className="field-label">Date</span>
        <input type="date" required value={day} onChange={(e) => setDay(e.target.value)} />
      </label>
      <label className="field">
        <span className="field-label">Start</span>
        <input type="time" required value={start} onChange={(e) => setStart(e.target.value)} />
      </label>
      <label className="field">
        <span className="field-label">End</span>
        <input type="time" required value={end} onChange={(e) => setEnd(e.target.value)} />
      </label>
      {kind === 'exam' && (
        <>
          <label className="field">
            <span className="field-label">Where</span>
            <input
              type="text"
              maxLength={200}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Center Hall 115"
            />
          </label>
          <label className="field">
            <span className="field-label">Weight (% of grade)</span>
            <input
              type="number"
              min={0}
              max={100}
              inputMode="numeric"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
          </label>
        </>
      )}
      <div className="row wide">
        <button className="btn btn-primary" disabled={busy}>
          <Icon name="check" /> {busy ? 'Adding…' : 'Add'}
        </button>
        <button type="button" className="btn btn-quiet" onClick={onDone}>
          Cancel
        </button>
      </div>
      {error && <p className="form-error wide">{error}</p>}
    </form>
  );
}
