# Roadmap

Phases and acceptance criteria: `ARCHITECTURE.md`, section J.

## Resume here (if a session is lost)

- **Done:** Phases 0–18 (18a–18d), each committed (`git log --oneline`:
  the last is titled "Phase 18d"). Every check green at that commit: `npm
  test` (1 315), `npm run test:ci`, `typecheck`, `build`, `size`, `bench`,
  `test:browser`, `perf:browser`, `test:package` (Angular 19–22, `ng add`,
  `dz-migrate`, React 18/19, Vue 3.4/3.5); `gen:schema --check`,
  `gen:llms --check`. `bench:public` measured (docs/benchmark.md).
- **Done:** Phase 18e (Sehhaty's feedback) committed ("Phase 18e"); every
  check green (1 344 tests, typecheck, build, size, test:browser,
  test:package) but the known noise (`normalize+index 10k`).
- **Done:** Phase 18f-1 (render hooks on every element) committed ("Phase
  18f-1"); every check green (1 375 tests, test:ci, typecheck, build, size,
  test:browser, test:package) but the known noise (`normalize+index 10k`
  73 ms against 70, `timeGridWeek:U` 28 ms against 27 — both as at HEAD).
- **Done:** Phase 18f-1b (the header's layout and buttons) committed
  ("Phase 18f-1b"); every check green (1 391 tests, test:ci, typecheck,
  build, size, test:browser, perf:browser, test:package) but the known
  noise (`normalize+index 10k`).
- **Done:** Phase 18f-2 (templates in every framework, the header's places)
  committed ("Phase 18f-2"); every check green (1 410 tests, test:ci,
  typecheck, build, size, bench, test:browser, perf:browser,
  test:package).
- **Done:** Phase 18f-3 (formats, custom views with `visibleRange`)
  committed ("Phase 18f-3"); every check green (1 439 tests, test:ci,
  typecheck, build, size, test:browser, perf:browser, test:package) but the
  known noise (`normalize+index 10k`).
- **Done:** Phase 18f-4 (dragging in from the page, between calendars)
  committed ("Phase 18f-4") — **Phase 18f is complete**. Every check green
  (1 455 tests, test:ci, typecheck, build, size, test:browser,
  perf:browser, test:package) but the known noise (`normalize+index 10k`).
  **Phase 18g, the CSS and accessibility pass** (owner, 2026-10-22, before
  first render and size) — see "Phase 18g" below; then first render and
  size, npm publication, licences, Phase 19.
- **Done:** 18g-1 (the styling contract) committed ("Phase 18g-1"); every
  check green (1 465 tests, exit codes checked) but the known noise.
- **Done:** 18g-2 (unstyled mode, the Tailwind 4 bridge) committed
  ("Phase 18g-2"); every check green, exit codes read.
- **Done:** 18g-3 (the visual pass) committed ("Phase 18g-3"); every
  check green, exit codes read; before/after screenshots published for the
  owner (`playground/gallery.html` makes them again).
- **Done:** 18g-4 (WCAG 2.2 AA) committed ("Phase 18g-4") — **Phase 18g
  is complete**. Every check green, exit codes read (1 473 tests, 267
  Chrome checks).
- **Done:** 18h (first render) committed ("Phase 18h"): ahead of
  FullCalendar 7 in every first render (46 / 45 / 40 ms against 63 / 74 /
  53, month / week / list, docs/benchmark.md). **In progress:** 18j (the
  documentation site: the skeleton built in `website/`, not committed yet).
- **Done:** 18k (Sehhaty's production report) committed ("Phase 18k").
  **18i owner's decisions (2026-10-23):** the recurrence (rrule) becomes an
  entry imported only by those who use it (`@dzcalendar/core/recurrence`;
  without it an event with `rrule` is a clear Problem); `timeGrid` and
  `dayGrid` become entries like `list` and `multimonth`; the interactions
  and the French catalogue stay built in. The benchmark now builds
  DzCalendar from its dists (−3.1 kB gzip, measured).
  **In progress: 18i (size).** 18i-1 committed ("Phase 18i-1"; budgets, owner: dom/base 39 339, core/recurrence 15 730; `npm run check:entries` keeps ical's recurrence under Rollup; a calendar with no view asked takes the first one imported; a missing recurrence import is said once on the console; seen, older than 18i: a redo of `event.repeat` fails): the recurrence an
  entry (`@dzcalendar/core/recurrence`, the engine plugged into a registry;
  ical, the compat, the Pro editor and `<dz-calendar>` bring it), `@dzcalendar/dom/base`
  with `/timegrid` and `/daygrid` (`@dzcalendar/dom` unchanged), the
  benchmark built from the dists: the benchmark's DZ bundle 139.4 → 126.8 kB
  gzip (JS). 18i-2 waits for tzslot 2.3.0 on npm: `@tzslot/core/lazy`
  (`loadTemporal()`, built and committed by tzslot at 35ebaa4, 795 B first load,
  the polyfill's 24.5 kB fetched only without native Temporal — no stable
  Safari has it, so about three visitors in four skip it); not to be pinned
  before it is published. 18j
  (the documentation site, `website/`, preview `cd website && npm run
  build && npm run preview` → http://127.0.0.1:4701/dzcalendar/) still to
  review and commit; then npm publication, licences, Phase 19.
- **Sehhaty's second pass done (2026-10-20):** the five workarounds removed,
  compat problems 105 → 2 (`height`, `expandRows`: CSS, on purpose), no
  `zone-guessed` left, revert on a server 409 checked on both engines, 154
  events shown in the month instead of 18 + "+N", `eventStyle: 'solid'`
  adopted — "no functional gap left against FullCalendar" for that screen.
  Two doc lines added (`props` vs `extendedProps`; Angular's caches after a
  tarball change). Seen, left: the default day heads' case comes from `Intl`
  (lower case where theirs wrote "LUN. 19/10").
- **After 18g:** first render (indexing every event at creation) and size
  (the polyfill loaded only where Temporal is missing, K.2) — where
  FullCalendar 7 is ahead; then npm publication, licences; then Phase 19.
- **Then, from the benchmark:** first render (the kernel reads and indexes
  every event at creation: 80 % of a 10 000-event month's first render) and
  size (122 kB against FullCalendar 7's 95 kB) — the two numbers where
  FullCalendar 7 is ahead.
- **Remote:** `git@github.com:plinthworks/dzcalendar.git` (push `main` by
  that URL; the owner authorised pushing on 2026-10-18).
- **Left after it:** 19+ native (Swift/Kotlin from
  `conformance/`, then SwiftUI/Compose).
- **How a phase is run** (owner's rule): decisions validated with the owner
  (in French) before coding → implement → two reviews in parallel
  (`feature-dev:code-architect` against `ARCHITECTURE.md`,
  `pr-review-toolkit:code-reviewer` by execution, Chrome included) → fix
  their findings → every check above → this file (phase section, review
  fixes, "Not done on purpose") and an `ARCHITECTURE.md` block
  « Ajustements après la Phase N » (newest first, near its top) → commit →
  report to the owner in French.
- **Standing rules:** never kill the playground on port 4600; GSAP only in
  `motion-gsap`; measure performance only minified; budgets are measured
  + 3 % when a phase grows a package (owner's rule); test expectations by
  hand; `.claude/` stays out of commits.
- **First user:** Sehhaty (a Saudi health app: appointments, Arabic, Hijri),
  but DzCalendar is a generic library for any project.

## Phase 0 — scaffold, spikes, model ✅ (2026-10-16)

- npm workspaces, strict tsconfig (core: `lib: ES2023`, no DOM), vitest
  projects (core in `node`), `scripts/build.mjs` (tzslot's shape; refuses a
  manifest pointing at `src/`, pins `@tzslot/core ^2.1.0`).
- `@dzcalendar/core`: `temporal`, `ids`, `intervals`, `zone`
  (`dayInfo`, `dayInfos`, `transitionsBetween`, `resolveWall`),
  `event/{types,problems,parse-temporal,defaults,normalize}`.
- `purity.test.ts`: no `Date`, no global Temporal, no direct polyfill import,
  no DOM — checked to fail on a planted `new Date()`.
- `CLAUDE.md`, `CLEANROOM.md`, `docs/behaviors/`.

### Spike results (`npm run spike`, node 24.21, no native Temporal → temporal-polyfill 1.0.6 /full)

1. **`ZonedDateTime#getTimeZoneTransition`** exists in the polyfill (and in
   native implementations). Returns `null` in UTC. → No bisection fallback;
   `zone.ts` asks Temporal directly.
2. **Formatting.** `Intl.DateTimeFormat#format(PlainDate | ZonedDateTime)`
   **throws** under the polyfill ("Cannot use valueOf") — the polyfill does not
   patch the global `Intl`. `zdt.toLocaleString(locale, opts)` and
   `DTF.format(epochMs)` with `timeZone` work, including
   `ar-SA-u-ca-islamic-umalqura`. → `format/` (Phase 2) formats through those
   two routes only. To recheck against native Temporal in Chrome.
3. **`Intl.Locale#getTextInfo()`** and the `textInfo` getter both exist
   (`{direction: 'rtl'}` for `ar`). → RTL detection keeps tzslot's
   method-or-getter fallback.
4. **Missing midnight.** `PlainDate#toZonedDateTime` gives 01:00 for
   São Paulo 2018-11-04 and Havana 2023-03-12 (the day starts at its
   transition), and **Apia 2011-12-30 maps to 2011-12-31T00:00** — a day of
   length zero. → `dayInfo` reports it with `lengthMinutes: 0`, `irregular`,
   and owns the transition that erased it.

### Deviations from ARCHITECTURE.md, on purpose

- `ProblemCode` has `invalid-id` and `unsupported-recurrence` (an event with
  `rrule`/`exdate`/`rdate` is rejected until Phase 5 rather than shown as one
  wrong occurrence). `invalid-rrule`, `invalid-exdate`, `too-many-occurrences`
  arrive with Phase 5 — no code is declared before something emits it.
- `Normalized` is `{ kind: 'event' }` only; `{ kind: 'series' }` joins in Phase 5.
- Constraint/overlap/allow fields join `EventInput` in Phase 4/6 with the rules.
- `conformance/` starts in Phase 1 as planned; Phase 0 cases are vitest tests.

### Review (architect + code review), fixed before closing Phase 0

Both reports were checked by running each scenario before fixing.

- A date and time joined by a **space** (`2026-03-29 09:00`, which Temporal
  accepts) was read as an all-day date, and a calendar annotation containing a
  `t` (`[u-ca=iso8601]`) turned a date into a time. Detection now looks only at
  the text before the annotations, for `T`, `t` or a space.
- **No exception escapes normalization**: a `null` row, a non-array
  `resourceIds`, a duration past the end of time all become problems
  (`invalid-event`, `invalid-duration`). JSON `null` means absent. A bad
  context (`displayZone`) throws once — it is the programmer's error.
- An all-day event read from an **instant** now goes through the same zone
  rules as a timed one (`offset-only`, `strictZones`).
- **Historical offsets with seconds** (Paris 1911, +00:09:21) made `dayInfo`
  throw; deltas and lengths are no longer rounded to the minute.
- A transition belongs to **exactly one day**, the one whose `[start, end)`
  holds it. Apia's 30 December 2011 is `kind: 'skipped'` with no transition;
  the 31st carries the jump.
- `preferOffset` compares offsets as numbers (`+01:00` = `+0100` = `+01`) and
  reports `offsetMatched`.
- The model is kept in the **ISO calendar** whatever the input says; the
  reader's calendar is a formatting matter.
- `TimedEvent.zoneGuessed` marks events placed in the display zone by
  default, so a later `setTimeZone` can move them and only them.
- `dayInfos` asks the zone for its transitions once per range, not per day.
- **`toEqual` cannot compare Temporal objects** (state in internal slots: two
  different instants compare equal). Tests compare strings. Worth checking in
  tzslot's tests too.
- Build: `fileURLToPath`, entry-point-only `src/` check, `@tzslot/core` range
  required; `tsconfig.spec.json` excludes `dist/`.

### Found upstream, for tzslot (not changed from here)

- **`@tzslot/core` 2.1.0 as published on npm imports `temporal-polyfill`, not
  `temporal-polyfill/full`** (`node_modules/@tzslot/core/temporal.js:18`),
  while the tzslot repository's source already says `/full`. Until a release
  carries it, non-ISO calendars (`[u-ca=buddhist]`, Hijri) fail to parse here:
  rejected as `invalid-start`, never mis-read.
- **`@tzslot/dom` 2.2.0's date fields carry `aria-haspopup` on a textbox**
  (axe `aria-allowed-attr`, Phase 16a): the editor's browser check leaves
  `.tz-dtr` out (`axeViolations(p, '.dz-editor', '.tz-dtr')`) and checks the
  rest of the dialog in full. Also: its words exist in English, French and
  Arabic only; `createDateTimeRange` injects its styles only once connected
  (the editor mounts its dialog hidden first).

### Other deviations, accepted

- `EventInput.start` is optional in the type (to report `missing-start`);
  `rrule` is `unknown` until Phase 5; `NormalizeContext` defaults are optional.
- `ref`, `SeriesId`, `RecurrenceKey` arrive with Phase 5.
- Theme, playground, `vite.config.ts`, `size-budget.json`, CHANGELOG move to
  Phase 3, with the first view — there is nothing to style or show before.

### Carried into Phase 1 (decided now, built with the store)

- **`revision` belongs to the store**: assigned on insert, +1 on each real
  change, object identity kept when content is equal (`store/diff.ts`,
  `eventEquals`). Normalization's 0 means "not yet assigned".
- **Deterministic ids** for source events that have none (derived from
  source, start, end, title, rank among identical ones), so a refetch does not
  remove and re-add everything; collisions with user ids detected in the store;
  cross-chunk duplicates resolved by `replaceSourceChunk`.
- Event memory (≤ 1.2 kB): shared frozen empty arrays/props, interned `perms`,
  one object shape; measure `normalizeMany` on 10 000 events.
- `epochDay(date)` helper for day indexes.

### Carried into Phase 2

- In `wall` axis mode, a timed event is **cut at each `repeat` transition**
  (02:50 first pass → 02:10 second pass has wall end < wall start); a
  `skipped` day yields no segment and a folded column.

## Phase 1 — store, index, conformance ✅ (2026-10-16)

- `store/avl.ts`: one persistent AVL (path copying) carrying each subtree's
  largest end; `PersistentOrderedMap` and `PersistentIntervalTree` on top.
  Property-tested against a plain Map and a linear scan.
- `store/store.ts`: immutable `StoreSnapshot` (events, timed index on epoch
  ms, all-day index on epoch days, one index pair per resource, source chunk
  bookkeeping), `queryInstances` with a stable order, `createEventStore` with
  `apply` (one transaction, one notification, no-op batches silent) and
  `replaceSourceChunk` (an event in two chunks goes when both drop it; a
  source cannot overwrite an event it does not own).
- `store/diff.ts`: `eventEquals`, `stamp` — **the store owns `revision`**:
  equal content keeps the same object, a change takes the next revision.
- **Deterministic ids** for source events without one (`api:<fnv1a>`, rank
  among identical events): a refetch is a no-op, not remove-all/add-all.
- `commands/`: `event.create|update|delete|batch`, pure `applyCommand`
  (all or nothing), `createHistory` (inverse mutations, `mergeKey`,
  `transaction`, entries overtaken by a source refresh are dropped).
- `source/`: `EventSourceSpec`, `arraySource`, `loadStaticSource`.
- `conformance/`: 32 hand-written cases (`zone-dayinfo`, `zone-resolve`,
  `normalize`), schema, runner.
- `epochDay` / `fromEpochDay`; shared frozen empties and interned `perms`.

### Measured (`npm run bench`: minified bundle, median, node 24, polyfill)

| Budget (G.2) | Measured | Budget |
|---|---|---|
| normalize + index 10 000 | 61–67 ms | ≤ 70 ms — **thin margin** |
| index 10 000 | ~15 ms | ≤ 70 ms |
| query 5 weeks of 10 000 | ~0.6 ms | ≤ 2 ms |
| apply one update | ~0.01 ms | ≤ 2 ms |
| delete 2 238 (FC#4906: ~1.1 s) | ~3.9 ms | ≤ 50 ms |
| bytes per stored event | ~893 | ≤ 1 200 |

Lessons:
- **The polyfill attaches a debug string to every Temporal object unless it
  is minified** (`attachDebugString`, enabled while `noop.name === 'noop'`):
  in an unminified build half the time and a third of the memory went there.
  Budgets are therefore measured on a minified bundle (what ships); vitest
  runs do not assert timings.
- A wall time can only be skipped or repeated near a transition:
  `isQuietDay` (cached per zone and day) lets ordinary days take one parse.
- Normalization is now near Temporal's own floor (~3.8 µs of 4.5 µs per
  event is parsing and arithmetic in the polyfill); native Temporal will move it.

### Architect review, fixed before closing Phase 1

- **Revisions are the snapshot version that wrote them** — a per-event
  counter reused `(id, 2)` for two contents after an undo, and restarted at 1
  after an eviction. The store stamps (not callers) and reports `applied`.
- `eventEquals` compares nested `extendedProps` structurally: a refetch of
  JSON-parsed props is now a no-op. A drift test fails if a `CalEvent` field
  is left out. Times compared with `equals`, not strings (refetch 128 → 94 ms).
- `replaceSourceChunk` used `Array#includes` per item (quadratic): a `Set`.
- Deterministic ids: 53-bit hash (was 32).
- `event.update`: a start without an end keeps the length; a zoneless time is
  read in the event's zone.
- History: purges entries as soon as another writer changes their events
  (`onDropped`), compacts merged drags, checks before discarding.
- `EventInstance.origin` widened now; `FetchRequest.window: null` for
  unchunked sources instead of a lie in the types.

### Code review (verified by execution), fixed before closing Phase 1

- A source refresh **deleted a user event** that had taken over the id of a
  deleted source event: a chunk now removes only what its source still owns,
  and a refused id is no longer counted among the chunk's owners.
- **Undo resurrected a source event** the source had since withdrawn, which
  then no refresh would remove: such an entry is dropped (`onDropped`).
- `event.update` now means what create means for each field: `editable`
  resets the permissions, `resourceId` moves, `status` re-derives `busy`
  (unless set on purpose), `timeZone` keeps the wall times in the new zone,
  `allDay` converts both ways.
- Derived ids: two 53-bit hashes (~106 bits) — two real titles shared a
  32-bit id and merged across chunks.
- `isQuietDay` keys its cache on the ISO date whatever the input calendar.
- Confirmed sound by fuzzing: AVL balance/max/persistence, interval queries,
  `isQuietDay` against every transition 1840–2040 in 15 zones.
- Documented, not changed: a transaction that throws keeps what it applied.

Measured after the fixes: normalize+index 61–67 ms, replaceSourceChunk 10k
~30 ms, refetch 10k identical ~94 ms, ~890 bytes/event.

### Not done in Phase 1, on purpose

- Series (`seriesIdx`, `seriesTouched`, `EventInstance.origin` other than
  `single`) — Phase 5. Move/resize commands — Phase 6–7. Source manager,
  chunk cache, json/fn sources — done in Phase 9. `commands.schema.json` — Phase 18.

## Phase 2 — projection, axis, layout (pure) ✅ (2026-10-16)

- `project/segment.ts`: `segmentTimed` (binary search into the display
  zone's real days; 23/25/23.5-hour days; skipped days get nothing; optional
  cut at each fall-back for the wall axis), `segmentAllDay` (bars over shown
  columns, broken by hidden days), `splitByWeek`, `dateIndex`.
- `project/time-axis.ts`: `buildColumnAxis` — option C validated by the
  owner: `wall` (shared clock positions, gap/repeat bands, `fromPosition`
  with a reading preference) and `elapsed` (true lengths, second-pass ticks);
  `toEndPosition` places an end exactly at a fall-back on the first pass.
  `slotMin`/`slotMax` up to 30:00.
- `layout/column.ts` (greedy colouring = largest overlap, widening, cascade),
  `layout/rows.ts` (`packLanes` with heaps, `computeOverflow` for "+N"),
  `layout/virtual.ts` (Fenwick `PrefixSums`, `visibleRange`, `visible2D`).
- `views/`: `ViewSpec`, `BUILTIN_VIEWS`, `computeViewRange` (month grid from
  tzslot's `getMonthGrid`, `fixedWeekCount`, `hiddenDays`, `dayCount`),
  `navigate`, and pure models `buildTimeGridModel` / `buildDayGridModel`.
- `format/`: `formatTemporal` (epoch ms + zone, floating values in UTC),
  `formatRangeTitle` (Intl `formatRange` — it takes numbers, so no `Date`),
  weekday/month names, `weekNumber` with locale rules (`minimalDays` from a
  CLDR region table: V8 omits it).
- Conformance: +18 cases (`time-axis`, `segment`, `layout-column`, `navigation`).
- Tests: properties on 1000 random columns (lanes = largest overlap, no
  horizontal overlap of overlapping events) and 500 random weeks (every bar
  drawn or counted in "+N", never both); week numbers equal Temporal's ISO
  weeks for ten years.

Measured (minified): layoutColumn 1000 overlapping ~0.4 ms (≤ 5),
dayInfos 366 ~1.2 ms (≤ 15), time-grid week model over 10 000 events
~1.5 ms, month model ~3.3 ms.

Lessons:
- `Intl.DateTimeFormat#formatRange` names one offset for a whole range:
  01:30 (+02:00) – 02:30 (+01:00) prints "UTC+1" once. Titles only; an
  event's hours across a clock change are formatted end by end.
- An end at a fall-back instant reads as the *second* pass's clock time;
  ends are placed with `toEndPosition` (one millisecond before, then back).
- Positions are computed in integer milliseconds before dividing — floating
  minutes gave 29.99999 for a 30-minute event.

### Architect review, fixed before closing Phase 2

- Events outside `[slotMin, slotMax)` were drawn as 15-minute slivers at
  the edge; now dropped, and a piece cut by the axis loses that rounded end.
- A one-day view with hidden days was stuck going back from Monday; it now
  steps over hidden days in the direction of travel.
- Elapsed axis starting after a fall-back showed a phantom band at the top.
- `slotMax` beyond 24 h refused (segmentation cuts at the real midnight).
- `computeOverflow` and `visibleRange` validate their sizes; `weekNumber`
  reads ISO fields whatever the input calendar.
- +4 conformance cases: the 23-hour Sunday, Lord Howe's 23 h 30, a one-day
  view over a hidden weekend both ways. Unit tests for `toEndPosition`.
- Carried to Phase 3 by decision: minimal kernel, stable keys by date,
  column reuse and `updateTimeGridModel`, offset readings, gutter, now line.

### Code review (verified by execution), fixed before closing Phase 2

- **Background events took a lane** in the month grid and the all-day row,
  and could push a real event behind "+N". They are now set apart
  (`DayGridWeek.background`, `allDay.background`) and take no lane.
- `ticks(0)` never returned (the tab froze): a step ≤ 0 is now a RangeError.
- `formatRangeTitle` with reversed ends printed "21–15 mars": ends are ordered.
- `PrefixSums.indexAt(0)` returned a leading zero-size item.
- Confirmed by the reviewer's fuzzing: 3000 random columns, 2000 overflow
  cases, Fenwick, week numbers over 49 rule combinations, segmentation with
  non-contiguous hidden days, Havana and Lord Howe axes.
- Open, for the owner: `slotMax` beyond 24 h is refused for now (the plan
  said up to 30:00). Supporting it means segmenting by axis window rather
  than by civil day.

**Budget watch:** `normalize+index 10k` measures 62–72 ms against 70 depending
on machine load (load average ~5 during this phase). Not reliably met;
nothing in Phases 1–2 changed that path since it was measured at 61–67.

## Phase 3 — time grid in the DOM (read-only) ✅ (2026-10-16)

Owner decisions (2026-10-16): **own CSS, of one family with tzslot** (same
palette names and values); `slotMax` stays ≤ 24 h for now; GSAP as an
optional adapter from this phase.

- **core**: segment keys by ISO date; `buildTimeGridColumn`,
  `updateTimeGridModel` (rebuilds only columns a change touches, others keep
  their identity), `locateNow`, offset readings (`first`/`second` pass) and
  real length on days with a clock change, gutter ticks, `visualHeight`.
  **Minimal kernel** (`createKernel`): date, view, zone, locale week rules,
  navigation, title, memoized view model, injectable `store` and `now`.
- **@dzcalendar/dom**: `createCalendar(host, options)` → `{ kernel, element,
  update, navigate, destroy }`. Toolbar, day headers (a day that is not 24 h
  says so), all-day row, gutter, columns keyed by date, DST bands (hatched
  gap, dashed repeat, both named), events placed by axis minutes ×
  `--dz-minute` (no pixel measured), second-pass mark and offset badge,
  "N h real" badge, folded skipped day, now line (minute-aligned timer).
  Keyed reconciler: an unchanged column, event or header is not touched.
  Messages EN/FR. Structural CSS injected, every colour
  `var(--dz-x, var(--tz-x, system colour))`.
- **@dzcalendar/theme**: SCSS → CSS (drift test), tzslot's nine palette
  colours under `--tz-*`, named tones `--dz-tone-*`, sizes on `.dz-cal`.
- **@dzcalendar/motion-gsap**: view slide and event entrance through the
  DOM's motion hooks; `gsap.matchMedia` turns everything off under
  `prefers-reduced-motion`; transforms and `autoAlpha` only, `clearProps`.
  GSAP is a peer dependency, never bundled by `dom` (457 bytes gzip).
- **Playground** (`npm start`, port 4600): `index.html` (zone, axis, theme,
  GSAP toggles) and `dst.html` — one store, four kernels: Paris, Chicago,
  Lord Howe, Sydney, with buttons for each clock change of 2026.

Seen in real Chrome (playwright-core, system Chrome), not only jsdom:
- Found there: the gutter rendered on the **right** with every column shifted
  (the keyed list inserted before the grid's first child, the gutter) — fixed
  with a dedicated host and a jsdom test of DOM order.
- Found there: the DST band measured 54 px for an hour of 48 (padding and
  border added to the height) — `box-sizing: border-box`; measured 48 after.
- Found there: the theme was never loaded in the playground (a `<link>` to a
  path outside Vite's root, 404) — imported from TS.
- A tone set as `--dz-accent: var(--dz-tone-x, var(--dz-accent…))` on one
  element is a cycle and invalid: events now use `--dz-event-accent`.
- Measured in Chrome: all seven columns of the Paris week 1152 px tall
  (1440 min × 0.8 px), the two 02:30s side by side at the same top.

Sizes (minified, gzip): core + dom **20.2 kB without the polyfill**, 39.7 kB
with it (tzslot 2.1.0 ships the basic polyfill).

Known, for later: the 25-hour Sunday is cramped in a narrow week grid (an
event across the fall-back is two parts in two lanes); the shortest events
clip their time label; ticks in `elapsed` mode follow elapsed minutes.

### Reviews (architect + code review in jsdom and real Chrome), fixed before closing Phase 3

- **Readings were the piece's, not the event's**: a night across the
  fall-back read "00:00 – 06:00*" (06:00 happens once). Readings are now the
  event's own; an end is marked second-pass only when it lies *inside* that
  pass; an end at the fall-back instant shows 03:00, not "02:00*".
- **Today froze at midnight** while the now line moved on: `kernel.refreshToday()`
  from the minute timer.
- **Gutter lost its hours** with `slotMin: PT8H30M` (ticks at :30, unlabelled)
  and on Lord Howe's elapsed axis: ticks walk the wall clock.
- **The theme overrode sizes set by the page** (`--dz-height` declared on
  `.dz-cal` itself): sizes now live on `:root` and are read with fallbacks.
  The theme no longer redeclares a radius of its own (`--tz-radius` is shared).
- `update({ locale })` did not retitle: `kernel.setLocale`.
- `timeZone: undefined` or `locale: ''` threw: defaults now go after the spread.
- Headers and all-day row drifted 13–15 px from the columns with classic
  scrollbars: `scrollbar-gutter: stable` on all three rows.
- A replaced motion adapter was never destroyed; the scroll on first paint
  ignored a handed-in kernel's `slotMin`.
- `update()` echoing current values rebuilt everything, re-animated and
  re-announced the title: no-ops detected, one paint per update, the title
  node only rewritten when it changes. A view the DOM cannot draw is refused
  before the kernel moves (`kernel.getViewSpec`).
- Class names are tokens (a space or an empty string no longer throws); a
  tone must match `[a-z0-9_-]+`; an event's own classes are swapped as a set.
- A11y: columns `group`, events and bars `button`; the spoken label gives the
  offsets instead of "*", the real length, and the event's zone when it is
  not the one on screen. `dir` follows the locale; times stay LTR.
- A subscriber that throws no longer starves the others (nor other kernels
  sharing a store). `updateTimeGridModel` returns the same object when
  nothing it shows changed.
- 20 regression tests (`packages/dom/test/review3.test.ts`), one per finding.

### Step 4.0 — before drawing the day grid (from the architect's review)

1. `ViewHost` / `registerView`: the DOM mounts a view per family; the kernel
   asks a registry of model builders instead of `if family`.
2. `settings.ts` (resolve + diff, a handler per key) and a mutable kernel:
   `setOptions`, `setEvents` (via `replaceSourceChunk`), `batch`, `KernelEvent.cause`.
3. A lifecycle `Scope` (listeners, timers, observers) and one `Ticker` per
   kernel, paused when the tab is hidden or the host disconnected.
4. `render/event.ts`: one event renderer for time grid, day grid and popover,
   with two-level signatures (position vs content) and render hooks (D.5).
5. `FrameScheduler` (read → compute → write, coalesced per frame).
6. `toolbar.ts` with a view switcher.
7. `build.mjs` for dom, theme, motion-gsap; a size script and `size-budget.json`;
   `test:browser` (alignment, layout count) with playwright-core.
8. `docs/behaviors/*` sheets: "+N", dayCount, fixedWeekCount, minimum
   height, week numbers, business hours, context menu. ✅

Owner's request added to Phase 4 (2026-10-16): **a context menu on cells and
events** — every action reachable without a gesture (right-click, touch long
press, Menu key / Shift+F10). Shell and read actions in Phase 4, editing
actions in Phase 6/7, "Move…" by keyboard in Phase 8. See ARCHITECTURE D.3 bis.

## Phase 4 — day grid, "+N", business hours, context menu ✅ (2026-10-16)

**Step 4.0 (structure, from the Phase 3 architect review)**
- Kernel: a registry of model families (`registerModelFamily`; the Pro's
  timeline will plug in there), `setOptions`, `setEvents` (diffed by the
  store: same content, no change), `batch` (one `state` event), `causes` and
  `direction` on state events, `getViewSpec`.
- DOM: a view host (`registerView(family, factory)`), one renderer per
  family, mounted and unmounted as the view changes; `ViewCtx` with an
  `epoch` that moves when words or hooks change (nodes are redrawn in place,
  never cleared — focus survives); a lifecycle `Scope` (listeners, timers,
  observers released at once); a `FrameScheduler` (reads before writes);
  two-level signatures in `KeyedList` (position vs content);
  `render/event.ts` shared by the time grid, the month and the popover, with
  content hooks (`content`, `didMount` + cleanup, `willUnmount`); a toolbar
  with a view switcher; the minute timer pauses while the tab is hidden.
- `npm run build` builds core, dom, motion-gsap and theme; `npm run size`
  (budgets in `size-budget.json`); `npm run test:browser` (its own Vite
  server, system Chrome, 12 layout checks).
- Behaviour sheets: "+N", day count, fixed week count, minimum height, week
  numbers, business hours, context menu.

**Phase 4 proper**
- Month / week / day grid: six weeks (or fitted), padding days dimmed (or
  empty with `showNonCurrentDates: false`), today, all-day bars across days,
  timed events as a dot with their start, the day number leads to that day.
- **"+N"**: `dayMaxLanes` (number or `'auto'`, measured once per resize via
  the scheduler and a single ResizeObserver); the last lane gives way to the
  link; the panel is a native popover inside the calendar listing every event
  of the day, Escape closes it, focus returns to the link.
- **Business hours** in the core (`businessIntervals`: wall times in the
  rule's own zone, true lengths across clock changes — a 22:00–06:00 shift on
  the 25-hour night is 9 h); shaded off-hours in the time grid, hatched
  closed days in the month.
- **Context menu** (owner's request): right-click, touch long press, Menu
  key / Shift+F10 on cells, slots and events; `actionsFor` in the core (both
  readings of a repeated 02:30, a skipped hour says where it lands);
  `contextMenu(ctx, defaults)` hook (keep, replace, add, or null for the
  browser's menu); `onCreateRequest`, `onEventOpen`.
- The two 02:30s are told apart in the month too ("02:30" / "02:30*").

Measured: dom **13.7 kB** gzip (budget 30), core 19.3 kB without the
polyfill, theme 1.0 kB, motion-gsap 0.4 kB; 352 tests; 12/12 browser checks.

Found on the way:
- The size script counted all of core inside dom (an alias resolved it before
  `external` saw its name): 29.3 kB reported, 13.7 kB real.
- `sideEffects: false` on dom would have let a bundler drop the views'
  self-registration: dom now lists its side-effect modules.
- The month's "+N" sat on lane 0 on first paint (the rows read the previous
  model): the model is set before drawing.

### Reviews (architect + code review in jsdom and real Chrome), fixed before closing Phase 4

- **Critical: after a change of zone, labels kept the old zone's hours**
  (positions moved, text did not: zone was not in the content signature).
  A change of zone or locale now moves the epoch.
- The month rebuilt every cell and "+N" link on any change: focus lost, the
  open panel's anchor detached. `updateDayGridModel` keeps untouched rows'
  objects; cells and links are keyed by date.
- `'auto'` lanes counted the day-number button, not the grid's track and
  gaps: the last bar overflowed by 3 px at some heights. Now read from the
  row's own tracks; a month is capped at 4 lanes until measured; a week or a
  day of the day grid is never capped.
- Listeners piled up with each change of view family: each view has its own
  `Scope`, released when another mounts.
- The "+N" panel ignored the content hooks and had no context menu: it now
  draws through `fillEvent` (mounted on open, unmounted on close) and takes
  the same menu.
- Equal options (`setOptions`, `update({ businessHours })`) were not no-ops.
- `update()` refused a bad view only after changing the zone: everything is
  validated before the kernel moves.
- The minute timer stopped with `nowIndicator: false` (today froze at
  midnight) and died on a detached host: it always runs.
- Menu: closes on any change, on scroll and resize; never steals focus on
  destroy; clamped to the viewport; RTL-aligned; repeated letters cycle;
  visible focus in forced colours; no iOS callout on long press.
- API fixed before anyone depends on it: `onCreateRequest({ allDay, start,
  resourceId? })` (a month day is a date, not "midnight"); `ActionItem`
  gains `command?` and `icon?`; slot moments snap (`snapMinutes`, 15).
- Bars keep their keys when "+N" cuts them (`|p{k}` always); business-hours
  rules are validated when set; a throwing hook is reported and the default
  drawn; the probe used for measuring no longer looks like an event.
- `npm run test:browser` now also checks: "+N" exact, bars inside their rows
  after resizes, the panel, and **at most one layout per event change**
  (Chrome's `LayoutCount`, via CDP). 17/17.

### Planned from the reviews (not blocking Phase 5)
- `settings.ts` (a handler per option, live callbacks) — before Phase 6.
- `ViewController.hitTest / focusFor / nodeFor`; one `InteractionHost` for
  right-click, long press and drag — Phase 7.
- Month ARIA structure (bars inside cells) and roving focus — Phase 8.
- Per-instance registries alongside the global ones; extensible `ModelOptions`.

## Phase 5 — recurrence ✅ (2026-10-16)

- `@dzcalendar/rrule` (4.4 kB gz, budget 7): `parseRRule` (never throws;
  UNTIL as a date or a UTC date-time; extensions such as RSCALE refused),
  `serializeRRule`, `iterateZoned` / `iterateDates`, `expandZoned` /
  `expandDates` (RDATE added, EXDATE as an instant or as a date in the
  series' zone), `lastStart` (null when endless). Days are civil day
  numbers; DAILY and slower keep the wall time (`compatible`: a gap moves
  forward, a repeated time takes its first reading); HOURLY and finer step
  in elapsed time. A rule that can never happen ends after one 400-year
  Gregorian cycle of empty periods (29 February waits 8 years, not 400).
  Skip-ahead: occurrences before a window are counted, not built — COUNT
  stays exact, a window two years after DTSTART costs arithmetic.
- Core: `Series { id, revision, base, set, overrides, sourceId }`; an event
  with `rrule` normalizes to `{ kind: 'series' }` (`invalid-rrule`,
  `invalid-exdate`, `invalid-rdate` replace `unsupported-recurrence`;
  sub-daily rules on all-day events refused). `RecurrenceKey` = the
  original start's full string, offset included (the two 02:30s are two
  occurrences). Instance key `escape(seriesId)@key`, ids escaped (`%`, `|`,
  `@`). Store: `series` map, `seriesIdx` by occurrence span (endless =
  MAX_SAFE_INTEGER), `Mutation` of kind `series`, `StoreChange.seriesTouched`,
  sources deliver series (owners keyed `event:id` / `series:id`).
  `queryInstances` expands the series whose span meets the window, widened
  back by the length; occurrences are materialized once per series object
  (WeakMap), so an unchanged series redraws nothing. History, `invert`,
  `compact` and invalidation work per `kind:id`. Commands: `event.create`
  with `rrule` creates a series; `series.delete`. Models rebuild every
  column/week when `seriesTouched` is non-empty. DOM: `data-series-id`.
- Conformance: `rrule-expand`, 100 cases — 80 expectations computed by
  python-dateutil 2.9 (`scripts/conformance-crosscheck.py`, an independent
  implementation, not shipped), 20 written by hand (sub-daily across clock
  changes, EXDATE/RDATE, all-day, limits, refusals). A deliberately wrong
  expectation fails the runner.
- Bench (minified): a year of a daily rule 1.7 ms (budget 5); a week seen
  through 200 weekly series started two years earlier 15 ms (83 ms before
  skip-ahead; budget 30).
- Browser: 19/19 (a demo series Mon/Wed/Fri 09:30 Paris with an EXDATE:
  two then three occurrences, same position across the clock change).

### Architect review, fixed before closing Phase 5
- No input can stall: `lastStart` walks at most 50 000 (beyond, the series
  is indexed as endless — a safe bound); plain sub-daily COUNT is arithmetic;
  a sub-daily rule skips non-matching days in day arithmetic (a barren
  `MINUTELY;BYMONTHDAY=30;BYMONTH=2` ends after one 400-year cycle of
  integers), and every sub-daily generator stops at 2 000 000 steps.
- DTSTART on the second reading of a repeated hour is yielded as itself.
- All-day EXDATE given as a moment names its wall day (was read in UTC).
- `limit`: detected by fetching one more (exactly `limit` is not too many),
  RDATEs counted before the cut; `expandSeries` (`core/recurrence/expand.ts`)
  returns `{ occurrences, problems }`, `queryInstances({ onProblem })`
  receives `too-many-occurrences`; conformance asserts it (`withProblems`).
- An occurrence keeps the base's end zone; the window is widened back by an
  hour per wall day of the length (25-hour days); an RDATE before DTSTART
  widens the index span (`firstStart`); the occurrence cache is capped at
  2 000 per series.
- `is-series` / `is-occurrence` instead of `unknown-event`;
  `parseInstanceKey`; `occurrenceLength` (nominal, RFC DURATION) named apart
  from a moved event's elapsed length; purity test covers `rrule`, which now
  takes its Temporal types from `@tzslot/core`.

### Code review (verified by execution: 16 000-rule skip-ahead fuzz, 1 500 rules against dateutil), fixed
- Sub-daily rules with BY parts no longer hit the step budget: a non-matching
  hour or minute jumps to the next one that can match (never across a zone
  transition — wall time rewinds at a fall-back); a generator that still runs
  out of steps reports `too-many-occurrences` and `lastStart` returns null.
- Several rules: the limit is counted per rule, then the sorted union is cut.
- The occurrence cache forgets its older half (cap 8 000), not everything.
- A source may not bring a series with an event's id, or the reverse.
- WEEKLY + BYSETPOS follows RFC 5545 (the set is the whole WKST week);
  dateutil and rrule.js — FullCalendar's plugin — start the first week at
  DTSTART. A hand-written case pins our reading. The other dateutil
  differences found were dateutil's (mixed BYDAY, BYWEEKNO at year's end).

### Not done in Phase 5, on purpose
- A DTSTART typed in a gap (02:30 on spring-forward day) is normalized to
  03:30 first, so the series repeats at 03:30: the event says when it starts.
- `Occurrence.ambiguous` (B.8): not on the materialized event yet — the
  DOM marks repeated hours from the axis; revisit with Phase 6 editing.
- `too-many-occurrences` is not drawn by the DOM yet (Phase 8 messages).
- Editing one occurrence / the following / all (overrides, split series),
  the recurrence-scope sub-menu — Phase 6.
- A query cache per (snapshot, window): occurrence objects are already
  stable; measured need first.
- **Budget watch:** `normalize+index 10k` measures 70–75 ms against 70 —
  and so does the Phase 4 commit, A/B on the same machine at the same time
  (HEAD 70.0–74.6, Phase 5 70.8–73.4): no regression from recurrence, the
  line has sat on its budget since Phase 4. To decide: optimize
  normalization or revise the budget.

## Phase 6 — commands, undo/redo, editing series ✅ (2026-10-16)

- `recurrence/edit.ts`: `editOccurrence` / `deleteOccurrence` / `deleteSeries`
  with `this` / `following` / `all`. *This* = an override event (`ref`) in the
  ordinary index, the series skips its key; delete *this* = EXDATE. *All* =
  the base rebuilt from the edited occurrence (as the series produces it, not
  its override), every start shifted by the same wall-clock difference;
  rules rebased (`rebaseRule`: weekly days shift, monthly day / n-th weekday
  / last day recounted, a single BYHOUR/BYMINUTE follows); overrides keys,
  EXDATEs and RDATEs shifted with it. *Following* = `splitRule` (COUNT
  shared, or UNTIL = last start before the cut), EXDATEs/RDATEs/overrides
  after the cut migrate (keys remapped), `splitFrom`; on the first
  occurrence it is *all*. Switching a whole series between all-day and
  timed: `invalid-edit`.
- rrule: `rebaseRule`, `splitRule`, `countBefore`.
- Commands: `event.update` / `event.move` / `event.resize` / `event.delete`
  take `scope` and `key` (or an occurrence instance key as `id`, or an
  override's id); `series.delete` cascades to overrides; `series.split`.
  `CommandContext.weekStart` (WKST written into rules created here — owner's
  decision 2026-10-16) and `rules`.
- `rules/validate.ts`: `validateProposal` — not-editable, valid range,
  constraint (business hours, group, spans), overlap (one indexed query),
  `allow`. Commands return `violations`.
- Store: occurrence cache keyed by `series.base`, occurrences stamped with
  `base.revision`, `base`/`set` keep their objects when unchanged; an
  overrides/EXDATE-only change dirties that occurrence's span
  (`StoreChange.seriesChanged`, not `seriesTouched`): one override redraws
  one place. A source re-delivering a series drops local overrides and split
  parts (the source is the authority, as for events). `ref` survives
  `event.update` (`commands/patch.ts`).
- Kernel: `run(cmd)` and `history` (context read at each command: zone,
  first day, rules). DOM: `editable`, `onCommandRefused`, `run/undo/redo`;
  "Delete" with a keyboard-accessible sub-menu (ArrowRight opens, ArrowLeft
  / Escape returns; `aria-haspopup`/`aria-expanded`; the UA's
  `overflow:auto` on `[popover]` made it scroll under itself — fixed);
  `settings.ts`: live options (callbacks, `editable`, `contextMenu`,
  `snapMinutes`) changed by `update()`, checked before anything applies.
- Conformance: `series-edit`, 42 cases written by hand (a deliberately wrong
  expectation fails). `docs/behaviors/recurrence-editing.md`.
- Measured: 585 tests (`test:ci`); browser 21/21 (sub-menu beside the menu,
  on screen, focus and undo checked in Chrome); bench: an override 0.09 ms,
  "following" on a series with 100 overrides 1.4 ms; `normalize+index 10k`
  65 ms on a quiet machine.

### Reviews (architect; code review with 9 reproduced bugs), fixed
- **Occurrences are identified by position.** "All" recounts the rules from
  the edited occurrence (not the base), makes what a rule took from DTSTART
  explicit first (`explicitRule` / `implicitRule`), finds the new first start
  as the one that keeps the edited occurrence at its position, and carries
  overrides, EXDATEs and UNTIL by position (`iterateUnion`, one walk each
  way: "following" with 100 overrides 4.2 ms). Fixes: monthly/yearly/ordinal
  rules recounted wrongly, UNTIL dropping the last occurrence, overrides
  orphaned (a duplicate in the month), invalid BYMONTHDAY/BYYEARDAY values
  (now kept in range, sign kept; last day + 1 = the 1st), several ordinals
  merged, yearly ordinals counted in the month.
- **"Following"** cuts into a tail with explicit rules, checked to repeat
  the old tail exactly (64 starts); a cut that would break an INTERVAL
  rule's phase is refused (`invalid-edit`) instead of moving its dates; a
  cut on an RDATE keeps the rule on its own weekday.
- A series id without `key` anchors on its first start (an excluded or
  off-rule DTSTART no longer blocks editing or deleting it).
- WKST is added after reading the rule (`RRULE:` prefix, spaces).
- `validateProposal`: all-day lengths in days (the 25-hour day is one day);
  a series moving as a whole does not collide with itself; validates the
  event the edit will write; `businessHours` constraint without hours
  constrains nothing. **Rules apply to gestures only**:
  `kernel.run(cmd, { validate: true })` (the DOM menu); the application's
  own calls are not refused.
- Source cascade is transitive (a chain of splits goes with its source).
- Size: owner's decision — core 28 kB / dom 26 kB (sum unchanged), and a
  budget is a guide: `npm run size` warns over it, fails only beyond +5 %.
  Measured: core 27.0, rrule 6.9, dom 15.8 kB gz.
- Conformance `series-edit`: 47 cases by hand (non-first occurrences of
  monthly / yearly series, a cut on an RDATE, a refused phase break).
  605 tests, browser 21/21.

### Not done in Phase 6, on purpose
- Finding a cut walks from DTSTART: sub-daily series over years cost
  millions of steps (bounded); arithmetic jump to the cut later.
- Source re-delivery wipes local edits of its series (authority): write-back
  (`revert()`, optimistic commit) is Phase 9, before this is user-facing.
- Rename the validator's `Proposal` (B.13) when B.15's `Proposal` arrives
  (Phase 7).
- `chooseScope` on drop and keyboard moves — Phase 7/8 (the commands take
  the scope already).
- `overrides: 'drop'` for "all" is in `editOccurrence` but not in commands.
- Turning an event into a series (or back) by an update.

### Carried into Phase 6 from the Phase 5 review (done above unless noted)

From the Phase 5 architect review, to do with the editing:
- Granularity: keep `base`/`set` identity when equal, key the occurrence
  cache by `series.base`, stamp occurrences with `base.revision` — one
  override must not redraw every occurrence.
- Dirty spans for series: an overrides/EXDATE-only change dirties that
  occurrence's span, not every column.
- `ref` survives `event.update` (`toInput`, round-trip test); a snapshot
  invariant helper (overrides map ⇔ `event.ref`).
- Cascades: `series.delete` deletes its overrides; a source replacing a
  series drops overrides it no longer lists (the source is the authority);
  overrides inherit `sourceId`.
- "All" edits that change the time or zone remap every key (overrides,
  EXDATE, `ref.key`) in one transaction.
- rrule: `countBefore`, `truncate(rule, start, cut)` for "following";
  `splitFrom?` on `Series`.
- DOM: `data-recurrence-key`; the scope sub-menu (`ActionItem.children`,
  default `this`).
- Memoize `seriesSpan` per series; a "leak over 5 000 queries" bench line.

- Not done: memoizing `seriesSpan`, a "leak over 5 000 queries" bench line.

## Phase 7 — mouse, touch, pen ✅ (2026-10-16)

- Core `interaction/propose.ts`: `Hit` (slot with its instant, or day /
  all-day row), `proposeMove`, `proposeResize`, `selectionBetween`,
  `commandFor`, `isUnchanged`. Grab offset kept; start snapped on the wall
  clock and read again in the zone (`preferOffset` of the pass under the
  pointer): a gap → next existing moment + `skipped`; a repeat →
  `ambiguity { chosen, alternative }`. Event zone and elapsed length kept;
  timed ↔ all-day by dropping on the all-day row or the grid. Validated by
  `validateProposal` (renamed input: `Placement`). Parity test: a hit from
  an axis position equals a hit from a keyboard wall time.
- DOM `interact/`: `surface.ts` (what a view gives: `measure`, `hitAt`,
  `boxesFor`, `instanceOf`), `host.ts` (Pointer Events, 4/8 px threshold,
  touch tap selects / drag on selected without long press, `touch-action`
  only on the selected event, ghosts by CSS variables, autoscroll, edge
  navigation at 600 ms, Escape cancels, `chooseScope` / reading chooser,
  live announcements), `handles.ts`. Time grid and day grid implement the
  surface; geometry is read once per gesture and the scroll followed by
  events. Options (live): `selectable`, `onSelect`, `onDateClick`,
  `onEventClick`, `chooseScope`, `dragEdgeNavigate`,
  `eventResizableFromStart`. `kernel.rules()`.
- GSAP adapter: `dragStart` (lift), `dropRejected` (shake, fly back),
  `captureLayout` / `animateLayout` (Flip for the others), `dropSettle`
  (land from the ghost), `overlayOpen` (menu, sub-menu, "+N").
- Browser 39/39: mouse move and resize (snapped), Escape, Saturday refusal
  (red ghost, unchanged, announced), series scope menu, selection, the
  reading chooser in the repeated hour, month drag, touch (tap selects,
  drag without long press, empty time scrolls). GSAP path checked with
  motion on (transform cleared, no ghost left, no console error).
- Size: core 28.6 kB (over 28 by 2 %, within the owner's tolerance), dom
  22.3 kB, motion-gsap 0.9 kB.

### Reviews (architect; code review in real Chrome), fixed
- Only the calendar's time takes gestures (`surface.accepts`): a header,
  the gutter or a scrollbar is no date click and starts no selection.
- Off valid ground (a skipped day), the proposal is dropped: a drop there
  does nothing. The final proposal is computed from the pointerup point,
  without autoscroll or navigation side effects.
- RTL: time-grid columns sorted by position; all-day ghost by min/max.
- The repeated hour on a resize: `ambiguity.edge` — choosing the other
  reading moves only that edge; a resize clamped to its minimum has none.
- A drop in a skipped hour: the hit says `gap`, the event lands on the
  first moment after it (03:00, not 03:30), and it is announced.
- The drop is one pipeline, `interact/commit.ts` (`commitProposal`), for
  the keyboard too: refusal (announced, `onProposalRefused`, flying back
  only to a node still there), scope (only "this" when the kind changes),
  reading, a check that the calendar still exists after each wait, run,
  announcement (moved / resized), Flip and landing. It never throws; a busy
  flag blocks a new gesture while a choice is open.
- Series preview validated with `movingSeries` (a series moving as a whole
  is not in its own way); the final run stays the authority.
- Autoscroll: `scrollBy` (no layout read), only inside the scroller.
  Edge navigation re-measures after the view has settled (and waits 900 ms
  in a month). The page scrolling re-measures. `lostpointercapture` (on
  the root only — a touch's implicit capture handed over is not a loss) and
  window blur cancel.
- GSAP: the landed node is made visible (an entrance tween killed by the
  landing left it hidden) and cleaned of opacity/visibility.
- Focus: a click on an editable event focuses it again (`preventDefault`
  had cancelled that); the menu closes before running an entry again, so
  an application's editor keeps the focus it takes.
- Ghosts copy only the event's accent and the application's classes; a
  long press is never a tap; the touch resize strip is 16 px; a touched
  event stays selected where it lands; an unchanged hit recomputes nothing.
- Selections end on the wall-clock slot (Lord Howe's half-hour changes).
- "+N" panel: a click on an event there fires `onEventClick`.
- Browser 45/45 (header click, focus, RTL drop, March gap drop, GSAP
  visibility added); 620 tests.

### Manual (not automatable here)
- iOS Safari: a finger on an unselected event or empty time scrolls; a
  selected event drags. To check on a device.

### Not done in Phase 7, on purpose
- Touch selection handles (a tap selects one slot; adjusting it: Phase 8).
- Violation codes turned into words ("outside business hours"); a warning
  when a day event becomes a one-hour timed one; conformance cases for the
  proposals (Swift/Kotlin); a keyboard sequence parity test (with Phase 8).
- Dragging between calendars / external drop; timeline (Phase 10+).
- Keyboard grab mode: Phase 8 (the proposals are already shared).

## Phase 8 — keyboard and accessibility ✅ (2026-10-16)

- Core `interaction/keymap.ts`: `intentFor(key, { mode, rtl, grid })` (cursor,
  event, grab; arrows by grid, RTL swapped, undo/redo), `stepHit` (days keep
  the wall time and the pass; into a gap, the first moment after it; slots
  step in elapsed time — both passes of a repeated hour, none of a skipped
  one), `eventHit`, `grabStep` (eventHit → stepHit → the view's `fit` →
  `proposeMove` / `proposeResize`), `heldEvent`. Parity: key sequences
  propose exactly what the mouse does (core tests).
- DOM `interact/keyboard.ts` on every view with `surface.keys`
  (`KeyboardSurface`): a cursor that is a Hit, Shift selection
  (`selectionBetween`), event mode (Enter = click, M / Alt+Enter = grab,
  Delete with the scope chooser, Escape back, arrows through the day), grab
  mode (each step said with its violations, Enter through `commitProposal`,
  Escape / Tab let go, the period changes at its edge, a press on the time
  puts it there), undo/redo keys on the calendar (`keyboardUndo`).
  Context menu: "Move…", "Change duration…".
- Time grid: a focusable cursor placed by `grid-column` in the scrolling
  grid, replaced at each move (spoken as a focus change), resting in the
  all-day row until first focused; day headers hidden from assistive
  technology, column groups named with their real length.
- Month: one tab stop (roving), each gridcell holds a button per event of
  its day (those behind "+N" too); bars and "+N" are drawn, not read, and
  wear the focus ring of the item focused.
- Selection kept on screen (pointer, touch, keyboard), cleared by a click,
  Escape or another period; a tap selects a slot with two 24 px handles to
  pull; `instance.select()`.
- Messages (EN/FR): cursor names, selection, violation reasons, grab mode,
  delete, undo/redo, resize from the start.
- axe-core 4.13.0 (pinned dev dependency) in `npm run test:browser`: week,
  month, day, menu and sub-menu open, RTL, the four-zone page — no
  violation. Found by it: the selected view button lost its background on
  hover (white on light grey) — fixed in the theme.
- ACR draft: `site/a11y-conformance.md` (WCAG 2.2 A/AA). Behaviour sheet:
  `docs/behaviors/keyboard.md`.
- The structural CSS ships minified (`scripts/css-literal.mjs`, in the
  build and in the size measurement): −1 kB gzip, same 132 rules in Chrome.
- Size: core 29.6 kB, dom 29.2 kB, motion-gsap 0.9 kB. Budgets raised by the
  owner (2026-10-16) to core 30 kB and dom 30 kB (were 28 / 26): the
  complete keyboard, the ARIA structure and their words in EN and FR; the
  5 % tolerance stays.

### Reviews (architect; code review in real Chrome), fixed
- Shift+F10 on the time grid's cursor opened nothing (the menu looked for a
  column): it now opens the menu of that very slot, both readings in a
  repeated hour.
- A screen reader's bare `click` (VoiceOver, NVDA browse mode, TalkBack) did
  nothing on the cursor or an event: it does what Enter does.
- Timed ↔ all-day by keyboard was not said: each step and the drop say it
  ("It becomes a timed event of 1 hour").
- Keys taken from a link or a field an application puts inside an event:
  the keyboard acts only when the event itself has the focus.
- The application changing the period under a focused cursor: every arrow
  changed period again — the first one now brings the cursor home.
- Ctrl/Cmd+Z (and a pointer drop to another column, older) left the focus
  on `<body>`: it follows the event, else the cursor (`Interactions.refocus`).
- Apia, a day its zone skipped: a step over it lost the wall time (00:00) —
  the retry starts from the original hit. Cause upstream: tzslot reads a
  skipped whole day as ambiguous (`docs/for-tzslot.md`).
- Grab mode: released when the focus leaves the calendar or the window
  blurs; Alt+arrows swallowed (no history.back); Tab lets go and moves on;
  dimming re-applied after a period change; "Change duration…" makes plain
  arrows pull the end; the help names only the keys that work here.
- "Change duration…" no longer offered for a timed event in a month
  (`ActionContext.canResize`); undo keys only when `editable`; the undo hint
  says ⌘Z on a Mac, nothing when the keys are off.
- Public types exported (`ScopeRequest`, `KeyboardSurface`,
  `InteractionSurface`, `LiveSettings`); `css-literal` throws rather than
  ship unminified CSS; the "+N" panel's title is an `h2` (heading order).
- axe now runs WCAG 2.0–2.2 A/AA + best-practice tags, also with an event
  held, a selection drawn and the "+N" panel open. `target-size` (2.5.8)
  flags narrow side-by-side events on the four-zone page: allowed for
  events only (the "essential" exception, see the ACR).
- Tests: 16 more acceptance paths (time-grid traversal, RTL in grab mode,
  start resize, all-day → timed, month timed event, crossing a month,
  "All events" chosen by keyboard, the reading chooser, Delete on an
  occurrence, Space, menu on the cursor, bare clicks) and 5 for the fixes.
  684 tests; browser 67/67.

### Manual (not automatable here)
- Screen readers: NVDA (Firefox, Chrome), JAWS, VoiceOver macOS and iOS,
  TalkBack. On iOS, check that touch exploration activates a month cell's
  hidden event items (they are 1 × 1 px).

### Not done in Phase 8, on purpose
- `hiddenDays`: `fit` would change period for a hidden day (no DOM option
  yet; Phase 10).
- Conformance cases for the keymap and `stepHit` / `grabStep` (ports).
- A grab mixing move and resize announces only its last kind.
- After `setView` week → month, the first lane measurement can give 1
  (older than Phase 8; to look at with the CSS pass).
- `aria-keyshortcuts` on events and the cursor; remappable keys.
- `--dz-target-min` and the week at 320 px: the CSS pass.
- `too-many-occurrences` drawn by the DOM (Phase 5 note): with the
  problems panel, later.

## Phase 9 — sources, iCal ✅ (2026-10-17)

Owner's decisions: write-back by an optional `save` per source (optimistic,
reverted on refusal); custom `VTIMEZONE` → Windows table, then a match on
IANA rules, then fixed offsets; budgets core 33 kB, ical 7.5 kB.

- Core `source/`: `createSourceManager` — whole-date chunks (week from
  Monday, month, year, none) fetched over `datesWindow` (the dates as they
  exist anywhere, UTC+14 → UTC−12: a zone change fetches nothing);
  contiguous missing chunks → one request; `prefetch`; at most 4 in flight;
  abort of what is no longer needed; generations (an answer from before a
  `refetch` is ignored); retries with exponential backoff; `staleAfter`;
  12 spare chunks kept per source (LRU); synchronous sources applied before
  `setRange` returns; `idle()`. One answer = one store change
  (`store.replaceSourceChunks`, atomic over chunks; an event over two
  chunks is owned by both). `jsonSource` (GET/POST, params, `map`),
  `fnSource`, `exportInputs` / `eventInput` / `seriesInput`.
- Write-back: `save({ sourceId, edits, cause })` for commands, undo and
  redo, one at a time per source; edits carry what the gesture created on
  a source's series (override, split tail — `sourceOf`); refusal reverts by
  identity (else refetch), purges the history, is announced; pending tags
  are shielded from deliveries, then the source is fetched again.
- `EventInput.seriesId` + `recurrenceId`: an override as input, linked to
  its series in the same batch (re-keyed in the series' zone);
  `invalid-recurrence-id`, `orphan-override`.
- Kernel: `sources`, `onSource(notice)`, `timers`, `kernel.sources`, a
  `source` `KernelEvent`; `events` is reserved. DOM: `aria-busy` and
  `dz-loading` while loading, refused save and failed fetch announced (EN/FR),
  `update({ sources })`, `refetch()`; an application's `messages` are laid
  over the locale's (a set from before a version still works).
- `@dzcalendar/ical`: `parseICal` (unfolding, params, escapes, VEVENT with
  RRULE/EXDATE/RDATE/RECURRENCE-ID, STATUS, TRANSP, X-WR-TIMEZONE; TZID:
  IANA, prefixed, Windows via CLDR, custom VTIMEZONE matched over the years
  used then the latest, else per-time offsets from its own rules; missing
  END closed with an error; UTC starts of a series stay UTC),
  `serializeICal` (75-octet folding, VTIMEZONE from real transitions with
  RRULE observances for the last regular year), `icalSource` (`webcal:`).
- Playground `sources.html`: a simulated server (latency, outage, refuses
  Fridays), a request log, `.ics` import and export.
- Tests: 811 (+ manager, save, JSON, overrides; 72 ical incl. 32 fixtures
  round-tripped and a store-level round trip); conformance `ical-parse`
  (10 cases, 214 in all); browser 74/74 (one request for three months,
  busy and no flash on refetch, axe while loading, a refused save put back
  and said, a Chicago series with a moved occurrence imported then
  exported); bench `source delivery 10k over 12 months` ~90 ms (≤ 150).
- Sizes: core 34.2 kB, ical 7.9 kB — both over by < 5 %; dom 29.6 kB.

### Reviews (architect; code review by execution), fixed
- What "this occurrence" / "this and following" created on a source series
  never reached `save` (lost after a refetch, doubled after a refusal):
  attributed through `sourceOf`, reverted with the rest, adopted when
  delivered back under its id.
- A source with id `events` collided with the kernel's `events`: refused.
- `remove()` stalled the queue of other sources.
- A failed chunk was fetched again at every state change: an identical
  range is a no-op.
- A new spec with another chunk unit left old chunks' events; eviction
  dropped chunks holding a pending save.
- iCal: old events spoiled VTIMEZONE matching (fixed offset all year); the
  written VTIMEZONE ended a year after the first event; a missing
  `END:VEVENT` lost every later event; a UTC series start was moved to the
  calendar's zone (DST shift); `RANGE=THISANDFUTURE` silent; several
  VCALENDARs; `webcal:`; the round-trip test stripped offsets.
- A flaky browser check (month focus ring read before its frame) now waits.

### Not done in Phase 9, on purpose
- Creating an event into a source (`save` sees edits of a source's events
  only; creation is the application's, `onCreateRequest`).
- Overrides delivered apart from their series (another chunk, a later
  answer) are not relinked: documented server contract.
- `jsonSource` sends `timeZone`, but a zone change does not refetch
  (documented; `refetch()`).
- `RELATED-TO` for split series in iCal; fixed-offset TZIDs written as
  `+05:30` are not standard for other readers.
- `maxConcurrent` / `keepChunks` not exposed by the kernel or DOM.
- A notice emitted before the DOM subscribes (a failing synchronous source
  at construction) is not announced.
- A later edit queued after a failed save is sent relative to the failed
  state; the refetch after settle repairs it.

## Phase 10 — list, multi-month, custom views ✅ (2026-10-17)

Owner's decisions: views paid for when imported (`@dzcalendar/dom/list`,
`/multimonth`, `/custom`; models in `@dzcalendar/core/views`; the plugin
toolkit in `@dzcalendar/dom/toolkit`); multi-month "like the month";
custom views at two levels (`defineView` + `registerView`); a view's own
hidden days win over the calendar's; six weeks per month in a multi-month
view; budgets dom/list 3.5 kB.

- Core: `buildListModel` (days in the display zone with their real length,
  parts of multi-day events, all-day first, background left out;
  `includeEmpty` for custom views), `buildMultiMonthModel` /
  `updateMultiMonthModel` (a month grid per month, padding days empty, months
  kept by identity), `ViewRange.months`, a month alignment runs for its
  `duration` outside the month grid, titles of several months; kernel
  `hiddenDays` (an effective spec cached by identity; ISO 1–7 validated).
- DOM: list view (sections and `h3` per day, real lengths and offsets on
  clock-change days, one tab stop, Enter/Delete/menu, hooks, focus kept);
  the month view draws month sections (`createDayGridView(ctx, { months })`)
  — one tab stop for a year, arrows across months and years, drags in each
  month, a padding day never a way into the next month; week numbers
  (`weekNumbers`, the locale's rules, a button to the week; the time grid's
  corner); `weekends` / `hiddenDays` (the keyboard steps over them in every
  view); `multiMonthMaxColumns`; `defineView`; errors naming the entry to
  import; `injectStyles: false` honoured, `LIST_CSS` / `MULTIMONTH_CSS`
  exported.
- Fixed on the way (a Phase 8 carry-over): a week without events wrote
  `repeat(0, …)` — invalid CSS — and the lane measurement read "room for one
  lane"; months showed "+N" alone. `--lanes` is at least 1; the measurement
  is decided on the view mounted at read time (multi-month included).
- Tests: 859; browser 88/88 (months side by side then stacked, a drag in
  October, a padding cell, five aligned columns, week numbers S40–S45, axe on
  list week/month, multi-month and a weekend-less month); bench list year
  model (10k) ~57 ms, multiMonth model (10k) ~50 ms (≤ 150).
- Sizes: core 34.5, dom 31.1 (both over, < 5 %), core/views 0.8, dom/list
  3.3, dom/multimonth 0.8, dom/custom 0.8 kB.

### Reviews (architect; code review by execution, dist imported), fixed
- Multi-month offered "Change duration…" on a timed event; `injectStyles:
  false` ignored by the new views; `defineView` could replace a built-in
  family, a second definition went half-applied, a throwing `render` blanked
  the view; errors did not say which entry to import; one title for a span of
  months; `hiddenDays` duplicates and values outside 1–7.
- Day views without the weekend: Friday → Monday changed the period but left
  the cursor ("no further"); a list on a 25-hour day hid real lengths (and
  their contrast failed axe once shown); a multi-month padding cell took a
  drag into the next month; focus lost when the focused day was hidden, when
  a listed event moved or the list emptied.

### Not done in Phase 10, on purpose
- `visibleWindow()` on `ViewController` (D.1/D.2): with virtualisation,
  Phase 12; list year and multi-month render everything until then.
- The list's keyboard is a line, not a grid (documented); a day heading's
  context menu is the pointer's.
- The week-number button is a pointer shortcut (the keyboard has the view
  switcher and PageUp/PageDown); the time grid's corner number is not read.
- `hiddenDays: []` on a view cannot force every day to show (a view naming
  none takes the calendar's).

## Phase 11 — Angular ✅ (2026-10-17)

Owner's decisions: signals only, Angular 19 and later (`^19 || ^20 || ^21
|| ^22`); components simple to plug.

- `@dzcalendar/angular` (ng-packagr, partial compilation): `<dz-calendar>`
  (standalone, OnPush) with signal inputs (`events`, `sources`, `timeZone`,
  `locale`, `axis`, `editable`, `selectable`, `businessHours`, `weekends`,
  `weekNumbers`, `hiddenDays`, `messages`, `options`), `model()` `view`,
  `date`, `selection`, outputs `dateClick`, `eventClick`, `eventOpen`,
  `createRequest`, `selected`, `sourceNotice`, `problems`;
  `CalendarController` (`title`, `range`, `view`, `date`, `canUndo`,
  `canRedo`, `loading`, `problems`; `prev/next/today/goTo/changeView/
  dispatch/undo/redo/refetch`); `dzEventContent`; `provideDzCalendar`;
  `DZ_CALENDAR` (one import). Created at construction (tzslot's rule), the
  widget call in `untracked`, only changed keys sent, echoes of `view` /
  `date` / `selection` no-ops, everything outside the zone under zone.js.
- DOM for it: the `content` hook gets the event's node; `update()` takes
  `timeGrid` and `headerViews` (the toolbar's buttons change live);
  `onUnselect` when a shown selection goes away.
- Tooling: Angular 21 dev dependencies, Analog's Vite plugin (vitest
  project `angular`, compiled templates; `angular-zone` with zone.js in its
  own processes; the playground's Vite limited to Angular files, Vite's own
  TypeScript transform put back for the rest), `npm run pack:local`,
  `npm run test:package` (a fresh application from the tarballs, `ng build`
  with strict templates and library types on Angular 19, 20, 21, 22; 19 and
  22 also run in Chrome), `playground/angular.html`.
- Tests: 883; browser 92/92 (Angular page: controller, `[(date)]`,
  `headerViews` after creation, axe). Size: angular 3.5 kB (≤ 6).

### Reviews (architect; code review by execution, scratch apps), fixed
- `[(selection)]` stale when the calendar cleared it (no DOM callback;
  `onUnselect` added, a view family change included); `[(date)]` bound to
  `undefined` never written; embedded views leaked or reused across a
  template change; under zone.js `update` and the controller ran in the zone
  (pointer moves would run change detection); `canUndo()` stale right after
  `dispatch()`; the controller kept a destroyed calendar; `axis` replaced
  `options.timeGrid`.
- One bad input (an unknown view, seven hidden days) threw at every later
  change and blocked them all; `[options]` callbacks silenced the outputs;
  a template did not follow the application's signals (views are now in the
  component's container); every change re-sent all events.
- The Vite plugin had turned TypeScript off for the whole playground (the
  main page broke for a few minutes on the owner's server; fixed, checked).

### Not done in Phase 11, on purpose
- `DzDayHeader`, `DzResourceLabel`, `DzMoreLink`, `DzSlotLabel`: the DOM has
  no such hooks yet; `resources` input with resources (Pro phases).
- `rangeChange` / `commandApplied` outputs: `controller.range()` and the
  store; an `eventChange` with `revert()` is Phase 9's per-source `save`.
- Creation-time options per instance (`views`, `rules`…) go through
  `provideDzCalendar` (component-level providers); no `[config]` input.
- `pack:local` keeps version 0.0.0: a consumer's lockfile may keep an older
  tarball (`test:package` installs fresh each time).

## Phase 12 — virtualisation of every view, print ✅ (2026-10-18)

Owner's decisions: a month day lists its drawn events to assistive
technology, all of them once entered (Enter); windowing only above
`virtualizeAbove` (default 500 events), so the common case keeps a screen
reader's full browse mode; an automatic time-grid "+N" (`eventMaxStack`);
a shared windowing helper; printing shows everything; nodes recycled; size
budgets at the measure + 3 % (core 36, dom 35.1, dom/list 4.8 kB).

- Measured first (`playground/perf.html`, U = 10 000 over a year, W = 10 000
  in a week): the worst cases were the month's hidden items (10 958 nodes),
  the week's 10 256 slivers, the list's 55 277 nodes, and three hidden costs —
  a quadratic lookup in month cells (68 ms), axis positions built from
  Temporal objects (190 ms for a crowded week's model), and an all-day row
  that grew without bound and squeezed the hours to 0 px.
- Core: quiet-day fast path in `time-axis` (a subtraction; checked equal to
  the slow path on 60 000 instants over 12 zones, historic offsets included);
  `TimeGridOptions.maxStack` and `MoreTimed` "+N" runs; `kernel.getOptions()`.
- DOM: month items on demand; time-grid windowing of the scrolled hours and
  "+N" links (the month's panel); list windowing (`RowWindow`: estimated then
  measured rows, anchored corrections, the top row kept across store
  changes); multi-month months asleep at a whole month's height, the year
  opening on its date's month; `NodePool` (event nodes, bars, list entries);
  `KeyedList` removes what leaves before placing the rest (kept nodes never
  move: the focus survives windowing); `ViewController.relayout()` on
  resize; measurements through the frame scheduler; `preparePrint()` /
  `autoPrint` (everything mounted, "+N" caps lifted, scroll restored); the
  all-day row capped (`--dz-allday-max`); `eventMaxStack` guessed from the
  host before the first paint; options validated (`eventMaxStack`,
  `virtualizeAbove`). Theme: `@media print`.
- `npm run perf:browser` (minified playground, median of 5, budgets in
  `perf/browser-budgets.json`): week U 24 ms, week W 98 ms / 2 203 nodes
  (was 540 / 28 903), month W 73 ms / 221 (was 176 / 10 958), list year
  42 ms / 255 (was 291 / 55 277), year U 85 ms, one event changed: ≤ 33 ms,
  one layout. Bench rows for the W models.
- Tests: 908; browser 100/100 (a crowded week with axe, the list's scroll
  stable, the hours printed whole).

### Reviews (architect; code review by execution in Chrome), fixed
- The kept nodes were moved by every window change (KeyedList walked past
  nodes about to leave): the focus fell to the page while scrolling, after a
  keyboard grab, after printing — removal now comes first.
- No re-windowing on resize or when a hidden calendar appeared; layouts
  forced inside writes (render, month waking); a windowed list jumping when
  rows came or went above the view; asleep months collapsed before a height
  was known, and sized on the grid instead of the month (17 px jumps);
  asleep grids exposed without rows; `eventMaxStack: 1` drew "+N" outside the
  column, bad values unchecked; `preparePrint` restore after destroy; the
  month lanes guess (wrong at common sizes) removed; the perf page did not
  exercise the week's window (a variant added).

### Not done in Phase 12, on purpose
- `visibleWindow()` on `ViewController` (the custom-view contract of D.2):
  `relayout()` covers resizing; a window query for custom views waits for a
  view that needs it.
- A scroll-frame cost budget (script ms per frame while scrolling) in
  `perf:browser`.
- An announcement when entering a crowded day ("N events listed").

## Phase 13 — complete theme, i18n, density ✅ (2026-10-18)

The owner's brief: DzCalendar serves any project, not only Sehhaty — a base
CSS the client overrides entirely without effort, the same for the words;
light and dark built in, and a few ready-made looks.

- **Owner's decisions**: families `standard`, `slate`, `night`, `pastel`,
  `frost`, `solar`, `contrast`, each light and dark (palettes inspired by
  Primer, Tokyo Night/One, Catppuccin, Nord, Solarized; names ours);
  `defineTheme` for one's own; densities; Arabic, Spanish, German as imports;
  Hijri display in this phase. After the review: **the page first** (a
  page's `--tz-*` beats a family), **iOS 15.4** as the floor (no
  `light-dark()`), **`cssLayers: false` + `tailwind3.css`** for unlayered
  resets, Arabic shipped as written (no native review pending).
- CSS: the calendar's CSS in cascade layers `dzcalendar.base` then
  `dzcalendar.theme` (a page's unlayered rule wins whatever its specificity);
  layered sheets appended (after a framework's own layers), unlayered ones
  first. Every colour reads `--dz-x`, else the palette resolved once on
  `.dz-cal` (`--dzc-*`: the page's `--tz-*`, else the family's `--dzp-*`,
  else a system colour). Families switched by `scheme`, `[data-theme]` and
  `prefers-color-scheme` with plain values; `color-mix()` tints fall back to
  the raised background under `@supports not`. `data-dz-theme` (always),
  `data-dz-scheme`, `data-dz-density`. Print layout in the base layer, no
  `!important`. Forced colours: pressed view, today, dots, outlines.
- Theme package: `dzcalendar.css` (layered), `unlayered.css` (+ `.scss`),
  `tailwind.css` (v4 layer order), `tailwind3.css`; 2.4 kB gzip.
- DOM: options `theme`, `scheme`, `density`, `displayCalendar`,
  `secondaryCalendar`, `cssLayers`; `defineTheme`, `themeCss` (CSP),
  `THEME_NAMES`; redefined themes update every sheet (shadow roots too);
  the alternate date beside each day (its month on the 1st, read from the
  day part), in headings and spoken names; Hijri titles naming every month
  covered (core `titleFor`); locale and calendars validated together before
  any change (canonical names and aliases taken as Intl takes them); an
  unrelated update never puts back a locale changed elsewhere, a shared
  kernel's locale followed; RTL fallback list.
- i18n: `@dzcalendar/dom/locales/{ar,es,de}` (2.1, 1.6, 1.7 kB);
  `defineLocale` takes words or a function of the full locale (digits follow
  it: `ar-SA` Arabic-Indic, `-u-nu-latn` Latin); `messages` is a
  `Partial<DzMessages>` kept across locale switches. Angular inputs for all.
- Checks: 938 tests; Chrome 123/123 — axe on 7 families × light/dark ×
  week/month, contrast pairs computed (text, muted, on accent ≥ 4.5, accent
  ≥ 3), forced colours, captures, and **the real Tailwind 3 preflight,
  Bootstrap 5.3 reboot and Tailwind 4's layered preflight**: every element of
  a week, a month and a list keeps the boxes and colours of a bare page
  (only a pointer cursor on `role="button"` events differs); the comparison
  is shown to catch Tailwind 3 breaking a layered calendar.
- Sizes: dom 37.2 kB (budget raised to measured + 3 %: 38.3 kB — themes,
  calendars, validation, unlayered mode; the owner approved the raise);
  theme css 2.4 kB.

### Reviews (architect; code review by execution in Chrome), fixed
- Architect: messages lost on a locale switch; `Partial` messages; Hijri
  titles naming one month; RTL fallback; CSP (`themeCss`); Tailwind order;
  forced-colours gaps; contrast checks beyond axe; captures; `:host`; print
  `!important` beating page rules; contrast outlines; values validated.
- Code review: one bad `locale` with a `displayCalendar` broke every later
  `update()` (and blamed the calendar); any `update()` put back a locale
  changed on a shared kernel; prepended layered CSS lost to Tailwind 4's
  preflight even with the recipe; families inert in a shadow root
  (documented: load the theme there) and redefinitions not reaching shadow
  roots; Arabic counts in Latin digits beside Arabic-Indic dates; the Hijri
  month missing on the 1st in ja/zh/ko; `'Islamic-Umalqura'` and aliases
  refused.

### Not done in Phase 13, on purpose
- A native review of the Arabic words (owner: ship as written).
- `contrast.css` as a separate file: the `contrast` family covers it.
- Families generated as `defineTheme` entries to reach shadow roots by
  themselves: loading the theme CSS in the root is documented instead.
- Visual checks on a real iOS 15/16 device: the fallbacks are checked by
  construction (no `light-dark()` in the theme; `@supports not` for
  `color-mix()`), not on WebKit.

## Phase 14 — slots ✅ (2026-10-18)

See `ARCHITECTURE.md` J. Phase 14.

- **Owner's decisions (2026-10-18):**
  - Availability = weekly windows in the provider's zone + dated exceptions
    (closed day, special hours) + optional RRULE windows for rare cases.
  - Busy = plain intervals from any source, plus the calendar's own events
    (`busy: true`); Google / Graph / CalDAV free-busy adapters later, apart.
  - Capacity (several seats per slot) is **Pro** (Phase 16), not in the MIT
    package: Phase 14's acceptance drops `capacity`.
  - Click in the availability view: the calendar reports the slot
    (`onSlotClick`), the application books; its server re-checks with the
    same engine before saving. Nothing is created optimistically.
- `@dzcalendar/slots` (3.0 kB gzip, budget 5): `findSlots`, `checkSlot`,
  `openSpans`, `busyFromEvents`. Weekly windows, dated exceptions (replace the
  windows opening on their date) and RRULE windows in the provider's zone;
  slots step in real minutes from each opening's start (an opening open for
  days on end: multiples of the step since the epoch, so the range never
  moves the grid; openings looked for a week back); bookings get the buffers
  and count toward `maxPerDay` (by the provider's date), blocks only take
  their time; `minNotice` and `maxAdvanceDays` from an explicit `now`; a
  closing time the clocks skip closes at the jump. `checkSlot` needs no
  range (the slot itself), returns the first rule broken, `problems` when
  the query is invalid. Nothing throws (bad shapes, out-of-range dates, a
  step under a minute → problems; last-resort catch); at most 10 000 slots /
  200 000 starts (`too-many-occurrences`).
- 55 conformance cases (`conformance/cases/slots`, by hand; clock-change
  dates checked against Python's zoneinfo; Riyadh, Paris, Chicago, Lord
  Howe, Kolkata, UTC around the clock). The forum case in ten lines, page and
  server (`slots.test.ts`, `docs/slots.md`). `slots 30 days at 15 min`
  6.8 ms minified (budget 25).
- Core: `availableSlots` model option → `TimeGridColumn.slots` (cut to the
  axis, de-duplicated, an overlapped slot drawn down to the next start),
  `slotInstant`. DOM: `.dz-slot` buttons (tokens `--dz-slot-*`), out of the
  tab order; `onSlotClick` hands back the very object given; without it the
  slots are disabled and a press acts as on empty time; the keyboard cursor
  says "Free slot, …" and Enter books; `freeSlot` in en/fr/ar/es/de.
  Angular `[availableSlots]`/`(slotClick)`. `playground/slots.html`.
- Checks: 1 012 tests; Chrome 131/131 (slots at their minute in their
  column, axe, a click books and re-checks, the provider's zone, an inert
  slot clicks and selects); Angular 19–22 from the tarballs. dom 37.7 kB
  (budget 38.3).

### Reviews (architect; code review by execution, Chrome included), fixed
- The slot grid moved with the query's range for openings chained across
  midnight (24/7): a server checking a narrower range refused slots the page
  showed. `checkSlot` required a range. The purity test did not read slots.
- Bad input threw (fractional days, a step of 1/7 minute, dates beyond
  Temporal's range, `null` entries, non-string times, ISO strings in
  `availableSlots`); no limit on the work (a tiny step over a year hung).
- A refetch with the same times kept the old slot objects (a click handed
  back stale data); a slot swallowed date clicks and selections when the
  application took no slot clicks; overlapping slots hid each other;
  slots before `slotMin` were dropped; two slots at one start, one dropped;
  a closing time in a skipped hour extended the opening; a vacuous Chrome
  check.

### Not done in Phase 14, on purpose
- Capacity (several seats): Pro, Phase 16 (owner).
- Free/busy adapters (Google, Graph, CalDAV): later, apart (owner).
- Slots in the month and list views; a "next free slot" key (the cursor
  steps by `snapMinutes`: keep slots on the snap grid); a drag starting on a
  bookable slot.
- A `find-slots` command in the serialisable command API: with
  `commands.schema.json`, Phase 18.
- `normalize+index 10k` reads 65–76 ms against 70 on this machine at both
  the Phase 13 and Phase 14 commits (noise around a tight budget, not a
  regression); the budget is left as it is.

## Phase 15 — Pro, resources and timeline ✅ (2026-10-19)

See `ARCHITECTURE.md` J. Phase 15.

### Owner's decisions (2026-10-18)

- **Split:** 15a — the resource model (tree, groups, resources in the
  kernel) and the resource views in columns (week/day/month by resource:
  Sehhaty's "one doctor per column"); 15b — the timeline (with and without
  resources) and windowing on both axes (500 × 10 000). Each sub-phase has
  its own reviews and commit.
- **Zone (K.6):** every column is drawn in the calendar's zone; a
  resource's `timeZone` serves its business hours (shaded outside them,
  each computed in its own zone) and slots. No per-column zone.
- **Interactions:** everything from the start — drag from one resource to
  another, resize, select a range on a resource, context menu, keyboard,
  the same rules (constraint, overlap, a resource's `eventConstraint` /
  `eventOverlap`), undo.
- **Resource area (15b):** expandable tree, grouping by a field, several
  field columns with adjustable widths.
- **Package boundary (K.5):** resource columns live in core and dom, next
  to the grids they extend (as MUI X keeps them free); `@dzcalendar/pro`
  is born in 15b with the timeline, a new family.
- **Licence:** still all MIT (2026-10-16 decision): `@dzcalendar/pro` is a
  code boundary, no key, no watermark — `license.ts` is not written.
- **15a follow-ups (2026-10-18):** an empty resource view says "No
  resources to show"; events on no resource (or an unknown one) stay out of
  resource views; ←/→ stay in one resource's days and **Alt+←/→** go to the
  next resource (cursor and held event); size budgets raised to measured
  + 3 % (core 39.4 kB, dom 41.7 kB, locales/ar 2.2 kB); Chrome's first
  `timeGridWeek:U` frame 27 ms (26 measured; 25–27 at the Phase 14 commit,
  a budget at its edge).

- **15b decisions (2026-10-19):** eight timeline views — day, week, month,
  year, each with resources (`resourceTimelineDay`…) and without
  (`timelineDay`…); default slots: day 30 min, week 1 h (horizontal scroll,
  days above the hours), month and year 1 day (configurable); rows of a
  **fixed height with "+N"** past N lanes (not growing rows); an optional
  "Unassigned" row (`showUnassigned`, off by default) for events on no
  resource or an unknown one — dropping there removes the resource,
  dragging out assigns one — also offered to the column views.

### 15a — resource columns ✅ (2026-10-18)

**Built**
- `core/resource/{types,tree,rows}`: `buildResourceTree` (order, orderBy
  fields or function, cycles, duplicates, unknown parents → Problems, never
  throws), `fieldOf`, `flattenRows` (expanded, groups, filter — ready for
  the timeline's area), `columnResources`.
- Kernel: `resources`, `setResources` (cause `'resources'`),
  `getResources`, `getResourceProblems`, `resourceOrder`,
  `resourceGroupField`; rules carry the tree.
- Views `resourceTimeGridDay/Week`, `resourceDayGridDay/Week/Month`: the
  time and day grids with a column per resource and date (resources first),
  heads and group heads, per-resource business hours read in the resource's
  zone, the now line in every column of today, slots per resource.
- Rules: a resource's `eventConstraint` (else the calendar's) against its
  own hours in its zone; its `eventOverlap` decides for shared events.
- Interactions: drag between resources (the grabbed one swapped, others
  kept), resize, select, date click and context menu with `resourceId`,
  keyboard (labels say the resource, Alt+←/→, grab across resources),
  undo.
- DOM: `render/resource-heads.ts`, `hooks.resource.content`,
  `onResourceProblems`, `noResources`, `ofResource` (5 languages, `،` in
  Arabic); Angular `[resources]`, `(resourceProblems)`.
- Tests: `core/test/resources.test.ts`, `dom/test/resources15.test.ts`,
  conformance `resource-tree` (10) and `resource-rules` (10, one on the
  25 October fall-back), 16 Chrome checks (`playground/resources.html`,
  capture `resources-day.png`), benches `resource week model (20 × 10k)`,
  `resource month model (20 × 10k)`, `resource tree 500 + rows`.
- Docs: `docs/resources.md`, `docs/behaviors/resources.md`, keyboard sheet.

**Reviews fixed**
- Regression: in a plain time grid an event with a `resourceId` could not
  be moved by keyboard (the grab took a resource no column had).
- An all-day event on two resources taken from the second one's bar
  swapped the wrong one (bars now carry their column's resource).
- Resources replaced during a keyboard grab: it is let go; a cursor whose
  column vanished starts again at home.
- `eventMaxStack: 'auto'` measured again when resources change.
- Resource problems reach the application (`onResourceProblems`); no
  English sentence in Problem details; `fieldOf` reads own keys only; a
  throwing `resourceOrder` comparison is a warning, not a crash.
- `resourceColumns` renamed `columnResources` and the heads file
  `resource-heads.ts` (the timeline's area will have field columns).
- Week-view arrows that jumped six days back onto the next resource
  (owner's decision: Alt+arrows for resources).
- Missing tests (undo, `resourceEditable: false`, problems callback,
  empty view), behaviour sheet, 500-resource bench, ARCHITECTURE
  contradictions (K.5/K.6, Pro scope, file tree).

**Not done on purpose**
- Dates above resources; per-column zones (K.6); horizontal scrolling of
  many resource columns (use the day view or the timeline).
- `unknown-resource` for events (resources may arrive after events). (The
  "Unassigned" column came in 15b, `showUnassigned`.)
- `resource.set` as an undoable command (`setResources` is data, like
  `setEvents`).
- Windowed per-resource rows, an overlap check indexed by resource,
  `didMount` / `willUnmount` for resource heads, a resource click: see 15b's
  "Not done on purpose" (row state in the kernel came in 15b).
- Slots stay instants: a resource's zone is not given to `findSlots`.
- ical's size (7.9 kB against 7.5) was already over before this phase:
  left for the owner.

### 15b — the timeline ✅ (2026-10-19)

**Built**
- `@dzcalendar/pro` (MIT for now): `timeline/axis.ts` (elapsed axis cut on
  the wall clock: 23/24/25-hour days at their width, 02:00 twice on a
  fall-back night), `model.ts` (rows: resources, groups, "Unassigned", or one
  row without resources; fixed height with "+N"; shading per resource zone,
  memoised; row bodies reused across folds; fine update by touched
  resource), `family.ts` (the eight views, registered with every kernel),
  `view.ts` (one scroller, sticky area and heads, windowing on both axes,
  treegrid, area columns with resizers, gestures, keyboard, menu, "+N"
  panel), `styles.ts`; `@dzcalendar/pro/model` without a DOM.
- Core: `UNASSIGNED` and `instancesOf`, `showUnassigned` (column views too),
  `collapsedResources` / `collapsedGroups`, `timeline` options with
  `assertTimeline`, `registerViewSpec`, keymap grid `'timeline'`,
  `keepAllDay`.
- DOM: horizontal scroll in gestures (scrollX, autoscroll past the sticky
  area, period change only at the scroll's end), `viewOptions`,
  `onResourceToggle`, `update({ timeline, collapsedResources,
  collapsedGroups, showUnassigned })`, shared event-node selectors; words
  `unassigned`, `resource`, the timeline views' names (5 languages).
- Tests: `pro/test/timeline.test.ts` (axis, model, kernel),
  `pro/test/dom/timeline-dom.test.ts`, conformance `timeline-axis` (11 hand
  cases from the zones' published rules), 14 Chrome checks
  (`playground/timeline.html`, capture `timeline-day.png`), browser perf
  `resourceTimelineWeek:U:500`, `:W:500`, `resourceTimelineMonth:U:500`,
  `timelineDay:U` (first frame, script per frame, longest frame), bench
  `timeline week model (500 × 10k W)`.
- Docs: `docs/timeline.md`, `docs/behaviors/timeline.md`.

**Reviews fixed**
- The "Unassigned" sentinel reached `onDateClick` and `onSelect`.
- An all-day event dragged in an hourly timeline became timed (data loss):
  `keepAllDay`.
- Treegrid: levels under groups, `aria-colcount`/`aria-colindex`, header
  row index, a named first column head, the repeated 02:00 said with its
  offset (not by a tooltip), the separators one tab stop.
- Right to left, dragging to the edge never changed period.
- Month and year opened on the 1st, not today.
- The cursor vanished when its row was folded, and kept the old scale's
  place after a scale change.
- A dragged width stuck to the column's index, not its field; an area
  wider than the scroller left no time (40–480 px per column).
- A day the zone skipped was blank: said now.
- Autoscroll zones over the sticky area and heads; bad `slot`/`maxLanes`
  silently guessed (now a RangeError); the fold rebuilt every row; shading
  computed per row; the scroll measure averaged away spikes (longest frame
  measured); `update()` could not change the timeline keys; no fold
  callback; ↑/↓ did nothing on a focused event.

**Not done on purpose**
- A row builder windowed by resource (rows are all built, reused across
  folds; 500 × 10 000 is 38 ms worst in Chrome).
- An overlap check indexed by resource during a drag; a drag-validation
  bench; month/year benches with business hours.
- `didMount`/`willUnmount` and a click for resource heads; area widths kept
  beyond the view's life (no `onAreaResize`); Shift+↑/↓ selection across
  rows.
- `visible2D` (the view windows itself), a split of `view.ts` into area /
  windowing modules.
- `perf:browser`'s "update" lines are one sample (not a median): one run
  read `timeGridWeek:U update` 20 ms, three reruns 2–3 ms — a spike, not a
  regression; a median there is left for later.
- Owner's budget raises (measured + 3 %): pro 14.1 kB, locales ar 2.3, es
  1.9, de 1.9 kB. ical (7.9 against 7.5) is still as it was before Phase 15.

## Phase 16 — Pro: editor, capacity, printing, exports ✅ (2026-10-19)

See `ARCHITECTURE.md` J. Phase 16.

### Owner's decisions (2026-10-19)

- **Split:** 16a — the event and recurrence editor, slot capacity,
  `pro-angular`; 16b — paged printing and the PDF / PNG / XLSX / ICS exports.
  Reviews and a commit per sub-phase.
- **Exports without dependencies:** XLSX (a zip of XML) and ICS written by
  us; PNG and PDF drawn from the view's model (a canvas for PNG, a simple
  vector PDF); loaded on demand from a sub-entry. No third-party library.
- **Editor:** an accessible modal dialog — title, start and end with the
  zone, all-day, resources, colour; usual recurrence (every N days / weeks /
  months / years, weekdays, "2nd Tuesday", ending never / on a date / after
  N); a rule beyond that is shown and kept as it is. The application can
  replace the editor.
- **Capacity:** simple seats — `capacity: N` per query or per resource; a
  booking takes 1 seat (or its `seats`); a slot is offered while seats
  remain; the view says how many ("2 seats"); `checkSlot` refuses with
  `full`. Rotas and advanced constraints are not in it.

## Phase 16b — paged printing and exports ✅ (2026-10-19)

### Owner's decisions (2026-10-19)

- **PDF = pages as images:** each page drawn on a canvas (the browser shapes
  Arabic and Hebrew), the images put in a PDF we write ourselves. No
  dependency; text not selectable; ~150–300 kB a page accepted.
- **Paged printing by the browser:** `printPages({ paper, orientation,
  range })` builds real A4/Letter pages in the DOM — a week, a day or N
  resource rows per page, headers (hours, resources, dates) repeated — then
  `window.print()` ("Save as PDF" works too, text selectable).
- **Views:** PDF and PNG draw every view from its model — time grid (day,
  week, resources), month, list, and the timeline; days of 23 h and 25 h at
  their real size.
- **XLSX (and CSV):** one row per occurrence over the asked range; title,
  start and end in the event's zone + the zone, start and end in the
  display zone, real duration, all-day, resources, status; real Excel dates.
- (Phase 16) Exports without dependencies, loaded on demand from a
  sub-entry; ICS through `@dzcalendar/ical`'s `serializeICal`.
- **After the reviews (owner):** budgets measured + 3 % (export 12.3 kB,
  print 4.4 kB, core 41.5 kB, ical 8.1 kB — core 39.9 and ical 7.9 were
  already over at 16a, tolerated by the 5 % margin and missed in that
  report); paper always light (print and PDF/PNG); an "end time zone"
  column (a flight's end in its own zone: 11 columns).

### Built

- **Core:** `kernel.stateAt(type, date)`, `kernel.modelAt(type, date,
  over?)` (another view or date as it would be shown, hidden days applied,
  nothing shown changed; `over` lays family options on: paper lifts the
  "+N" caps); views looked up as own keys; `sources.hold(start, end)`
  (fetched and kept beside the shown range; `ready` names the chunks that
  failed); problem code `invalid-export`.
- **Dom:** `CalendarInstance.getOptions()`.
- **`@dzcalendar/pro/export`:** `occurrenceRows` (both zones, the real
  duration, series expanded once), `toCSV` (BOM, CRLF, formula guard),
  `toXLSX` (a stored zip of SpreadsheetML: real Excel dates with the 1900
  leap bug, frozen and filtered head, right to left in Arabic), `zip`,
  `crc32`, `pdfFromJpegs` (PDF 1.4, a JPEG a page, UTF-16 title),
  `periodsFor`, `paintSheets` (pure drawing operations for the time grid,
  month, list and timeline, mirrored right to left), `drawSheet` (canvas,
  per-text direction, "…" fitting), `exportPDF`, `exportPNG`, `exportXLSX`,
  `exportCSV`, `exportICS` (series whole, overrides kept), `download`;
  words in five languages (`exportMessagesFor`, `defineExportLocale`).
- **`@dzcalendar/pro/print`:** `printPages(cal, { view, from, to, paper,
  orientation, rowsPerPage, print })` — a copy of the calendar per period
  in A4/Letter/A3 sheets, store shared, sized to the sheet (hours to its
  height, weeks to its height, a timeline's slot to its width and coarse
  enough to label), a resource timeline split by whole top-level
  resources, no "now" line, light paper; `PrintJob { pages, problems,
  close }`.
- **Playground:** print and export buttons on `timeline.html` and
  `resources.html` (`playground/export-controls.ts`).
- **Measured:** `pro/export` 11.9 kB, `pro/print` 4.3 kB; a two-week
  timeline PDF ~260 kB; Chrome checks 183 (PDF page count, XLSX/ICS/CSV
  bytes, @page size as Chrome reads it, print sheets 1123 × 794 with the
  25-hour day across, Arabic export, cleanup).

### Reviews (architect; code review by execution in Chrome), fixed

- **Paper:** `@page` mixed lengths and an orientation keyword (invalid:
  Chrome printed on its default paper) — lengths alone now, checked as
  Chrome reads them back. A month's "+N" was drawn below the grid (the
  week's lane count, not the day's drawn lanes), the sheet lanes reserved
  one too many; 15-minute events had no text; RTL "+N" read "27+"; Arabic
  timeline labels were cut; the last gutter label hung below the grid.
- **Copies:** they took the calendar's motion adapter (closing a print
  destroyed the live one) and every handler (a 20-sheet print would call
  the application 20 times): stripped. No cleanup when a copy failed to be
  made, no `onDestroy`, two jobs printing together, `afterprint` left
  attached — one job per document, closed on failure, on destroy, on a new
  print. A sheet that cannot hold its copy now says `clipped:n`.
- **Bad input:** `toString` as a view, `null` options, a string date, a
  bad separator, orientation or scale: problems or warnings now, never a
  throw; every public function wrapped (a refused canvas, a destroyed
  calendar). Problem details are short codes, not sentences.
- **Data:** the ICS of a range dropped a series' moved occurrences; PDF/PNG
  ignored hidden days and weekends; the default range of another view was
  the shown one's; a false "cut at 60" warning; the PDF's title was the
  shown period's; U+FFFE/U+FFFF and lone surrogates made the XLSX
  unreadable; Excel serials before 1 March 1900 were a day off.
- **Memory:** every sheet's canvas was held at once (~14 MB each at scale
  2): one canvas, each sheet encoded before the next; at most 300 sheets.
- **Sources:** a failed fetch gave a file silently missing events: `hold`
  reports the failed chunks, the exports and the print say them.
- **Packaging:** `pro/print` no longer pulls the painters (`periods.ts`,
  `paper.ts`).

### Not done in Phase 16b, on purpose

- Column paging of a resource time grid or month with many resources
  (they are drawn narrow on one sheet); collapsed resources still count in
  a timeline's split; "Unassigned" repeated on every sheet.
- PNG of several sheets as several downloads (the `zip` is there for an
  application that wants one file); the XLSX row limit (1 048 576).
- A PDF with selectable text (owner's decision: images; the browser's
  "Save as PDF" of `printPages` has it).
- With an external `kernel`, `getOptions()` lacks the kernel's own options:
  a print copy may then differ.

## Phase 16a — the editor, seats, pro-angular ✅ (2026-10-19)

### Built

- **Core commands:** `series.rule { id, rrule }` (another rule for a whole
  series; its excluded dates, moved occurrences and WKST kept; HOURLY and
  finer refused on an all-day series; `null` stops it: the first occurrence
  becomes the event, moved ones stand alone) and `event.repeat { id, rrule }`
  (a single event becomes a series: same id, every field, its source). With
  `rules` (a person's change), `event.create`, `event.repeat` and
  `series.rule` check a series on its occurrences (a year, 500 at most); a
  rule with no occurrence is a warning.
- **`@dzcalendar/pro/editor`:** `openEventEditor(cal, target, o)` →
  `'saved' | 'deleted' | 'cancelled'`, `editorHandlers(cal)` (context menu
  "Open" / "New event here"). Modal dialog on tzslot's `createDateTimeRange`;
  title, when, zone, resources, colour, repeat (`readRepeat` / `writeRepeat`:
  every N days/weeks/months/years, weekdays, n-th or last weekday, ends
  never / on a date / after N; anything else "custom", kept); "this / this
  and following / all events" for an occurrence. Words in EN, FR, AR, ES, DE
  (`editorMessagesFor`, `defineEditorLocale`), `EDITOR_CSS`.
- **`@dzcalendar/pro/slots`:** seats over `@dzcalendar/slots` — `capacity`,
  a booking's `seats`, refusal `full`, `seatedBusyFromEvents`,
  `resourceSeats` (a resource's `extendedProps.capacity`, its own bookings).
  The time grid shows "10:00 · 2 places" (`AvailableSlot.seats`, message
  `seatsLeft` in five languages).
- **`@dzcalendar/pro-angular`:** `<dz-calendar dzEventEditor
  (editorClosed)>`, the editor fetched on its first opening; Angular 19–22
  in `test:package`.
- **`@dzcalendar/dom`:** `CalendarInstance.onDestroy(fn)`.
- **Measured:** `pro/editor` 10.3 kB (budget 10.6), with tzslot's widget
  36.4 kB (37.5), `pro/slots` 1.69 kB (1.74), `pro-angular` 0.76 kB (0.8);
  bench `seats 30 days at 15 min (2000 bookings)` 13 ms (budget 25, as the
  free engine's line). `@tzslot/core ^2.2.0` everywhere (owner, after the
  reviews).
- **Noise noted:** `normalize+index 10k` read 66–78 ms (budget 70) on a
  loaded machine (a VM, Xcode, another vitest run); the Phase 15b commit,
  benched in a worktree beside it, read the same 72–75 ms. Unchanged code
  path; 68 ms once the machine was quieter. Not raised.

### Reviews (architect; code review by execution in Chrome), fixed

- **Data:** a save compared the rule as text (another spelling or its own
  WKST was rewritten — an UNTIL before the event's hour added an
  occurrence): compared as forms now, nothing written when nothing changed.
  "Does not repeat" deleted and recreated the series, and a single event made
  to repeat was deleted and recreated (fields lost): `series.rule null`,
  `event.repeat`. A flight's end zone was replaced by the start's. Moving a
  series and changing its rule together put it back on the old weekday: the
  rule goes first, the move rebases it.
- **Checks:** until empty or before the start, no weekday, a bad count or
  interval: said, marked `aria-invalid`, focused. A series made or changed by
  a person was checked on its first occurrence only: all of them now.
- **Focus and lifecycle:** Escape closed the dialog while a tzslot picker was
  open; the focus trap pulled the focus out of tzslot's picker (opened on
  the body); a click outside lost what was typed; the focus was lost when
  opened from the context menu; the calendar destroyed left the dialog open;
  a second opening made a second dialog. All fixed, the Chrome checks added.
- **Look:** tzslot's styles were never injected (the widget was made before
  the dialog was in the document: an empty 16×6 switch); the picker's chosen
  day was white on white (no `--tz-*` outside `.dz-cal`): the palette is
  resolved on the backdrop and handed to tzslot.
- **Markup and words:** inline inputs taken out of their radio's label, a
  frequency label distinct from its group, a "custom rule" option, problem
  codes said in words.
- **Seats:** `maxPerDay` and the buffers read as nothing when invalid (now
  refused, as the free engine does); a `busy` not a list hidden from the
  engine; an unreadable booking reported at the wrong index; seats shown
  only when a whole number ≥ 1; the seat count by binary search (bench
  line); property tests (capacity 1 against the free engine; `checkSlot`
  against `findSlots`, nine zones, DST days).
- **Packaging:** `@tzslot/dom` an optional peer dependency of `pro`;
  `pro-angular` no longer imports the timeline, fetches the editor lazily,
  and reports a failed fetch (`editorClosed` 'cancelled').

### Not done in Phase 16a, on purpose

- "This and following" with another rule (the repeat shows with "all
  events" only).
- Rotas and advanced capacity constraints (owner's decision).
- tzslot's words in Spanish and German; its `aria-haspopup` (upstream).
- The Angular directive is tested zoneless only: zone.js in jsdom breaks
  inside tzslot (`addEventListener` with `signal`, a jsdom realm issue);
  `test:package` builds it on Angular 19–22.

## Phase 17 — animations ✅ (2026-10-19)

See `ARCHITECTURE.md` J. Phase 17.

### Owner's decisions (2026-10-19)

- **"Very nice things with GSAP"**, all four families:
  - **zones and DST** (the product's signature): on a zone change every
    event glides to its new time (the instant stays, the clock changes); the
    repeated hour of a 25-hour day unfolds, a 23-hour day's skipped hour
    folds; a living "now" line;
  - **navigation**: month → day morph from the clicked cell (shared
    element, Flip), the title as an odometer, "today" as a quick run
    through the periods between, depth when sliding (heads and body at
    different speeds);
  - **events**: drag with tilt from the gesture's speed and magnetic slots,
    a drop that settles, a delete that dissolves (and comes back on undo),
    a selection that pours into an event, entrances as a wave;
  - **overlays and timeline**: "+N" and the editor opening from what was
    clicked, resource rows as an accordion, scrolling to "now" eased with
    inertia, the seats counter animated.
- **Presets:** "sober" (default: soft curves, 200–350 ms, no bounce — a
  health app) and "expressive" (springs, squash, bounces); every duration
  and effect adjustable.
- **Without GSAP:** a light WAAPI base in `@dzcalendar/dom` (period slide,
  event entrance, overlays; < 1 kB); everything else comes with GSAP.
- **Plugins:** Flip, CustomEase, InertiaPlugin, ScrollToPlugin (GSAP 3.13+,
  all free), each loaded only when its effect is on. GSAP stays an optional
  peer of the application, never in `@dzcalendar/dom`.
- Always: off under `prefers-reduced-motion`; transforms and opacity only.
- **Split (17a / 17b)**, reviews and a commit per sub-phase.
- **After 17a (owner):** budgets measured + 3 % (dom 43.4 kB, motion-gsap
  3.6 kB); "today" from far is one long fast slide and a soft stop (no run
  through the periods between); the 17b plugins are given by the
  application.

## Phase 17a — motion foundations, the zone/DST signature, navigation ✅ (2026-10-19)

### Built

- **`@dzcalendar/dom`:** `MotionAdapter.beforeChange` / `afterChange`
  (`MotionChange`, `MotionSide`), `titleChange`, `nowTick`; changes before
  one paint merged; a family remount is a change; `WAAPI_MOTION` (the
  default: a period's slide, reversed right to left; entrances up to 60
  nodes; overlays) and `createWaapiMotion`; the toolbar's title exposed.
- **`@dzcalendar/motion-gsap`:** presets `SOBER` / `EXPRESSIVE`, every
  value adjustable; effects `zone` (events glide to their new times, reads
  then writes, only what moved, 150 at most), `dst` (the repeated hour
  unfolds, the skipped one folds in, the "25 h" note pops), `now` (glide in
  its column, pulse), `morph` (a day cell on screen opens into the day),
  `odometer` (a copy rolls the changed words, or the whole title; the live
  title already says them), `today` (> 45 days: a long fast slide), `depth`
  (heads half the body's way, reversed right to left); `opacity` only;
  `matchMedia` from the first use and after a destroy; destroy finishes
  what runs.
- **Playground:** a "Mouvement" select (GSAP sober / expressive, WAAPI,
  none); a month day click opens the day (the morph).
- **Tests:** dom hooks, no GSAP in dom, the adapter (presets, odometer,
  reduced motion, toggles, destroy mid-roll, one roll at a time, a shared
  adapter, no morph week → month); Chrome (zone glide, odometer over the
  title, month → day, right to left, two zone changes in a row, an adapter
  swapped mid-slide, reduced motion, the WAAPI default, print copies
  still).
- **Measured:** dom 42.1 kB, motion-gsap 3.5 kB; `timeGridWeek:U` 26 ms
  (budget 27); a zone change with 336 event nodes ~23 ms of script, one
  33 ms frame (40 nodes: frames ≤ 17 ms).

### Reviews (architect; code review by execution in Chrome), fixed

- Print copies took the new WAAPI default (events faded in on paper):
  `NO_MOTION`. A module-level adapter stopped following reduced motion
  after its first calendar was destroyed; it read `matchMedia` at creation
  (a server would throw). `visibility` (autoAlpha) could take the focus
  from a hidden event. The zone glide read and wrote per node, tweened
  nodes that did not move, fired on a view + zone change; a second zone
  change mid-glide made events jump. The morph fired on week → month and
  from off-screen cells. The now glide measured on the screen (a scroll
  moved it). Right to left slid the wrong way. The odometer copy was wider
  than the title (text jumping sideways) and paired words of different
  titles by position; it rolled on locale changes; it left the toolbar
  positioned; two could overlap. Swapping adapters mid-slide left the body
  half-transparent (killed tweens skip their clearProps). A stale change
  survived a failed mount or an adapter swap; several changes before one
  paint lost causes; `rtl` was read before a locale's direction.

### Not done in Phase 17a, on purpose

- The events, overlays and timeline effects (17b).
- Week → day morph (a time grid has no day cells to open from).
- A long glide for a zone change in a big month is capped at 150 nodes;
  the "now" glide starts from the second minute after a paint.

## Phase 17b — events, overlays, timeline ✅ (2026-10-19)

### Built

- **`@dzcalendar/dom`:** `eventsEnter(nodes, { cause, from? })` (a
  person's change; the selection it was made from); `eventsLeave(copies,
  info)` → promise, with `wantsLeave()` — copies made **before** the redraw
  of the nodes of the events the change touches (`removed`, `updated`,
  `seriesChanged`; an occurrence's node by its series), kept only if
  neither the piece nor the occurrence is drawn after, in a `.dz-leave`
  layer, without ids or keys, cut to their scroller, placed in any
  direction; `EVENT_NODE` skips them; `seatsChange`; `scroll(el, to)` with
  `ViewCtx.easeScroll` and the toolkit's `scrollEased` (the time grid, the
  timeline); `overlayOpen(el, origin)` (menus from the pointer, "+N" from
  its link), `overlayClose`; `dragStart(ghosts, kind)`;
  `CalendarInstance.motion`; "today" from another date scrolls to now
  (an hour before; elapsed minutes on a timeline).
- **`@dzcalendar/pro/editor`:** opens out of the event (or the selection)
  and closes back into it (the backdrop inert meanwhile; tzslot's widget
  destroyed once it is gone).
- **`@dzcalendar/motion-gsap`:** effects `drag` (lean from `--gx`/`--gy`
  speed, 3° sober / 9° expressive, magnetic glide, a resize does not lean;
  a thrown drop with InertiaPlugin), `leave` (dissolve; gathered back on
  undo within a minute, per calendar), `enter` (pour from the selection;
  the wave a third of a second at most), `overlay`, `seats` (roll and
  pop), `scroll` (ScrollToPlugin or the scroll properties; stopped by the
  person's wheel, touch, pointer or key; never kills a slide), `rows`
  (only on a fold or an unfold); `plugins` given by the application.
- **Playground:** plugins on `/`; GSAP on the timeline (with the editor)
  and the slots pages.
- **Tests:** dom (copies with their words and no ids, in the layer; undo
  enters with its cause; no copy for a move or with `wantsLeave` false;
  `scrollEased`), the adapter (dissolve then gather back, reduced motion);
  Chrome (copy where the event was in French and Arabic, an occurrence
  dissolving, undo gathering from 0.86, menu origin, eased scroll leaving
  the slide whole, editor in and out, accordion, drag lean, seats pop,
  reduced motion).
- **Measured:** dom 43.5 kB (budget 44.9), motion-gsap 5.2 kB (5.4);
  `timeGridWeek:U` 26 ms (27).

### Reviews (architect; code review by execution in Chrome), fixed

- Copies were cloned after the redraw, from nodes the pool had already
  emptied (blank copies; undo never gathered back) — now before it, only
  of the events touched; a deleted occurrence was missed (its node carries
  `series@key`, the change names the series in `seriesChanged`). Copies
  sat at the wrong place (logical insets undid their `left`; right to left
  too), drew over the heads when scrolled half out, kept their ids
  (queries found them). The eased scroll killed the period slide (an
  overwrite skipped its clearProps). "Today" scrolled on view changes and
  an hour off on a timeline's DST day. The drag loop read layout and its
  own rotation each frame, died when the hit was lost, tilted resizes,
  piled tweens; a refused drop flew back tilted; a thrown drop kept a
  killed entrance's scale. The accordion fired on lane measures and used
  two eases. The wave could last seconds. The dissolved-ids map grew
  forever, across calendars. The editor emptied its "when" field while
  closing and stayed tabbable. Every capture ran under reduced motion; a
  deferred paint kept a stale "from"; a cleanup closure per delete stayed
  in the calendar's scope.

### Not done in Phase 17b, on purpose

- No dissolve in the list view; rows folding away have no copy.
- One adapter's drag state is shared by calendars that share it (one drag
  at a time).
- The focus after creating from a selection (earlier than 17b).

## Phase 18 — ecosystem (in progress)

### Owner's decisions (2026-10-19)

- **Split:** 18a — Angular complements (print and exports from a service
  or directive, GSAP motion provided once, `ng add @dzcalendar/angular`,
  Angular examples in the docs) and the Web Component; 18b — the
  FullCalendar translator and its codemod; 18c — React, Vue, `llms.txt`,
  `commands.schema.json`, the public benchmark. Reviews and a commit per
  sub-phase.
- **Translator + codemod:** `fromFullCalendar(options)` at run time (what
  has no equivalent is a warning), and a command-line codemod rewriting the
  source; its code parser is a dependency of the tool only, never of the
  calendar.
- **React and Vue**, both at Angular's level (component, two-way view,
  date and selection, event templates, the Pro editor), tested by a real
  application built.
- **Benchmark against FullCalendar as a black box:** installed only in
  `bench-public/`, used through its public API on the same scenarios;
  results and protocol published; its code never read nor copied
  (CLEANROOM).
- **18a (owner, 2026-10-19):** the Web Component in both modes — light DOM
  by default (the page's CSS, themes and Tailwind apply), a `shadow`
  attribute to isolate it (styled then by the `--tz-*`/`--dz-*` palette
  and `::part`); Angular print and exports as an injectable service
  `DzExport` (`print`, `pdf`, `xlsx`, `csv`, `ics`, `png`, with the
  calendar's `CalendarController`, the Pro loaded on demand);
  `ng add @dzcalendar/angular` installs the packages, adds the theme CSS
  and `provideDzCalendar()`, offers GSAP motion, offers the Pro, and adds
  an example component.

## Phase 18a — Angular complements, the Web Component ✅ (2026-10-19)

### Built

- **`@dzcalendar/angular`:** `provideDzMotion(() => adapter)` (one adapter
  per calendar; a `motion` in `provideDzCalendar` or on a calendar wins; a
  factory that throws is reported to the `ErrorHandler`, the calendar drawn
  without motion); `ng add @dzcalendar/angular` (packages at their own
  versions from `schematics/versions.json`, the theme in `angular.json`'s
  styles, `provideDzCalendar({})`; prompts for GSAP motion —
  `provideDzMotion(() => createGsapMotion())` —, the Pro and an example
  `src/app/agenda.ts`; idempotent; the first application with a build;
  existing `gsap` / `@tzslot/dom` kept; CommonJS `.cjs` in
  `dist/schematics`).
- **`@dzcalendar/pro-angular`:** `DzExport` — `print`, `pdf`, `png`,
  `xlsx`, `csv`, `ics`, `download` (PNG sheets zipped), with the component,
  its `CalendarController` or the DOM calendar; the Pro fetched on first
  use; outside the zone, settled inside; never rejects. `@dzcalendar/angular`
  is a peer.
- **`@dzcalendar/element`:** `<dz-calendar>` (`DzCalendarElement`,
  `defineDzCalendar(name)`, `@dzcalendar/element/define`) — light DOM by
  default, `shadow` isolates it (`:host` a block, the theme by
  `stylesheet`, `::part(calendar | toolbar)`); live attributes; `events`,
  `resources`, `sources`, `options` (live keys in place, else remade on
  its store, `dz-remade`); composed `dz-*` events; the offering callbacks
  only when listened to; `problems`; server-safe import.
- **`@dzcalendar/dom`:** `activeIn` / `targetOf` (toolkit) — focus and
  event targets read in a shadow root (menus, "+N", focus after undo, the
  editor's trap); the measuring probe placed physically (no page-wide
  scroll right to left).
- **Core:** problem code `invalid-option`.
- **Docs:** `docs/angular.md` (install, a calendar, defaults, motion, the
  Pro), `docs/element.md`; playground `element.html` (both modes).
- **Measured:** pro-angular 1.46 kB (budget 1.5), element 2.9 kB (3.0),
  dom 43.6 kB (44.9), angular 4.0 kB (6.0).
- **Bench noise:** `normalize+index 10k` read 70–79 ms (budget 70); the
  17b commit, benched alternately in a worktree beside it, read the same
  75 ms on this machine at that time. 18a does not touch that path (a type
  only). Not raised; to watch (it has been at the line since 16a).

### Reviews (architect; code review by execution in Chrome), fixed

- In a shadow root, menus closed on the press (the event retargeted to the
  host), "+N" lost its focus order, the editor yanked the focus at each
  move, focus after undo jumped: `activeIn` / `targetOf`. Importing the
  element threw on a server. A bad zone or view at mount left a blank
  element, and the problem was said before anyone listened. `options`
  remade the calendar for any new object (losing edits and undo); `events`,
  `sources` could throw, bad events were never said, one bad source left no
  calendar for good. Every callback was passed, so "Open", "New event
  here" and slot buttons showed with nobody listening. Booleans taken away
  hid the weekends; swapping `shadow` emptied it; no default `display`;
  `dz-command-refused` lost its command; details were sentences. The
  schematic doubled the providers when run twice, replaced the
  application's `gsap`, could pick a library, wrote one version for every
  package. `DzExport` relied on `instanceof` (two copies of the Angular
  package) and could reject; no PNG download. Right to left, a probe gave
  the page 10 000 px of horizontal scroll.

### Not done in Phase 18a, on purpose

- A page listening on `document` (not on the element) for `dz-event-open`,
  `dz-create-request` or `dz-slot-click` does not turn those offers on:
  listen on the element, or give the callback in `options`.
- The schematic's NgModule application path is handled by
  `addRootProvider` but not in `test:package` (standalone only).
- Remade on new options: the undo history starts again.

### 18b — owner's decisions (2026-10-20)

- **Coverage: essentials + Premium** — views and navigation, zone and
  locale, events and sources (JSON, function, iCal), editing and selection,
  hours and days shown, business hours, constraints, callbacks (click,
  select, drop), the toolbar, resources and the timeline; anything else a
  warning "no equivalent".
- **Dates:** a time without a zone is read in the calendar's zone, a
  warning each time (`zone-guessed`); a `Date` is the instant it stands for;
  `timeZone: 'local'` the browser's zone, said too.
- **Codemod: JS/TS + Angular** — `@fullcalendar/*` imports, `new
  Calendar(el, opts)` → `createCalendar(el, opts)` with options renamed,
  `<full-calendar [options]>` → `<dz-calendar>` in Angular templates; what
  does not translate as is gets a `// dz-migrate:` comment.
- **Parser: ts-morph** (a dependency of the tool only); Angular templates
  read with Angular's own compiler.
- Two packages so the parser never reaches an application:
  `@dzcalendar/compat-fullcalendar` (run time) and `@dzcalendar/migrate`
  (the command-line codemod).

## Phase 18b — the FullCalendar translator and its codemod ✅ (2026-10-20)

### Built

- **`@dzcalendar/compat-fullcalendar`** (run time; behaviour sheet
  `docs/behaviors/fullcalendar-options.md`, guide
  `docs/migrating-from-fullcalendar.md`): `fromFullCalendar(options)` →
  `{ options, problems, attach(calendar) }`; `createFromFullCalendar(el,
  options, { warn })` → `{ calendar, problems, detach }`;
  `applyFullCalendar(calendar, options, { initial })` for a calendar that
  exists. Views, dates, zones (a wall time in the calendar's zone, said; a
  `Date` an instant; `'local'` the browser's, said), Sunday = 0 → ISO,
  events (ids as text, `className`, colours kept in `extendedProps` and said
  once per field), simple recurrence → RRULE (`endRecur` excluded in the
  calendar's zone; no `startRecur` → from 2000-01-03), the rrule plugin (text
  with DTSTART/EXDATE, object), sources (JSON with its parameters, function
  with callbacks or a promise, iCal), hours, snap, business hours, rules,
  toolbar views, resources (nested → `parentId`), area columns, `views: {…}`
  for the first view, render hooks (function or value), callbacks with plain
  objects and `Date`s (`jsEvent` a stand-in; a `url` followed unless
  prevented), `datesSet` once per dates (grid = active, period = current),
  `eventDrop`/`eventResize`/`eventChange`/`eventAdd`/`eventRemove` with
  `revert` = undo (an occurrence moved alone = the series' event dropped),
  `eventsSet` once per burst, `loading`. The other library's type names
  (`CalendarOptions`, `EventClickArg`, `EventApi`…) exported for the codemod.
  Nothing throws: refused options are found key by key and said.
- **`@dzcalendar/angular/fullcalendar`** (secondary entry, the compat package
  an optional peer): `<dz-calendar [dzFullCalendar]="options"
  (fullCalendarProblems)>`; callbacks in Angular's zone; the first options
  decide the view and date; problems in the console in dev mode.
- **`@dzcalendar/migrate`** (`dz-migrate [paths] [--write]`, ts-morph; a
  tool, never an application's dependency): imports (plugins built in or
  their entry, `locales/*` and `locales-all`, types), `new Calendar` (held by
  a declaration, a field or an assignment; `.render()` chained or not), the
  `Calendar` type → `CalendarInstance`, calls (`next`/`prev`/`today`,
  `changeView`, `refetchEvents`, `unselect`, `destroy`; the rest marked
  `// dz-migrate:`), `FullCalendarModule`, `<full-calendar [options]>` in
  external (Angular's own parser) and inline templates (quotes kept, escaped).
  Idempotent; a file it cannot read is reported, the others done; exit code.
- **core:** problem code `compat-unsupported`; a source spec replaced under
  the same id drops what it fetched for dates not shown. **dom:**
  `hasRenderer(family)`.
- Playground `fullcalendar.html`; `test:package` migrates an Angular 22
  application written for FullCalendar, then builds it on DzCalendar alone.
- Budget (owner, measured + 3 %): compat-fullcalendar 8.7 kB (8 438 B).

### Reviews (architect; code review by execution in Chrome), fixed

- Bad input threw (`initialDate` unreadable or impossible, `validRange`,
  `endRecur`, an `until` in an unknown zone, `resourceAreaColumns: [null]`,
  `businessHours.daysOfWeek: 'x'`, an unknown or not imported
  `initialView`, a zero slot, a half-minute snap): every moment is now
  parsed before use, numbers bounded, the calendar made without what it
  refuses — each said.
- `datesSet` / `view` gave the period as the active range: the grid now
  (28 Sep – 9 Nov for October, Monday first).
- `endRecur` was a UTC midnight (Chicago lost a day, Lord Howe kept one):
  the calendar zone's midnight.
- A series without `startRecur` began today: from 2000.
- `applyFullCalendar` sent the calendar back to `initialDate` on every
  change and kept sources and events no longer given; and core kept a
  replaced spec's chunks for dates not shown.
- An occurrence moved alone fired `eventAdd`: now `eventDrop` + `eventChange`
  on the series' id.
- The rule text's EXDATE was lost when `exdate` was also given: merged.
- `jsEvent: null` broke `info.jsEvent.preventDefault()`: a stand-in.
- `datesSet` on every state change, `eventsSet` per chunk: deduplicated.
- Event defaults only reached inline events; `eventContent` as a value was
  dropped; colours said once per event; toolbar views that cannot be drawn
  silent: all fixed (`listWeek:@dzcalendar/dom/list`).
- Codemod: `this.calendar = new Calendar` and `.render()` chained were left
  unmigrated, the `Calendar` type dangling, `select(start, end)` passed
  through, `${`/backslashes in inline templates changed meaning, `import *
  as` removed, `locales-all` misreported: all fixed and tested.

### Not done in Phase 18b, on purpose

- No React or Vue codemod (18c), no `getApi()` translation (marked).
- `eventDrop`/`eventResize` also follow the application's own commands (the
  store does not tell a gesture from a call) — said in the sheet.
- Per-view options for views other than the first, custom view types,
  formats (`…Format`: the locale's), colours (tones): said, not translated.
- The iCal entry is a hard dependency of compat (an `import()` would save a
  bundle that never reads iCal).


## Phase 18c — React and Vue ✅ (2026-10-20)

### Owner's decisions (2026-10-20)

- **Split:** 18c React and Vue (with their Pro); 18d `llms.txt`,
  `commands.schema.json`, the public benchmark. Reviews and a commit each.
- **Versions:** React 18 and 19, Vue 3.4 and 3.5 — each checked by a real
  application built in `test:package`.
- **Event templates:** the application's own components, through portals —
  React `renderEventContent={(event, ctx) => <JSX/>}`, Vue the
  `#event-content` slot; the application's context (state, router, i18n)
  kept.
- **Pro:** separate packages `@dzcalendar/pro-react` and
  `@dzcalendar/pro-vue`, as `pro-angular`: the Pro never reaches an
  application that does not use it.

### Built

- **`@dzcalendar/react`** (React 18 and 19; `docs/react.md`): `<DzCalendar>`
  — options as props (what changed goes to `update()`; arrays and objects
  compared by contents, Temporal values by what they print, Dates by their
  milliseconds; a cycle ends the walk), `initial` for what is read once,
  `view` / `date` / `selection` given (they win, as a controlled input) or
  free (`defaultView`, `defaultDate`), callbacks (`onViewChange`,
  `onDateChange`, `onSelectionChange`, `onEventClick`… `onError`, default
  `console.error`), `renderEventContent` through portals (the application's
  context kept; drawn by `flushSync` in a microtask, before the browser
  paints), `data-*` / `aria-*` / `className` / `style` / `id` on the
  element, a ref `{ instance, controller }`. `CalendarController` (an
  external store: `useCalendarController`, `useCalendarState`,
  `useParentCalendarController` in the events' content; `takeOver` for the
  Pro), `DzCalendarProvider` (defaults, a motion made per calendar). The
  offering callbacks (`onEventOpen`, `onCreateRequest`, `onSlotClick`) given
  only while the prop is. Layout effects only in a browser.
- **`@dzcalendar/vue`** (Vue 3.4 and 3.5; `docs/vue.md`): `<DzCalendar>` —
  props as Angular's inputs plus `options` and `initial`, `v-model:view`,
  `v-model:date`, `v-model:selection` (a binding without its handler wins),
  events (`@event-click`… `@error`, else `app.config.errorHandler`, else the
  console), the `#event-content` slot teleported into each event (provides
  kept; added or taken away with `v-if`), attributes on the element; its
  type written out (Vue 3.4 and 3.5 infer different generics);
  `createCalendarController` (refs), `injectCalendarController`,
  `DzCalendarPlugin` and `provideDzCalendar`.
- **`@dzcalendar/pro-react`, `@dzcalendar/pro-vue`**: `useEventEditor`
  (through `controller.takeOver`, the editor fetched on its first opening)
  and `useDzExport` (print, PDF, PNG, XLSX, CSV, ICS, `download` typed per
  kind; fetched on first use; never throws). **pro/export:**
  `downloadExport(cal, kind, filename)` — pro-angular's `download` uses it.
- Playground `react.html`, `vue.html` (a header of one's own, the app's
  context in the events, the DST week, the editor, an ICS).
- `test:package` builds four real applications from the tarballs — React
  18.3.1 and 19.2.8 in TSX (`tsc` strict), Vue 3.4.38 and 3.5.43 in single
  file components (`vue-tsc`, templates checked) — with Vite, and checks the
  editor is in a chunk of its own.
- `npm run size` fails for a package measured without a budget. Budgets
  (owner, measured + 3 %): react 3.4 kB, vue 3.55 kB, pro-react 0.76 kB,
  pro-vue 0.7 kB.

### Reviews (architect; code review by execution in Chrome), fixed

- A component reading the calendar while rendering it with literals
  (`resources={[…]}`) rendered without end: values compared by contents.
- Creation-only options (`firstDay`, `rules`, `now`) could not be given:
  `initial`.
- Vue 3.4 refused the declarations made with 3.5: the component's type
  written out.
- React: a controlled view set back by the parent after a person's change
  was not sent (the diff was against what was sent); a refused view was not
  given back; a fixed `date` stayed moved after `controller.next()`; given →
  free → given with the same value did nothing — `view` and `date` are now
  compared with the calendar's state, a refused value not retried until it
  changes (React and Vue).
- The Pro's editor lost "Open" whenever the parent added or removed an
  offering callback: it takes them through the controller (`takeOver`).
- `same()` took a JS Date to the second and any class with `toJSON` as
  equal: Dates by milliseconds, Temporal by tag, others by identity; a
  cycle in `extendedProps` overflowed: ended.
- A controller given later was never attached: handed over (React and Vue).
- Vue: `@error` not listened to was silent; a slot added with `v-if` was
  not drawn; `class` was lost (fragment root). React: no way for the events'
  content to reach its controller; `data-*`/`aria-*` went to `update()`;
  `DzCalendarProvider` gave a new value each render; layout effects warned on
  a server (React 18). Both `useCalendarController` names meant opposite
  things: Vue's reader is `injectCalendarController`.

### Not done in Phase 18c, on purpose

- No running of the smoke applications in a browser (the playground pages
  are driven in Chrome instead).
- `exportsFor` is the same file in pro-react and pro-vue (an entry of the
  Pro's own would load nothing more, but is a new public entry; left).
- A prop going back to `undefined` leaves the calendar's value (as Angular);
  sources are compared by identity (an inline spec refetches each render) —
  both said in the docs.
- Vue's events' content injects the first controller given.


## Phase 18d — llms.txt, commands.schema.json, the public benchmark ✅ (2026-10-20)

### Owner's decisions (2026-10-20)

- **`commands.schema.json`** generated from the TypeScript types (the
  generator a dependency of the script only); a test fails when the shipped
  schema differs from the types, and example commands are validated against
  it. **Scope:** every command, an event (`EventInput`) and the `find-slots`
  query — what an assistant needs to write.
- **`llms.txt` and `llms-full.txt`** (llmstxt.org): a short index and the
  whole documentation, generated from `docs/` and checked by a test.
- **Benchmark: DzCalendar against FullCalendar**, same scenarios, same
  machine, Chrome, minified — times, memory, size — and a table of
  observable correctness (23 h / 25 h days, Lord Howe, Apia 2011).
  FullCalendar installed only in `bench-public/`, through its public API,
  its code never read (CLEANROOM). Protocol and results published.
- **FullCalendar 7 (June 2026) is on Temporal** for named zones (no Luxon
  plugin; still `Date` objects in its API). Measured against **both 6.1.21
  (with luxon) and 7.1.0**; the analysis « DzCalendar face à FullCalendar.md »
  gets a FullCalendar 7 section at the end of 18d (owner, 2026-10-20).
- **After 18d (owner):** a real test — Sehhaty's agent duplicates an agenda
  screen of Sehhaty using DzCalendar; what it hits is fed back here.

### Built

- **`commands.schema.json`** (`npm run gen:schema`, `scripts/gen-schema.mjs`):
  the TypeScript compiler reads `Command`, `EventInput`, `SlotQuery` — every
  command closed (`additionalProperties: false`), Temporal values as ISO
  strings described with examples, shared `$defs` (`TemporalInput`,
  `Moment`, `WallTime`, `DurationLike`, whole-number fields), `start`
  required on an event, comments as descriptions. In `site/` and, published,
  `@dzcalendar/core/commands.schema.json`. A test fails when it differs from
  the types; 20 hand-written commands (every type) pass ajv **and run**, 11
  are refused.
- **`llms.txt`, `llms-full.txt`** (`npm run gen:llms`): the llmstxt.org
  index (rules an assistant keeps, the docs, the schema, the packages) and
  the whole documentation; links checked by a test. **`docs/getting-started.md`**
  (vanilla, its snippet run).
- **Public benchmark** (`npm run bench:public`): `bench-public/` with
  FullCalendar 6.1.21 (+ Luxon) and 7.1.0 isolated, lockfiles, three minified
  pages, 7 interleaved runs (median, spread), first render / update /
  navigation with main-thread work from CDP, events shown, elements, JS heap,
  size, and the days that are not 24 hours long (two references neutralise
  each library's margin). `docs/benchmark.md`, `site/benchmark.json`; the
  analysis « DzCalendar face à FullCalendar.md » has a section on it;
  CLEANROOM.md a paragraph on `bench-public/`.
- **core:** an unknown `scope` is `invalid-edit` (it was read as
  "following" and cut a series); an occurrence key is read without its
  offset, as an instant, or as `series@start` (`key`, `series.split.at`);
  `EventPatch` takes `null` on `end`, `groupId`, `tone`, `url`.

### Reviews (architect; code review by execution in Chrome), fixed

- `scope: 'thisAndFollowing'` (any unknown scope) deleted four occurrences:
  refused now. `key: '2026-10-21T08:00[Europe/Paris]'` named nothing: read.
  The schema had no way to clear a field: `null`.
- The correctness table compared FullCalendar against a metric it does not
  claim, and hid that DzCalendar's default wall axis fails the same two
  cases: the measure is now named, and the text says it.
- "Drawn as they are" (docs, llms.txt) said more than the wall axis does:
  "shown for what they are", the elapsed axis named.
- The pages did not draw the same events (different "+N" limits): the same
  limits, and the events shown in the tables. Update and navigation were at
  the frame floor: main-thread work added. FullCalendar's margin biased the
  ratios (6.12 for 6): two references. "Two thirds" was not measured: the
  kernel is timed apart (80 %). The size note blamed the polyfill
  FullCalendar 7 also ships: corrected.
- `tone: 'warning'` (not a tone) in llms.txt and the tests; internal words
  (Phase, ARCHITECTURE, owner's decision) in public docs and package
  descriptions; `getProblems()` described as a list; "never throws" too
  broad; 8 of 11 command types tested; `$id` a page, not a schema: all fixed.
- Bench robustness: a busy port is said, page errors checked, versions by
  commit.

### Not done in Phase 18d, on purpose

- No release to npm, no site: `site/` holds the generated files; links point
  at the repository's raw files.
- The benchmark measures and says; it does not optimise (first render,
  size: next).
- A slot query's unknown `busy.kind` is refused by the schema but read as a
  booking by the engine (left as is, noted).


## The real test — Sehhaty's agenda on DzCalendar (2026-10-20)

Sehhaty's agent duplicated `/agenda/:doctorId` (Angular 21 zoneless,
FullCalendar 6.1.20, three views, background layers, drag and drop, context
menu, SSE, six side panels, fr/en/ar + RTL) as `/agenda-dz/:doctorId` on
the branch `spike/dzcalendar-agenda` of sehhaty-dashboard (commit 30f6c50,
not pushed), from the tarballs and the docs only; the orchestrator is the
original file to one import.

**Worked at once:** `dz-migrate` in one pass; the palette inherited from
tzslot's `--tz-accent` (430 lines of `.fc-*` overrides gone, ~10 variables);
no re-measuring (FullCalendar needed a ResizeObserver and a `resize()` from
the parent); the typed context menu with the instant (replacing 60 lines of
`elementsFromPoint`: FullCalendar's menu did not open in week/day); drag and
drop with the server's refusal reverted; 50 events, no console or API error.
Net: −430 lines of CSS, −60 of menu, −35 of re-measuring.

**What it hit (to fix):**
- **A. The application's zone lost** — `provideDzCalendar({ timeZone })` is
  overridden by the compat layer when the FullCalendar options name no zone
  (they rarely do): `zone-guessed browser:…`, events read in the browser's
  zone. The defaults' zone should win.
- **B. No day-header hook** — `CalendarHooks` has `event` and `resource`
  only, and `hooks` is out of reach from Angular (`DzCalendarOptions` omits
  it). Sehhaty marks a day ("Fermé · Congrès") and counts the patients to
  move in the column head. `dayHeaderContent` is `compat-unsupported`.
- **C. An all-day background event does not wash the column** in the time
  grid (FullCalendar does: a closed day shows at every hour). Worked around
  with a timed layer over the hours shown.
- **D. `allDaySlot: false`, `displayEventTime: false`** unsupported (the
  all-day row stays; a 30-minute event's time and title cut each other).
- **E. `dz-migrate` drops `DateClickArg`** imported from
  `@fullcalendar/interaction` ("has no equivalent") although compat exports
  it: the types table is only for `@fullcalendar/core`.
- **F. Compat types looser than FullCalendar's**: `view` is
  `ViewApi | null` in `DatesSetArg`, `EventClickArg`, `DateClickArg`,
  `DateSelectArg` — strict code no longer compiles (TS18047).
- **G. At-creation options with the directive**: `nowIndicator`,
  `scrollTime`, `dayMaxLanes`, `eventMaxStack`, `firstDay`, rules are read at
  construction, the directive applies after: lost (said `at-creation`). Only
  the behaviour sheet says to move them to `provideDzCalendar`.
- **H.** `npx @dzcalendar/migrate` (the doc) cannot work before publication
  — `npx dz-migrate` after a local install does.
- **I.** Installing from tarballs needs the whole internal closure
  (`ical`, `rrule` too): to be said.
- **J. `angular.md` is thin**: 5 inputs and 1 output shown of 22 and 12;
  nothing on persisting a drag server-side (no output for "an event moved":
  `kernel.subscribe` → `store` change, `cause === 'command'`, `applied`,
  then `controller.undo()` on refusal — found in the `.d.ts` only); that
  `[options]` and `[dzFullCalendar]` compose is not said.
- Its own lesson: `tsc` does not check Angular templates — `ng build` does.

## Phase 18e — Sehhaty's feedback ✅ (2026-10-20)

### Owner's decisions (2026-10-20)

- **B. A day-header hook** in dom (`hooks.dayHeader`: content, didMount,
  willUnmount; with the date, the resource, the day's info — 23 h / 25 h),
  exposed in each framework: Angular `dzDayHeader` template, React
  `renderDayHeader`, Vue `#day-header` slot; compat maps `dayHeaderContent`.
- **C. An all-day background event washes the whole column** of the time
  grid as well as the all-day row (behaviour sheet first).
- **G. Every at-creation option live**: `nowIndicator`, `scrollTime`,
  `dayMaxLanes`, `eventMaxStack`, `firstDay`, rules through `update()`.
- **J. An `eventChange` output** in dom (`onEventChange`) and each
  framework: after a person's gesture or command, `{ before, after, command,
  revert() }` (revert = undo); the framework docs show the server call and
  the revert on refusal.
- **From the owner's side-by-side screenshots (FullCalendar vs DzCalendar
  in Sehhaty):** (1) the month gets a **"show everything" mode**,
  `dayMaxLanes: null` — no cap, weeks grow, the month scrolls (default stays
  `'auto'`); (2) the time grid's **default scale higher**, about 1.2 px a
  minute (72 px an hour), and `--dz-minute` documented in theming; (3) an
  **`eventStyle: 'tinted' | 'solid'`** option (solid: a filled block, text
  contrast checked AA) — the rest of the look waits for the CSS pass; (4)
  **background events can carry content** through the content hook
  (`ctx.background: true`; Angular `dzEventContent`, React
  `renderEventContent`, Vue `#event-content`); without a hook they stay
  mute. Also seen: in the month, timed events show their dot without their
  title — to reproduce.
- Without a decision to take: A (the defaults' zone wins in compat), D
  (`allDaySlot`, `displayEventTime` options, mapped by compat), E (dz-migrate
  types from every `@fullcalendar/*`), F (`view` non-null in compat types),
  H/I (install docs: `npx dz-migrate`, the tarballs' closure), J's docs
  (the whole Angular/React/Vue surface; `[options]` and `[dzFullCalendar]`
  compose). Then Sehhaty's agent runs its screen again on the new tarballs, removing
  its workarounds (its checklist: A `timeZone: FUSEAU` out of `options`, the
  "25 h" mark must not come back on 25 Oct in Algiers; B `dayHeaderContent`
  and `enTeteDeJour` back, "Fermé · Congrès" on Fri 23 / Sat 24 and the
  patients counter clickable; C `coucheVersEvenement` out, columns washed
  top to bottom; D the title-only template out, no empty all-day row; G
  `nowIndicator` / `scrollTime` out of `provideDzCalendar`; J the drag done
  again without `[dzFullCalendar]`, `e2e/dz-glisser.spec.ts`). Its traps:
  `ng build` checks templates, `tsc` does not; a test click must stay inside
  the viewport.

### Built

- **Day-header hook** `hooks.dayHeader` (content, didMount, willUnmount; date,
  resource, the day's real length, the calendar's words) in week, day and
  month views — Angular `dzDayHeader`, React `renderDayHeader`, Vue
  `#day-header`, compat `dayHeaderContent`; a head with the application's
  content (or a didMount) is read by assistive technology; a throwing hook
  is reported, the calendar drawn.
- **All-day backgrounds wash their columns** (core model;
  `docs/behaviors/allday-background.md`); **backgrounds take the content
  hook** in the time grid (`ctx.background`, a sticky label).
- **Live options**: `firstDay` (kernel `setFirstDay`), `rules`
  (`setRules`), `nowIndicator`, `scrollTime`, `dayMaxLanes` (and `null`: the
  weeks grow), `eventMaxStack`; new `allDaySlot`, `displayEventTime`,
  `eventStyle: 'tinted' | 'solid'` (text `--dz-on-tone` / `--dz-tone-<name>-on`,
  AA by test for every tone), `--dz-event-radius`; the time grid's default
  scale 1.2 px a minute (densities 0.8 / 1.2 / 1.6).
- **`onEventChange`** (dom) and `(eventChange)` / `onEventChange` /
  `@event-change`: a person's command (validated), undo or redo, with its
  `revert()` — kernel store events carry `command` and `validated`;
  `history.revert(applied)` takes back that write by its own entry (an undo's
  goes back to done, a redo's to undone), refuses a merged entry or a
  transaction, and works from inside the callback.
- **Compat**: the calendar's zone wins over the browser's; `dayMaxLanes:
  null` by default (theirs shows all); `eventDrop` / `eventResize` /
  `eventChange` / `eventAdd` / `eventRemove` for a person's changes, `revert`
  exact; `view` non-null; `isPast` / `isFuture`. **dz-migrate** keeps types
  imported from plugins.
- Docs: angular.md (the whole surface, saving a change with revert,
  `[dzFullCalendar]` composing), react.md, vue.md, theming.md,
  migrating-from-fullcalendar.md (npx dz-migrate, tarballs' closure);
  playground `sehhaty.html`.
- Budgets (owner, measured + 3 %): dom 46.35 kB, react 3.55 kB, vue 3.75 kB,
  compat-fullcalendar 9.0 kB.

### Reviews (architect; code review by execution in Chrome), fixed

- An undo's revert redid whatever was on top (the wrong appointment moved):
  by its own entry now. A revert inside the callback left a phantom entry and
  slipped past the transaction rule: deferred to the end of the write.
  `history.revert` took a merged entry whole: refused.
- A person's undo / redo was not said: said, with `cause`.
- Compat's revert was "the last undo": exact.
- `allDaySlot: false` let the keyboard into the folded row: no all-day row
  for the keyboard then.
- Solid text on off-white families (pastel, frost) fell under AA: its own
  token, tested for every tone.
- Month heads: resource null and 24 h always: the column's resource, the
  day's length. A didMount-only head stayed `aria-hidden`: read.
- The background sheet promised a reading that was not built: corrected.

### Not done in Phase 18e, on purpose

- The day-header hook does not reach a list's day headings; background
  content is in the time grid's columns only (the all-day row and the month
  stay tints) — both said in the docs.
- A command your code runs with `{ validate: true }` is said as a person's
  (that is what validating means) — documented.


## Phase 18h–18j — first render, size, the documentation site (planned)

**Owner's decisions (2026-10-23)**
- Order: 18h (first render) then 18i (size), **18j (the documentation
  site) in parallel** — its skeleton, languages, deployment and getting
  started first, the option pages after.
- **18h — first render:** below FullCalendar 7 (month 58.5 ms, week
  69.9 ms, list 49.8 ms against our 82, 84, 81 ms in docs/benchmark.md).
  The kernel normalises and indexes every event at creation (80 % of a
  10 000-event month); plan: the shown period (and a margin) first, the
  rest when idle or when navigated to; dates read as numbers, Temporal
  objects made for what is drawn. Problems still reported, the history,
  sources and exports still see everything.
- **18i — size:** below FullCalendar 7's 94.9 kB (ours 122.3 kB). **K.2
  reversed:** the Temporal polyfill (≈ 20 kB) is **loaded only where
  Temporal is missing** (a dynamic import; `calendar.ready` for the
  browsers that wait) — needs `@tzslot/core`'s side. Then each view as its
  own entry (as FullCalendar's plugins), and what everyone pays without
  using it.
- **18j — documentation site:** **Astro Starlight**, **French and
  English**, published by a GitHub Action on **GitHub Pages**
  (`https://plinthworks.github.io/dzcalendar/`, the repository public).
  Like FullCalendar's in its structure, written from scratch (CLEANROOM):
  getting started (vanilla JS, Angular, React, Vue), one page per option
  (what it does, type, default, an example in tabs JS | Angular | React |
  Vue, a live demo, related options), guides (events, sources, recurrence,
  views, drag and drop, keyboard and accessibility, time zones and clock
  changes, theming and CSS, Tailwind, unstyled, languages, Pro), migrating
  from FullCalendar, the API reference generated from the types. A test:
  every option has its page in both languages; the examples are compiled.

### 18h — done (2026-10-23)

**Built**
- Above 2 000 events (owner), the `events` option loads the shown period
  and a week either side at once; the other weeks while the page is idle
  (`requestIdleCallback`, nearest first, slices sized by the idle period;
  a slice forced by the one-second timeout takes 25 ms) —
  `packages/core/src/source/deferred.ts`. Each pending week knows the
  latest day its events reach: a period needs the weeks begun before its
  end that reach its start, loaded at once when it is shown — by this
  calendar or another one sharing the store (`loadPeriod`).
- Transparent (owner): `kernel.store` is a face that finishes the load
  before any read or write (one face per store, a face handed back is its
  store); commands, `kernel.history` (run, undo, redo, revert), sources'
  writes finish it first; `kernel.whenLoaded()`; the rest's problems by
  `onSource` (`problems`, the whole report) when it is in.
- A store change touching nothing shown (and no series) keeps the model of
  a `rangeOnly` family (every built-in) and is told `offscreen: true`: the
  DOM does not redraw, an open menu or "+N" panel stays.
- The public benchmark waits for everything to load before the update,
  the navigation and the heap, and reports "All events loaded".
- Tests: `packages/core/test/deferred.test.ts` (17).
- Budget (owner, measured + 3 %): core 45 741.

**Reviews fixed** (architect + execution in Chrome)
- A face passed back as `store` made a face of a face (the problems told
  twice, other kernels blind to the load); a source could take an id of an
  event not loaded yet, silently; `kernel.history` bypassed the load;
  `whenLoaded` hung after `destroy`; a listener reading the store during a
  week's write told the problems twice; a third-party family reading
  beyond its range would have gone stale (`rangeOnly`); a non-ISO
  calendar's period disabled the partition; twins without an id near a
  Monday could lose their rank.
- A second calendar on the store drew its period nearly empty until the
  first one's idle load reached it; a long event removed by a second large
  `setEvents` stayed shown until idle; any period beyond the first window
  flushed everything (67 ms) — now only the weeks it needs.
- Measured on the way: the polyfill's debug string is attached whenever
  function names survive a build (`"noop" === noop.name`), `--keep-names`
  included — profiles must be taken on a truly minified bundle.

**Not done on purpose**
- Up to 2 000 events nothing changes (no notice for problems: the report
  is `setEvents`'s and `getProblems()`).
- The first drag on a large calendar finishes the load (≈ 65 ms on 10 000
  events) through the interaction's snapshot.

### 18k — Sehhaty's production report (`retours/2026-10-23-sehhaty.md`)

**Owner's decisions (2026-10-23):** Sehhaty first, then 18i. An all-day
background event washes its whole time-grid column, always (as
FullCalendar), besides the all-day row when shown; an event's
`durationEditable` / `startEditable` win over the calendar's defaults
(as FullCalendar), and no resize handle is drawn on an event that cannot be
resized; runtime problems through an `onProblem(problem)` option (the
wrappers' `problems` output), a `console.warn` once per code without it; the
month shows every event by default (`dayMaxLanes` default: none — the week
grows), "+N" only when asked.
**Taken without a question (no serious alternative):** `timeGrid.labelMinutes`
(a label every N minutes, default 60; the compat maps `slotLabelInterval`);
a month's context-menu target is a `day` without an instant; the menu's
target found under the pointer (not by `closest` from the event target);
`data-date` on the time grid's day heads; `<dz-calendar>` a block; a problem
when the host has no height; the structure documented (the resize grip is a
`::after`, month bars live in the week row, the box is given, never
measured, `extendedProps` in, `props` out); `dzDayCell` and `dzSlotLabel`
exist already (18f-2) — said in the docs; the two bugs seen in 18h's review.

**Built**
- Measured first against Sehhaty's own path (the compat, their objects):
  points 2 (a closed day not washed), 3 (the trigger) and 4 (a month's
  `slot` target) did not reproduce on the current code (their build was of
  2026-10-20; they withdrew 2); 1 and 5 were real.
- `timeGrid.labelMinutes` (a label every N minutes of the clock, default
  60; `data-time` on every tick; the compat maps `slotLabelInterval`, said
  `compat-unsupported` for a timeline); `assertTimeGrid` refuses
  `slotMinutes` / `labelMinutes` that cannot be taken (a RangeError at
  creation or `update`, no longer thrown while drawing).
- An event's own `true` wins (owner): `perms.own = { start, duration }`
  (round-trip safe through `toInput`, compared by `eventEquals`); moving
  needs the start, resizing the length (`mayMove` / `mayResize`),
  deleting both (`mayDelete`), each the calendar's `editable` or the
  event's own; its node says `data-editable="move resize"`; its menu
  offers what it may do; it may be dropped on a calendar that is not
  editable. Ctrl+Z stays the editable calendar's (the hint is left out
  elsewhere).
- `onProblem` (owner) with `ctx.problem` / `problemGone` (told once per code
  and key, again after it went away), else `console.warn` once per code:
  `events-not-drawn` (all-day events without the all-day row; timed events
  outside `slotMin`–`slotMax`), `host-no-height` (no height, or a relative
  `--dz-height` with nothing scrolling; checked again on resize). Angular
  `(problem)` (with the console), Vue `@problem`, React `onProblem`, the
  element `dz-calendar-problem` (offered once listened to).
- `dayMaxLanes` by default (owner): a month every event, a year "+N" —
  decided per view while nothing is asked (a silent `setOptions`, no second
  paint); the compat writes it only when FullCalendar's options say it.
- A month's context menu finds the cell under the pointer (a background
  bar beside the cells; the element's shadow root included).
- `<dz-calendar>` a block; the docs' "Worth knowing" (the box given, the
  grip a `::after`, month bars in the week row, `data-date` on day heads,
  `extendedProps`/`props`, the day-cell and slot-label templates).
- Fixed from 18h's review: the timeline's scroll-to-now (fractional
  milliseconds; a non-finite scale); a drag in the hours under a crowded,
  scrolling all-day row became all-day (the hit area clamped to the row
  seen).
- Tests: `packages/dom/test/sehhaty18k.test.ts` (12), core own/round trip,
  Chrome block "Phase 18k" (`playground/sehhaty-checks.html`).
- Budget (owner, measured + 3 %): dom 57 086.

**Reviews fixed** (architect + execution in Chrome)
- `own` was ignored by `eventEquals` (a re-delivery or an update changing
  only it was dropped), set where it gave nothing, and too coarse (revoking
  one `true` kept the other's effect, a resize-only event could be moved and
  deleted, its menu offered "Move"); the menu, the touch selection and the
  drop still gated on the calendar alone.
- The lanes default re-entered the kernel's emit (two paints, events out of
  order); the problems' dedupe keyed on their wording and never cleared; an
  explicit tall height was reported; the docs named the wrong element for
  `--dz-height: 100%`; the month menu fix did not pierce a shadow root; the
  wrappers' `onProblem` was overridable through `options` (Angular, Vue) and
  sent on every render (React).

**Not done on purpose**
- Deviation: the wrappers' output is `problem` (`problems` is the data's
  report already).
- Ctrl+Z of an own event's change in a calendar that is not editable (the
  history holds the application's commands too).
- `events-not-drawn` for an event on no resource column of a resource view.

**Seen during 18h's review, now fixed in 18k:** the Pro timeline
throws `RangeError: Expected finite integer` (from
`Instant.fromEpochMilliseconds`, the scheduled scroll-to-time write in
`packages/pro/src/timeline/view.ts`) after six quick navigations one frame
apart, with 500 events too; dragging a timed event about 96 px down in a
time-grid column made it an all-day event of that date (the same with or
without the deferred load).

## Phase 19 — native: owner's decision on the product (2026-10-20)

- **A library and a showcase app.** `DzCalendarKit` (SwiftUI components for
  applications — Sehhaty's iOS app first), then Kotlin/Compose; and a
  **demonstration app built on it, in the spirit of macOS Calendar**: Day /
  Week / Month / Year views, a sidebar of calendars to tick (sources on and
  off), a mini-month to navigate, today, search. It proves the library; it
  does **not** aim at a calendar product (no iCloud / CalDAV / Exchange sync,
  no reminders, no App Store target). Still open before Phase 19 starts:
  hand-written ports per language vs one Rust core (K.14).
- On the web side this asks for a **mini-month** component (date picker /
  navigator) — not built yet; the year view exists (`multiMonthYear`).

## Phase 18f — what FullCalendar has that we lack (planned)

Compared on 2026-10-22 with FullCalendar 7's public docs (`docs/all`): the
three gaps worth closing, owner's decisions (2026-10-22).

### 1. Render hooks "as theirs": every element, four forms, everywhere

- **DOM**: `hooks.<element>.{ class, content, didMount, willUnmount }` for
  every element a calendar draws — `class` (a string, a list, or a function
  of the element's context), `content` (text, a node, or null to keep ours),
  `didMount` (may return its cleanup), `willUnmount`. Our names (CLEANROOM:
  behaviour sheets first); compat translates theirs (`eventClassNames`,
  `dayCellContent`, `moreLinkDidMount`…).
- **Elements** (contexts carry Temporal values, the day's length on a clock
  change, the resource): `event` (with its kind: block, bar, list item,
  background), `dayCell`, `dayHeader` (already: + class), `dayLane` (a time
  grid's column), `slotLabel`, `slotLane`, `allDayLabel`, `moreLink`,
  `morePopover`, `nowIndicator`, `weekNumber`, `noEvents`, `listDayHeader`,
  `view`, `monthHeader` (multi-month), `resource` (head: + class, mount),
  `resourceLane`, `resourceGroupHeader`, `resourceGroupLane`, and the
  timeline's `resourceCell` / `resourceAreaHeader`.
- **Frameworks — all of them** (owner: "tous partout"): an Angular template
  directive, a React render prop and a Vue slot for each element, plus a
  class input; templates checked by `ng build` / `vue-tsc` in
  `test:package`.
- Guarded like the event hook (an application's hook that throws is
  reported, ours drawn); a head or cell with the application's content is
  read by assistive technology; hooks compared member by member.

### 2. Dragging in from the page, and between calendars

- `makeDraggable(el, data)` on any element of the page (mouse, touch, pen;
  a keyboard alternative: "Put in the calendar…" from its menu), the event
  data a function or an object; `droppable`, `onDrop` (a date, maybe a
  resource), `onEventReceive` (an event created by the drop, with `revert()`).
- Between two calendars of the page: an event dragged out of one into the
  other (`onEventLeave` on the first, `onEventReceive` on the second), the
  rules of both applied, the source's save path respected, one revert taking
  both back. Behaviour sheet first (`docs/behaviors/external-drag.md`).

### 3. Display formats

- `formats: { eventTime, eventTimeRange, dayHeader, slotLabel, title,
  listDay, listDaySide, weekNumber, dayCell, monthHeader, morePopover }`,
  each an `Intl.DateTimeFormat` options object (in the calendar's locale and
  display calendar: `{ weekday: 'short', day: '2-digit', month: '2-digit' }`
  → "lun. 19/10", the case by CSS) or a function of the Temporal value;
  compat translates `eventTimeFormat`, `dayHeaderFormat`, `slotLabelFormat`,
  `titleFormat`, `listDayFormat`…

### 4. Custom views (their "Custom Views" page, read by the owner)

- Already here: a view made from a family by settings (`views: { name: {
  family, duration, dayCount, alignment, dateIncrement, hiddenDays } }`) and
  from scratch (`registerView(family, factory)`, the `custom` family).
- To add: **`visibleRange`** — a fixed, exact span (3–12 November, a
  congress) that navigation does not move; a **`docs/custom-views.md`** page
  (by settings, from scratch, the custom family's model and gestures); the
  compat translating their custom views (`type` + `duration` / `dayCount` /
  `visibleRange`).

### 18f-1 — done (2026-10-22)

**Built**
- `docs/behaviors/render-hooks.md` (CLEANROOM: their behaviour in our words).
- `packages/dom/src/render/hooks.ts`: `ElementHooks<C>` (`class`, `content`,
  `didMount`, `willUnmount`) and one context type per element; `decorate` /
  `undecorate` / `undecorateAll` / `holder`, `flushMounts` (a `didMount`
  waits until the drawing is in the page; the calendar empties the queue
  after each render and after opening "+N"; a microtask otherwise).
- Elements: `event` (now through the same path), `dayHeader`, `dayCell`,
  `dayLane`, `slotLabel`, `slotLane` (drawn only when asked),
  `allDayLabel`, `moreLink`, `morePopover`, `nowIndicator`, `weekNumber`,
  `noEvents`, `listDayHeader`, `view`, `monthHeader`, `resource`,
  `resourceLane`, `resourceGroupHeader`, `resourceGroupLane`,
  `resourceAreaHeader` — in the time grid, day grid, multi-month, list,
  resource views and the Pro timeline (exported to it by `dom/toolkit`).
- `update({ hooks })` compares element by element, member by member; new
  `didMount` / `willUnmount` functions let each element go and mount it
  again; a hook taken away takes its classes. An open "+N" closes when the
  hooks change.
- compat-fullcalendar: one table for their 17 families
  (`<name>ClassNames / Content / DidMount / WillUnmount`), arguments rebuilt
  with their field names; `eventClassNames` as a function is now a hook.
- Tests: `packages/dom/test/render-hooks.test.ts` (27),
  `packages/pro/test/dom/timeline-hooks.test.ts` (4).
- Budgets (owner, measured + 3 %): pro 14 525, dom/list 5 007.

**Reviews fixed** (architect + execution in Chrome)
- Teardown: a month's cells, week numbers and "+N" when the month goes; a
  year's month titles; the now line (time grid, timeline); the list's
  "nothing" message — none was let go; the page-wide `live` counter leaked.
- `didMount` ran before the element was in the page (every element, events
  included): now queued.
- Events' `willUnmount` came from the current hooks, not the mounting ones.
- Stale hooks kept after `update`; a removed hook left its classes; the
  reused "+N" panel kept the application's classes; a group head did not
  redraw on new hooks; a month's "+N" had no resource; `view` missing from
  the resource context; `['a b']` threw; a class of ours given back was
  removed; background events honoured only `content`; an empty 24:00 slot
  lane; the list imported `hooks.ts` beside the toolkit (+0.4 kB).

**Not done on purpose**
- Background events in the all-day row, the month and the timeline stay
  plain tints (no event hooks), as in 18e.
- `slotLabel` in a timeline's time head; their `slotLabel` argument's
  `date` (we give the time).
- An application's content in an `aria-hidden` place stays hidden where the
  parent is hidden (the gutter, "+N" hosts, the now line).

### 5. The header's buttons (owner's decision, 2026-10-22, from Sehhaty's screenshot)

Today our header is fixed (‹ today › title, the view tabs): it cannot be
hidden, reordered, or given an application's button (reload, "blocked
slots", a business view). Decided:

- **Like FullCalendar, plus a template**: `headerToolbar: { start, center,
  end }` (names: `prev`, `next`, `today`, `title`, views, the application's
  buttons; `false` hides the header) and `customButtons: { name: { text,
  icon?, hint?, click, active? } }` (`active`: a pressed state, re-read at
  each drawing); plus a free place for rich content (a menu, a badge): an
  Angular directive, a React prop, a Vue slot (done with 18f-2). The compat
  translates `headerToolbar` whole and `customButtons`.
- **The look** (grouped buttons, centred title, the active view filled)
  waits for the CSS pass, with everything else visual.
- Placed as **18f-1b**, right after 18f-1.

### 18f-1b — done (2026-10-22)

**Built**
- `docs/behaviors/header-toolbar.md` (CLEANROOM).
- `headerToolbar: { start, center, end } | false` (a space between groups,
  a comma inside one; names `prev`, `next`, `today`, `title`, views, the
  application's buttons, which win over a built-in name) and
  `customButtons: { name: { text?, hint?, icon?, click(event, el),
  active? } }`; both live through `update()`. Without `headerToolbar`, the
  header as before (`defaultLayout`, `headerViews`). `<dz-calendar>` takes
  both live.
- Joined views are the view switcher (a named group); other joined buttons
  are one piece to the eye only. A narrow header goes on several lines
  (a container query below 40 rem lets a place break inside too).
- compat-fullcalendar: `headerToolbar` kept whole (`left` / `right` →
  `start` / `end`, `prevYear` / `nextYear` said), `customButtons`
  (`icon` → `fc-icon fc-icon-<name>`); `applyFullCalendar` gives the layout
  and its buttons in one change.
- Tests: `packages/dom/test/header-toolbar.test.ts` (14), compat (2).
- Budgets (owner, measured + 3 %): dom 48 951, compat-fullcalendar 9 623.

**Reviews fixed** (architect + execution in Chrome)
- A framework's new closures at each render rebuilt the header (focus lost):
  only a button's look (words, hint, icon, toggle or not) rebuilds it, its
  `click` / `active` are read at the click; a focused piece moved by a new
  layout keeps the focus.
- A toggle's `aria-pressed` waited for the next drawing: re-read at the click.
- `<dz-calendar>` remade the calendar for these two options.
- Below ~900 px the three places overlapped (Sehhaty's layout unusable on a
  phone): they wrap now, no overlap, nothing off-screen, no sideways scroll
  (measured in Chrome at 390, 640, 900, 1 200 px, French and Arabic);
  a button's words no longer break inside it.
- Bad input said once and left out, never thrown: a button without `click`,
  a `null` one, a non-string icon or place, a `headerToolbar` that is not an
  object or `false`; a button with neither words nor hint said; a view this
  page cannot draw said once, not at each layout; `role="group"` without a
  name on non-view groups removed.
- `applyFullCalendar` warned "nothing called reload" (layout applied before
  its buttons). Stale compat doc line.

**Not done on purpose**
- The look of the header (grouped buttons, centred title, the pressed view
  filled, Sehhaty's screenshot): the CSS pass. What was added is structural
  (places, groups, wrapping, the pressed state).
- The header's free place for rich content: with the templates, 18f-2.
- A React prop going back to `undefined` keeps the calendar's layout (said
  in the sheet).

### 18f-2 — decisions (owner, 2026-10-22)

- **The header's free place, one per name**: `headerItems: { name: { content,
  didMount, willUnmount, class } }` in the DOM, the name placed in
  `headerToolbar` like a button; React `headerItems={{ name: <X/> }}`, Vue
  `#header-item-<name>`, Angular `<ng-template dzHeaderItem="name">`.
- **Classes and mounts in the frameworks through `hooks`**, merged with the
  templates: the template gives the content, `hooks` the rest (one entry,
  the same documentation everywhere; no per-element class inputs).
- Templates for the 14 elements with a content (event, dayHeader, dayCell,
  slotLabel, allDayLabel, moreLink, nowIndicator, weekNumber, noEvents,
  listDayHeader, monthHeader, resource, resourceGroupHeader,
  resourceAreaHeader); the holders (dayLane, slotLane, morePopover, view,
  resourceLane, resourceGroupLane) take `hooks` only.

### 18f-2 — done (2026-10-22)

**Built**
- A shared builder in `@dzcalendar/dom/toolkit` (`render/templates.ts`:
  `TEMPLATE_ELEMENTS`, `templateShape`, `templateHooks`, `templateClass`):
  each framework says only whether it has a template for an element, gives
  the application's `hooks` and its portals. Hooks are made again element by
  element, only when that element's part of the shape changes (a template
  added or taken away, a member of `hooks`, a class given as words): new
  closures at each render redraw and remount nothing.
- React: `render<Element>` props for the 14 elements with a content,
  `headerItems={{ name: node | (ctx) => node }}`, a `hooks` prop. Vue: slots
  `#day-cell`, `#slot-label`… (`{ ctx }`), `#header-item-<name>`, `:hooks`.
  Angular: directives `dzDayCell`, `dzSlotLabel`… (`let-ctx`, all in
  `DZ_CALENDAR`), `dzHeaderItem="name"`, `[hooks]`. `#event-content`,
  `#day-header`, `dzEventContent`, `dzDayHeader` kept as they were (a day
  head's context has `ctx` too now).
- DOM: `headerItems` (places kept by name, told the view and the title when
  they change; a node returned again is left in place: a focused control
  stays focused). `<dz-calendar>` takes it live.
- `hooks` / `headerItems` taken out of the providers' defaults' types (each
  calendar's own; the wrappers set them already).
- Tests: React (12 new), Vue (2), Angular (2), DOM (3);
  `scripts/package-smoke.mjs` uses a day cell template, a header place and
  `hooks` in the Angular, React and Vue apps (types checked strictly).
- Budgets (owner, measured + 3 %): react 3 819, vue 4 010, a new line
  `dom/templates` 1 017 (the shared builder, counted nowhere before).

**Reviews fixed** (architect + execution in Chrome and TestBed)
- A day cell's (and a timeline resource's or group's) template kept one
  portal / embedded view alive per redraw (462 components for 42 cells after
  ten navigations): the content is now the cell's (its `el`), kept by it and
  let go with it.
- A focused control in a header place lost the focus at each navigation
  (the node detached and put back; Angular made a new host each time).
- Any template or class change remounted every element and the header
  places (Angular even dropped the header's view): hooks are kept element by
  element, the header record while its names stay; the wrappers no longer
  drop portals on a hooks change (the calendar lets go what changed).
- Templates for "+N", the gutter's labels and the now line sat inside
  `aria-hidden`: read once the application fills them.
- The shared builder counted nowhere in `size`; the Angular build compiled
  the dom sources (`@dzcalendar/dom/toolkit` mapped to `dist`); `contentChild`
  outside a class member's initializer (NG8110).

**Not done on purpose**
- A function in `hooks` is read when its element is drawn again (new
  closures do not redraw); a class that must follow state at once is given
  as words (docs).
- Angular: two templates for one element swapped with `@if` / `@else` keep
  the first's views until the element is drawn again.
- `.dz-tpl*` spans have no CSS yet (the CSS pass).
- Seen outside 18f-2, not checked at HEAD: in Vue with `v-model:view`,
  `controller.changeView` reports the view three times.

### 18f-3 — done (2026-10-22)

**Built**
- `docs/behaviors/formats.md` (CLEANROOM). `formats` (DOM, live): `title`
  (the kernel's `titleFormat` / `setTitleFormat`), `dayHeader`, `dayCell`,
  `slotLabel`, `eventTime`, `eventTimeRange`, `listDay`, `listDaySide`,
  `monthHeader`, `morePopover` — the platform's options or a function —,
  `weekNumber` (a function: the platform has no week). In every view where
  the place is, the Pro timeline's heads too. What is said keeps the
  calendar's full words.
- Custom views: `ViewSpec.visibleRange` (a fixed period, `end` exclusive:
  navigation does not move it, the arrows and "today" disabled, PageUp /
  PageDown said "no further"; a day grid's rows padded to whole weeks);
  `views` takes settings (`{ family, … }`, the type its key, the alignment
  from the duration's unit, `fixedWeekCount` true), checked when the kernel
  is made; a day grid of several months in one grid. `docs/custom-views.md`.
- compat-fullcalendar: their format options (`titleFormat`,
  `slotLabelFormat`, `eventTimeFormat`…) as `formats`, their own keys said;
  custom views (`type`, `duration` in their forms, `dayCount`,
  `dateIncrement`, `visibleRange`, `hiddenDays`), a calendar-wide
  `visibleRange`.
- Tests: DOM formats (13), kernel (10), compat (6).
- Budgets (owner, measured + 3 %): core 42 974, compat-fullcalendar 10 649.

**Reviews fixed** (architect + execution in Chrome)
- A month's title in options was "septembre – novembre" (the grid's padding
  days); a view that could not be made left the kernel half changed
  (`setView`, `setOptions` now atomic); views' settings were never checked
  (a day count of 0, a duration of nothing threw later); `fixedWeekCount`
  defaulted to false; a two-month day grid showed one month; a broken
  format was reported at every cell (now once); short words were said as
  they were written (now the full ones); the timeline's heads ignored
  `dayHeader` / `monthHeader` / `dayCell`; an open "+N" kept old formats;
  a fixed period's day grid had rows of 6 and 4 columns (misaligned; now
  whole weeks, checked in Chrome); PageDown jumped back to the first day;
  long custom day heads overflowed; the compat lost a custom view's own
  options silently, read only Temporal durations, and dropped a
  calendar-wide `visibleRange` without `initialView`.

**Not done on purpose**
- A function `visibleRange` (theirs: a function of the date); a view's
  `buttonText` (give `messages.views`).
- Disabled header buttons are not styled yet (the CSS pass).
- On a shared kernel, the title format is the kernel's: the last calendar
  giving one wins.

### 18f-4 — done (2026-10-22)

**Built**
- `docs/behaviors/external-drag.md` (CLEANROOM). `makeDraggable(el, {
  event, data, create })` in its own entry `@dzcalendar/dom/drag` (owner:
  paid for only when imported): a pointer (a finger holds 300 ms), an
  avatar, the keyboard (Enter takes it, Tab to a calendar, the arrows,
  Enter puts it down, Escape anywhere gives it back); its clean-up leaves
  nothing.
- Every view's surface is a drop target on its page (a registry per
  document, shadow roots read through): `droppable` (true, false — default
  —, a filter), the place shown with ghosts, an autoscroll near the edges,
  the drop an `event.create` checked as a gesture is, the rules' `allow`
  told `external` (through `kernel.run({ external })` too). `onDrop`,
  `onEventReceive` (with `revert()`); a drop is told there only, not to
  `onEventChange` as well (`ctx.capture`).
- Between calendars: made there, then taken from here — or nothing at all;
  told and announced once both are done (`onEventLeave` here,
  `onEventReceive` there, one revert that never leaves it on both); one
  store: a move. Releasing an event outside every calendar now puts
  nothing down (8 px of margin at the edge).
- Angular `(dropped)`, `(eventReceive)`, `(eventLeave)`; Vue `@dropped`,
  `@event-receive`, `@event-leave`; React props. compat-fullcalendar:
  their `Draggable` (delegation with `itemSelector`, `create: false`),
  `droppable`, `drop`, `eventReceive`, `eventLeave`; `dz-migrate` rewrites
  the `Draggable` import.
- `playground/dragdrop.html` (a waiting list, two doctors). Tests: DOM (13),
  compat (2), migrate (1), Chrome (12 in `test:browser`).
- Budgets (owner, measured + 3 %): dom 52 944, a new line dom/drag 2 126,
  locales ar 2 449 and de 1 972 (two new messages), compat-fullcalendar
  11 292.

**Reviews fixed** (architect + execution in Chrome)
- A drop told twice (`onEventChange` and `onEventReceive`); across
  calendars, the target's change told before the source let go, unpaired,
  and announced before a refusal; a revert that could leave the event on
  both sides; nothing guarded a calendar destroyed while a chooser was
  open; the calendar's box measured once (a page scroll made in-calendar
  places "outside"); shadow roots never reached; seven document listeners
  per card at rest; the avatar focusable; a card's data that threw retried
  at every move; Escape only on the card; a click that focused a calendar
  took the held card; a card removed while held picked up later; another
  store's event checked under its own id (a false "valid") and its
  resources kept; Tab inside the calendar lost the place chosen; no
  autoscroll from the page (hours off-screen unreachable by a finger).
- Seen by the execution review and older than 18f: Escape during a mouse
  drag inside a calendar did nothing (the focused event took the key) — the
  host's Escape now listens first; the Chrome check that should have caught
  it compared the state with itself (fixed).

**Not done on purpose**
- A calendar in an iframe is not reached from the page around it.
- An undo on one calendar alone after a drop between two (each history is
  its own): `revert()` is the way back for both (the sheet says so).
- Seen, older than 18f, left for the CSS and a11y pass (owner): an empty
  day of a time grid fails axe's `scrollable-region-focusable` (the
  keyboard's cursor rests in the all-day row, not in the scrolling hours). Fixed in 18g-4.

### Order

18f-1 the hooks in the DOM (all elements, four forms) → 18f-1b the header's
buttons (`headerToolbar`, `customButtons`) → 18f-2 the framework
templates for each → 18f-3 formats and custom views (`visibleRange`, the docs page, compat) →
18f-4 external and cross-calendar dragging. Reviews and a commit at the end of each.

## Phase 18g — the CSS and accessibility pass (planned)

Owner's decisions (2026-10-22): the CSS must be easy to override with
Tailwind or any other mechanism; the look **modern and sober** (the spirit
of Sehhaty's screenshot: grouped buttons with rounded corners, a centred
title, the active view filled, soft borders, rounded tinted events, today
marked without shouting; the seven themes follow); four override
mechanisms beside the layers, the `--dz-*` tokens and `hooks.class`:
**states as `data-*`**, a **Tailwind 4 `@theme` bridge**, an **unstyled
mode**, a **stable class contract**; accessibility: **WCAG 2.2 AA in full**,
as automated checks.

### 18g-1 — the contract
- Every part (`.dz-*`) and token (`--dz-*`) listed in `docs/styling.md`
  (what it is, where, which states), versioned as an API (a rename is a
  major version); a test that the list and the CSS agree.
- States as attributes on the parts that have them: `data-today`,
  `data-past`, `data-outside`, `data-selected`, `data-dragging`,
  `data-all-day`, `data-tone`, `data-invalid`… (Tailwind variants
  `data-[today]:…`; plain selectors elsewhere); the classes kept.

### 18g-1 — done (2026-10-22)

**Built**
- `docs/styling.md`: the contract — five ways to change the look, every
  part (253), state (`data-*`) and token (`--dz-*`), what is internal, the
  element's `::part`s; a rename is a major version.
- `scripts/css-contract.mjs` (comments stripped; dom, pro, motion-gsap and
  the theme scanned) and `packages/dom/test/styling-contract.test.ts`: the
  code and the page agree on parts, tokens and data-* attributes.
- States as attributes beside the classes: a day's `data-date`,
  `data-weekday`, `data-today` / `-past` / `-future`, `data-outside`,
  `data-closed`, `data-folded`, `data-resource`; an event's `data-tone`,
  `data-all-day`, `data-background`, `data-past` / `-future`,
  `data-continues-before` / `-after`, `data-selected`, `data-moving`; the
  surfaces' `data-dragging`, `-selecting`, `-grabbing`, `-dropping`; the
  calendar's `data-editable`, `-loading`; a ghost's `data-invalid`.
- Tests: `packages/dom/test/data-states.test.ts` (7).

**Reviews fixed** (architect + execution in Chrome)
- A token documented that only a comment named (`--dz-tone`); data-*
  attributes outside the contract test (a rename passed); a day's past and
  future stale after a jump of days (its side of today now in the
  signatures); `data-closed` meaning two things (`data-folded` split off);
  `data-source` renamed `data-moving` before it was frozen; `data-date` and
  `data-resource` missing on day heads; the time grid's closed days never
  marked; a conditional `setAttribute` the inventory could not read;
  `data-scheme`, density, event style, the `[data-theme]` ancestor and
  `::part` undocumented; a touch-selected event kept selected after
  `editable: false`; `state()` writing unchanged attributes.
- Found while checking: `perf:browser` did not build since 18f-4 (the
  playground's Vite alias lacked `@dzcalendar/dom/drag`) — fixed; exit codes
  are read from now on, not only the count of ✗.

**Not done on purpose**
- The timeline's heads carry no day states (its events do); an event's past
  and future are read when it is drawn (both in the contract).

### 18g-2 — unstyled mode and the Tailwind bridge
- `look: 'none'`: the structure only (grids, positions, sizes, what a
  layout needs), no colour, border or shadow — the CSS split in two
  layers (`dzcalendar.structure`, `dzcalendar.look`).
- `@dzcalendar/theme/tailwind-theme.css`: our tokens in Tailwind 4's
  `@theme` (`bg-dz-accent`, `text-dz-muted`…) and the application's
  Tailwind colours able to feed ours; a playground page built with
  Tailwind 4, checked in Chrome (utilities win, nothing reset).

### 18g-2 — done (2026-10-22)

**Built**
- `look: 'styled' | 'none'` (live, `data-dz-look`): every rule of the
  calendar's CSS split, declaration by declaration, into its structure
  (layout, sizes, scrolling, resets, opacity, the page's own colours) and
  its look, the look kept from an unstyled calendar by `:where(:not(...))`
  (no weight). Lazy: a page with no unstyled calendar pays nothing; the
  first one guards its document's (or shadow root's) sheets
  (`packages/dom/src/render/look.ts`, `guardLook`). `lookGuardedCss` for
  pages that include the CSS themselves (a warning once otherwise).
- The theme's CSS built by `scripts/build-theme.mjs` (Sass, then the same
  guard); `npm run build:theme` runs it, the theme's test compares.
- `@dzcalendar/theme/tailwind-theme.css`: the tokens in Tailwind 4's
  `@theme inline` (`bg-dz-accent`, `text-dz-muted`, `rounded-dz`…, the
  platform's colours outside a calendar).
- Tailwind 4.3.3 (`tailwindcss`, `@tailwindcss/vite`, dev only) in the
  playground; `playground/tailwind.html` (styled + utilities, unstyled +
  Tailwind) and `playground/unstyled.html` (no CSS of the application),
  checked in Chrome (`test:browser`).
- Tests: `packages/dom/test/look.test.ts` (8), Chrome (12).
- Budgets (owner, measured + 3 %): dom 54 803, pro/editor 10 948, and the
  first frame of `timeGridWeek:U` 30 ms (27 before, over it as known noise
  for several phases).

**Reviews fixed** (architect + execution in Chrome)
- Unstyled was unusable in places: sticky heads (the list's, the
  timeline's) and the editor lost their fill (content through them) —
  now the page's `Canvas`; buttons became the browser's grey ones — resets
  kept; disabled entries and moved events lost their opacity — kept.
- Dark text on a dark fill (the system dark, the page light): the scheme is
  the look again, `Canvas` follows the page. A weight (600) and a radius
  (50 %) in digits were taken for neutral values — neutral counts only for
  colours, fills, borders and a font reset.
- A string with a semicolon cut a declaration; a single-colon
  pseudo-element got the guard after it (an invalid selector); a sheet
  guarded twice; a `defineTheme` sheet written back unguarded at each
  update; the bridge without fallbacks outside a calendar and without the
  calendar's on-tone chain; checks that Tailwind's preflight made pass
  whatever the guard did.
- Measured: the guard on every sheet cost ~2 ms at first render for every
  page — made lazy; `kernel.now()` read for every event drawn (since
  18g-1) — once per drawing.

**Not done on purpose**
- Type is the look: heads and rows that size to their text follow the
  application's font sizes (the time scale does not move); borders are the
  look (a column's 1-px line).
- The editor's buttons and fields are the browser's own when unstyled.

### 18g-3 — the visual pass
- **Owner's decisions (2026-10-22):** the header as FullCalendar's —
  `[‹|›] [today]` at the start, the title centred and bold, the views at the
  end (the new default layout); events tinted with their edge (the default),
  the title in the tone's dark shade; the background: one pale grey for
  "out of service" (weekends, closed hours), the month's weekend hatching
  kept but paler, days outside the month with a muted number and no fill.
  Before screenshots: `playground/gallery.html` (every view, a fixed now).
- Header, buttons and groups, the title, the active view, events (tinted
  and solid), today, grid lines, the month, the list, the multi-month
  year, the timeline, "+N" and its panel, menus, the editor's surfaces,
  focus rings, disabled states, `.dz-tpl*`; light and dark, the seven
  themes; before/after screenshots for the owner.

**Built**
- The header by default as FullCalendar's (`'prev,next today'` | title |
  views), its title (1.375rem, 600), its buttons (2rem high, the arrows
  square, joined groups, disabled at half), the pressed view filled.
- Events tinted with their edge; the text a shade of the tone (45% with
  the theme, the plain text without one — a system accent can be
  translucent); the time at full strength. Short events (under ~1.9rem:
  20 minutes at the default scale) on one line, the time giving way, the
  title alone when narrow too (`@container dz-ev`); a title in a narrow
  column cut anywhere rather than an ellipsis on every line.
- The background: closed hours at 6%, the month's hatching paler, padding
  days without a fill (a muted number), inner lines `--dz-line`.
- Every choice the application's: `--dz-title-*`, `--dz-button-*`,
  `--dz-arrow-size`, `--dz-event-tint|shade|edge|title-weight|hyphens`,
  `--dz-closed-image`, `--dz-outside-fg` (docs/styling.md); `headerToolbar`
  and `eventStyle` as before. A narrow header: the title alone on the first
  line, centred.
- Fixed on the way: a timeline bar begun before the view had no title
  (now sticky, with its time); "+N" spilt over the next day in a year's
  months; `eventStyle: 'solid'` did not reach the timeline.
- Chrome: the defaults, every token applied, one-line/two-line events, the
  sticky timeline label, solid keeping `--dz-event-bg/fg`, and every
  event's text ≥ 4.5:1 on its tint (6 tones and the accent × 7 families ×
  light/dark, time grid, month bars, timeline).
- Budgets (owner, measured + 3 %): pro 15 032, `timeGridWeek:U` first
  frame 33 ms (the container of short events, the narrow-column cut).

**Reviews fixed** (architect + execution in Chrome)
- AA: the tone's text at 60% fell under 4.5:1 in 4 families (titles) and
  5 (times, at 85% opacity) — 45%, the times opaque, measured 0 failures
  out of 1,344 samples; without the theme, the plain text.
- `eventStyle: 'solid'` redefined `--dz-event-bg/fg` and ignored the
  application's; the short-event time pushed the title out (and lost its
  gap in RTL); the timeline's sticky title slid over its time;
  `--dz-closed-bg` was an image under a colour's name; chains that skipped
  `--dz-bg`/`--dz-bg-raised`; the ghost ignored the event tokens; the
  arrows and the title weight not tokens; a padding day's opacity
  survived the unstyled mode (now a colour); the old default layout in
  three docs; a narrow header pushing the centred title aside, or the old
  layout squeezing it to a word a line.
- Measured: hyphenation cost ~4 ms at the first drawing (its dictionary) —
  opt-in (`--dz-event-hyphens: auto`).
- A drag check went straight across a calendar's top edge, whose autoscroll
  moved the hours by a quarter: the path goes to the height first.

**Not done on purpose**
- The popover, the menus, the editor's surfaces, focus rings and `.dz-tpl*`
  keep their look (already sober); the seven themes' palettes unchanged
  (only the event shade is the theme's). Focus and targets are 18g-4's.
- Compact density: an event of 20 minutes or less (16 px) clips its one
  line; a tooltip of the application's with `position: fixed` inside an
  event is placed by the event (it is a size container) — documented.

### 18g-4 — WCAG 2.2 AA
- **Owner's decisions (2026-10-22):** the time grid's one tab stop (its
  keyboard cursor) rests in the visible hours — at now when shown, else at
  `scrollTime` — not in the all-day row (an empty day's scrolling hours then
  hold something focusable); targets: an event's height is its duration,
  WCAG 2.5.8's "essential" exception, said in the conformance report; every
  other target (buttons, day numbers, "+N", handles) at least 24 px.

**Built**
- The time grid's cursor rests, before its first focus, in the hours shown
  (a sticky box over the first column: an empty day's scrolling region
  holds the tab stop, tabbing scrolls nothing); focused, it goes on now
  when today shows it, else on the first slot in view; it moves by the
  least scroll (no centring jump). The timeline's likewise (it was focused
  off-screen).
- Targets ≥ `--dz-target-min` (24 px): day and week numbers, "+N", list
  dates, the panel's close button, the timeline's expander; events take
  the essential exception, the column grip the spacing one.
- 320 px / 400 %: the header's title alone on its line and wrapping, its
  buttons tighter and wrapping; the list's time above its title; "+N" keeps
  its count when narrow (`.dz-more__rest` dropped); weekday heads clipped
  with an ellipsis.
- Focus never hidden: `scroll-padding` under the list's and the timeline's
  sticky heads (`--dz-list-head`, `--dz-tl-head`), and what sticks keeps
  the scroll when focused (negative `scroll-margin`). Rings made explicit
  (week number, "+N", day number, close button, the column grip — solid);
  forced-colour rules for the timeline.
- "Selection cleared" said on Escape (EN, FR, AR, ES, DE). A keyboard
  context menu stays open through a scroll that does not move its anchor;
  closed by one, it hands the focus back.
- Outside-month numbers in `--dz-fg-muted` (they are links: AA).
- Chrome (scripts/browser.mjs, "Phase 18g-4"): an empty day under axe; the
  cursor resting and placed (now, RTL, no all-day row); targets; text
  spacing measured on the text's own box, across and down; text at 200 %;
  reflow at 320 and 640 px (the list included); focus not obscured (list,
  timeline); axe under forced colours, light and dark; the timeline's
  cursor seen; a grip keeping the scroll; a keyboard menu through a smooth
  scroll. `playground/gallery.html` gained an empty day.
- `site/a11y-conformance.md` reviewed: 1.4.4, 1.4.10, 1.4.12, 2.1.4, 2.5.8
  now Supports (with what checks them), 1.4.13 (native `title`s, the
  user-agent case), 1.3.5 / 3.3.7 worded for the Pro editor, the timeline's
  coverage stated.
- Budgets (owner, measured + 3 %): dom/list 5 429, pro 15 506.

**Reviews fixed** (architect + execution in Chrome)
- The decision "at now when shown" was not what `home()` did — it is now.
- The timeline's cursor was focused off-screen (pre-existing); the column
  grip's focus jumped the view 525 px (from this pass's scroll-padding).
- The list scrolled sideways at 320 px and its rows did not follow the
  page's text size; "+N" lost its count when narrow; Escape left a stale
  "Selected: …"; ArrowUp past the top jumped 260 px; a keyboard menu
  closed at once during a scroll and dropped the focus on `<body>`
  (pre-existing).
- The column grip's focus was a 35 % tint; the ACR claimed checks that did
  not exist (1.4.4, vertical cuts for 1.4.12) and a ring on everything; the
  24 px floors and the sticky offsets were not tokens.
- The time heads' "02:00*" (the second pass) lost its star with wider text
  spacing: a time head's text may run into the next one's padding.

**Not done on purpose**
- Screen-reader sessions (NVDA, JAWS, VoiceOver, TalkBack) and an audit
  with users — still the ACR's first known gap.
- axe under forced colours with the calendar's scheme opposite the
  system's reports the pre-forcing colours (a false positive: the page is
  drawn in the forced palette); the checks run with matching schemes.
- `aria-keyshortcuts`, remappable keys (3.3.2 stays "partially").
- axe in Chrome on every view × theme × scheme; the keyboard end to end;
  reflow at 320 px and zoom 200 %; text spacing (1.4.12); targets ≥ 24 px
  (2.5.8, compact density included); focus never hidden (2.4.11) under the
  sticky heads; forced colours; reduced motion; the empty day's scroll
  region (a decision on the grid's tab stops, asked first).

Reviews and a commit at the end of each step.

