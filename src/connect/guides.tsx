/* eslint-disable react-refresh/only-export-components -- guide data and its diagrams live together */
import type { ReactNode } from 'react';
import type { SourceKind } from '../lib/sources';

// Setup guides for each calendar source: three numbered steps, each with a drawn diagram of the
// screen the student is looking at. The diagrams are schematic on purpose (they keep working when
// a vendor moves a button a few pixels) and use the app's colors.

export interface Guide {
  id: 'canvas' | 'google' | 'apple' | 'outlook' | 'ics';
  kind: SourceKind;
  name: string;
  blurb: string;
  recommended?: boolean;
  /** Where the address comes from, in one line, for the paste box. */
  placeholder: string;
  steps: { text: ReactNode; diagram: ReactNode }[];
  /** The "this didn't work" list. */
  trouble: ReactNode[];
  /** Platform notes shown above the steps. */
  note?: ReactNode;
}

// ── Diagram primitives ─────────────────────────────────────────────────────────

const W = 320;
const H = 180;

function Frame({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="gd" role="img" aria-hidden="true" focusable="false">
      <rect x="0.5" y="0.5" width={W - 1} height={H - 1} rx="8" className="gd-win" />
      <rect x="0.5" y="0.5" width={W - 1} height="22" rx="8" className="gd-bar" />
      <circle cx="12" cy="11.5" r="3.5" className="gd-dot" />
      <circle cx="24" cy="11.5" r="3.5" className="gd-dot" />
      <circle cx="36" cy="11.5" r="3.5" className="gd-dot" />
      {title && (
        <text x={W / 2} y="15" textAnchor="middle" className="gd-t gd-muted">
          {title}
        </text>
      )}
      {children}
    </svg>
  );
}

const Sidebar = ({ items, active }: { items: string[]; active?: string }) => (
  <g>
    <rect x="1" y="23" width="74" height={H - 24} className="gd-side" />
    {items.map((it, i) => (
      <g key={it}>
        {it === active && <rect x="6" y={32 + i * 20} width="64" height="16" rx="4" className="gd-active" />}
        <text x="12" y={43 + i * 20} className={`gd-t${it === active ? ' gd-on' : ''}`}>
          {it}
        </text>
      </g>
    ))}
  </g>
);

const Button = ({
  x,
  y,
  w = 92,
  label,
  hot,
}: {
  x: number;
  y: number;
  w?: number;
  label: string;
  hot?: boolean;
}) => (
  <g>
    <rect x={x} y={y} width={w} height="20" rx="5" className={hot ? 'gd-btn gd-hot' : 'gd-btn'} />
    <text x={x + w / 2} y={y + 13.5} textAnchor="middle" className={`gd-t${hot ? ' gd-on' : ''}`}>
      {label}
    </text>
  </g>
);

const Field = ({ x, y, w, text, hot }: { x: number; y: number; w: number; text: string; hot?: boolean }) => (
  <g>
    <rect x={x} y={y} width={w} height="20" rx="4" className={hot ? 'gd-field gd-hot-line' : 'gd-field'} />
    <text x={x + 7} y={y + 13.5} className="gd-t gd-mono">
      {text}
    </text>
  </g>
);

const Pointer = ({ x, y }: { x: number; y: number }) => (
  <path d={`M${x} ${y} l0 16 l4.5 -3.5 l3 6.5 l3 -1.5 l-3 -6.5 l5.5 -0.5 z`} className="gd-ptr" />
);

const Line = ({ x, y, w, hot }: { x: number; y: number; w: number; hot?: boolean }) => (
  <rect x={x} y={y} width={w} height="6" rx="3" className={hot ? 'gd-line gd-hot-fill' : 'gd-line'} />
);

const Dialog = ({ children, title }: { children: ReactNode; title: string }) => (
  <g>
    <rect x="86" y="46" width="222" height="112" rx="8" className="gd-dialog" />
    <text x="98" y="66" className="gd-t gd-strong">
      {title}
    </text>
    {children}
  </g>
);

// ── Guides ─────────────────────────────────────────────────────────────────────

