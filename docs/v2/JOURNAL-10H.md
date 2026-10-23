# Runway — ten hours, a journal

Thursday 22 October 2026, from 5:40 PM Pacific. Written as I go, in my own words. The plan is
`SESSION-10H.md`; the previous session's report is at the end of `SESSION-3H.md`.

## 5:40 PM · Where I start

The repo is green as of an hour ago (check 21, db 46, deno 68, e2e-db 39), and I am running the
suites again on a fresh database before anything else. What the last session left me: a rules
classifier that reads context, a model that reads it at 98 %, a data download, a second screen,
the week in words, a forecast line. All of it small and finished, which is the right shape.

The temptation is to open the ideas file and start on the top "build later". I'm not going to.
The ideas file was written in ten minutes by someone (me, earlier) who had just built the obvious
things. The horizons ask harder questions. One at a time.

## 5:45 PM · 1 · Time

Why two weeks? Because that is how far a student can see. Beyond that the plan is the planner's
guess, not theirs. Why a strip? Because the thing a student wants to know is "what is between me
and the exam", and a strip answers it in one glance: the hatched red is the wall, the colored
blocks are the road. The strip is right. What is wrong is that it looks the same at every hour.

At 11 PM a student does not want a strip of twelve days. They want to know two things: is there
anything left tonight, and when does tomorrow start. At 7 AM they want the first block and the
day's shape. On the morning of an exam they want the room, the time, and permission to stop
studying. During the exam Runway should be silent. The day after, it should say what is next and
nothing about the exam. None of this needs new data; it needs the headline to know what time it
is. Today the lede always says "3 days until MATH 20C Midterm 1, you have 12 hours of prep on the
calendar for it." True, and tone-deaf at 11 PM.

Smallest unit: a block, 30 minutes. Below that Runway should not care; the timer handles minutes.
Largest: the term. Runway does not know the term exists today; it sees a 180-day window. A term
has a start, a reading week, finals, an end. Knowing the end is the difference between "the plan is
finished" (today's wording when the runway runs out) and "the term is over". That is horizon 6's
problem and I will come back to it.

**What I'd build:** the headline that knows the hour. Night (after 9 PM): "Tonight: one block left, then
"Tomorrow starts at 9:30 with MATH 20C." Exam day: "Today: MATH 20C
Midterm 1, 5 PM, Center Hall 115. 11 of 12 hours done. Nothing else before it." These are variants
of one component with a pure function behind them, which means tests.

## 5:55 PM · 2 · Ready

Hours done over hours planned is a proxy and everyone knows it. It has one virtue: it is honest
about being a proxy. The checkpoint says "2 of 12 prep hours done" and the student can argue with
the 12. A score from nowhere ("you're 73 % ready") would be worse, because it hides its inputs.

What does a student trust the night before? Three things, in my experience: having done the
practice problems under time, having explained the hard thing once to someone, and sleep. Runway
can know the first (a block titled "Past midterm, timed" ran and was rated), can't know the
second, and now knows the third. What it should never become is a quiz app that asks "do you know
X?". The person's own words after a session ("What did you get?") are the right input, and they
exist already as the note. They are not used anywhere yet except the log.

The honest readiness that a student would believe the night before and that would be right the
morning after is not a number. It is a forecast with its inputs showing: "At this pace you reach
about 9 of 12 hours by Sunday." Pace is measurable: hours actually studied for that course in the
last seven days, divided by seven, times the days left. That is arithmetic a student would do
themselves and trust because they could check it. When the honest answer is "not ready", Runway
should say the arithmetic, not the adjective: "9 of 12 at this pace; one more block gets you to
10.5." Never "you're behind", which is a judgement. Never a red number.

**What I'd build:** the pace line on every exam checkpoint, for the person themself only (never on
share pages). Pure function, unit tests on the demo plan with seeded sessions, a browser check.

## 6:05 PM · 3 · The AI

What should it be? A quiet secretary. It reads the calendar so the student doesn't have to type
it; it drafts so the student doesn't face a blank runway; it reads the syllabus so nobody retypes
dates. It proposes, it explains in one line, it waits. The line between helping and deciding is
the confirm step, and it holds everywhere today. Keep it.

What it should never do: speak in the second person about the student's character ("you tend to
procrastinate"), move an accepted block, read a description or an attendee, remember a note it
was never given, or be the only path to a feature (the allocator is the proof: every AI path has a
plain fallback). What it knows that it should pretend not to: the grade. The planner sees weights,
not scores. That stays.

