# Runway v2 — brainstorm

_2026-10-21 · from Runway v1 (single-user, live at aryenp.github.io/academic-dashbaord) to an app anyone can sign up for._

## The idea in one line

Sign up, connect your calendar, and Runway reads it: it finds your courses, classes, exams and deadlines, builds a study plan toward each exam, then runs your sessions and tells you how ready you are.

v1 proved the loop for one person: **plan → session → verified focus → exam readiness**. v2 makes the first step automatic. Today the plan only exists because Aryen hand-writes 📚 study blocks in Google Calendar. For anyone else, the AI has to do that part.

## The flow

```
Landing ──▶ Sign up ──▶ Connect calendar ──▶ AI reads it ──▶ You confirm ──▶ AI drafts plan ──▶ Your runway
 (demo runway)  (Google or      (iCal link, Canvas,     ("4 courses,       (fix anything      (study blocks      (sessions, focus,
                 email link)     .ics, syllabus PDF)     3 midterms")       it got wrong)      before each exam)   readiness)
```

### 1. Landing page (public)
- The hero **is** the product: a live runway with demo data (made-up courses), counting down to exams. It's the one orchestrated animation on the page.
- One promise: "Connect your calendar. See your runway to every exam in a minute."
- A CTA, then three short proof sections: how readiness works, phone-verified focus, a privacy line. No pricing at first.
- This also fixes v1's privacy problem: visitors see a demo, never a real schedule.

### 2. Sign up
- **Continue with Google** (Supabase Auth, identity scopes only: openid and email, which need no Google review) and **email magic link**.
- No calendar permission at sign-up. Ask for it only on the connect step, where the reason is obvious.

