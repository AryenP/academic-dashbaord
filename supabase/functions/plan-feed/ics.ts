// The accepted plan as iCalendar text (RFC 5545): escaping, 75-octet folding, stable UIDs.

const ics = (s: string) =>
  s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const stamp = (iso: string) =>
  new Date(iso)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
/** Folds a line at 75 octets, per RFC 5545. */
const fold = (line: string) => {
  const out: string[] = [];
  let cur = '';
  for (const ch of line) {
    if (Buffer_byteLength(cur + ch) > 73) {
      out.push(cur);
      cur = ' ' + ch;
    } else cur += ch;
  }
  out.push(cur);
  return out.join('\r\n');
};
const Buffer_byteLength = (s: string) => new TextEncoder().encode(s).byteLength;

export interface Row {
  id: string;
  course: string | null;
  kind: string;
  title: string;
  start_at: string;
  end_at: string;
  location: string;
  status: string;
  updated_at: string;
}

export function toIcs(rows: Row[], now = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Runway//Study plan//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Runway',
    'X-PUBLISHED-TTL:PT15M',
  ];
  for (const r of rows) {
    const course = r.course ? `${r.course} ` : '';
    const kind = r.kind === 'exam' ? 'Exam' : r.kind === 'deadline' ? 'Due' : 'Study';
    const summary =
      r.kind === 'study'
        ? `📚 ${course}${r.title}`
        : `${course}${r.title}${r.kind === 'deadline' ? ' due' : ''}`;
    lines.push(
      'BEGIN:VEVENT',
      `UID:runway-${r.id}@runway`,
      `DTSTAMP:${stamp(now.toISOString())}`,
      `LAST-MODIFIED:${stamp(r.updated_at)}`,
      `DTSTART:${stamp(r.start_at)}`,
      `DTEND:${stamp(r.end_at)}`,
      fold(`SUMMARY:${ics(summary)}`),
      fold(
        `DESCRIPTION:${ics(`${kind} · from your Runway plan${r.status === 'submitted' ? ' · submitted' : ''}`)}`,
      ),
    );
    if (r.location) lines.push(fold(`LOCATION:${ics(r.location)}`));
    lines.push(`CATEGORIES:${kind.toUpperCase()}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
