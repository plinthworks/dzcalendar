# Roadmap

Phases and acceptance criteria: `ARCHITECTURE.md`, section J.

## Resume here (if a session is lost)

- **Done:** Phases 0–14 and 15a, each committed (`git log --oneline`: the
  last is titled "Phase 15a"). Every check green at that commit: `npm test`
  (1 072), `npm run test:ci`, `typecheck`, `build`, `size`, `bench`,
  `test:browser` (147), `perf:browser`, `test:package`.
- **Now:** Phase 15, split in two by the owner (2026-10-18): **15a**
  resource model + resource columns (timeGrid/dayGrid by resource), then
  **15b** timeline + 2D windowing. Decisions validated: see
  "Phase 15 — owner's decisions" below.
- **15a done** (commit titled "Phase 15a"). **Next: 15b** — the timeline
  (with and without resources, `elapsed` axis, two labelled 02:00s, the
  resource area with tree, groups and field columns, 2D windowing, budget
  G.2 500 × 10 000, `treegrid`) in a new `@dzcalendar/pro`; its design
  decisions are to be validated with the owner first.
- **Remote:** `git@github.com:plinthworks/dzcalendar.git` (push `main` by
  that URL; the owner authorised pushing on 2026-10-18).
- **Left after it:** 16 Pro print / export /
  editor, 17 animations, 18 ecosystem (Web Component, React/Vue,
  FullCalendar options translator), 19+ native (Swift/Kotlin from
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

## Phase 15 — Pro, resources and timeline (in progress)

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
- An "unassigned" column; `unknown-resource` for events (resources may
  arrive after events).
- `resource.set` as an undoable command (`setResources` is data, like
  `setEvents`).
- Row state (expanded, collapsed groups) in the kernel, windowed
  per-resource rows, an overlap check indexed by resource, `didMount` /
  `willUnmount` for resource heads, a resource click: with the timeline
  (15b).
- Slots stay instants: a resource's zone is not given to `findSlots`.
- ical's size (7.9 kB against 7.5) was already over before this phase:
  left for the owner.
