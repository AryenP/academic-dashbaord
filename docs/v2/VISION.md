# Runway, in one page

_Written 2026-10-22 at the end of a ten-hour session, updated 2026-10-23. For Aryen in five minutes, for a stranger in ten._

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

## Where it stands

Phases 0–5 of the v2 spec are live: multi-user with RLS, calendar sources in Vault with a
15-minute sync, the AI reading with a confirm, the planner with proposals and a feed, the
extension for submissions and grades, classmates and friends, syllabus reading, the weekly review,
phone signals and patterns, sharing levels, download and delete. The night of October 22 added the
pace line, the panel of what Runway holds, a headline that knows the hour, overfull days, the
glance for the lock screen, a stale-sync warning, a runbook, the Android recipe, the hour-three
line and a printable runway. The next day added the three things this page used to list as next:
studying together from shared free time (both opted in, nothing on either runway until the other
says yes), the term in the student's own numbers when the last exam has passed, and a sync and a
deploy that fail loudly instead of quietly. Then the first minute: a visitor can paste a calendar
address before there is an account, see their own runway, and land on it after the sign-in link.

## The three things that matter most next

1. **Learn from the drops.** The planner proposes and the student discards some blocks. Which ones
   (mornings, blocks over two hours, Fridays) is the clearest signal Runway gets about a person,
   and it is thrown away today. A small log of discards and a tie-break in the allocator, said in
   the block's reason, is the honest version.
2. **A forecast you can drag.** The pace line says where this pace lands; the next step is "add one
   more block on Saturday and you reach 11 of 12", shown while the block is being placed, so the
   plan is argued with in numbers instead of guilt.
3. **Time zones a feed doesn't define.** A feed that names a zone without a VTIMEZONE block reads
   as UTC today. Falling back to the runtime's own zones fixes the sync and the preview at once.

Still only Aryen's: SMTP for sign-in emails, the school-email switch back on before launch, the
extension in the store, and VAPID keys if push notifications are ever wanted.

Everything else that was thought of is in `IDEAS.md` with a verdict, and the reasons for
every choice are in `DECISIONS.md`.
