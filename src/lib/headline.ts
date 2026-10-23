// The runway's first sentence, which knows what time it is. At 11 PM a student wants to know
// whether anything is left tonight and when tomorrow starts; on exam morning they want the room
// and permission to stop; during the exam, silence about prep; when the last exam has passed, the
// term is over. Pure over the plan, so each hour of the day is a test.
import {
  dayKey,
  daysUntil,
  isNow,
  isPast,
  prepBlocks,
  round1,
  timePart,
  type ExamPrep,
  type PlanItem,
} from './plan';

export interface Segment {
  t: string;
  b?: boolean;
}

export const NIGHT_FROM = 21; // 9 PM
export const MORNING_UNTIL = 10; // 10 AM

const live = (plan: PlanItem[]) => plan.filter((r) => !r.proposed);
/** The time part of an exam's `when`, like `timePart` for plan items. */
const examTime = (x: ExamPrep) =>
  x.start.slice(0, 10) === x.end.slice(0, 10) ? x.when.split(', ').slice(1).join(', ') : x.when;
const startOf = (r: PlanItem) => timePart(r).split('–')[0];
const hours = (rs: PlanItem[]) => round1(rs.reduce((a, r) => a + r.hours, 0));
const countdown = (x: ExamPrep, now: number) => {
  const n = daysUntil(x.day, new Date(now));
  return n === 1 ? 'tomorrow' : `in ${n} days`;
};

export function headline(plan: PlanItem[], exams: ExamPrep[], now: number): Segment[] {
  const next = exams.find((x) => !isPast(x, now));
  const items = live(plan);
  if (!next) {
    if (!exams.length) return [{ t: 'No exams on the runway yet.' }];
    const ahead = items.some((r) => !isPast(r, now));
    return ahead
      ? [{ t: 'Every exam on the runway is behind you.' }]
      : [{ t: 'The term is over: every exam and every block on the runway is behind you.' }];
  }
  const today = dayKey(new Date(now));
  const hour = new Date(now).getHours();
  const exam: Segment[] = [{ t: next.course, b: true }, { t: ' ' }, { t: next.title, b: true }];
  const blocks = prepBlocks(plan, next);
  const done = hours(blocks.filter((r) => isPast(r, now)));

  if (isNow(next, now))
    return [
      { t: 'Happening now: ' },
      ...exam,
      { t: `, ${next.when}. ` },
      { t: `${done}`, b: true },
      { t: ' of ' },
      { t: `${next.prep_hours}`, b: true },
      { t: ' prep hours on the calendar ran before it.' },
    ];

  if (next.day === today) {
    const before = items.filter(
      (r) =>
        r.day === today &&
        r.id !== next.id &&
        Date.parse(r.start) < Date.parse(next.start) &&
        !isPast(r, now),
    );
    const tail =
      before.length === 0
        ? ' Nothing else before it.'
        : before.length === 1
          ? ` One thing before it: ${before[0].title}, ${timePart(before[0])}.`
          : ` ${before.length} things before it, the first at ${startOf(before[0])}.`;
    return [
      { t: 'Today: ' },
      ...exam,
      { t: `, ${examTime(next)}${next.location ? `, ${next.location}` : ''}. ` },
      { t: `${done}`, b: true },
      { t: ' of ' },
      { t: `${next.prep_hours}`, b: true },
      { t: ' prep hours done.' },
      { t: tail },
    ];
  }

  const todays = items.filter((r) => r.day === today);
  const left = todays.filter((r) => !isPast(r, now));
  const tomorrowKey = dayKey(new Date(now + 864e5));
  const tomorrows = items.filter((r) => r.day === tomorrowKey).sort((a, b) => (a.start < b.start ? -1 : 1));
  const tomorrow: Segment[] = tomorrows.length
    ? [
        { t: ` Tomorrow starts at ${startOf(tomorrows[0])} with ` },
        { t: tomorrows[0].course, b: true },
        { t: `.` },
      ]
    : [{ t: ' Nothing planned tomorrow.' }];
  const until: Segment[] = [{ t: ' ' }, ...exam, { t: ` is ${countdown(next, now)}.` }];

  if (hour >= NIGHT_FROM) {
    if (left.length === 0) return [{ t: 'Tonight is done.' }, ...tomorrow, ...until];
    const now1 = left.find((r) => isNow(r, now)) ?? left[0];
    return [
      { t: isNow(now1, now) ? 'Tonight, now: ' : 'Tonight: ' },
      { t: now1.course, b: true },
      { t: ` ${now1.title}, ${timePart(now1)}.` },
      ...tomorrow,
      ...until,
    ];
  }

  if (hour < MORNING_UNTIL && todays.length && !isNow(todays[0], now) && !isPast(todays[0], now)) {
    const first = todays.sort((a, b) => (a.start < b.start ? -1 : 1))[0];
    return [
      { t: `Today starts at ${startOf(first)} with ` },
      { t: first.course, b: true },
      {
        t: ` ${first.title}; ${hours(todays)} hours in ${todays.length === 1 ? 'one block' : `${todays.length} blocks`}.`,
      },
      ...until,
    ];
  }

  const n = daysUntil(next.day, new Date(now));
  return [
    { t: n === 1 ? 'Tomorrow: ' : `${n} days until ` },
    ...exam,
    { t: `, ${next.when}. You have ` },
    { t: `${next.prep_hours}`, b: true },
    { t: ' hours of prep on the calendar for it.' },
  ];
}

export const plain = (s: Segment[]) => s.map((x) => x.t).join('');
