// The runway in words: one sentence per day for the week ahead, the way you'd tell a friend. For
// screen readers first, and for anyone who'd rather read than scan.
import { dayKey, dayName, iso, timePart, utc, type PlanItem } from './plan';

export interface DayWords {
  day: string;
  heading: string;
  text: string;
}

const list = (xs: string[]) =>
  xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const count = (n: number) => WORDS[n] ?? String(n);

/** The day's items as one sentence: "Two study blocks for MATH 20C, 9–10:30 AM and 3–4:30 PM; a CSE 12 deadline at 11:59 PM." */
export function dayWords(items: PlanItem[]): string {
  const live = items.filter((r) => !r.proposed);
  if (!live.length) return 'Nothing planned.';
  const parts: string[] = [];
  const exams = live.filter((r) => r.kind === 'Exam');
  for (const x of exams)
    parts.push(`${x.course} ${x.title} at ${timePart(x)}${x.location ? ` in ${x.location}` : ''}`);
  const study = live.filter((r) => r.kind === 'Study');
  const byCourse = new Map<string, PlanItem[]>();
  for (const r of study) byCourse.set(r.course, [...(byCourse.get(r.course) ?? []), r]);
  for (const [course, blocks] of byCourse)
    parts.push(
      `${count(blocks.length)} study ${blocks.length === 1 ? 'block' : 'blocks'} for ${course}, ${list(blocks.map(timePart))}`,
    );
  const classes = live.filter((r) => r.kind === 'Class');
  if (classes.length)
    parts.push(
      `${count(classes.length)} ${classes.length === 1 ? 'class' : 'classes'}: ${list(classes.map((c) => `${c.course} ${timePart(c)}`))}`,
    );
  const due = live.filter((r) => r.kind === 'Deadline');
  for (const d of due)
    parts.push(
      `${d.course} ${d.title}${/\bdue\b/i.test(d.title) ? '' : ' due'} ${timePart(d).replace(/^.*–/, '')}${d.status === 'submitted' ? ' (submitted)' : ''}`,
    );
  const other = live.filter((r) => r.kind === 'Commitment');
  if (other.length) parts.push(list(other.map((o) => `${o.title} ${timePart(o)}`)));
  const s = parts.join('; ');
  return s.charAt(0).toUpperCase() + s.slice(1) + '.';
}

/** The next `days` days from today, each as a heading and a sentence. */
export function narrate(plan: PlanItem[], now: number, days = 7, notes?: Map<string, string>): DayWords[] {
  const today = dayKey(new Date(now));
  const out: DayWords[] = [];
  for (let i = 0; i < days; i++) {
    const day = iso(utc(today) + i * 864e5);
    const items = plan.filter((r) => r.day === day).sort((a, b) => (a.start < b.start ? -1 : 1));
    const note = notes?.get(day);
    out.push({ day, heading: dayName(day, new Date(now)), text: dayWords(items) + (note ? ` ${note}` : '') });
  }
  return out;
}