How would trust be earned? The same way a secretary earns it: by being right about small things
for a long time, and by showing their work. The Courses screen shows every reading and its reason.
Nothing shows what the AI was sent. A student who could see "this month Runway sent 48 event
titles and times to the model, nothing else" would trust it more than one who read that sentence
on the privacy page. That belongs to horizon 8.

The "oh" moment. I keep coming back to the same thing: the AI could tell the student that
Thursday will not happen. Lecture 2–3:20, work 4–8, a deadline at midnight, and a three-hour
study block the calendar says is at 5. The block cannot run; the day is overfull. That is not an
AI task at all; it is arithmetic over free hours and planned hours, which the planner already
computes for its own drafts. It just never tells the student when a day they made themselves won't
fit. "Thursday has 5 hours planned in 3 free" is the sentence. A student would say "oh" and move
the block, and no model was involved. I'll take the "oh" and skip the model.

**What I'd build:** overfull days in the forecast line and in the week in words.

## 6:15 PM · 4 · Others

The right amount of other people is: as many as you asked for, and none you didn't. Runway has
that right by construction: nobody appears unless both sides opted in per course; counts, not
names, on the runway; nothing shared below the level each person set. Companionship becomes
comparison the moment there is an ordering, and comparison becomes shame the moment the ordering
is visible to the person at the bottom. So: no ordering. The per-course list has readiness bars,
which is already close to the line. I would not add a board, ever.

What could two students do together that they can't today? Study at the same time. Not share a
room, not chat: just know that between 3 and 5 on Tuesday they are both on DSC 140A. The free
slots are computable server-side. The design is clear (propose, accept, nothing shown until both
agree) and it is a sitting of its own: a table, RLS both ways, a function, a UI for each side, and
a test for each refusal. Not tonight. What should be impossible by construction: seeing a
classmate's calendar, ever. The proposal would carry a slot, not a schedule.

**What I'd build:** nothing tonight. Written down.

## 6:20 PM · 5 · The body

The coarse signals are the right size. Sleep in hours, exercise in minutes, steps as a count, a
place as a word. The patterns section says "tends to" and stays silent below the thresholds. That
is the whole health feature and it should stay that small. A student who slept five hours does not
need Runway to say so; they know. What the plan could do is not add to the damage: when the day
is already long and the night was short, the honest thing is to put the lighter block first and
say nothing about why. I am wary of this. "Lighter" needs a definition the student agreed to, and
the planner already has first-pick hours. I will leave it.

Hour three of a session. The focus screen counts up and the break screen says "water, stretch".
After three hours what it should say is "three hours is a long time; the pattern in your own
sessions is that the fourth hour runs at N %" if the data says so, else nothing. Only from the
person's own sessions, only "tends to". It is small and it is cosmetic. Lower on the list.

**What I'd build:** maybe the hour-three line, late, if there is time.

## 6:30 PM · 6 · The first hour and the last day

The first sixty seconds are the landing page and sign-in; the first hour is Connect, the courses
check, a draft, and the first session. I looked at the new-user test's screenshots this evening and
they are decent. What a nervous first-year feels at Connect is "which address?", and the guides
answer it. What I can't tell from screenshots is whether the Courses check feels like a test they
might fail. The copy says "fix anything it got wrong", which is right.

The last day is the real gap. The runway runs out and says "The plan is finished." A term ends
with a week of nothing and then a new calendar. Runway should notice when the last exam has passed
and there is nothing ahead, and say so in the student's own numbers: hours this term, the exam
with the best readiness, the week that went best. That is "your term, wrapped" and it is also what
a student keeps and what they'd show a friend. It is a day's work done properly (a page, its own
facts function, a share decision). Not tonight; but the headline's "term is over" state is part of
the time-aware headline and I'll write it there.

What makes them come back next term without being asked: a calendar that still syncs. Runway
keeps the sources; when the new term's events arrive, the runway fills itself. Nothing to build,
one thing to verify: that a source with no events in the window does not go to "error". It
doesn't; the sync reports 0 events and keeps the schedule.

## 6:40 PM · 7 · Beyond the browser

Where attention actually lives: the lock screen, the watch, the menu bar, the desk. Runway reaches
the home screen (installed), the calendar (the plan feed), the Shortcut (signals in), the extension
(grades in). It reaches nothing *out* to the phone except the calendar feed, which is a day's view,
not a glance.

