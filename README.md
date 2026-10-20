# Midterm Runway

Fall 2026 midterm study plan, live at https://aryenp.github.io/academic-dashbaord/

`data.json` is rebuilt from Google Calendar every 15 minutes by `.github/workflows/sync.yml`, which runs `scripts/sync.py` against the calendar's secret iCal address (repository secret `GCAL_ICS_URL`). Only study blocks (titles starting with 📚), deadlines and midterms are published; nothing else from the calendar leaves it.
