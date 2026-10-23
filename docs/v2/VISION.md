# Runway, in one page

_Written 2026-10-22, at the end of a ten-hour session. For Aryen in five minutes, for a stranger in ten._

## What it is

Runway is a study app that starts from the calendar a student already keeps. It reads that
calendar, finds the courses, classes, exams and deadlines in it, draws every day from now to the
last exam as one strip, drafts study blocks toward each exam when asked, runs the sessions, lets
the phone verify the focus, and says, in the student's own numbers, how ready they are. Everything
it holds is the student's: private by default, enforced by the database, counted on request,
downloadable in one file, deleted at once.

## What it is for

For the Tuesday night when a student has three exams in nine days, a calendar they half trust and
no sense of whether the week is enough. Runway's whole job is to turn that into something they can
look at once: what is on now, what comes next, what the week's shape is, where this pace lands by
exam day, and what the plan still holds. It is a quiet secretary, not a coach: it proposes, it
explains in one line, it waits for the person to say yes.

The loop is plan → session → verified focus → readiness, and "planned versus actual" comes free
because the plan is the calendar. The night-before answer is arithmetic with its inputs showing,
not a score from nowhere; the morning-after answer is the same arithmetic, which is why it can be
trusted.

## What it will never do

- Rank students, shame a missed day, or put a red number next to a tired person.
- Show one student anything of another's without both having opted in, course by course, and
  never below the level each person chose. Never a schedule, never notes, never grades.
- Let the AI decide. Every reading, draft, syllabus date and review passes through a confirm, and
  every AI path has a plain fallback that works with no model at all.
- Say "because" about a pattern. A few weeks of one person's data is "tends to".
- Read more than it needs: titles, times and places from a calendar; coarse daily numbers from
  the phone; the apps the student listed and nothing else. No analytics, no tracking, no third
  party that sees the data.
- Need an account, a key or money the student has to give it. It is free while it is small, and
  the budget caps are in the open.

## Where it stands tonight

Phases 0–5 of the v2 spec are live: multi-user with RLS, calendar sources in Vault with a
15-minute sync, the AI reading with a confirm, the planner with proposals and a feed, the
extension for submissions and grades, classmates and friends, syllabus reading, the weekly review,
phone signals and patterns, sharing levels, download and delete. Tonight added the pace line, the
panel of what Runway holds, a headline that knows the hour, overfull days, the glance for the lock
screen, a stale-sync warning, a runbook, the Android recipe and the hour-three line. Every suite
is green; the live site has it all.

## The three things that matter most next

1. **Study together, from free time.** Two students in the same course, both opted in, see
   "you're both free Tuesday 3–5 for DSC 140A; propose it?" and nothing until both agree. Free
   slots are already computed server-side; what is missing is a proposals table with RLS both
   ways and a quiet UI. It is the one social thing that is companionship and not comparison.
2. **The last day.** When the last exam has passed, Runway should hand the student their term in
   their own numbers (hours, the exam they turned around, the week that went best, what tended to
   go with their best sessions), in the runway's style, theirs to keep or share. It is what they
   would show a friend, and it is why they would come back next term.
3. **Boring to run.** The runbook exists; the next step is that none of its sections is ever
   needed: a sync that reports its own silence to Aryen, not just to the student; a deploy that
   checks the live functions answer before the site switches; and the three things only Aryen can
   do (SMTP for sign-in emails, the school-email switch back on, the extension in the store).

Everything else that was thought of tonight is in `IDEAS.md` with a verdict, and the reasons for
every choice are in `DECISIONS.md`.
