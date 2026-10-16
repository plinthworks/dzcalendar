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

## Next — Phase 4: day grid month/week/day and "+N"

See `ARCHITECTURE.md` J. Phase 4.