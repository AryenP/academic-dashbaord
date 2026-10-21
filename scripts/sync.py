"""Rebuild public/data.json from Google Calendar's private iCal feed.

Reads the feed URL from the GCAL_ICS_URL environment variable (a GitHub
Actions secret), expands recurring events in the plan window, keeps only
study blocks, deadlines and midterms, and writes data.json. Nothing else
from the calendar is published.

Classification (the iCal feed carries no event colors, so it goes by title):
  - title starts with the books emoji  -> Study
  - title mentions "midterm"           -> Exam
  - any other title naming a course     -> Deadline, unless it is a regular
    class meeting ("DSC 102 Lecture", "CSE 151A Discussion", "CSE 151A")
"""
import hashlib
import math
import json
import os
import re
import sys
import urllib.request
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import icalendar
import recurring_ical_events

TZ = ZoneInfo("America/Los_Angeles")
WINDOW_START = os.environ.get("PLAN_START", "2026-10-20")
WINDOW_END = os.environ.get("PLAN_END", "2026-11-05")  # exclusive
OUT = os.environ.get("OUT", os.path.join(os.path.dirname(__file__), "..", "public", "data.json"))

COURSE_RE = re.compile(r"\b(DSC|CSE)\s?(\d+[A-Z]?)\b")
CLASS_MEETING_RE = re.compile(r"^(DSC|CSE)\s?\d+[A-Z]?(\s+(Lecture|Discussion|Section|Lab section))?$")
WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def r1(x: float) -> float:
    """Round to one decimal, halves up (matches the page's Math.round)."""
    return math.floor(x * 10 + 0.5) / 10


def iso(dt: datetime) -> str:
    """Local wall time with offset, the same shape Google's API returns."""
    s = dt.astimezone(TZ).isoformat(timespec="seconds")
    return s


def day_label(s: str) -> str:
    d = date.fromisoformat(s[:10])
    return f"{WD[d.weekday()]} {MO[d.month - 1]} {d.day}"


def time_label(s: str) -> str:
    h, mi = int(s[11:13]), s[14:16]
    ap = "PM" if h >= 12 else "AM"
    h = h % 12 or 12
    return f"{h} {ap}" if mi == "00" else f"{h}:{mi} {ap}"


def events_from_ics(raw: bytes):
    cal = icalendar.Calendar.from_ical(raw)
    start = datetime.combine(date.fromisoformat(WINDOW_START), datetime.min.time(), TZ)
    end = datetime.combine(date.fromisoformat(WINDOW_END), datetime.min.time(), TZ)
    rows = []
    for ev in recurring_ical_events.of(cal).between(start, end):
        if str(ev.get("STATUS", "")).upper() == "CANCELLED":
            continue
        ds, de = ev.get("DTSTART").dt, ev.get("DTEND").dt if ev.get("DTEND") else None
        all_day = not isinstance(ds, datetime)
        if all_day:
            rows.append({"summary": str(ev.get("SUMMARY", "")), "all_day": True})
            continue
        if ds.tzinfo is None:
            ds = ds.replace(tzinfo=TZ)
        if de is None:
            de = ds + (ev.get("DURATION").dt if ev.get("DURATION") else timedelta(0))
        elif de.tzinfo is None:
            de = de.replace(tzinfo=TZ)
        uid = str(ev.get("UID", ""))
        rows.append({
            "id": hashlib.sha1(f"{uid}|{ds.astimezone(timezone.utc).isoformat()}".encode()).hexdigest()[:20],
            "summary": str(ev.get("SUMMARY", "")).strip(),
            "start": iso(ds),
            "end": iso(de),
            "all_day": False,
            "location": str(ev.get("LOCATION", "") or ""),
            "description": str(ev.get("DESCRIPTION", "") or ""),
        })
    return rows