The glance: "Now: MATH 20C, Series: lectures 8–10, 30 min left. Next: COGS 1 at 6. Midterm in 3
days." That sentence on a lock screen is the smallest Runway. It can be reached today: an iOS
Shortcut can fetch a URL with the existing shortcut token and show the result as a notification,
on a schedule or on a tap, and a watch can run a Shortcut. An Edge Function that answers plain
text is an hour's work including the Deno test and the guide line. No account needed. Android's
Tasker can call the same address, which also answers horizon 10's Android question for signals:
the receiving side is the same.

The menu bar, the wall and paper are the same text at different sizes; the second screen covers the
wall. Voice is the narration already written, through speech synthesis, later.

**What I'd build:** the `glance` function, and the line in the Shortcut guide.

## 6:50 PM · 8 · Trust

The promise is true and invisible. The privacy page says it; nothing in the app shows it. A
careful student would trust Runway more if Settings had a panel that said, in their own numbers:
"Runway holds 4 courses, 312 events, 61 plan items, 23 sessions, 2 phone events, 14 signals, 1
weekly review, 2 friends. Your calendars were last read 12 minutes ago. This month the model was
sent 48 event titles and times and nothing else. Your share page is off. Download it. Delete it."
Every number comes from the same policies that keep the app honest; the panel is a SQL function
over the person's own rows, no new table. The point is not the counts. The point is that the
student sees Runway counting, and that the last two links sit next to the numbers.

What could go wrong, and what would Runway do the day it did? A leak through a function that
returned another person's rows. The RLS tests are the defence; the deletion cascade test is the
second. What is missing is that a student has no way to see what Runway did *with* the data: when
the AI was called, when the sync ran, when a share page was viewed. The first two are cheap (the
counts above include them). The third would need a log table and I would not add one tonight.

**What I'd build:** "What Runway holds about you" in Settings, from a `my_footprint()` function with
an RLS test that user B's numbers never include user A.

## 7:00 PM · 9 · The machine

Boring to run means: nothing silent. The sync can stop silently today: if the GitHub cron stops
(the workflow is disabled after 60 days of no pushes, or a secret rotates), every source keeps its
last `last_synced_at` and the runway's footer says "Synced 3 days ago" in the same calm grey as
"Synced 4 minutes ago". A student would not notice until a deadline was missing. The runway should
say, in a different voice, when the last sync is older than two hours: "Your calendars haven't been
read since 3 hours ago. Sync now." That's a pure check and one button that already exists.

Failures that explain themselves: the function errors mostly do (`describeError`). Costs that can't
surprise: the budget caps exist. A deploy that can't ship a broken runway: CI runs the check and
the Pages deploy only after it. What a stranger at 2 AM needs: `CLAUDE.md` is good, DECISIONS is
long but linear, the function names say what they do. The gap is the *runbook*: what to do when
Kong answers 503, when the Edge runtime dies, when the sync stops. It is scattered across DECISIONS
and the backlog. Half an hour to write `docs/RUNBOOK.md` would pay for itself the first night it
is needed. Tests missing for the last ten bugs: the hung session check (there is a 4-second
fallback; is it tested? I'll look), the CORS header (a Deno test asserting the preflight lists
`x-runway-token` would have caught it), the landing overflow (now tested).

**What I'd build:** the stale-sync warning; the runbook; the CORS preflight test.

## 7:10 PM · 10 · Everyone

A school Runway doesn't know: works, the school row is only for the Canvas deep link. Semester: the
180-day window covers it; nothing assumes ten weeks. Not English: everything is English; the
classifier's word lists are English. That is honest to say and not fixable tonight. Screen reader:
the week in words was for this; the runway blocks have full labels. A disability that makes fifty
minutes impossible: custom focus length goes down to one minute; flow mode has no timer. Three
jobs: commitments are a first-class kind and the planner never schedules over them; the forecast
will now say when the week is overfull. No laptop: the app installs on a phone and every screen
works at 375. Android: sessions and the runway work; phone focus and signals need Shortcuts, which
Android lacks. Tasker or MacroDroid can POST the same JSON; nobody has written the recipe. The
glance function gives Android a reason to have the recipe.

**What I'd build:** `docs/ANDROID.md`, the recipe, with the glance address in it.

## 7:15 PM · 11 · The far edge

Five years, everything goes right: Runway is in the App Store, reads HealthKit, has every LMS, a
million students, and a company behind it that needs the data to be worth something. Five years,
exactly this size: a few thousand students at a few schools, free, run by one person, every
promise kept. The second is better for the student, obviously, and worse for almost everyone else.
What I'd build today that only makes sense in the second: the trust panel, because a company would
never show you the count of what it holds. What I'd refuse even though it would grow the thing: a
leaderboard, a feed, a "share your readiness" card that posts to a social network, an analytics
script, any AI that writes without a confirm.

