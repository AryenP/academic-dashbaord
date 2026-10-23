# Runway on Android

Runway is a web app, so most of it already works on Android: open the site in Chrome, "Add to
Home screen", and the runway, sessions, breaks, the log, stats, courses, classmates and the
second screen (`#/now`) all work, offline sessions included. Two things lean on iPhone Shortcuts
and need another route on Android: phone focus and the nightly signals. This page is the honest
state of that route. Nothing here needs an account of Runway's; it needs an automation app on
the phone.

## What works today, as is

- The site, installed to the home screen (Chrome: menu → Add to Home screen).
- Sessions, breaks and the offline queue.
- The plan feed (Settings → Plan feed) subscribed in Google Calendar, so blocks and exams show on
  the lock screen through the calendar widget.
- The browser extension, in a desktop browser (Android Chrome does not run extensions; Firefox for
  Android runs a short list, and this one is not on it).

## The glance on the lock screen

The `glance` function answers one line of plain text ("Now: MATH 20C Series: lectures 8–10, 30 min
left. Next: COGS 1 at 6 PM. MATH 20C Midterm 1 in 3 days, Sun Oct 25, 5 PM–6 PM, Center Hall 115.")
to a GET with the shortcut token, in the header `x-runway-token` or as `?t=`. Make the token in
Settings under "Sleep and exercise from your iPhone" (the name is the iPhone guide's; the token is
not iPhone-specific).

**Tasker** (one profile, one task):

1. Profile: Time, every 30 minutes between your study hours, or Event → Display On.
2. Task: _HTTP Request_, method GET, URL `https://<project>.supabase.co/functions/v1/glance`,
   headers `x-runway-token:<token>`; then _Notify_ with text `%http_data`.

**MacroDroid**: trigger "Screen on" or "Regular interval"; action "HTTP Request (GET)" with the
same URL and header, save the response to a variable; action "Notification" with that variable.

**Google Assistant / a widget**: the Tasker task can be run from a home-screen shortcut or a
widget, so one tap shows the line.

Add `?format=json` to the address for a structured answer (`now`, `next`, `exam`, `text`), for a
KWGT widget or anything that formats its own text.

## Nightly signals (sleep, exercise, steps)

The `signals` function takes a POST of one summary a day, exactly as the iPhone Shortcut sends it:

```
POST https://<project>.supabase.co/functions/v1/signals
x-runway-token: <token>
content-type: application/json

[{"day":"2026-10-22","kind":"sleep_h","value":7.5},
 {"day":"2026-10-22","kind":"steps","value":8400},
 {"day":"2026-10-22","kind":"exercise_min","value":35}]
```

Kinds: `sleep_h` (0–24), `exercise_min` (0–1440), `steps` (whole, 0–200 000), `place` (with
`label`, no value). The day is the day the night ended. Sending the same day again updates it.

Where the numbers come from on Android:

- **Health Connect** holds sleep, steps and exercise from most watches and phones, but only an
  installed app can read it, not a web page and not Tasker directly. Tasker's "Health Connect"
  plugin (third-party) can read daily totals into variables; MacroDroid has a Health Connect
  trigger/action on recent versions. Either can then run the same _HTTP Request_ as above at
  8 AM. This is the honest route: it works, it is a one-time setup of about fifteen minutes, and it
  depends on a plugin Runway does not control.
- **A wearable's own app** (Fitbit, Garmin, Oura) can't be scripted from the phone. Their cloud
  APIs can, with OAuth apps that Aryen would have to register; that is on the backlog as "needs
  Aryen" and nothing here fakes it.
- **Steps alone** without a plugin: Tasker can read the phone's step counter sensor directly
  (_Sensor_ → Step Counter) and send `steps` at the end of the day.

## Phone focus (the distracting-apps list)

The iPhone route uses Shortcuts automations that fire when a listed app opens or closes and POST
to `phone-event`. Tasker's _App_ context (app opened / closed) does the same on Android, with an
_HTTP Request_ to the same function and body as the iPhone guide shows in Settings → Phone. Set one
profile per listed app, or one profile with the apps listed, with Enter → `open` and Exit → `close`.
Android's own Digital Wellbeing is not readable by apps, so, like on iPhone, Runway sees only the
apps you list.

## What Runway will not do on Android

- Read Health Connect itself (that needs a native app; see the v3 note in `docs/v2/SPEC.md`).
- Read your total screen time.
- Ship a Runway Android app before the iOS one exists; the web app is the product on both.
