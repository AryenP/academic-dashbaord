// The week's shape in one line, the way a forecast reads: "Heavy Thursday, clear weekend, exam on
// Sunday." Students glance; they don't read tables.
import { dayKey, iso, mins, utc, WD, type PlanItem } from './plan';

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

/** The study window a person set (Settings → Planning), as the browser sees it. */
export interface Window {
  earliest?: string; // 'HH:MM'
  latest?: string;
  days_off?: number[];
}

const DEFAULT_WINDOW = { earliest: '09:00', latest: '22:00' };
const hhmm = (s: string | undefined, d: string) => (s && /^\d{2}:\d{2}$/.test(s) ? s : d);
const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));

export interface Overfull {
  day: string;
  name: string;
  /** Study hours on the calendar that day. */
  planned: number;
  /** Hours of the study window not taken by classes, commitments, exams or deadlines. */
  free: number;
}

/**
 * Days where more study is on the calendar than the day has room for: the window the person set,
 * minus everything fixed in it. The planner never drafts such a day; this is for the blocks a
 * person or a calendar made. Days off are left alone (a block there is their choice).
 */
export function overfull(plan: PlanItem[], now: number, w: Window = {}): Overfull[] {
  const earliest = toMin(hhmm(w.earliest, DEFAULT_WINDOW.earliest));
  const latest = toMin(hhmm(w.latest, DEFAULT_WINDOW.latest));
  if (latest <= earliest) return [];
  const off = new Set(w.days_off ?? []);
  const out: Overfull[] = [];
  for (const d of loads(plan, now)) {
    if (off.has(new Date(utc(d.day)).getUTCDay())) continue;
    const items = plan.filter((r) => !r.proposed && r.day === d.day);
    const study = items.filter((r) => r.kind === 'Study');
    if (!study.length) continue;
    // Fixed time inside the window, merged so overlapping classes aren't counted twice.
    const spans = items
      .filter((r) => r.kind !== 'Study')
      .map(
        (r) =>
          [
            Math.max(earliest, mins(r.start)),
            Math.min(latest, r.end.slice(0, 10) === d.day ? mins(r.end) : latest),
          ] as [number, number],
      )
      .filter(([a, b]) => b > a)
      .sort((a, b) => a[0] - b[0]);
    let fixed = 0;
    let cur: [number, number] | null = null;
    for (const sp of spans) {
      if (cur && sp[0] <= cur[1]) cur[1] = Math.max(cur[1], sp[1]);
      else {
        if (cur) fixed += cur[1] - cur[0];
        cur = [sp[0], sp[1]];
      }
    }
    if (cur) fixed += cur[1] - cur[0];
    const free = Math.max(0, Math.round(((latest - earliest - fixed) / 60) * 10) / 10);
    const planned = Math.round(study.reduce((a, r) => a + r.hours, 0) * 10) / 10;
    if (planned > free + 0.25) out.push({ day: d.day, name: d.name, planned, free });
  }
  return out;
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
export function forecast(plan: PlanItem[], now: number, w?: Window): string {
  const week = loads(plan, now);
  const over = overfull(plan, now, w);
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
  for (const o of over) parts.push(`overfull ${o.name} (${o.planned} h of study in ${o.free} free)`);
  if (!parts.length) return '';
  const s = parts.join(', ');
  return `The week: ${s}.`;
}

export { WD };