def classify(summary: str):
    m = COURSE_RE.search(summary)
    if summary.startswith("📚"):
        return "Study"
    if re.search(r"midterm", summary, re.I) and m:
        return "Exam"
    if m and not CLASS_MEETING_RE.match(summary.strip()):
        return "Deadline"
    return None


def build_plan(events):
    plan = []
    for e in events:
        if e.get("all_day"):
            continue
        kind = classify(e["summary"])
        if not kind:
            continue
        m = COURSE_RE.search(e["summary"])
        course = f"{m.group(1)} {m.group(2)}" if m else "Other"
        title = re.sub(r"^📚\s*", "", e["summary"])
        title = re.sub(r"^(DSC|CSE)\s?\d+[A-Z]?[:\s]*", "", title)
        title = title.replace("MIDTERM", "Midterm", 1).strip() or e["summary"]
        s, en = e["start"], e["end"]
        if s[:10] == en[:10]:
            when = f"{day_label(s)}, {time_label(s)}–{time_label(en)}"
        else:
            when = f"{day_label(s)} {time_label(s)} → {day_label(en)} {time_label(en)}"
        w = re.search(r"Worth (\d+)%", e["description"])
        hours = (datetime.fromisoformat(en) - datetime.fromisoformat(s)).total_seconds() / 3600
        loc = re.sub(r", UCSD$", "", e["location"]) if e["location"] else ""
        plan.append({
            "id": e["id"], "course": course, "kind": kind, "title": title, "when": when,
            "day": s[:10], "start": s, "end": en, "hours": r1(hours),
            "location": loc, "weight": int(w.group(1)) if w else None,
        })
    plan.sort(key=lambda r: datetime.fromisoformat(r["start"]))
    return plan


def build_all(plan):
    study = [r for r in plan if r["kind"] == "Study"]
    totals = [{
        "study_hours": r1(sum(r["hours"] for r in study)),
        "study_blocks": len(study),
        "exams": sum(r["kind"] == "Exam" for r in plan),
        "deadlines": sum(r["kind"] == "Deadline" for r in plan),
    }]
    exam_prep = []
    for x in (r for r in plan if r["kind"] == "Exam"):
        xs = datetime.fromisoformat(x["start"])
        prep = sum(r["hours"] for r in study if r["course"] == x["course"] and datetime.fromisoformat(r["end"]) <= xs)
        exam_prep.append({
            "id": x["id"], "course": x["course"], "title": x["title"], "when": x["when"], "day": x["day"],
            "start": x["start"], "end": x["end"], "location": x["location"] or "Take-home",
            "weight": x["weight"], "prep_hours": r1(prep),
        })
    return {"plan": plan, "totals": totals, "exam_prep": exam_prep}


def main():
    url = os.environ.get("GCAL_ICS_URL", "").strip()
    if not url:
        sys.exit("GCAL_ICS_URL is not set. Add your calendar's secret iCal address as a repository secret.")
    if url.startswith("webcal://"):
        url = "https://" + url[len("webcal://"):]
    req = urllib.request.Request(url, headers={"User-Agent": "midterm-runway-sync"})
    with urllib.request.urlopen(req, timeout=60) as r:
        raw = r.read()
    if b"BEGIN:VCALENDAR" not in raw[:2000]:
        sys.exit("The calendar address did not return an iCal feed. Check that GCAL_ICS_URL is the 'Secret address in iCal format'.")
    data = build_all(build_plan(events_from_ics(raw)))
    if not data["plan"]:
        sys.exit("The feed had no study blocks, deadlines or midterms in the plan window; leaving data.json unchanged.")

    # Only rewrite (and so only commit) when the plan itself changed.
    try:
        old = json.load(open(OUT))
    except (OSError, ValueError):
        old = {}
    if {k: old.get(k) for k in data} == data:
        print("No changes to the plan.")
        return
    data["updated"] = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    with open(OUT, "w") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Wrote {len(data['plan'])} plan items: {data['totals'][0]}")


if __name__ == "__main__":
    main()
