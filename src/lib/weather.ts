// The week's shape in one line, the way a forecast reads: "Heavy Thursday, clear weekend, exam on
// Sunday." Students glance; they don't read tables.
import { dayKey, iso, utc, WD, type PlanItem } from './plan';

export const HEAVY_HOURS = 4;
export const LIGHT_HOURS = 1;

const LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const list = (xs: string[]) =>
  xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

export interface DayLoad {
  day: string;
  name: string;
  hours: number;
  exam: boolean;
}

/** Planned study and class hours per day for the next seven days from today. */
export function loads(plan: PlanItem[], now: number): DayLoad[] {
  const today = dayKey(new Date(now));
  const out: DayLoad[] = [];
  for (let i = 0; i < 7; i++) {
    const day = iso(utc(today) + i * 864e5);
    const items = plan.filter((r) => r.day === day && !r.proposed);
    const hours = items
      .filter((r) => r.kind === 'Study' || r.kind === 'Class')
      .reduce((a, r) => a + r.hours, 0);
    const name = i === 0 ? 'today' : i === 1 ? 'tomorrow' : LONG[new Date(utc(day)).getUTCDay()];
    out.push({ day, name, hours: Math.round(hours * 10) / 10, exam: items.some((r) => r.kind === 'Exam') });
  }
  return out;
}

/** One line, or an empty string when the week is even. */
export function forecast(plan: PlanItem[], now: number): string {
  const week = loads(plan, now);
  const heavy = week.filter((d) => d.hours >= HEAVY_HOURS && !d.exam);
  const clear = week.filter((d) => d.hours === 0 && !d.exam);
  const exams = week.filter((d) => d.exam);
  const parts: string[] = [];
  if (heavy.length) parts.push(`heavy ${list(heavy.map((d) => d.name))}`);
  if (clear.length) {
    // A clear Saturday and Sunday read as "the weekend", in their place in the week.
    const dow = (d: DayLoad) => new Date(utc(d.day)).getUTCDay();
    const names: string[] = [];
    for (let i = 0; i < clear.length; i++) {
      const d = clear[i];
      const nx = clear[i + 1];
      if (dow(d) === 6 && nx && dow(nx) === 0 && d.name !== 'today' && nx.name !== 'tomorrow') {
        names.push('the weekend');
        i++;
      } else names.push(d.name);
    }
    parts.push(`clear ${list(names)}`);
  }
  if (exams.length) parts.push(`${exams.length === 1 ? 'exam' : 'exams'} ${list(exams.map((d) => d.name))}`);
  if (!parts.length) return '';
  const s = parts.join(', ');
  return `The week: ${s}.`;
}

export { WD };