export const GUIDES: Guide[] = [
  {
    id: 'canvas',
    kind: 'canvas',
    name: 'Canvas',
    blurb: 'Every assignment and due date from all your courses. The best place to start.',
    recommended: true,
    placeholder: 'https://canvas.yourschool.edu/feeds/calendars/user_….ics',
    steps: [
      {
        text: (
          <>
            Open Canvas on a laptop and click <b>Calendar</b> in the left sidebar.
          </>
        ),
        diagram: (
          <Frame title="canvas.yourschool.edu">
            <Sidebar items={['Dashboard', 'Courses', 'Calendar', 'Inbox']} active="Calendar" />
            <Line x={90} y={40} w={120} />
            <Line x={90} y={56} w={200} />
            <Line x={90} y={72} w={160} />
            <Pointer x={60} y={74} />
          </Frame>
        ),
      },
      {
        text: (
          <>
            On the right, below the mini calendar, click <b>Calendar Feed</b>.
          </>
        ),
        diagram: (
          <Frame title="Calendar">
            <Sidebar items={['Dashboard', 'Courses', 'Calendar', 'Inbox']} active="Calendar" />
            <rect x="86" y="32" width="140" height="120" rx="4" className="gd-field" />
            <rect x="238" y="32" width="70" height="56" rx="4" className="gd-field" />
            <Line x={244} y={96} w={52} />
            <Line x={244} y={108} w={44} />
            <Button x={236} y={126} w={74} label="Calendar Feed" hot />
            <Pointer x={288} y={138} />
          </Frame>
        ),
      },
      {
        text: (
          <>
            Copy the address in the box that opens and paste it below. It's long and starts with
            <b> https://…/feeds/calendars/</b>.
          </>
        ),
        diagram: (
          <Frame title="Calendar">
            <Sidebar items={['Dashboard', 'Courses', 'Calendar', 'Inbox']} active="Calendar" />
            <Dialog title="Calendar Feed">
              <Line x={98} y={76} w={190} />
              <Field x={98} y={92} w={198} text="https://canvas…/feeds/calendars/user_a1…" hot />
              <Button x={98} y={124} w={60} label="Copy" hot />
              <Pointer x={140} y={132} />
            </Dialog>
          </Frame>
        ),
      },
    ],
    trouble: [
      <>
        <b>The address ends in "…"</b> You copied it from a preview that cut it off. Open the Calendar Feed
        box again and copy from inside the text field.
      </>,
      <>
        <b>"Nothing was found at that address."</b> Canvas feeds are per account; one from a different school
        or an old account won't work. Make sure you're signed in to your school's Canvas.
      </>,
      <>
        <b>A course is missing.</b> The feed only has courses you're enrolled in that are published. New
        courses show up after the next sync.
      </>,
    ],
  },
  {
    id: 'google',
    kind: 'ical',
    name: 'Google Calendar',
    blurb: 'Your own calendar: classes, study blocks, work, anything you keep there.',
    placeholder: 'https://calendar.google.com/calendar/ical/…/private-…/basic.ics',
    note: (
      <>
        This works on the web, not in the phone app. Open <b>calendar.google.com</b> on a laptop (or request
        the desktop site on your phone).
      </>
    ),
    steps: [
      {
        text: (
          <>
            In the left list under <b>My calendars</b>, hover the calendar, click the three dots, then{' '}
            <b>Settings and sharing</b>.
          </>
        ),
        diagram: (
          <Frame title="calendar.google.com">
            <Sidebar items={['My calendars', 'School', 'Personal', 'Other calendars']} active="School" />
            <rect x="86" y="32" width="222" height="120" rx="4" className="gd-field" />
            <rect x="60" y="60" width="110" height="52" rx="6" className="gd-dialog" />
            <text x="70" y="76" className="gd-t">
              Display this only
            </text>
            <text x="70" y="92" className="gd-t gd-strong">
              Settings and sharing
            </text>
            <Pointer x={110} y={96} />
          </Frame>
        ),
      },
      {
        text: (
          <>
            Scroll to <b>Integrate calendar</b>. Find <b>Secret address in iCal format</b>, not the public
            address and not the embed code.
          </>
        ),
        diagram: (
          <Frame title="Settings · School">
            <Sidebar
              items={['Calendar settings', 'Access permissions', 'Integrate calendar']}
              active="Integrate calendar"
            />
            <text x="90" y="44" className="gd-t gd-strong">
              Integrate calendar
            </text>
            <text x="90" y="64" className="gd-t gd-muted">
              Public address in iCal format
            </text>
            <Field x={90} y={70} w={210} text="https://calendar.google.com/…/public/basic.ics" />
            <text x="90" y="112" className="gd-t">
              Secret address in iCal format
            </text>
            <Field x={90} y={118} w={210} text="https://calendar.google.com/…/private-…/basic.ics" hot />
          </Frame>
        ),
      },
      {
        text: (
          <>
            Click the copy button next to the secret address and paste it below. The whole address ends in{' '}
            <b>basic.ics</b>.
          </>
        ),
        diagram: (
          <Frame title="Settings · School">
            <Sidebar
              items={['Calendar settings', 'Access permissions', 'Integrate calendar']}
              active="Integrate calendar"
            />
            <text x="90" y="112" className="gd-t">
              Secret address in iCal format
            </text>
            <Field x={90} y={118} w={180} text="https://calendar.google.com/…/private-…" hot />
            <Button x={276} y={118} w={24} label="⧉" hot />
            <Pointer x={286} y={130} />
          </Frame>
        ),
      },
    ],
    trouble: [
      <>
        <b>The address ends in "…"</b> The settings page shows a shortened preview. Use the copy button next
        to the field, or click into the field and select all.
      </>,
      <>
        <b>"Nothing was found" or "a web page, not a calendar."</b> That's the public address or the embed
        code. Only the <i>secret</i> address works for a private calendar.
      </>,
      <>
        <b>You can't find Settings and sharing.</b> You're in the phone app. Open calendar.google.com in a
        browser on a laptop.
      </>,
    ],
  },
  {
    id: 'apple',
    kind: 'ical',
    name: 'Apple Calendar (iCloud)',
    blurb: 'A calendar you keep on your iPhone or Mac.',
    placeholder: 'webcal://p12-caldav.icloud.com/published/2/…',
    note: (
      <>
        Works from the Mac app or icloud.com. On iPhone, open Calendar → Calendars, then the ⓘ next to the
        calendar.
      </>
    ),
    steps: [
      {
        text: (
          <>
            In Calendar, right-click the calendar in the sidebar (or tap ⓘ on iPhone) and choose{' '}
            <b>Share Calendar</b>.
          </>
        ),
        diagram: (
          <Frame title="Calendar">
            <Sidebar items={['iCloud', 'School', 'Home', 'Work']} active="School" />
            <rect x="60" y="56" width="100" height="40" rx="6" className="gd-dialog" />
            <text x="70" y="72" className="gd-t">
              Get Info
            </text>
            <text x="70" y="88" className="gd-t gd-strong">
              Share Calendar…
            </text>
            <Pointer x={120} y={92} />
          </Frame>
        ),
      },
      {
        text: (
          <>
            Turn on <b>Public Calendar</b>. Anyone with the link can read this calendar, so treat the link
            like a password.
          </>
        ),
        diagram: (
          <Frame title="Calendar">
            <Sidebar items={['iCloud', 'School', 'Home', 'Work']} active="School" />
            <Dialog title="Share “School”">
              <text x="98" y="92" className="gd-t">
                Public Calendar
              </text>
              <rect x="258" y="82" width="34" height="16" rx="8" className="gd-hot-fill" />
              <circle cx="284" cy="90" r="6" className="gd-knob" />
              <Field x={98} y={108} w={198} text="webcal://p12-caldav.icloud.com/published/…" hot />
            </Dialog>
          </Frame>
        ),
      },
      {
        text: (
          <>
            Copy the link that appears (it starts with <b>webcal://</b>) and paste it below.
          </>
        ),
        diagram: (
          <Frame title="Calendar">
            <Sidebar items={['iCloud', 'School', 'Home', 'Work']} active="School" />
            <Dialog title="Share “School”">
              <Field x={98} y={92} w={198} text="webcal://p12-caldav.icloud.com/published/…" hot />
              <Button x={98} y={124} w={70} label="Copy Link" hot />
              <Pointer x={150} y={132} />
            </Dialog>
          </Frame>
        ),
      },
    ],
    trouble: [
      <>
        <b>There's no Share Calendar option.</b> Only iCloud calendars can be shared this way. Calendars from
        a Google or school account inside Apple Calendar need that service's own guide.
      </>,
      <>
        <b>"Nothing was found at that address."</b> Public Calendar got turned off, which changes the link.
        Turn it on and paste the new link.
      </>,
    ],
  },
  {
    id: 'outlook',
    kind: 'ical',
    name: 'Outlook',
    blurb: 'A calendar in Outlook on the web or a school Microsoft 365 account.',
    placeholder: 'https://outlook.office365.com/owa/calendar/…/calendar.ics',
    steps: [
      {
        text: (
          <>
            In Outlook on the web, open <b>Settings</b> (the gear) → <b>Calendar</b> → <b>Shared calendars</b>
            .
          </>
        ),
        diagram: (
          <Frame title="outlook.office.com">
            <Sidebar items={['General', 'Mail', 'Calendar', 'People']} active="Calendar" />
            <text x="90" y="44" className="gd-t">
              View
            </text>
            <text x="90" y="64" className="gd-t">
              Events and invitations
            </text>
            <rect x="84" y="72" width="120" height="16" rx="4" className="gd-active" />
            <text x="90" y="84" className="gd-t gd-on">
              Shared calendars
            </text>
            <Pointer x={150} y={88} />
          </Frame>
        ),
      },
      {
        text: (
          <>
            Under <b>Publish a calendar</b>, pick the calendar, choose <b>Can view all details</b>, and click{' '}
            <b>Publish</b>.
          </>
        ),
        diagram: (
          <Frame title="Shared calendars">
            <Sidebar items={['General', 'Mail', 'Calendar', 'People']} active="Calendar" />
            <text x="90" y="44" className="gd-t gd-strong">
              Publish a calendar
            </text>
            <Field x={90} y={54} w={100} text="Calendar" />
            <Field x={198} y={54} w={100} text="Can view all details" />
            <Button x={90} y={84} w={64} label="Publish" hot />
            <Pointer x={130} y={92} />
          </Frame>
        ),
      },
      {
        text: (
          <>
            Copy the <b>ICS</b> link (not the HTML one) and paste it below.
          </>
        ),
        diagram: (
          <Frame title="Shared calendars">
            <Sidebar items={['General', 'Mail', 'Calendar', 'People']} active="Calendar" />
            <text x="90" y="44" className="gd-t gd-strong">
              Publish a calendar
            </text>
            <text x="90" y="72" className="gd-t gd-muted">
              HTML
            </text>
            <Field x={90} y={78} w={210} text="https://outlook.office365.com/…/calendar.html" />
            <text x="90" y="116" className="gd-t">
              ICS
            </text>
            <Field x={90} y={122} w={210} text="https://outlook.office365.com/…/calendar.ics" hot />
            <Pointer x={280} y={134} />
          </Frame>
        ),
      },
    ],
    trouble: [
      <>
        <b>"A web page, not a calendar."</b> That's the HTML link. Use the one ending in .ics.
      </>,
      <>
        <b>Publishing is greyed out.</b> Some schools turn calendar publishing off. Export the calendar as an
        .ics file instead and upload it here.
      </>,
    ],
  },
  {
    id: 'ics',
    kind: 'ics_upload',
    name: 'Upload an .ics file',
    blurb: "A one-time copy. It won't stay in sync, but it works with any calendar app.",
    placeholder: '',
    steps: [
      {
        text: (
          <>
            In your calendar app, export the calendar. Most apps call it <b>Export</b> or <b>Download .ics</b>
            .
          </>
        ),
        diagram: (
          <Frame title="Calendar">
            <Sidebar items={['School', 'Personal']} active="School" />
            <rect x="60" y="56" width="100" height="40" rx="6" className="gd-dialog" />
            <text x="70" y="72" className="gd-t">
              Rename
            </text>
            <text x="70" y="88" className="gd-t gd-strong">
              Export…
            </text>
            <Pointer x={120} y={92} />
          </Frame>
        ),
      },
      {
        text: <>Save the file somewhere you can find it.</>,
        diagram: (
          <Frame title="Save">
            <Field x={40} y={60} w={240} text="School.ics" hot />
            <Button x={216} y={100} w={64} label="Save" hot />
            <Pointer x={256} y={108} />
          </Frame>
        ),
      },
      {
        text: <>Choose the file below. Runway reads it once.</>,
        diagram: (
          <Frame title="Runway">
            <Button x={40} y={70} w={110} label="Choose file" hot />
            <text x="160" y="84" className="gd-t gd-muted">
              School.ics
            </text>
            <Pointer x={100} y={78} />
          </Frame>
        ),
      },
    ],
    trouble: [
      <>
        <b>The file is bigger than 5 MB.</b> Export just the school calendar, not every calendar at once.
      </>,
    ],
  },
];
