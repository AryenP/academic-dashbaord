// Items the browser extension read off Gradescope or Canvas, turned into deadlines on the runway.
// Pure over a Store so it can be tested with a fake database.
import { findCourse, matchKnown } from './classify.ts';

export interface Incoming {
  source: 'gradescope' | 'canvas';
  course: string | null; // as the page shows it: "DSC 140A", "DSC106_FA26_001" or "Probabilistic Modeling (Fall 2026)"
  course_name?: string | null; // the long name when the page has one: "DSC 106 - Intro to Data Visualization - Liao [FA26]"
  title: string;
  due: string | null; // ISO
  status: 'submitted' | 'open' | null;
  score: number | null;
  max_score: number | null;
  url: string | null;
}

export interface ExistingItem {
  id: string;
  course_id: string | null;
  kind: string;
  title: string;
  start_at: string;
  end_at: string;
  status: string;
  source: string;
}

export interface ImportStore {
  courses(userId: string): Promise<{ id: string; code: string; name: string | null; color: number }[]>;
  addCourse(
    userId: string,
    code: string,
    name: string | null,
    color: number,
  ): Promise<{ id: string; code: string; name: string | null; color: number }>;
  /** Deadlines and exams of the person in a window around now. */
  items(userId: string): Promise<ExistingItem[]>;
  /** The person's extension source id, created on first use. */
  extensionSource(userId: string): Promise<string>;
  insert(row: Record<string, unknown>): Promise<string>;
  update(id: string, patch: Record<string, unknown>): Promise<void>;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\[.*?\]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// Gradescope names a course like "DSC106_FA26_001" and Canvas like "CSE151A_FA26_A00": the code with
// no space, then a term. The title rules want a space, so this reads the glued form too. Term
// tokens ("FA26", "WI27") and ordinary words never pass.
const GLUED_RE = /\b([A-Z]{2,5})(\d{1,3}[A-Z]{0,2})(?=[_\s-]|$)/;
const TERMS = new Set(['FA', 'WI', 'SP', 'SU', 'SS', 'FALL', 'WNTR', 'SPR', 'SUM']);
export function gluedCode(text: string): string | null {
  const m = text.toUpperCase().match(GLUED_RE);
  if (!m || TERMS.has(m[1])) return null;
  return `${m[1]} ${m[2]}`;
}

/** "DSC 106 - Intro to Data Visualization - Liao [FA26]" → "Intro to Data Visualization". */
export function cleanName(name: string | null | undefined, code: string | null): string | null {
  if (!name) return null;
  let n = name.replace(/\s*\[[^\]]*\]\s*$/, '').trim();
  if (code) {
    const glued = code.replace(' ', '');
    n = n.replace(new RegExp(`^(${code}|${glued})\\s*[-–:]?\\s*`, 'i'), '');
  }
  const parts = n.split(/\s+[-–]\s+/).filter(Boolean);
  // "Intro to Data Visualization - Liao": the last part is usually the instructor; keep the first.
  n = (parts.length > 1 ? parts[0] : n).trim();
  return n.length >= 3 ? n.slice(0, 120) : null;
}

/** Finds a code in the page's course text or long name, else matches a known course by name. */
function resolveCourse(
  text: string | null,
  longName: string | null | undefined,
  courses: { id: string; code: string; name: string | null }[],
): { id: string; code: string } | { code: string | null; name: string | null } {
  if (!text && !longName) return { code: null, name: null };
  const codes = courses.map((c) => c.code);
  const code =
    (text && (findCourse(text) ?? gluedCode(text) ?? matchKnown(text, codes))) ||
    (longName && (findCourse(longName) ?? gluedCode(longName) ?? matchKnown(longName, codes))) ||
    null;
  if (code) {
    const c = courses.find((x) => x.code === code);
    return c ? { id: c.id, code: c.code } : { code, name: cleanName(longName, code) };
  }
  for (const t of [text, longName]) {
    if (!t) continue;
    const n = norm(t);
    const byName = courses.find((c) => c.name && (n.includes(norm(c.name)) || norm(c.name).includes(n)));
    if (byName) return { id: byName.id, code: byName.code };
  }
  return { code: null, name: (text ?? longName ?? '').trim().slice(0, 80) };
}