## 7:20 PM · The ranked list

Each line: why it matters on a Tuesday night, and what finished means.

1. **The pace line on each exam checkpoint.** Tuesday night the student wants to know if the plan
   is enough and whether they are on it; the arithmetic they'd do on paper, with the inputs shown.
   Finished: pure function + tests, shown for the person only, in both themes at 375, screenshot
   looked at, DECISIONS line.
2. **What Runway holds about you.** Tuesday night they are about to paste a calendar address and
   wonder what happens to it. Finished: migration 0016 with `my_footprint()`, RLS test for user B,
   Settings panel with the download and delete links beside it, e2e, axe.
3. **The headline that knows the hour.** At 11 PM the lede should say tomorrow; on exam morning,
   the room; after the last exam, the term is over. Finished: pure function + tests over the demo
   plan at six hours of the day, e2e at one of them, DECISIONS.
4. **Overfull days.** The "oh": a day with more planned than free. Finished: free-hours arithmetic
   from the planning settings and the day's fixed items, the forecast says "overfull Thursday (5 h
   in 3 free)", the week in words says it too, tests.
5. **The glance.** A plain-text sentence for a Shortcut, a watch, a Tasker. Finished: `glance`
   Edge Function with the shortcut token, Deno test, deployed, one line in the Shortcut guide and
   in `docs/ANDROID.md`.
6. **The stale-sync warning.** Finished: a pure check, the footer changes voice after two hours
   with "Sync now", unit test, e2e with a backdated source.
7. **The runbook and the preflight test.** Finished: `docs/RUNBOOK.md` with the five failures
   seen so far and what to do; a Deno test that the shared CORS preflight allows every header the
   clients send.
8. **The Android recipe.** Finished: `docs/ANDROID.md`, honest about what works and what doesn't.
9. **Hour three.** Only if time: one line on the focus screen after 180 minutes, from the person's
   own data, "tends to".

Not building, written down: study together from free time; your term, wrapped; sound; push;
the forecast you can drag. All in IDEAS.md already, and still right.

Order of work: 1, 2, 3, 4, 5, 6, 7, 8, 9. Review at 9:30 PM and 11:30 PM.

## 7:35 PM · Building 1 · the pace line

Ground check on a fresh database: check 21, db 46, deno 68; the browser suite is running. The
pace function was twenty lines; the words took longer than the arithmetic, which is the right
ratio. Two things I decided while writing it: a block that is running still counts as "ahead"
(it hasn't ended), and the projection rounds to the half hour so it never looks more exact than
it is. The first test expectation was wrong about the running block and I changed the test, not
the rule.

## 8:15 PM · Building 2 · what Runway holds about you

The function is one `jsonb_build_object` with sixteen subselects, and it runs as the caller on
purpose: a definer would have been shorter and would have made the panel's claim ("through the
same rules that keep every row yours") a lie. The words were again the slow part. I wrote "the
model was sent 48 event titles with times and places, and nothing else" and then checked that it
is true: `classify-events` sends title, start, end, all-day, location, the calendar's label and
the rules' reading. "Nothing else" holds.

Moving the download button into the panel broke the export test (two buttons with the same name)
and that was the right failure: there should be one place that says "yours" and it is this one.
Account keeps the sign-out and the fields.

Noticed on the way, from the mobile screenshot: the agenda table at 375 px clips its last column
("Submitted" shows as "Submitte"). Pre-existing. Added to the list after the glance.

## 8:50 PM · Building 3 · the headline that knows the hour

Migration 0016 went live before the panel's code was pushed, in the right order. Build 2 is in.

The headline took one wrong turn: my first tests built the demo plan from each test's clock, so
"Sunday 8 AM" was a different Sunday every time and nothing matched. The plan has to be held fixed
and only the clock moves; that is also the only honest way to test "what does the runway say at 11
PM". Six states: day, morning, night (something left / nothing left), exam day (before / during),
and the term over. I resisted a seventh for "the day after an exam": the day state already says
the next exam, and silence about the one that passed is the point.

## 9:20 PM · Building 4 · overfull days

The "oh". It needed no model, which was the point of writing it down in hour one. My first test
expected a 9-to-5 shift to make Saturday overfull with the default window; it doesn't (13 hours
minus 8 leaves 5, and the day holds 4). The function was right and I was wrong, twice tonight in
the same direction: I keep expecting the arithmetic to be harsher than it is. Good sign for the
wording.
