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
  Tests run in `node`, not jsdom. `test/purity.test.ts` enforces it.
- Temporal comes **only** from `@tzslot/core` (re-exported by `core/src/temporal.ts`).
  One polyfill, one set of classes for apps using both libraries.
- Later phases add `dom`, `angular`, `theme`, `rrule`, `ical`, `slots`,
  `motion-gsap`, `pro` (everything MIT for now — owner's decision).

## Commands

```bash
npm test               # vitest; core in node
npm run test:ci        # one worker — catches state shared between files
npm run typecheck      # core (lib ES2023, no DOM) then the tests
npm run build          # packages/*/dist, refuses a manifest pointing at src/
npm run spike          # Phase 0 polyfill questions, results in ROADMAP.md
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
  jsdom checks behaviour, never layout.
- `Intl.DateTimeFormat#format` does not accept Temporal objects under the
  polyfill (spike 2): format with `toLocaleString` or epoch ms + `timeZone`.
