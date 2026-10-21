# Runway — working notes for coding agents

Runway is Aryen Palkar's study app: a public dashboard built from his Google Calendar, growing into sessions, breaks, phone-verified focus and Spotify control. Spec: `docs/SPEC.md`. Research and API limits: `docs/RESEARCH.md`. Build plan: `docs/BUILD_PROMPT.md`. Decisions log: `docs/DECISIONS.md` (create it on first decision).

## Rules

- No AI attribution: no `Co-Authored-By` or "Generated with" lines in commits or PRs, no AI mentions in the UI or README. Check every commit message.
- Never commit secrets (calendar iCal URL, Supabase service-role key or access token, phone tokens). Public by design: Supabase anon key, Spotify client ID.
- Personal data (session notes, phone events, app names) is never public; enforce with Row Level Security.
- Don't break the 15-minute calendar sync (`.github/workflows/sync.yml`, `scripts/sync.py`).
- Every screen must work at 375px wide and in light and dark mode. Keep the runway design identity (Big Shoulders Display numerals, course colors, red hatched exams).
- Commit messages: short, imperative, conventional prefix (`feat:`, `fix:`, `docs:`, `chore:`).

## Plan data

`scripts/sync.py` turns the calendar's secret iCal feed (repo secret `GCAL_ICS_URL`) into the plan JSON. Classification is by title: `📚` prefix = study, "midterm" = exam, any other title with a course code = deadline, except class meetings ("DSC 102 Lecture", "CSE 151A Discussion").
