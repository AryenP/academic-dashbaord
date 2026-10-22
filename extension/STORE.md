# Chrome Web Store listing

Everything the Developer Dashboard asks for, so a submission is a copy-and-paste job. Build the zip
with `npm run ext:zip` (it lands in `extension/dist/`). Bump `version` in `manifest.json` for each
upload; the store rejects a repeat.

## Store listing

**Name:** Runway for Gradescope and Canvas

**Summary (132 chars max):**
Sends your Gradescope and Canvas deadlines, and whether you've submitted, to your Runway runway.

**Description:**

Runway is a study app for students: connect a calendar, see a runway to every exam, run focus
sessions, let it plan the studying in between. This extension closes the one gap a calendar feed
leaves: whether a thing is actually done.

When you open a Gradescope course page or a Canvas assignments page you are already signed into,
the extension reads the assignment list on that page (names, due dates, submitted or not) and sends
it to your own Runway account, so deadlines on your runway clear themselves when you submit. If you
turn on the switch in the popup, released scores go along too; that is off by default.

What it never does: read any other page, read anything else on those pages, send a password or a
cookie, or run any code it didn't ship with. Everything it sends goes only to your Runway account,
identified by a token you make in Runway's settings and can replace at any time.

You need a Runway account to use it: https://aryenp.github.io/academic-dashbaord/

**Category:** Education · **Language:** English

**Screenshots (1280×800):** the popup with a token saved; a Gradescope course page with the "Sent 8
items" status; the Runway runway with a deadline marked submitted.

**Icon:** `icon-128.png`.

## Privacy practices

**Single purpose:** Send the deadlines and submission status from a student's own Gradescope and
Canvas pages to that student's Runway account.

**Permission justifications**

- `storage`: keeps the Runway token and the "send scores" switch in the browser.
- Host permission `https://www.gradescope.com/*`: read the assignment table on course pages the
  student opens.
- Host permission `https://*.instructure.com/*`: read the assignment list on Canvas assignments
  pages the student opens.
- Host permission `https://uhqurcspebdxtkalbduc.supabase.co/*`: post the items to Runway's own
  server (the student's account).
- Content scripts on the two sites above: that is where the reading happens; the scripts run at
  document idle and only on those URLs.
- No `tabs`, `history`, `cookies`, `webRequest` or remote code.

**Data use disclosure**

- Collects: website content (assignment names, due dates, submission status, and released scores
  only if the user turns that on). Nothing else.
- Purpose: app functionality (the user's own study plan). Not sold, not used for advertising, not
  shared with third parties, not used for creditworthiness or lending, not used for purposes
  unrelated to the single purpose.
- Personally identifiable information: none is read from the page; the token identifies the user's
  Runway account, which they created with their email.
- Data goes to the user's own account on Runway's server. They can delete it, and the account,
  from Runway's settings at any time.

**Privacy policy URL:** https://aryenp.github.io/academic-dashbaord/privacy.html

**Remote code:** No. **Does the extension use any of the following?** None of the listed items.

## Before each upload

1. `npm run test:ext` passes (parsers against saved page fixtures).
2. Bump `manifest.json` → `version`, commit.
3. `npm run ext:zip`, upload `extension/dist/runway-extension-<version>.zip`.
4. Paste the sections above into the listing and privacy tabs; submit for review.
