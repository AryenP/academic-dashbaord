# Runway

A study cockpit built from my real calendar. It lays out every study block, deadline and exam on a day-by-day runway, counts down to each midterm, and tracks how much prep is actually done.

**Live:** https://aryenp.github.io/academic-dashbaord/

## How it works now

- `scripts/sync.py` reads my Google Calendar through its private iCal feed every 15 minutes (`.github/workflows/sync.yml`) and writes `public/data.json`. Only study blocks, deadlines and exams are published.
- A Vite + React + TypeScript app (`src/`) draws the runway, exam checkpoints, today's list and the full agenda from that file, and refreshes while open. `.github/workflows/deploy.yml` builds it and publishes it to GitHub Pages.

## Develop

```sh
npm install
npm run dev     # http://127.0.0.1:5173/academic-dashbaord/
npm run check   # lint, format, unit tests, build, Playwright, pytest
```

The Python tests need `pip install -r scripts/requirements.txt pytest` (a `.venv/` in the repo root is picked up automatically).

## Where it's going

Study sessions with breaks, an hours log, planned-vs-actual stats, focus % verified by my phone through iPhone Shortcuts, and Spotify control during sessions. See [`docs/SPEC.md`](docs/SPEC.md) and the research behind it in [`docs/RESEARCH.md`](docs/RESEARCH.md).
