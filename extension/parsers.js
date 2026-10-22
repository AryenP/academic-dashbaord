// Reads assignment rows out of the pages you're logged into. Pure functions over a Document, so
// they run in the content script and in tests (with a parsed HTML fixture).
//
// Output rows: { source, course, title, due (ISO or null), status ('submitted'|'open'|null),
//                score (number|null), max_score (number|null), url (string|null) }

const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');

/** "Oct 26 at 11:59PM", "Oct 26 at 11:59 PM", "2026-10-26 23:59", "Due: Oct 26 11:59PM". */
export function parseDue(s, now = new Date()) {
  if (!s) return null;
  const t = s
    .replace(/^\s*(due|late due date)\s*:?\s*/i, '')
    .replace(/\s+at\s+/i, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const direct = Date.parse(t);
  if (Number.isFinite(direct) && /\d{4}/.test(t)) return new Date(direct).toISOString();
  const m = t.match(
    /^([A-Za-z]{3,9})\s+(\d{1,2})(?:,\s*(\d{4}))?(?:\s+(\d{1,2})(?::(\d{2}))?\s*([AaPp][Mm])?)?$/,
  );
  if (!m) return null;
  const month = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(
    m[1].slice(0, 3).toLowerCase(),
  );
  if (month < 0) return null;
  let year = m[3] ? Number(m[3]) : now.getFullYear();
  let hour = m[4] ? Number(m[4]) : 23;
  const minute = m[5] ? Number(m[5]) : m[4] ? 0 : 59;
  if (m[6]) {
    const pm = m[6].toLowerCase() === 'pm';
    if (pm && hour < 12) hour += 12;
    if (!pm && hour === 12) hour = 0;
  }
  let d = new Date(year, month, Number(m[2]), hour, minute);
  // No year given and the date is more than 6 months behind us: it's next year's.
  if (!m[3] && d.getTime() < now.getTime() - 180 * 864e5)
    d = new Date(year + 1, month, Number(m[2]), hour, minute);
  return d.toISOString();
}

/** "18.0 / 20.0", "18 / 20", "—" */
export function parseScore(s) {
  const m = (s || '').match(/(-?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  return m ? { score: Number(m[1]), max_score: Number(m[2]) } : { score: null, max_score: null };
}

/** Gradescope course page: /courses/<id>. The assignments table. */
export function parseGradescopeCourse(doc, url, now = new Date()) {
  const course = text(doc.querySelector('.courseHeader--title, h1.courseHeader--title, h1')) || null;
  const rows = [];
  for (const tr of doc.querySelectorAll('table#assignments-student-table tbody tr, table.table tbody tr')) {
    const cells = tr.querySelectorAll('th, td');
    if (cells.length < 2) continue;
    const titleEl = tr.querySelector('th a, th .table--primaryLink, th') ?? cells[0];
    const title = text(titleEl);
    if (!title) continue;
    const link = tr.querySelector('th a');
    const statusText = text(tr.querySelector('.submissionStatus, .submissionStatus--text, td:nth-child(2)'));
    const dueEl = tr.querySelector(
      '.submissionTimeChart--dueDate, time.submissionTimeChart--dueDate, [class*="dueDate"]',
    );
    const due = parseDue(dueEl?.getAttribute?.('datetime') || text(dueEl), now);
    const { score, max_score } = parseScore(
      text(tr.querySelector('.submissionStatus--score, td:nth-child(2)')),
    );
    let status = null;
    if (/no submission|not submitted/i.test(statusText)) status = 'open';
    else if (/submitted|graded|\d+\s*\/\s*\d+/i.test(statusText)) status = 'submitted';
    rows.push({
      source: 'gradescope',
      course,
      title,
      due,
      status,
      score,
      max_score,
      url: link?.getAttribute?.('href') ? new URL(link.getAttribute('href'), url).toString() : null,
    });
  }
  return rows;
}

/** Gradescope dashboard: the course cards by term. The first term on the page is the current one.
 * Each card: the short name ("DSC106_FA26_001"), the long name, and the course page path. */
export function parseGradescopeDashboard(doc) {
  const out = [];
  const groups = doc.querySelectorAll('.courseList--coursesForTerm');
  const scopes = groups.length ? [...groups] : [doc];
  scopes.forEach((scope, i) => {
    const termEl = scope.previousElementSibling;
    const term = termEl && /courseList--term/.test(termEl.className || '') ? text(termEl) : null;
    for (const a of scope.querySelectorAll('a.courseBox')) {
      const course =
        text(a.querySelector('.courseBox--shortname')) || text(a.querySelector('.courseBox--name'));
      const name = text(a.querySelector('.courseBox--name')) || null;
      const href = a.getAttribute('href');
      // The add-a-course card links to /courses/new; real courses have a number.
      if (course && href && /\/courses\/\d+/.test(href))
        out.push({ course, name, path: href, term, current: i === 0 });
    }
  });
  return out;
}

/** Canvas assignments page: /courses/<id>/assignments. */
export function parseCanvasAssignments(doc, url, now = new Date()) {
  const course =
    text(doc.querySelector('#breadcrumbs li:nth-child(2) a, #breadcrumbs .ellipsible')) ||
    (doc.title || '').split(':')[0].trim() ||
    null;
  const rows = [];
  for (const li of doc.querySelectorAll('.assignment, li.assignment, .ig-row')) {
    const link = li.querySelector('a.ig-title, .ig-title a, a[href*="/assignments/"]');
    const title = text(link);
    if (!title) continue;
    const dueEl = li.querySelector(
      '.assignment-date-due .screenreader-only, .assignment-date-due span, .due_date_display, [data-html-tooltip-title]',
    );
    const due = parseDue(
      (dueEl && (dueEl.getAttribute('data-html-tooltip-title') || text(dueEl))) ||
        text(li.querySelector('.assignment-date-due')),
      now,
    );
    const scoreText = text(li.querySelector('.score-display, .assignment-score, .points_possible_display'));
    const { score, max_score } = parseScore(scoreText);
    const st = text(li.querySelector('.submission-status, .submission_status'));
    const status = /not submitted|no submission|missing/i.test(st)
      ? 'open'
      : /submitted|graded|complete/i.test(st)
        ? 'submitted'
        : null;
    rows.push({
      source: 'canvas',
      course,
      title,
      due,
      status,
      score,
      max_score,
      url: link.getAttribute('href') ? new URL(link.getAttribute('href'), url).toString() : null,
    });
  }
  return rows;
}

/** Picks the parser for a page. Returns [] off the pages we know. */
export function parsePage(doc, url, now = new Date()) {
  const u = new URL(url);
  if (u.hostname === 'www.gradescope.com') {
    if (/^\/courses\/\d+/.test(u.pathname)) return parseGradescopeCourse(doc, url, now);
    return [];
  }
  if (/\/courses\/\d+\/assignments/.test(u.pathname)) return parseCanvasAssignments(doc, url, now);
  return [];
}
