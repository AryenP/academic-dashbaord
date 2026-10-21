# Runway

A study cockpit built from my real calendar. It lays out every study block, deadline and exam on a day-by-day runway, counts down to each midterm, and tracks how much prep is actually done.

**Live:** https://aryenp.github.io/academic-dashbaord/

## How it works now

- `scripts/sync.py` reads my Google Calendar through its private iCal feed every 15 minutes (`.github/workflows/sync.yml`) and writes `data.json`. Only study blocks, deadlines and exams are published.
- `index.html` draws the runway, exam checkpoints, today's list and the full agenda from that file, and refreshes while open.

## Where it's going

Study sessions with breaks, an hours log, planned-vs-actual stats, focus % verified by my phone through iPhone Shortcuts, and Spotify control during sessions. See [`docs/SPEC.md`](docs/SPEC.md) and the research behind it in [`docs/RESEARCH.md`](docs/RESEARCH.md).
