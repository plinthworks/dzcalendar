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

## Next — Phase 2: projection, axis, layout (pure)

See `ARCHITECTURE.md` J. Phase 2. Carried items above still apply (cut timed
events at `repeat` transitions in `wall` mode; `skipped` days).
