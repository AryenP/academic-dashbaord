// Reads a calendar event's title and decides what it is. These are the title rules from v1's sync,
// generalized beyond one person's calendar: they run on every sync for free, and Phase 2's AI pass
// only has to handle what they're unsure about (low confidence) or get wrong.

export type EventKind = 'study' | 'deadline' | 'exam' | 'class' | 'commitment' | 'personal';

export interface Reading {
  kind: EventKind;
  course: string | null; // 'DSC 140A'
  confidence: number; // 0..1
}

export interface ClassifyInput {
  title: string;
  allDay?: boolean;
  /** Canvas feeds mark assignments in the UID. */
  uid?: string;
  sourceKind?: 'ical' | 'canvas' | 'ics_upload';
  /** The person's course codes so far, so "(140A)" can be matched by number. */
  knownCourses?: string[];
}

// Letters that look like a department but aren't. Mostly things that precede a number in titles.
const NOT_A_DEPT = new Set(
  (
    'HW PA PS PSET LAB LABS WEEK WK CH CHAP CHAPTER PART ROOM RM BLDG HR HRS AM PM Q QUIZ EX EXAM MT TEST ' +
    'SEC SECTION DISC UNIT LEC LECTURE PROJ PROJECT DUE NO AT ON OF TO ISO COVID FALL SPRING WINTER SUMMER ' +
    'V VER ID PIN PG PP VOL NUM NO MIN MINS MINUTES HOUR HOURS DAY DAYS TOP ALL MY THE AND FOR BY ' +
    'JAN FEB MAR APR MAY JUN JUL AUG SEP SEPT OCT NOV DEC MON TUE WED THU FRI SAT SUN GRADE GROUP TEAM ' +
    'STEP ROUND LEVEL PHASE ITEM TASK CASE STUDY READ READING NOTE NOTES'
  ).split(' '),
);

const COURSE_RE = /\b([A-Za-z]{2,5})[ \-]?(\d{1,3}[A-Za-z]{0,2})\b/g;

/** Finds a course code like "DSC 140A" (any spacing or case) in text. */
export function findCourse(text: string): string | null {
  for (const m of text.matchAll(COURSE_RE)) {
    const dept = m[1].toUpperCase();
    const num = m[2].toUpperCase();
    if (NOT_A_DEPT.has(dept)) continue;
    if (/^\d{3}[A-Z]{2}$/.test(num) && num.endsWith('TH')) continue; // "12TH"
    return `${dept} ${num}`;
  }
  return null;
}

/** Canvas titles end with the course in brackets: "HW 2 [DSC 140A - Probabilistic Modeling]". */
const BRACKET_RE = /\s*\[([^\]]+)\]\s*$/;

/** The title without a trailing "[Course …]" bracket, for display. */
export function cleanTitle(title: string): string {
  return title.replace(BRACKET_RE, '').trim() || title.trim();
}

const EXAM = /\b(midterm|final exam|finals?|exam|quiz|test)\b/i;
const STUDY =
  /^(📚|📖|✏️|🧠)|\b(study|review|practice|revise|revision|cheat sheet|prep|flashcards?|problems)\b/i;
const CLASS = /\b(lecture|discussion|section|lab|seminar|tutorial|office hours|recitation|studio|class)\b/i;
const DEADLINE =
  /\b(due|deadline|submit|submission|homework|hw|assignment|project|problem set|pset|essay|paper|report|checkpoint|milestone|lab \d|reading response|post|discussion board|peer review|survey|turn in)\b/i;
const COMMITMENT =
  /\b(work|shift|research|lab meeting|internship|intern|club|meeting|standup|stand-up|1:1|volunteer|ta hours|tutoring|rehearsal)\b/i;

/** "(140A)" or "140a hw" → "DSC 140A" when exactly one known course has that number. */
export function matchKnown(text: string, known: string[] | undefined): string | null {
  if (!known?.length) return null;
  for (const m of text.matchAll(/(?<![A-Za-z])(\d{1,3}[A-Za-z]{0,2})(?![A-Za-z0-9])/g)) {
    const num = m[1].toUpperCase();
    if (!/[A-Z]/.test(num) && num.length < 2) continue; // a bare single digit is noise
    const hits = known.filter((c) => c.split(' ')[1] === num);
    if (hits.length === 1) return hits[0];
  }
  return null;
}

export function classify(input: ClassifyInput): Reading {
  const raw = input.title.trim();
  const bracket = raw.match(BRACKET_RE)?.[1] ?? null;
  const body = cleanTitle(raw);
  const course = (bracket && findCourse(bracket)) || findCourse(body) || matchKnown(body, input.knownCourses);
  const canvasAssignment = input.sourceKind === 'canvas' && /assignment/i.test(input.uid ?? '');

  const studyish = STUDY.test(raw) && !/\bpractice (exam|midterm|final|test)\b/i.test(body);
  if (studyish && course && !EXAM.test(body)) return { kind: 'study', course, confidence: 0.9 };
  // A study block with no department ("📚 140A practice"): Phase 2's AI groups it; keep it visible.
  if (/^(📚|📖|✏️|🧠)/.test(raw) && !course) return { kind: 'study', course: null, confidence: 0.6 };
  if (canvasAssignment) {
    if (/\b(midterm|final)\b/i.test(body)) return { kind: 'exam', course, confidence: 0.85 };
    return { kind: 'deadline', course: course ?? (bracket ? bracket.trim() : null), confidence: 0.9 };
  }
  if (EXAM.test(body) && !/\b(review|prep|practice|study)\b/i.test(body)) {
    return { kind: 'exam', course, confidence: course ? 0.9 : 0.6 };
  }
  if (EXAM.test(body) && course) return { kind: 'study', course, confidence: 0.75 }; // "midterm review"
  if (course && DEADLINE.test(body)) return { kind: 'deadline', course, confidence: 0.9 };
  if (/\boffice hours\b/i.test(body)) return { kind: 'class', course, confidence: course ? 0.85 : 0.5 };
  if (
    course &&
    (CLASS.test(body) ||
      body.toUpperCase() === course ||
      body.replace(/\s+/g, '').toUpperCase() === course.replace(/\s+/g, ''))
  )
    return { kind: 'class', course, confidence: 0.85 };
  if (course) return { kind: input.allDay ? 'deadline' : 'class', course, confidence: 0.5 };
  if (input.sourceKind === 'canvas' && bracket)
    return { kind: CLASS.test(body) ? 'class' : 'deadline', course: bracket.trim(), confidence: 0.6 };
  // "Lab 4 due", "HW due": a deadline with no course yet; the AI or the person places it.
  if (
    /\b(due|submit|deadline)\b/i.test(body) ||
    /^(hw|homework|pset|problem set|lab|project|essay|p\d)\b/i.test(body)
  )
    return { kind: 'deadline', course: null, confidence: 0.5 };
  if (COMMITMENT.test(body) && !input.allDay) return { kind: 'commitment', course: null, confidence: 0.6 };
  return { kind: 'personal', course: null, confidence: 0.5 };
}
