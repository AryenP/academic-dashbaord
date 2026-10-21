import json
import pathlib

import pytest

import sync

FIXTURE = pathlib.Path(__file__).parent / "fixtures" / "plan.ics"


@pytest.fixture(scope="module")
def data():
    return sync.build_all(sync.build_plan(sync.events_from_ics(FIXTURE.read_bytes())))


def by_title(data, title):
    return [r for r in data["plan"] if r["title"] == title]


def test_recurring_event_expands_into_each_day(data):
    rows = by_title(data, "practice problems")
    assert [r["day"] for r in rows] == ["2026-10-21", "2026-10-22", "2026-10-23"]
    assert {r["kind"] for r in rows} == {"Study"}
    assert all(r["course"] == "DSC 140A" and r["hours"] == 2 for r in rows)
    assert len({r["id"] for r in rows}) == 3, "each occurrence needs its own id"
    assert rows[0]["when"] == "Wed Oct 21, 10 AM–12 PM"


def test_utc_event_is_shown_in_local_time(data):
    (r,) = by_title(data, "Lab 4 due")
    assert r["kind"] == "Deadline"
    assert r["start"] == "2026-10-23T23:00:00-07:00"
    assert r["day"] == "2026-10-23"
    assert r["when"] == "Fri Oct 23, 11 PM–11:59 PM"


def test_24_hour_exam_spans_two_days(data):
    (r,) = by_title(data, "Midterm (take-home, 24 hr)")
    assert r["kind"] == "Exam"
    assert r["start"] == "2026-11-03T14:00:00-08:00"
    assert r["end"] == "2026-11-04T14:00:00-08:00"
    assert r["hours"] == 24
    assert r["weight"] == 20
    assert r["when"] == "Tue Nov 3 2 PM → Wed Nov 4 2 PM"


def test_exam_prep_counts_only_earlier_study_for_that_course(data):
    (x,) = data["exam_prep"]
    assert x["course"] == "CSE 151A"
    assert x["prep_hours"] == 3
    assert x["location"] == "Take-home"


def test_all_day_class_meeting_cancelled_and_out_of_window_events_are_dropped(data):
    titles = {r["title"] for r in data["plan"]}
    assert "project day" not in titles
    assert not any("Lecture" in t for t in titles)
    assert "cancelled review" not in titles
    assert "after the window" not in titles
    assert len(data["plan"]) == 6


def test_totals(data):
    assert data["totals"] == [{"study_hours": 9, "study_blocks": 4, "exams": 1, "deadlines": 1}]


def test_plan_is_sorted_by_start(data):
    starts = [r["start"] for r in data["plan"]]
    assert starts == sorted(starts, key=lambda s: sync.datetime.fromisoformat(s))


@pytest.mark.parametrize(
    "summary,kind",
    [
        ("📚 DSC 102 review", "Study"),
        ("DSC 140A Midterm 1", "Exam"),
        ("DSC 106 Project 3 due", "Deadline"),
        ("CSE 151A Discussion", None),
        ("CSE 151A", None),
        ("Dentist", None),
    ],
)
def test_classify(summary, kind):
    assert sync.classify(summary) == kind


def test_main_writes_output_and_skips_unchanged_plans(tmp_path, monkeypatch, capsys):
    out = tmp_path / "data.json"
    monkeypatch.setenv("GCAL_ICS_URL", FIXTURE.as_uri())
    monkeypatch.setattr(sync, "OUT", str(out))
    sync.main()
    first = json.loads(out.read_text())
    assert len(first["plan"]) == 6 and first["updated"].endswith("Z")
    sync.main()
    assert "No changes to the plan." in capsys.readouterr().out
    assert json.loads(out.read_text())["updated"] == first["updated"]


def test_main_needs_the_feed_url(monkeypatch):
    monkeypatch.delenv("GCAL_ICS_URL", raising=False)
    with pytest.raises(SystemExit):
        sync.main()