### 3. Connect a calendar — routes, best first
| Route | What you get | Friction | Status |
|---|---|---|---|
| **Secret iCal address** (Google, iCloud, Outlook) | Everything on that calendar | Finding the address (a guide with screenshots helps) | Works today, no review |
| **Canvas calendar feed** | Every assignment and due date, all courses ([Canvas guide](https://community.canvaslms.com/t5/Student-Guide/How-do-I-view-the-Calendar-iCal-feed-to-subscribe-to-an-external/ta-p/331)) | Copy one link from Canvas → Calendar → Calendar Feed | Works today; the student unlock |
| **Upload a syllabus (PDF)** | Exam dates, weights, topics: what calendars don't have | One upload per course | AI reads the PDF directly |
| **Upload .ics** | A one-time snapshot | Doesn't stay in sync | Fallback |
| **Google Calendar sign-in (OAuth)** | Best UX, live sync, could write the plan back | Calendar scopes need Google's app verification. Reports say reviews can stall for weeks and unverified apps are capped around 100 users. ([Google: sensitive scopes](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification), [community report](https://security.googlecloudcommunity.com/cloud-security-foundation-7/oauth-app-verification-stuck-under-review-7-weeks-blocking-calendar-scope-for-production-users-8286)) | Phase 4, after verification |

Feed URLs are secrets (anyone holding one can read the calendar), so they're stored encrypted and never sent to the browser after saving.

### 3b. Schoolwork: Canvas and Gradescope, and tracking what's submitted

What students can actually get at, checked 2026-10-21:

| Source | Students can get | Not available to an app like this | What others do |
|---|---|---|---|
| **Canvas calendar feed** | Yes: every student has one (Calendar → "Calendar Feed"). It covers events and assignments across all enrolled courses, up to 366 days ahead and 30 days back, max 1,000 items. ([Canvas guide](https://community.canvaslms.com/t5/Student-Guide/How-do-I-view-the-Calendar-iCal-feed-to-subscribe-to-an-external/ta-p/331)) | **Submission status and grades are not in the feed.** New courses appear only after the feed refreshes | Subscribe the feed in Google Calendar |
| **Canvas API** | Students can sometimes make a personal access token, but **many schools block it**. Canvas added an admin switch for exactly that, and Instructure's API policy says multi-user apps must not ask users for personal tokens: proper access is OAuth with a developer key that **each school's admin** has to enable. ([Canvas community](https://community.canvaslms.com/t5/Canvas-Question-Forum/Student-use-of-API/m-p/646466), [example school policy](https://tdx.umsystem.edu/TDClient/66/MOOnline/KB/ArticleDet?ID=2193)) | No self-serve path for a student app across schools | Per-school partnerships, or browser extensions like Tasks for Canvas |
| **Gradescope** | **No official student API.** An unofficial library ([nyuoss/gradescope-api](https://github-redirect.dependabot.com/nyuoss/gradescope-api)) logs in with your Gradescope password and reads pages. That would mean storing student passwords, and it doesn't work with school single sign-on | Any server-side integration | Browser extensions that read Gradescope pages while you're logged in, e.g. [Gradescope to Cal](https://chromewebstore.google.com/detail/bbepekfgnpdfclkpfoojmfclnbkkbbco) (background check every 30 min) and [GradeWork Sync](https://chromewebstore.google.com/detail/nlkockhdponghjcfipemdpkiiipjlfdd); both small, a few hundred users |

**What this means for Runway:**

1. **Start with the Canvas feed.** It's free, works at every school, and often includes Gradescope deadlines too, because many instructors link Gradescope assignments into Canvas. Runway can de-duplicate the same assignment showing up twice.
2. **A Runway browser extension covers Gradescope and submission status.** It reads the course and assignment pages *you're already logged into* (Gradescope and Canvas): due dates, "Submitted / No submission", and scores when released. It sends them to Runway with your account token. No passwords stored, works with school sign-in, and the browser checks every so often in the background. Same approach as the existing extensions, but feeding the runway instead of a calendar.
3. **Without the extension, three fallbacks:**
   - **Paste or screenshot:** copy the Gradescope dashboard (or take a screenshot), drop it into Runway, and the AI pulls out assignments and due dates. One minute, any school, no install.
   - **Tick it off:** each deadline on the runway has a "Submitted" checkbox, and the phone Shortcut can mark one done too.
   - **Auto-done as a guess:** if a "work on" study block passed and the deadline passed, ask once: "Did you submit HW 2?"
4. **Later, per school:** if a school's Canvas admin enables a Runway developer key, use real Canvas OAuth for that school, with submissions and grades. That's a partnership conversation, not a launch requirement.

**What tracking gives you:** deadlines turn green when submitted and red when missed. The weekly review counts on-time vs late. Readiness can weigh "homework done" for the exam's topics. Grades, once released, can feed "how did the prep go" (optional, private).

### 3c. Setup that doesn't feel like homework

Every source gets a short, friendly guide inside the connect step, never a wall of text:

- **Find your school from your email** (`@ucsd.edu` → your school's Canvas address) and link straight to its Calendar page, so the student only clicks "Calendar Feed" and copies.
- **One screen per source:** three numbered steps, a short looping clip or annotated screenshot per step (drawn diagrams like v1's iPhone guide, kept up to date when Canvas changes its UI), a paste box that checks the link right away ("Found 4 courses and 37 assignments ✓"), and a "this didn't work" path that explains the common mistakes. For Google, that's copying the public address instead of the secret one, or getting it cut off with "…", exactly what happened to Aryen.
- **Platform-specific:** iPhone vs Android vs laptop instructions where steps differ (Google Calendar's secret address is only on the web, not the phone app; say so up front).
- **Skip-able and come-back-able:** connect one source now, add the rest from Settings later. Show a "You're 2 of 3 connected" nudge, not a blocker.
- **Extension install** is one click from the Chrome / Firefox store, with a 20-second clip of what it does and what it can't see.

### 4. The AI reads the calendar
- **Classify every event:** class meeting · exam · deadline · study block · office hours · personal (ignored). This generalizes v1's title rules (`📚` = study, "midterm" = exam), which only work for Aryen.
- **Extract courses:** "DSC 140A Lecture", "dsc140a hw", "Midterm 1 (140A)" all become one course. Assign course colors.
- **Exams:** date, place, weight (from the syllabus if uploaded), and whether it's take-home.
- **Shown as it works:** "Found 4 courses · 3 midterms · 11 deadlines", with chips filling in as they arrive.
- **Cost control:** classify only new or changed events (hash each one), cache results, and use structured outputs so the answer always fits the schema.

### 5. You confirm (human in the loop)
- A review screen, one card per course: classes, exams and deadlines, each editable. "Not a course" removes one. Unsure items are flagged for a decision.
- Nothing becomes a plan until you confirm. This is where trust gets built, and it's the eval data for improving the AI.

### 6. The AI drafts a study plan
- Inputs: exams (date, weight), how much you've already studied (v1's readiness data), free time between classes, and your settings (hours a day, no studying after 11 PM, preferred block length).
- Output: study blocks before each exam, sized by weight and time left, not overlapping anything, with a short reason per block ("3 h for 140A: 25 % of the grade, 6 days out").
- **Getting it into your calendar without write permission:** Runway publishes its own iCal feed of your plan, and you subscribe to it once. Writing straight to Google Calendar waits for OAuth (Phase 4).
- **Re-plans** when you fall behind: "You're 4 h behind on 140A. Move Thursday's 151A block?" One tap accepts.

### 7. The daily loop (v1, now per user)
Sessions, breaks, log, stats, weekly review and phone focus all carry over. New: an AI-written weekly review in plain words (what went to plan, what didn't, one change for next week).

## What changes under the hood

| Area | v1 | v2 |
|---|---|---|
| Users | One owner (`is_owner`), visitors | Everyone has their own data. Optional public share page (`/u/<handle>`), off by default |
| Plan data | `public/data.json`, committed to a public repo | Tables per user (`calendar_sources`, `events`, `courses`, `exams`, `plan_blocks`), all under RLS. `data.json` and the GitHub sync are retired |
| Calendar sync | GitHub Action every 15 min, one feed | Supabase Edge Function on `pg_cron`, per source, with backoff. Only changed events go to the AI |
| AI | none | Edge Functions call the Claude API server-side; the key never reaches the browser |
| Secrets | Repo secret | Supabase Vault (encrypted columns) for feed URLs |
| Phone focus | Per-user tokens already | Works as-is |
| Spotify | Remote control (PKCE) | **Development Mode allows at most 5 users** ([TechCrunch](https://techcrunch.com/2026/02/06/spotify-changes-developer-mode-api-to-require-premium-accounts-limits-test-users/)), and extended quota needs a registered business with 250k MAU. So the playlist embed is the default for everyone; remote control stays a beta for 5 allowlisted accounts |
| Hosting | GitHub Pages SPA | The SPA can stay on Pages. The landing page wants real HTML for search and link previews: prerender it, or move hosting. Decide in the new chat |

## AI choices

- **Model:** default to **Claude Opus 5.5** (`claude-opus-5-5`, $4 / $20 per million tokens) for classification and planning, with structured outputs (`output_config.format`).
- **Cheaper option, your call:** classification is high-volume and simple. **Claude Haiku 5.5** (`claude-haiku-5-5`, $0.10 / $0.50) may be good enough, but switch only once an eval shows it holds quality.
- **Build the eval first:** Aryen's real Fall 2026 calendar, hand-labeled, with a few classmates' calendars if they're willing. Score classification accuracy and course grouping before choosing a model.
- **Prompt caching:** a long, stable system prompt (the rules plus examples), cached; each user's events go after the cache breakpoint.
- **Syllabus PDFs:** sent as document input. Ask for exam dates and weights with citations, so the review screen can show where each one came from.
- **Batches API** (50 % cheaper) for nightly re-analysis that isn't urgent.

Rough cost per student per term: one first-time classification of a few hundred events, small daily diffs, a few plan drafts and weekly reviews. Measure it before promising a free tier.

## Design direction

- **Keep the identity:** the departure-board runway, Big Shoulders Display for numbers, course colors, red hatched exams, one calm number on the focus screen. It's what makes Runway not look like every other SaaS.
- The UI/UX Pro Max skill's automatic pick (a webinar-signup layout, teal and orange, Plus Jakarta Sans) is generic, and v2 should **not** adopt it. Its UX rules still apply: 44 px touch targets, 16 px body text on phones, skeleton loading, `prefers-reduced-motion`, SVG icons (never emoji), 4.5:1 contrast, no complex onboarding.
- **Onboarding:** at most three screens before the first runway shows (connect → review → runway). Everything else (break mode, phone, music) is asked later, in context.
- **Empty states always have a next action:** "No exams found. Upload a syllabus, or add one by hand."
- **Skills for the build:** Anthropic's official **frontend-design** skill (anthropics/skills; the most-installed design skill), plus **UI/UX Pro Max** (already installed), plus Playwright for screenshots. Check repo names and current versions on GitHub before installing. Star counts in roundups vary and some pages look machine-written ([roundup](https://www.claudemarket.ai/skills/best-ui-ux-skills)).

## Privacy and trust (an app, not a portfolio page)

- Calendars are personal. Write a short privacy page in plain words: what's read, what the AI sees, what's stored, how to delete everything (account delete cascades).
- Send the AI only what it needs: event titles, times and locations. Never attendee emails or descriptions unless they matter (syllabi do).
- **Check the Anthropic API's data terms before launch.** The privacy page must not promise anything the terms don't.
- Encrypt feed URLs; RLS on every table; per-user rate limits on AI calls; a monthly AI budget with a hard stop.

## Phases

| Phase | Ships | Done when |
|---|---|---|
| **0 · Multi-user foundation** | Per-user schema and RLS; retire `data.json`; landing page with a demo runway; sign-up | Two test accounts can't see each other's anything; logged out shows only the demo |
| **1 · Connect and sync** | iCal and Canvas feeds, .ics upload, Vault-stored URLs, cron sync, friendly setup guides, de-duplication across sources | Aryen's real calendar and Canvas sync into his account; a classmate connects Canvas in under 2 minutes from the guide alone |
| **2 · AI reads it** | Classification and course grouping, review screen, eval set | ≥ 95 % correct on the labeled set, and the review screen fixes the rest |
| **3 · AI plans it** | Plan drafts, re-plans, the plan as a subscribable iCal feed; "Submitted" tracking with manual tick-off and paste/screenshot import | A student with no study blocks gets a sensible plan in under a minute |
| **3b · Browser extension** | Chrome/Firefox extension that reads Gradescope and Canvas pages you're logged into (deadlines, submission status, scores) and sends them to Runway | Gradescope deadlines and submissions show on the runway without typing anything |
| **4 · Grow** | Google OAuth (after verification), syllabus PDFs, AI weekly review, share pages | Five classmates use it for a full exam cycle |

## Decisions for Aryen (first thing in the new chat)

1. **Name:** keep "Runway"?
2. **Who first:** UCSD students (Canvas is UCSD's LMS), or any student?
3. **Your own schedule:** private in v2? (Recommended. The public portfolio becomes the demo landing page.)
4. **AI model for classification:** Opus 5.5 everywhere, or test Haiku 5.5 against the eval?
5. **Landing page stack:** prerender inside the Vite app, or a separate static landing page?
6. **Google sign-in for calendar:** start Google's verification now (it takes time), or wait until people ask?
7. **Money:** free while small, with a per-user AI budget? Or a paid tier later?
8. **Gradescope and submissions:** build the browser extension (best coverage, more work, a store review), or start with paste/screenshot import and manual tick-off?
9. **Grades:** track scores when they're released (private), or stay out of grades entirely?
