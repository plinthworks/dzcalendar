# Roadmap

Phases and acceptance criteria: `ARCHITECTURE.md`, section J.

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
  chunk cache, json/fn sources — Phase 9. `commands.schema.json` — Phase 18.

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

## Next — Phase 7: mouse, touch, pen

See `ARCHITECTURE.md` J. Phase 7.
