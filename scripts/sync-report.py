"""Reads the scheduled sync's answer on stdin, prints it, and fails when calendars are overdue.

The sync answering 200 while sources pile up unread is the silent failure: the run is green and
nobody looks. Exiting non-zero turns it into a failed workflow run, which GitHub emails about.
"""
import json
import sys

d = json.load(sys.stdin)
print("due", d.get("due"), "done", d.get("done"), "overdue", d.get("overdue"))
for r in d.get("results", []):
    if not r.get("ok"):
        print(r)
overdue = int(d.get("overdue") or 0)
if overdue > 0:
    print(f"::error::{overdue} calendar(s) are more than 2 hours overdue for a read. See docs/RUNBOOK.md, 'The sync stopped'.")
    sys.exit(1)