export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  unmatched_courses: string[];
}

/** Applies incoming items: new deadlines are created, known ones get status, score and due updates. */
export async function importItems(
  store: ImportStore,
  userId: string,
  incoming: Incoming[],
  now = new Date(),
): Promise<ImportResult> {
  const courses = await store.courses(userId);
  const existing = await store.items(userId);
  const res: ImportResult = { created: 0, updated: 0, skipped: 0, unmatched_courses: [] };
  let sourceId: string | null = null;
  for (const it of incoming.slice(0, 500)) {
    const title = it.title.trim().slice(0, 200);
    if (!title) {
      res.skipped++;
      continue;
    }
    const course = resolveCourse(it.course, it.course_name, courses);
    let courseId: string | null = 'id' in course ? course.id : null;
    if (!courseId && course.code) {
      const used = new Set(courses.map((c) => c.color));
      let color = 6;
      for (let n = 1; n < 6; n++)
        if (!used.has(n)) {
          color = n;
          break;
        }
      const c = await store.addCourse(userId, course.code, 'name' in course ? course.name : null, color);
      courses.push(c);
      courseId = c.id;
    }
    if (!courseId && it.course && !res.unmatched_courses.includes(it.course))
      res.unmatched_courses.push(it.course);

    // The same assignment already on the runway (from a Canvas feed, or an earlier visit)?
    const t = norm(title);
    const match = existing.find(
      (e) =>
        e.kind === 'deadline' &&
        norm(e.title) === t &&
        (e.course_id === courseId || !e.course_id || !courseId) &&
        (!it.due ||
          Math.abs(Date.parse(e.end_at) - Date.parse(it.due)) < 36 * 3_600_000 ||
          e.source === 'extension'),
    );
    const patch: Record<string, unknown> = {};
    if (it.status === 'submitted' && match?.status !== 'submitted') {
      patch.status = 'submitted';
      patch.submitted_by = 'extension';
      patch.submitted_at = now.toISOString();
    }
    if (it.score != null) patch.score = it.score;
    if (it.max_score != null) patch.max_score = it.max_score;
    if (match) {
      if (it.due && match.source === 'extension') {
        patch.start_at = new Date(Date.parse(it.due) - 60_000).toISOString();
        patch.end_at = it.due;
      }
      if (!match.course_id && courseId) patch.course_id = courseId;
      if (Object.keys(patch).length) {
        await store.update(match.id, patch);
        res.updated++;
      } else res.skipped++;
      continue;
    }
    if (!it.due) {
      // Nothing to draw without a due date; a past assignment with no date isn't useful either.
      res.skipped++;
      continue;
    }
    if (Date.parse(it.due) < now.getTime() - 60 * 864e5) {
      res.skipped++;
      continue;
    }
    sourceId ??= await store.extensionSource(userId);
    const id = await store.insert({
      user_id: userId,
      source_id: sourceId,
      course_id: courseId,
      kind: 'deadline',
      title,
      start_at: new Date(Date.parse(it.due) - 60_000).toISOString(),
      end_at: it.due,
      location: '',
      source: 'extension',
      accepted: true,
      status: it.status === 'submitted' ? 'submitted' : 'open',
      submitted_at: it.status === 'submitted' ? now.toISOString() : null,
      submitted_by: it.status === 'submitted' ? 'extension' : null,
      score: it.score,
      max_score: it.max_score,
    });
    existing.push({
      id,
      course_id: courseId,
      kind: 'deadline',
      title,
      start_at: it.due,
      end_at: it.due,
      status: it.status ?? 'open',
      source: 'extension',
    });
    res.created++;
  }
  return res;
}
