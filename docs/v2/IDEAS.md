# Runway — ideas, 2026-10-22

Written before building, in one sitting, as the session plan asked: every idea one line, the wide
questions first, then a one-word verdict after thinking it through. Sorted by verdict. The verdicts
are _build now_ (small, finished tonight), _build later_ (right, but a sitting of its own), _needs
Aryen_ (an account, a key, money or a sign-off), _no_ (with the reason).

## The questions

- What if the runway were the only screen? What would have to be on it, and what could go?
- What would a student who hates planning apps still open every morning? Probably not a plan.
- What if the app knew when you were tired, and said less, not more?
- What if studying felt like going somewhere: a gate, a departure, a landing?
- What can the phone, the calendar, the syllabus, the classmates and the music do together?
- What does a nervous first-year feel at each step of the first minute?
- What would Runway say out loud, if it had to?
- What would it never do, even if asked? (Rank you. Nag you. Tell anyone.)

## Built

- A second screen: `#/now`, no nav, the current block, a countdown, the next exam, in the runway's numerals; for an iPad on the desk or a browser on a TV. _built_ (`#/now`, see the report)
- The runway narrated: the week as sentences, "Tuesday: two blocks for DSC 140A, 9 to 10:30 and 3 to 4:30, a deadline at midnight", under the runway for screen readers and for anyone who would rather read. _built_ (under the runway)
- Weather: the week's shape in one line, "heavy Thursday, clear weekend, exam Sunday", next to the headline. _built_ (in the headline)
- Study together from free time: classmates who both opted in see when they're both free this week and invite each other; nothing on either runway until the other says yes. _built 2026-10-23_ (migration 0017)
- Your term, wrapped: hours, focus, the best week, each course, each exam against its plan, in the runway's style. _built 2026-10-23_ (`#/term`; "the exam you turned around" left out as a superlative)
- The first minute: paste a calendar address on `#/try` before there's an account, see your own runway, keep it, and land on it after the sign-in link. _built 2026-10-23_ (`preview-source`)

## Build later

- The runway breathes: the current block glows, the past fades, a day that went to plan looks different from one that didn't. _build later_ (CSS and actuals exist; needs a careful eye in both themes)
- A forecast, not a score: "at this pace you tend to reach about 80 % of the prep by exam day", with an honest range, from planned hours, pace so far and focus history. _build later_ (needs a model of pace per course and a way to show the range without a number that looks precise)
- "What if" you can drag: add a block on the runway and watch the forecast move. _build later_ (after the forecast)
- Ten seconds after a session: "What did you get?" one sentence; before the exam, those sentences come back as questions, spaced out. _build later_ (notes exist; the spacing and the question form need design)
- The syllabus knows the grade: "what do I need on the final to keep an A?" from weights and scores. _build later_ (weights and scores are in plan_items; a per-course calculator on the Courses card, pure arithmetic)
- Boarding passes: each exam as a card with gate (room), departure (time), packed (hours), left; shareable as an image. _build later_ (the OG image script is a start; a share image needs the privacy question answered per card)
- Sound without files: brown noise, rain, a café from Web Audio, starts with the session, pauses on breaks. _build later_ (no assets; testing audio in the browser suite needs a fake AudioContext)
- Push, not polling: "your block starts in 10 minutes" and "you planned 3 h today and it's 6 PM". _build later_ (VAPID keys in Vault, a subscriptions table, a function on the cron; opt-in per device)
- Learn from the drops: which proposals get discarded (morning? over two hours?) and let the allocator weigh that per person. _build later_ (needs a log of discards first; a column on plan_items)
- A command palette: Cmd-K to start a session, add a deadline, jump to a day, draft a plan. _build later_ (keyboard reach exists per screen; the palette is a day's work)
- The runway narrated, spoken: the same sentences through speech synthesis. _build later_ (after the narration lands)
- Android: Tasker or MacroDroid can POST the same JSON the Shortcut does; document the recipe, keep the receiving side. _build later_ (write the guide; nothing to build server-side)
- A kiosk QR: the `#/now` page shows a code to open the same on a phone. _build later_ (after the second screen)
- Exam-day mode: on the morning of an exam the runway shows only the room, the time and "you did N hours", nothing to do. _build later_ (a day's work, mostly design)
- Hours by place: the Shortcut can send a place label; "library mornings tend to go better" is one line in Patterns. _build later_ (signals has `place`; Patterns already groups by it, needs the Shortcut recipe)
- Commute blocks: a short block of flashcards the planner never places but offers when a class ends and another starts across campus. _build later_ (needs locations on classes)
- A gentle re-plan: when a day goes to nothing, the next morning's draft moves the lost hours without a nudge that shames. _build later_ (the "behind" nudge exists; the tone of the redraft is the work)
- Friends' pulse on the runway: "2 friends studying now" as a quiet count, opt-in both ways. _build later_ (classmate_pulse exists; friends need the same function)
- Printable week: one page, the runway as a list, for the fridge. _build later_ (a print stylesheet)
- Offline runway: the plan cached for the focus screen when the connection is gone. _build later_ (sessions work offline; the runway does not yet)
- Course colors from the school: the four palette slots picked by the course department so two people's DSC 140A look the same. _build later_ (cosmetic; needs a department table)

## Needs Aryen

- Runway for the professor: opt-in, aggregated, anonymous ("your class tends to start 4 days before the midterm"); never individuals. _needs Aryen_ (a product decision and an institutional one; he'd need to decide who can ask and what k-anonymity floor, and probably talk to a department first)
- Google Calendar through OAuth instead of a pasted address. _needs Aryen_ (the calendar-scope review he already has on the list)
- Wearable sleep and steps straight from Fitbit or Oura. _needs Aryen_ (OAuth apps at each vendor; the Shortcut path covers Apple Health already)
- Push notifications in production. _needs Aryen_ (he generates the VAPID key pair with `npx web-push generate-vapid-keys` and stores it with `set_app_secret`; the code can be built before that)
- A custom domain so the Google consent screen says Runway. _needs Aryen_ (already on his list)
- Voice notes after a session. _needs Aryen_ (storage bucket and a transcription key; text notes are enough for the spaced questions)
- The extension in the Chrome Web Store. _needs Aryen_ (developer account; the zip is ready)
- A native iOS app with HealthKit and Live Activities. _needs Aryen_ (an Apple developer account; v3)

## No

- A leaderboard, streak shaming, or a "you fell behind" badge. _no_ (gamification that shames; the pitch is the opposite)
- Reading Screen Time, browser history or the full calendar description. _no_ (breaks privacy; Runway reads titles, times and places and says so)
- Analytics, crash reporting or any third-party script. _no_ (no third party sees the data)
- An AI that writes the plan without a confirm step, or that moves accepted blocks on its own. _no_ (the person confirms; the plan is theirs)
- "Because" in any pattern or review sentence. _no_ (correlation is all there is)
- A feed of what classmates are studying right now, by name. _no_ (opt-in counts only; names were never part of the deal)
- Blocking websites during a session from the extension by default. _no_ (their list, their switch, and only when they turn it on; the default stays off, so the feature waits for a clear design)
- Selling anything to a school. _no_ (isn't Runway)
