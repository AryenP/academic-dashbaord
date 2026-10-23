# Runway — ten hours, no ceiling

You have Runway (`/Users/AryenP/Downloads/academic-dashbaord`) to yourself for about ten hours.
Aryen is away and will not answer. Nobody else is editing the repo. This document gives you no
solutions. It gives you the state of things, the few things you may not do, a way to pace yourself,
and a set of horizons to think toward. Everything else is yours to decide.

## Where things stand

Read, in this order, before anything else:

1. `CLAUDE.md` — the house rules. They win over this file.
2. `docs/v2/SESSION-3H.md`, the "## Report" at the end — what the last session shipped this
   evening and what it left: classification context (rules 67 %, model 98 %), data download,
   deletion cascade proof, landing and README for v2, the planner's preferred hours, a second
   screen at `#/now`, "the week in words", a forecast line.
3. `docs/v2/IDEAS.md` — eight questions and forty-four ideas with verdicts from that session. Treat
   it as a starting inventory, not a plan. Disagree with it where you see further.
4. `docs/v2/BACKLOG.md` — what only Aryen can do. Leave that section alone.
5. `docs/DECISIONS.md` — read the last thirty entries to understand why things are the way they
   are. Add to it every time you deviate from the spec or make a call that someone later would
   want explained.
6. `docs/v2/SPEC.md` — the product as specified. You are allowed to outgrow it. When you do, say so
   in a DECISIONS line and, if the change is large, in a new section at the end of the spec.

Then run the suites so you know the ground is solid before you build on it:

```bash
cd /Users/AryenP/Downloads/academic-dashbaord && (docker info >/dev/null 2>&1 || docker desktop restart) && supabase start && supabase db reset && npm run types && npm run check && npm run test:db && npm run test:fn
```

For the signed-in browser suite: `supabase functions serve --no-verify-jwt --env-file .env.functions.local` in the background, then `npm run test:e2e:db`. If the runtime dies ("Edge Runtime container is no longer available"), restart it; that failure is the runtime's, not yours.

## The few things you may not do

- No AI attribution anywhere: commits, PRs, UI, docs. Check every commit message.
- No secrets in the repo. Never `supabase config push`. The keys in `.env.functions.local` and the
  Vault are the only places secrets live.
- Nothing that needs an account, key or payment Aryen doesn't have. Write those down with exactly
  what he'd need to do; don't build around them with fakes.
- No tracking, no analytics, no third party that sees a student's data. The student's data is the
  student's. RLS enforces it; every new table gets the "user B can't see user A" test, and deletion
  must cascade.
- Nothing the AI does becomes real without the person confirming it. "Tends to", never "because".
- Pushing `main` deploys the live site. `npm run check` before every push; a migration goes live
  with `supabase db push` before the code that needs it; a changed function is deployed with
  `supabase functions deploy <name> --no-verify-jwt`. Don't break v1's sessions, breaks, phone
  focus, Spotify or offline queue.
- Keep the identity: Big Shoulders Display numerals, course colors, the red hatched exams, the
  calm focus screen, plain words, inline SVG, no emoji, no praise, no shaming. New things should
  look like they were always there.
- One writer per checkout. No background loops, no second session.

That is the whole list. Everything else is open.

## How to spend ten hours

You will want to start building in the first ten minutes. Don't. The last session already built
the obvious things; the value now is in thinking further than the obvious before touching code.

- **Hour 1: think, and write.** Open `docs/v2/JOURNAL-10H.md` and write to it as you go, in your
  own words, timestamps and all. Take the horizons below one at a time. For each, write what you
  actually think: what Runway is for, what it could be, what it should refuse to be. Argue with
  yourself. Reach conclusions you could defend to a skeptical student, not to a product manager.
  End the hour with a ranked list of the things you intend to build, each with one sentence on why
  it matters to a student on a Tuesday night and one sentence on what "finished" means.
- **Hours 2–9: build, in order, completely.** One thing at a time. Each gets the full treatment:
  design, code, tests (unit, RLS where there is data, Deno where there is a function, browser
  where there is a screen), 375 px, light and dark, keyboard, axe, screenshots you have looked
  at, a DECISIONS line, a commit, a push. Finished and small beats large and open. When a thing
  turns out bigger than you thought, cut its scope honestly and say so in the journal rather than
  leaving it half done.
- **Every two hours: stop and look.** Reread your hour-1 list. Is the ranking still right, given
  what you learned building? Change it if not, and say why in the journal. Check the live site
  still works (sign in with the test flow, open the runway, start and end a session). Check the
  repo is green.
- **Hour 10: close.** All suites green, everything pushed, the journal complete, the report below
  written. Leave the repo in a state where Aryen could open it cold and understand what happened.

If you get stuck on one thing for more than forty minutes, write down where you are, leave it
green, and move to the next. Come back at the end if there is time.

## The horizons

These are directions, not tasks. Each is a set of questions. Your job in hour 1 is to think about
all of them and decide which deserve the ten hours; your job after that is to make a few of them
real. No horizon is required. A horizon not on this list is welcome if you can defend it.

