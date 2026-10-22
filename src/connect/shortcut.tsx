/* eslint-disable react-refresh/only-export-components -- guide data and its diagrams live together */
import type { ReactNode } from 'react';

// The "Runway nightly" iPhone Shortcut, drawn: three schematic screens of the Shortcuts app, in the
// app's colors, like the calendar guides in guides.tsx. Nothing here is a screenshot, so it keeps
// working when Apple moves a button.

const W = 320;
const H = 180;

/** A phone-shaped frame, landscape-cropped so the text stays readable at card width. */
function Phone({ title, children }: { title: string; children: ReactNode }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="gd" role="img" aria-hidden="true" focusable="false">
      <rect x="0.5" y="0.5" width={W - 1} height={H - 1} rx="14" className="gd-win" />
      <rect x="112" y="6" width="96" height="10" rx="5" className="gd-bar" />
      <text x={W / 2} y="32" textAnchor="middle" className="gd-t gd-strong">
        {title}
      </text>
      {children}
    </svg>
  );
}

/** One Shortcuts action card: a title row and up to three parameter pills. */
function Action({
  y,
  title,
  params,
  hot,
}: {
  y: number;
  title: string;
  params: { label: string; hot?: boolean }[];
  hot?: boolean;
}) {
  const h = 22 + params.length * 18;
  return (
    <g>
      <rect
        x="14"
        y={y}
        width={W - 28}
        height={h}
        rx="8"
        className={hot ? 'gd-dialog gd-hot-line' : 'gd-dialog'}
      />
      <circle cx="28" cy={y + 11} r="5" className="gd-active" />
      <text x="38" y={y + 14.5} className="gd-t gd-strong">
        {title}
      </text>
      {params.map((p, i) => (
        <g key={p.label}>
          <rect
            x="38"
            y={y + 22 + i * 18}
            width={Math.min(W - 60, 14 + p.label.length * 4.6)}
            height="14"
            rx="7"
            className={p.hot ? 'gd-btn gd-hot' : 'gd-btn'}
          />
          <text x="45" y={y + 32 + i * 18} className={`gd-t gd-mono${p.hot ? ' gd-on' : ''}`}>
            {p.label}
          </text>
        </g>
      ))}
    </g>
  );
}

export interface ShortcutStep {
  text: ReactNode;
  diagram: ReactNode;
}

export const SHORTCUT_STEPS: ShortcutStep[] = [
  {
    text: (
      <>
        In the <b>Shortcuts</b> app, make a new shortcut called <b>Runway nightly</b>. Add{' '}
        <b>Find Health Samples</b> with the type set to <b>Sleep</b> and{' '}
        <i>Start Date is in the last 1 day</i>, then <b>Calculate Statistics</b> set to <b>Sum</b> of the
        samples.
      </>
    ),
    diagram: (
      <Phone title="Runway nightly">
        <Action
          y={42}
          title="Find Health Samples"
          params={[{ label: 'Type: Sleep', hot: true }, { label: 'Start Date is in the last 1 day' }]}
        />
        <Action
          y={110}
          title="Calculate Statistics"
          params={[{ label: 'Sum of Health Samples', hot: true }]}
        />
      </Phone>
    ),
  },
  {
    text: (
      <>
        Add <b>Get Contents of URL</b>. Set the URL to the address below, the method to <b>POST</b>, a header{' '}
        <code>x-runway-token</code> with your token, and a JSON body with <code>day</code> (Current Date
        formatted <code>yyyy-MM-dd</code>), <code>kind</code> = <code>sleep_h</code>, and <code>value</code> =
        the statistics result.
      </>
    ),
    diagram: (
      <Phone title="Runway nightly">
        <Action
          y={42}
          title="Get Contents of URL"
          hot
          params={[
            { label: '…/functions/v1/signals', hot: true },
            { label: 'Method: POST · Header x-runway-token' },
            { label: 'JSON: day · kind: sleep_h · value' },
          ]}
        />
        <Action y={124} title="Show Result" params={[{ label: 'Contents of URL' }]} />
      </Phone>
    ),
  },
  {
    text: (
      <>
        In <b>Automation</b>, add a <b>Time of Day</b> automation at 8:00 AM, daily, that runs{' '}
        <b>Runway nightly</b> with <i>Run Immediately</i> on. Copy the shortcut for exercise minutes (
        <code>kind</code> = <code>exercise_min</code>) and steps (<code>steps</code>) if you want those too.
      </>
    ),
    diagram: (
      <Phone title="New Automation">
        <Action y={42} title="Time of Day" params={[{ label: '8:00 AM · Daily', hot: true }]} />
        <Action
          y={90}
          title="Run Shortcut"
          params={[{ label: 'Runway nightly', hot: true }, { label: 'Run Immediately' }]}
        />
      </Phone>
    ),
  },
];

export const SIGNAL_KINDS: Record<string, { name: string; unit: string }> = {
  sleep_h: { name: 'Sleep', unit: 'h' },
  exercise_min: { name: 'Exercise', unit: 'min' },
  steps: { name: 'Steps', unit: '' },
  place: { name: 'Place', unit: '' },
};
