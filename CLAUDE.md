# DzCalendar — context for Claude Code

A calendar and scheduler written from scratch on Temporal: every event keeps
its own time zone, and days of 23 h, 25 h or 23 h 30 are drawn as they are.
FullCalendar is the reference for **behaviour only** — read `CLEANROOM.md`
before anything else. Sister project: tzslot (`/Users/nadou/Dev/tzslot`),
whose `@tzslot/core` we depend on and whose conventions we follow.

## Where things are

- `ARCHITECTURE.md` — the full plan (packages, modules, signatures, phases).
  The owner's validated decisions sit at its top and win over the rest.
- `ROADMAP.md` — what is done, what is next, spike results. Keep it current.
- `packages/core` — `@dzcalendar/core`: pure Temporal, no DOM, no `Date`.
  Persistent store (`store/`), commands and undo (`commands/`), sources.
- `conformance/` — language-independent JSON cases, run by vitest; the future
  Swift/Kotlin ports read the same files.
  Tests run in `node`, not jsdom. `test/purity.test.ts` enforces it.
- Temporal comes **only** from `@tzslot/core/lazy` (re-exported by `core/src/temporal.ts`
  with `loadTemporal`), never its default entry (it installs the polyfill for
  everyone). One polyfill, one set of classes for apps using both libraries.
  No module reads Temporal as it is imported (Safari loads it after):
  `npm run check:entries` checks it — the suites preload it (`test/temporal-setup.ts`).
- `packages/dom` — `createCalendar`; views render from the kernel's model,
  keyed by date and segment key. `packages/theme` — one family with
  `@tzslot/theme` (same `--tz-*` palette). `packages/motion-gsap` — optional.
- `playground/` — `index.html`, `dst.html` (four zones, one store).
- Later phases add `angular`, `rrule`, `ical`, `slots`, `pro` (everything MIT
  for now — owner's decision).

## Commands

```bash
npm test               # vitest; core in node
npm run test:ci        # one worker — catches state shared between files
npm run typecheck      # core (lib ES2023, no DOM) then the tests
npm run build          # packages/*/dist, refuses a manifest pointing at src/
npm run spike          # Phase 0 polyfill questions, results in ROADMAP.md
npm run bench          # budgets (perf/budgets.json) on a MINIFIED bundle — exits 1 over budget
npm start              # playground on http://localhost:4600 (tzslot's is 4500) — often already running; don't kill it
npm run build:theme    # after editing packages/theme/dzcalendar.scss (a test fails if the CSS drifts)
npm run size           # gzip per package against size-budget.json
npm run test:browser   # layout checks in system Chrome on its own Vite server (port 4611)
npm run perf:browser   # first render, nodes, one update per view, U and W, minified, in Chrome (budgets: perf/browser-budgets.json)
npm run pack:local     # tarballs into packed/
npm run test:package   # a fresh Angular app from the tarballs, ng build on 19, 20, 21, 22 (network)
```

## Working rules

- **Validate structural decisions with the owner before coding.** Talk to the
  owner in French.
- Every phase ends with the architect agent checking it against
  `ARCHITECTURE.md` and a code review; findings are fixed before the phase is
  called done. GSAP (via the optional `motion-gsap` adapter, never in core or
  as a hard dependency of dom) wherever motion makes the product feel premium,
  always behind `prefers-reduced-motion`.
- Test expectations are written by hand from published zone rules, never
  copied from the implementation's output. Zones in use: Paris, Chicago,
  Lord Howe, São Paulo 2018, Havana, Apia 2011, Kolkata, Dublin, UTC.
- Bad input never throws: it becomes a `Problem` (code + detail; sentences
  belong to the DOM layer's translated messages). Every guess is a warning.
- Verify before saying done; measure sizes and timings rather than assert them.
  jsdom checks behaviour, never layout: look at the playground in real Chrome
  (`playwright-core`, `channel: 'chrome'`) — Phase 3's worst bug (the gutter
  on the right) passed every jsdom test. Clip full-page screenshots rather
  than taking element screenshots.
- Never measure performance or memory on unminified code: the Temporal
  polyfill adds a debug string to every object unless minified. Use `npm run bench`.
- `toEqual` cannot compare Temporal objects (internal slots: different
  instants compare equal). Compare `.toString()`.
- `conformance/cases` expectations are written by hand, never generated from
  our code. One exception: `rrule-expand` cases come from python-dateutil, an
  independent implementation (`scripts/conformance-crosscheck.py`).
- `Intl.DateTimeFormat#format` does not accept Temporal objects under the
  polyfill (spike 2): format with `toLocaleString` or epoch ms + `timeZone`.
