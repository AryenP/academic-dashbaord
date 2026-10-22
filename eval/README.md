# Classification eval

`eval/classify.json` is a hand-labeled set of calendar events: Aryen's Fall 2026 plan as he wrote it in Google Calendar (titles, times, no descriptions), plus Canvas-style assignments, classes, work, and personal events. Each event carries the expected `kind` and `course`.

Run the title rules alone:

```bash
npm run eval:classify
```

Run the AI too (needs `ANTHROPIC_API_KEY`; the model defaults to `claude-opus-5-5`):

```bash
ANTHROPIC_API_KEY=… npm run eval:classify -- --ai
ANTHROPIC_API_KEY=… npm run eval:classify -- --ai --model claude-haiku-5-5
```

It prints accuracy on kind and on course for each reader, the misses, and what the AI run cost. The rules score includes the context pass (`placeByContext`) over the whole set, the way the sync runs it; an event's optional `calendar` names the feed it came from, and events without one share a feed per `source_kind`. The bar in `docs/v2/SPEC.md` is 95 % on both before a model is the default.

Aryen's plan is in the repo because it is his own and he chose to; nothing in it is private (titles and times of study blocks). Classmates' calendars, if they're ever added, stay out of git.