**1 · Time.** Runway draws the next two weeks as a strip. Why two weeks? Why a strip? A student's
sense of time is not linear: the night before an exam is longer than a whole free weekend. What
would it mean for Runway to hold the student's relationship with time, not just display it? What
does the runway look like at 11 PM? At 7 AM? On the morning of the exam? During the exam? The
day after? What is the smallest unit of time Runway should care about, and the largest?

**2 · Ready.** Readiness today is hours done over hours planned. That is a proxy, and the student
knows it. What is readiness really? When does a student *know* they are ready, and what evidence
do they trust? What could Runway know about what was actually learned, without ever becoming a
quiz app that nags? What would an honest readiness look like that a student would believe the
night before, and that would be right the morning after? What should Runway say when the honest
answer is "not ready"?

**3 · The AI.** Runway's AI reads calendars, drafts plans, reads syllabi, writes a weekly review.
What should it be to a student: a planner, a coach, a tutor, a quiet secretary, a friend, none of
these? What should it never do? Where is the line between helping and deciding? What does it
know about this one student that it should use, and what does it know that it should pretend
not to? What would it mean for the AI to be *trusted*, and how would you know it had earned that?
What is the one thing the AI could do that would make a student say "oh" out loud?

**4 · Others.** Students study alone in rooms full of other people studying alone. Runway has
classmates, friends and opt-in stats. What is the right amount of other people? Where does
companionship become comparison, and comparison become shame? What could two students in the same
course do together through Runway that they can't do today, with nothing shared that either would
regret? What about a study group, a section, a whole class, a whole school? What should be
impossible, by construction, not by policy?

**5 · The body.** Sleep, movement, food, light, place. The phone now sends coarse signals; Stats
finds patterns. That is the beginning of something. What would Runway be if it took the body
seriously as part of studying, without becoming a health app, without moralising, without a
single number that makes a tired student feel worse? What does the plan look like if it knows
you slept five hours? What does the focus screen look like at hour three of a session?

**6 · The first hour and the last day.** A new student arrives nervous, with a calendar they
don't trust and an exam in nine days. What are the first sixty seconds? The first hour? The first
week? And at the other end: the term ends, the exams are over. What does Runway do then? What
does the student keep? What would make them come back next term without being asked? What would
make them tell a friend?

**7 · Beyond the browser.** Runway is a web app that installs to a home screen and talks to an
iPhone Shortcut and a browser extension. Where else does a student's attention actually live: the
lock screen, the watch, the laptop's menu bar, the desk, the wall, paper, a text message, a
calendar invite, a voice? Which of those could Runway reach today, with what exists, and which
only with Aryen's accounts? What would the smallest possible Runway look like: the one glance
that is enough?

**8 · Trust.** Runway's promise is that the data is the student's: private by default, enforced by
RLS, deleted at once, downloadable. Is that promise visible, or just true? What would make a
careful student trust Runway with their calendar, their grades, their sleep, their friends'
names? What would make them *feel* the privacy, not just read about it? What could go wrong, and
what would Runway do the day it did? What should a student be able to see about what Runway
knows and does with it, at any moment?

**9 · The machine.** Runway runs on GitHub Pages, Supabase, Deno functions, a GitHub Actions cron
and a browser extension, with tests at every layer. It has had gateway outages, stale secrets, a
dead local runtime, a hung session check. What would make it boring to run: things that can't
break, failures that explain themselves, costs that can't surprise, a sync that never silently
stops, a deploy that can't ship a broken runway? What does the code look like to a stranger who
has to fix it at 2 AM? What tests are missing that would have caught the last ten bugs?

**10 · Everyone.** Runway was built by one student at one school for the calendar he already
kept. What breaks for a student at a school Runway doesn't know, on a semester instead of a
quarter, in a language that isn't English, with a screen reader, with a disability that makes
sitting still for fifty minutes impossible, with three jobs, with no laptop, on Android? Which of
those could be met today, which with Aryen, and which should Runway honestly say it isn't for?

**11 · The far edge.** What is Runway in five years if everything goes right? What is it in five
years if it stays exactly this size and keeps its promises? Which future is better for the
student? What would you build today that only makes sense in the better one? What would you
refuse to build even though it would obviously grow the thing?

## What to leave behind

- `docs/v2/JOURNAL-10H.md`: your thinking, hour by hour, including the two-hour reviews and
  every change of mind.
- `docs/v2/VISION.md`: one page, written at the end, in plain words: what Runway is, what it is
  for, what it will never do, and the three things that matter most next. Written for Aryen to
  read in five minutes and for a stranger to read in ten.
- The things you built, each complete, each documented in `docs/DECISIONS.md`, all pushed.
- `docs/v2/BACKLOG.md`: a "Session 2026-10-22 night" block: what shipped (hashes), what you cut,
  what you'd do next, what needs Aryen.
- The report, appended to this file under "## Report": for each thing built, done / partly /
  cut, the commit, what was verified and how (which suites, which screenshots), and what Aryen
  must do or decide. Then, in at most ten lines, what you'd tell Aryen in person if you had one
  minute. No praise, no restating the rules.
