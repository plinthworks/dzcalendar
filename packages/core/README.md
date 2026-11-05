# @dzcalendar/core

Calendar model on Temporal: events with their own time zone, DST-correct days. No DOM, no framework, no `Date`.

**English** · [Français](#français)

## What it is

`@dzcalendar/core` is the engine under DzCalendar: a persistent event store with undo, commands, repeating events, event sources, view models and the layout and interaction rules, all pure functions over Temporal values. Every event keeps its own time zone, and days of 23 h, 25 h or 23 h 30 are modelled as they are (a skipped hour, a repeated hour, Lord Howe's half hour). It has no DOM and no framework, so it runs in a browser, in Node, in a worker, and is the model that `@dzcalendar/dom`, the framework components and the future native ports draw.

## Install

```bash
npm install @dzcalendar/core
```

`@tzslot/core` (`^2.3.0`) and `@dzcalendar/rrule` are dependencies and come with it. Companion packages: `@dzcalendar/dom` (draws a calendar from the kernel), `@dzcalendar/ical` (`.ics` files and feeds), `@dzcalendar/slots` (bookable slots).

Entries: `@dzcalendar/core` (everything below unless noted), `@dzcalendar/core/recurrence` (loads the repeating-events engine), `@dzcalendar/core/views` (list and multi-month models) and `@dzcalendar/core/live` (pushed event sources).

## Quick start

```ts
import { createKernel, dayInfo, loadTemporal, Temporal, viewWindow } from '@dzcalendar/core';

// Native Temporal: instant. Otherwise this fetches the polyfill once.
await loadTemporal();

const zone = 'Europe/Paris';
const kernel = createKernel({ timeZone: zone, locale: 'en-GB', initialView: 'dayGridWeek', initialDate: Temporal.PlainDate.from('2026-10-21') });

// A night shift across the end of summer time (Sunday 25 October 2026, 03:00 becomes 02:00).
const result = kernel.run({
  type: 'event.create',
  event: { id: 'shift', title: 'Night shift', start: '2026-10-25T01:00[Europe/Paris]', end: '2026-10-25T04:00[Europe/Paris]' },
});
console.log(result.ok); // true

// What the day shows.
const day = Temporal.PlainDate.from('2026-10-25');
console.log(dayInfo(day, zone).lengthMinutes); // 1500: a 25-hour day
const [shift] = kernel.store.snapshot.queryInstances(viewWindow(day, day.add({ days: 1 }), zone));
// Four elapsed hours, not three: 01:00 and 02:00 (+02:00), then 02:00 and 03:00 (+01:00).
const ev = shift!.event;
if (ev.allDay) throw new Error('a timed event');
console.log((ev.end.epochMilliseconds - ev.start.epochMilliseconds) / 60_000); // 240

// Undo is built in.
kernel.history.undo();
console.log(kernel.store.snapshot.counts.events); // 0

kernel.destroy();
```

Repeating events need the recurrence engine, imported once:

```ts
import '@dzcalendar/core/recurrence';
import { createKernel, loadTemporal, Temporal, viewWindow } from '@dzcalendar/core';

await loadTemporal();

const kernel = createKernel({ timeZone: 'Europe/Paris', locale: 'en-GB' });
kernel.setEvents([{ id: 'rounds', title: 'Rounds', start: '2026-10-19T08:00[Europe/Paris]', duration: { hours: 1 }, rrule: 'FREQ=WEEKLY;BYDAY=MO' }]);

// The week of Monday 26 October 2026: the clocks went back the day before, the wall time stays 08:00.
const week = viewWindow(Temporal.PlainDate.from('2026-10-26'), Temporal.PlainDate.from('2026-11-02'), 'Europe/Paris');
console.log(kernel.store.snapshot.queryInstances(week).map((i) => i.event.start.toString()));
// ['2026-10-26T08:00:00+01:00[Europe/Paris]']

// Delete this occurrence only.
kernel.run({ type: 'event.delete', id: 'rounds', key: '2026-10-26T08:00:00+01:00[Europe/Paris]', scope: 'this' });
console.log(kernel.store.snapshot.queryInstances(week).length); // 0

kernel.destroy();
```

## Temporal

Temporal comes only from `@tzslot/core/lazy`, re-exported here: `Temporal`, `usingPolyfill` (true when the runtime has no native Temporal: a diagnostic, not logic), `loadTemporal()` and `temporalReady()` (true when Temporal can be read now). Where the platform has no native Temporal, `await loadTemporal()` once at startup (it fetches the polyfill once; a microtask where native); touching Temporal before that throws a `ReferenceError` naming `loadTemporal`. No module here reads Temporal as it is imported. In a calendar made by `@dzcalendar/dom`, `await calendar.ready` does the same. One polyfill, one set of classes, for an application that uses this library and `@tzslot/core` together.

Types re-exported: `PlainDate`, `PlainTime`, `PlainDateTime`, `ZonedDateTime`, `Instant`, `Duration`, `DurationLike`, `Weekday` (ISO, 1 Monday ... 7 Sunday), `PlainYearMonth`, `ZoneId` (an IANA name or `UTC`), `EpochMs`. Compare Temporal values with `.toString()`; Temporal objects cannot go to `Intl.DateTimeFormat#format` under the polyfill: use `formatTemporal`.

## API

### Events

| Export | What it does |
| --- | --- |
| `normalizeEvent(input, ctx, path?)` | One loose `EventInput` to one strict `CalEvent` (or a `Series` when it has an `rrule`), or the reasons it cannot be one: `{ ok: true, value, problems }` or `{ ok: false, problems }`. Never throws on data; every guess is a warning. A bad `ctx` throws. |
| `normalizeMany(inputs, ctx, sourceId?, indexes?)` | Many inputs, each judged alone; returns `{ items, report }`. A repeated id rejects the later input. With a `sourceId`, an event without id gets one derived from what it is, so a refetch gives the same id. |
| `itemEvent(normalized)` | The event a `Normalized` stands for: the event itself, or a series' base event (its template at its first start). |
| `DEFAULT_TIMED_DURATION`, `DEFAULT_ALL_DAY_DURATION` | `{ hours: 1 }` and `{ days: 1 }`. |
| `createIdGenerator(prefix = 'dz')` | An `IdGenerator` (`() => string`) for events handed in without an id. |
| `toInput(event)` | A stored event written back as an `EventInput`. |

Types: `EventInput` (loose: `id`, `title`, `start`, `end`, `duration`, `allDay`, `timeZone`, `resourceId(s)`, `rrule`, `exdate`, `rdate`, `seriesId`, `recurrenceId`, `display`, `status`, `busy`, `editable` and friends, `classNames`, `tone`, `url`, `extendedProps`, `ongoing`), `CalEvent` = `TimedEvent` (start and end are `ZonedDateTime`, possibly in different zones) | `AllDayEvent` (`PlainDate`, `end` exclusive, no zone), `EventId`, `ResourceId`, `TemporalInput` (a Temporal object or a string, never a `Date`), `EventDisplay` (`'auto' | 'block' | 'list-item' | 'background' | 'inverse-background' | 'marker' | 'none'`), `EventStatus` (`'confirmed' | 'tentative' | 'cancelled'`), `NormalizeContext` (`displayZone`, `defaultEventZone?`, `defaultTimedDuration?`, `defaultAllDayDuration?`, `strictZones?`, `newId`, `now?`, `knownResources?`), `Normalized`, `NormalizeResult`, `NormalizationReport` (`accepted`, `rejected`, `problems`).

### Time zones and days

| Export | What it does |
| --- | --- |
| `dayInfo(date, zone)` | A `DayInfo`: `start` and `end` instants (a day does not always start at midnight), `lengthMinutes` (1380, 1500, 1410 at Lord Howe, 0 for a skipped day), `kind` (`'normal' \| 'short' \| 'long' \| 'skipped' \| 'irregular'`), `transitions`. |
| `dayInfos(from, count, zone)` | `count` consecutive days, the zone asked once. |
| `transitionsBetween(from, to, zone)` | Every offset change in `[from, to)`: `at`, offsets before and after, `deltaMinutes`, `wallBefore`, `wallAfter`, `kind` (`'gap' \| 'repeat'`). |
| `resolveWall(date, time, zone, policy)` | A wall time made into an instant under a `WallPolicy` (`'compatible' \| 'earlier' \| 'later' \| 'reject' \| { preferOffset }`): `{ instant, exists, ambiguous, other, offsetMatched }`. |
| `isValidZone(zone)`, `isOffsetZone(zone)` | A zone Temporal accepts; a bare offset such as `+02:00` (valid, but not a place). |
| `isQuietDay(date, zone)` | No clock change can touch a wall time on that date (cached). |
| `epochDay(date)`, `fromEpochDay(n)` | A date as a day number since 1970-01-01, and back. |

### Intervals

Half-open `[start, end)` spans on epoch milliseconds (`MsSpan { s, e }`; `Interval { start, end }` as instants): `normalizeIntervals` (sort, drop empty, merge), `unionSpans`, `intersectSpans`, `subtractSpans`, `spansToIntervals`.

### The store

| Export | What it does |
| --- | --- |
| `createEventStore(initial?)` | An `EventStore`: `snapshot` (immutable `StoreSnapshot`), `apply(mutations, cause)`, `replaceSourceChunk(s)`, `subscribe(fn)`. One transaction, one notification. |
| `StoreSnapshot` | One immutable state: `version`, `counts`, `getEvent(id)`, `getSeries(id)`, `allEvents()`, `allSeries()`, `isSourceOwned(id, kind?)`, `queryInstances(window, options?)` (the events a window shows, occurrences of series included, in a stable order). `StoreSnapshot.EMPTY`. |
| `viewWindow(startDate, endDate, zone)` | A `ViewWindow`: whole days in a zone (instants and dates, end exclusive). |
| `datesWindow(startDate, endDate, zone)` | Whole dates as they exist anywhere on earth: what a source chunk is fetched over. |
| `eventEquals(a, b)`, `sameValue(a, b)`, `stamp(prev, next, revision)` | Structural equality of events; of JSON-like values; the store's revision rule (an equal event keeps its object). |
| `invert(mutation)`, `isEmptyChange(change)` | The opposite mutation; a change that did nothing. |
| `PersistentOrderedMap`, `PersistentIntervalTree` | The store's persistent indexes (immutable sorted map; interval tree with `insert`, `remove`, `overlapping`). |

Types: `EventStore`, `ViewWindow`, `EventInstance` (`key`, `event`, `origin: 'single' | 'occurrence' | 'override'`), `QueryOptions` (`resourceId?`, `includeBackground?`, `onProblem?`), `Mutation` (`{ kind: 'event' | 'series', before?, after? }`), `StoreChange` (`version`, `added`, `updated`, `removed`, `dirtySpans`, `dirtyDays`, `cause`, `seriesTouched`, `seriesChanged`, `problems`, `applied`), `ChangeCause` (`'command' | 'source' | 'undo' | 'redo' | 'api'`).

### Commands and undo

| Export | What it does |
| --- | --- |
| `applyCommand(snapshot, command, ctx)` | Turns a `Command` into the mutations that carry it out. Pure, all or nothing: nothing is applied. Returns `{ ok: true, mutations, problems }` or `{ ok: false, problems, violations? }`. |
| `createHistory(store, ctx, options?)` | A `History`: `run(command)`, `undo()`, `redo()`, `canUndo`, `canRedo`, `revert(applied)`, `canRevert(applied)`, `transaction(label, fn)`, `clear()`, `destroy()`. Options: `limit` (200), `mergeKey` (a drag becomes one entry), `onDropped`. `ctx` may be a function read at each command. |

`Command` is plain data (log it, send it, generate it): `event.create`, `event.update` (with an `EventPatch`; a field left out is kept, `null` clears), `event.move`, `event.resize`, `event.delete`, `series.delete`, `series.split` ("this and following" without the drag), `series.rule` (`null` stops it repeating), `event.repeat`, and `batch`. The ones on an occurrence take a `Reach`: `scope` (`'this' | 'following' | 'all'`) and `key` (the occurrence's original start). `CommandContext` carries `normalize`, `weekStart?`, `rules?`, `external?`.

### Repeating events

Import `@dzcalendar/core/recurrence` once (it plugs the engine in: `useRecurrence`); without it, an event with `rrule` is refused with `recurrence-not-loaded`. The pure functions are exported from the main entry:

| Export | What it does |
| --- | --- |
| `expandSeries(series, window, { limit? })` | The occurrences of a series meeting a window, as events (those that began before and run into it included). Limit `DEFAULT_OCCURRENCE_LIMIT` (2000), then `too-many-occurrences`. |
| `seriesSpan(series)` | Where a series sits in an index. |
| `materialize(series, start)`, `occurrenceLength(base)` | The occurrence starting at `start` as an event; the length every occurrence takes (whole days on the wall clock, the rest elapsed). |
| `keyOf`, `escapeId`, `occurrenceKey(seriesId, key)`, `parseInstanceKey`, `seriesEquals` | Occurrence keys and instance keys (`id`, or `seriesId@key`). A key is the original start in full, offset included, so the two 02:30s of a fall-back night are two occurrences. |
| `editOccurrence`, `deleteOccurrence`, `deleteSeries`, `isOccurrence`, `startOfKey` | Series editing as mutations: one occurrence, the following ones, or all (`EditScope`; `EditOptions.overrides: 'keep' \| 'drop'`). |
| `parseRRule`, `serializeRRule`, `rebaseRule`, `splitRule`, `countBefore` | Re-exported from `@dzcalendar/rrule`, with the types `RRule`, `RRuleSet`, `Frequency`, `RRuleWeekday`. |

Types: `Series` (`id`, `revision`, `base`, `set`, `overrides`, `sourceId?`, `splitFrom?`), `SeriesWindow`, `EditScope`, `OccurrenceRef`, `EditOptions`.

### Rules and interaction

| Export | What it does |
| --- | --- |
| `validateProposal(snapshot, placement, rules, opts?)` | What stands in the way of a placement: `Violation[]` (`'constraint' \| 'overlap' \| 'allow' \| 'valid-range' \| 'not-editable'`), cheapest checks first. Types `Placement`, `ConstraintSpec`, `OverlapFn`, `RulesContext`. |
| `businessIntervals(from, to, input, displayZone)` | Open stretches of business hours as spans, each rule read in its own zone. |
| `assertBusinessHours(input)` | Throws on an unreadable rule: configuration, said once. Types `BusinessHoursRule` (`daysOfWeek`, `start`, `end`, `timeZone?`), `BusinessHoursInput` (`true` = Monday to Friday 09:00-17:00, `false`, a rule, or a list). |
| `proposeMove(ctx, event, grab, over)`, `proposeResize(ctx, event, edge, over)` | Where an event goes for a pointer or keyboard `Hit`, snapped on the wall clock, with `valid`, `violations`, and `ambiguity` / `skipped` flags for repeated and skipped hours. The same for every input device. |
| `isUnchanged(proposal)`, `selectionBetween(ctx, a, b)`, `commandFor(instance, proposal, scope?)` | Whether a proposal changes nothing; the stretch between two hits; the `Command` that carries a proposal out. |
| `intentFor(key, ctx)`, `stepHit`, `eventHit`, `grabStep`, `heldEvent` | The keyboard model: what a key means (`Intent`), moving a hit by a step, an event's edge as a hit, one press in grab mode, the event as held. Types `Hit`, `InteractionContext`, `Proposal`, `Selection`, `KeyLike`, `KeyContext`, `KeyMode`, `Step`, `Intent`. |
| `actionsFor(target, ctx)` | The built-in context-menu entries for a target (`ActionTarget`), as data (`ActionItem`, `ActionLabels`, `ActionContext`, `CreateRequest`). |

### Sources

A source is a spec (`EventSourceSpec`: `id`, `fetch`, `chunk`, `staleAfter?`, `retry?`, `zoneDependent?`, `defaults?`, `save?`, `live?`, `forgot?`).

| Export | What it does |
| --- | --- |
| `arraySource(id, events, defaults?)`, `loadStaticSource(store, spec, ctx)` | A fixed list, one chunk for all of time; load a synchronous unchunked source straight into a store. |
| `jsonSource(id, options)` | Events from a URL answering JSON: `start`, `end` and `timeZone` in the query (`startParam`, `endParam`, `zoneParam`, `params`, `method`, `headers`, `map`, `chunk`, `fetchImpl`). One month a request by default. |
| `fnSource(id, fn, options?)` | Events from your function of `{ window, signal, sourceId }`, synchronous or not. |
| `createSourceManager(options)` | Fetches each source chunk by chunk as the calendar moves and keeps the store in step: `add`, `remove`, `get`, `ids`, `setRange`, `refetch`, `loading`, `idle()`, `hold(start, end)`, `forgot`, `destroy`. By default 4 requests at once (`maxConcurrent`) and 12 chunks kept beyond what is shown (`keepChunks`). Reports `SourceNotice`s: `loading`, `error`, `problems`, `save-error`, `saved`. |
| `chunkAt(unit, date)`, `chunksCovering(unit, start, end, prefetch?)` | The chunks (`'none' \| 'week' \| 'month' \| 'year'`) a date falls in, or `[start, end)` needs. |
| `exportInputs(snapshot, keep?)`, `eventInput`, `seriesInput` | What a snapshot holds written back as inputs (series first, then events, in id order): the start of an export. |

Types: `FetchRequest`, `SourceFetch`, `SourceResult` (events, or `{ events, problems? }`), `ChunkPolicy` (`unit`, `prefetch`), `SourceEdit`, `SaveRequest` (`sourceId`, `edits`, `cause`), `AbortSignalLike`, `PlatformAbortSignal`, `JsonSourceOptions`, `FetchLike`, `SourceManager`, `SourceManagerOptions`, `Timers`, `Chunk`.

`@dzcalendar/core/live` adds sources that are told rather than asked: `liveSource(id, { connect, defaults? })` for any feed (a WebSocket, MQTT...), whose `connect(emit)` opens it and returns how to close it; `sseSource(id, url, { map, events?, withCredentials?, reopenAfterMs?, defaults? })` for Server-Sent Events. A message is a `LiveMessage`: `{ create }`, `{ update, patch }`, `{ remove }` or `{ reset }`.

```ts
import type { EventInput } from '@dzcalendar/core';
import { liveSource, sseSource } from '@dzcalendar/core/live';

// Server-Sent Events: each message is an event to create.
export const feed = sseSource('feed', '/events/stream', { map: (data) => ({ create: data as EventInput }) });

// Any other transport: a WebSocket.
export const sockets = liveSource('sockets', {
  connect(emit) {
    const ws = new WebSocket('wss://example.org/events');
    ws.onmessage = (m) => emit({ create: JSON.parse(String(m.data)) as EventInput });
    return () => ws.close();
  },
});
```

### Layout and projection

| Export | What it does |
| --- | --- |
| `layoutColumn(items, options)` | Side-by-side (or cascade) placement of overlapping events in one time column, in axis units: `ColPlacement` (`lane`, `lanes`, `left`, `width`, `z`). |
| `packLanes(items)`, `computeOverflow(lanes, items, dayCount, maxLanes)` | Stacking bars into rows; what fits in `maxLanes` day by day, with the "+N" counts. |
| `PrefixSums`, `visibleRange`, `visible2D` | Virtual scrolling: offsets of items of varying size (Fenwick tree) and the visible index range. |
| `segmentTimed(instance, days, options?)`, `segmentAllDay(instance, dateIndex)`, `splitByWeek(segments, weeks)`, `dateIndex(dates)` | An event cut into the real days of the display zone (23, 24 or 25 hours, or none), all-day bars over shown columns, bars cut at week ends. Types `Segment`, `TimedSegment`, `SegmentTimedOptions`, `DateIndex`. |
| `buildColumnAxis(date, zone, options?)` | The vertical axis of one day column: `'wall'` (clock minutes, a skipped hour is a band, a repeated hour shares positions) or `'elapsed'` (real minutes, a 25-hour day is 25 hours tall); `toPosition`, `toEndPosition`, `fromPosition`, `ticks`. |

### Views and the kernel

| Export | What it does |
| --- | --- |
| `createKernel(options)` | The calendar without a screen: state (view, date, range, title), store, sources, history, commands. See below. |
| `BUILTIN_VIEWS` | `dayGridMonth`, `dayGridWeek`, `dayGridDay`, `timeGridWeek`, `timeGridDay`, `listDay`, `listWeek`, `listMonth`, `listYear`, `multiMonthYear`, and the `resource...` ones (`resourceTimeGridDay`, `resourceTimeGridWeek`, `resourceDayGridDay`, `resourceDayGridWeek`, `resourceDayGridMonth`). |
| `registerViewSpec(spec)`, `registeredViewSpecs()` | Views a plugin brings. |
| `computeViewRange(anchor, spec, ctx)`, `navigate(anchor, spec, direction, ctx)` | The dates a view covers around an anchor (`ViewRange`); the anchor after `'prev' \| 'next' \| 'today' \| { to }`. Types `ViewSpec`, `ViewSettings`, `ViewFamily`, `ViewRange`, `NavContext`, `NavDirection`. |
| `buildTimeGridModel`, `buildTimeGridColumn`, `updateTimeGridModel`, `locateNow`, `slotInstant` | Everything a time grid draws, as data, rebuilt only where a change touched (untouched columns keep their identity). Types `TimeGridModel`, `TimeGridColumn`, `TimeGridOptions`, `PlacedTimed`, `MoreTimed`, `AllDayBar`, `Reading`, `AvailableSlot`, `PlacedSlot`, `ResourceHead`, `ResourceGroupHead`. |
| `buildDayGridModel`, `updateDayGridModel` | A month (or week, or day) as rows of bars. Types `DayGridModel`, `DayGridWeek`, `DayGridBar`, `DayGridOptions`. |
| `registerModelFamily(family, f)`, `assertTimeline`, `assertTimeGrid`, `timeStep`, `timeSpan`, `followBefore` | The kernel's model families and the validation of timeline and time-grid settings (a `RangeError` for a setting that cannot be taken). |

The kernel (`CalendarKernel`) holds `store`, `history`, `sources`, and: `getState()` (`KernelState`: `date`, `view`, `range`, `timeZone`, `locale`, `firstDay`, `title`, `today`), `setView`, `navigate`, `setTimeZone`, `setLocale`, `setOptions`, `setFirstDay`, `setTitleFormat`, `setRules`, `getOptions`, `setEvents(events)`, `batch(fn)`, `refreshToday`, `refreshOngoing`, `forgetBefore`, `viewModel()`, `viewProblems()`, `stateAt`, `modelAt`, `now()`, `getProblems()`, `whenLoaded()`, `setResources`, `getResources`, `getResourceProblems`, `run(command, { validate?, external? })`, `rules()`, `subscribe(fn)` (`KernelEvent`: `state`, `store`, `source`) and `destroy()`. Options (`KernelOptions`): `timeZone`, `locale`, `firstDay?`, `titleFormat?`, `initialDate?`, `initialView?`, `views?`, `store?` (share one store between kernels), `events?`, `rules?`, `historyLimit?`, `sources?`, `onSource?`, `resources?`, plus `timeGrid`, `dayGrid`, `timeline`, `businessHours`, `availableSlots`, `hiddenDays`, `resourceOrder`, `resourceGroupField`, `showUnassigned`, `collapsedResources`, `collapsedGroups`. Types `CalendarKernel`, `KernelOptions`, `KernelState`, `KernelEvent`, `ViewModel`, `ModelFamily`, `ModelOptions`, `StateCause`, `TitleFormat`, `TitleFormatArg`.

`@dzcalendar/core/views` holds the models paid for only when used: `buildListModel(range, snapshot, { displayZone, includeEmpty? })` (types `ListModel`, `ListDay`, `ListEntry`, `ListOptions`), `buildMultiMonthModel` and `updateMultiMonthModel` (type `MultiMonthModel`).

### Resources

| Export | What it does |
| --- | --- |
| `buildResourceTree(inputs, { orderBy? })` | The resources as a checked tree: `{ tree, problems }`. Never throws (`invalid-resource`, `duplicate-id`, `unknown-resource`, `resource-cycle`). `EMPTY_TREE`. |
| `fieldOf(resource, name)` | A field of a resource: its own, else what the application gave, else its `extendedProps`. |
| `flattenRows(tree, state?, filter?)`, `columnResources(tree, groupBy?)`, `groupValue(resource, field)` | The rows of a timeline (expanded, collapsed, grouped) and the columns of a resource view. |
| `UNASSIGNED`, `UNASSIGNED_RESOURCE`, `instancesOf(snapshot, window, resource, all, options?)` | The "Unassigned" pseudo-resource and what one resource's column shows. |

Types: `Resource`, `ResourceInput` (`id`, `title?`, `parentId?`, `order?`, `timeZone?`, `businessHours?`, `eventConstraint?`, `eventOverlap?`, `classNames?`, `extendedProps?`), `ResourceNode`, `ResourceTree`, `ResourceOrder`, `ResourceRow`, `RowState`, `ColumnResources`.

### Formatting

| Export | What it does |
| --- | --- |
| `formatTemporal(value, options, locale)`, `formatToPartsTemporal(...)` | Format a Temporal value without `Date` and without handing Temporal to Intl (epoch milliseconds plus the zone). |
| `formatRangeTitle(a, b, options, locale, { separator? })` | "15-21 March 2026", with Intl's range formatting. For titles, not for hours across a clock change. |
| `weekdayNames(locale, width, firstDay)`, `monthNames(locale, width)` | Names in a locale. |
| `weekRulesFor(locale)`, `weekNumber(date, rules)` | The locale's week rules (`firstDay`, `minimalDays`) and a date's week number under them. Types `Fmt`, `Formattable`, `WeekRules`. |

## Problems

Bad input never throws: it becomes a `Problem` (`{ code, severity: 'error' | 'warning', path, sourceId?, detail? }`). An error rejects the event; a warning accompanies an accepted one. The sentences belong to the DOM layer's translated messages. The codes (`ProblemCode`):

| Group | Codes |
| --- | --- |
| Shape | `invalid-event`, `missing-start`, `invalid-start`, `invalid-end`, `invalid-duration`, `end-before-start`, `date-object-rejected` (a `Date` is refused), `foreign-temporal` (a Temporal object from another copy is re-read from its string) |
| Identity | `invalid-id`, `duplicate-id`, `unknown-event` |
| Zones and wall times | `unknown-zone`, `zone-defaulted`, `offset-only`, `offset-mismatch`, `wall-time-skipped`, `wall-time-ambiguous` |
| All-day, markers, ongoing | `allday-with-time`, `allday-zone-ignored`, `marker-all-day`, `marker-length-ignored`, `ongoing-not-timed` |
| Resources | `unknown-resource`, `invalid-resource`, `resource-cycle` |
| Recurrence | `invalid-rrule`, `recurrence-not-loaded`, `invalid-exdate`, `invalid-rdate`, `too-many-occurrences`, `unknown-occurrence`, `invalid-edit`, `invalid-recurrence-id`, `orphan-override` |
| iCalendar | `ical-syntax`, `ical-unsupported`, `zone-guessed`, `zone-fixed-offset` (from `@dzcalendar/ical`) |
| Slots | `invalid-availability`, `invalid-slot-query` (from `@dzcalendar/slots`) |
| Application | `calendar-not-ready`, `invalid-export`, `invalid-option`, `compat-unsupported` |

Commands refused by the rules answer with `violations` (`constraint`, `overlap`, `allow`, `valid-range`, `not-editable`).

## Documentation

- [Events](https://plinthworks.github.io/dzcalendar/guides/events/) and [event sources](https://plinthworks.github.io/dzcalendar/guides/event-sources/)
- [Recurrence](https://plinthworks.github.io/dzcalendar/guides/recurrence/)
- [Time zones](https://plinthworks.github.io/dzcalendar/guides/time-zones/)
- [Views](https://plinthworks.github.io/dzcalendar/guides/views/)
- [Resources and timeline](https://plinthworks.github.io/dzcalendar/guides/resources-timeline/)
- [Drag and drop](https://plinthworks.github.io/dzcalendar/guides/drag-and-drop/) and [keyboard and accessibility](https://plinthworks.github.io/dzcalendar/guides/keyboard-accessibility/)
- Options: [`kernel`](https://plinthworks.github.io/dzcalendar/options/kernel/), [`store`](https://plinthworks.github.io/dzcalendar/options/store/), [`sources`](https://plinthworks.github.io/dzcalendar/options/sources/), [`events`](https://plinthworks.github.io/dzcalendar/options/events/), [`rules`](https://plinthworks.github.io/dzcalendar/options/rules/), [`business-hours`](https://plinthworks.github.io/dzcalendar/options/business-hours/), [`time-zone`](https://plinthworks.github.io/dzcalendar/options/time-zone/)
- [Documentation home](https://plinthworks.github.io/dzcalendar/)

## License

MIT

---

## Français

Modèle de calendrier sur Temporal : des événements qui gardent leur propre fuseau horaire, des jours corrects malgré les changements d'heure. Ni DOM, ni framework, ni `Date`.

**[English](#dzcalendarcore)** · Français

### Présentation

`@dzcalendar/core` est le moteur de DzCalendar : un store d'événements persistant avec annulation, des commandes, des événements récurrents, des sources d'événements, des modèles de vues et les règles de mise en page et d'interaction, le tout en fonctions pures sur des valeurs Temporal. Chaque événement garde son propre fuseau, et les jours de 23 h, 25 h ou 23 h 30 sont modélisés tels qu'ils sont (une heure sautée, une heure répétée, la demi-heure de Lord Howe). Il n'a ni DOM ni framework : il tourne dans un navigateur, dans Node, dans un worker, et c'est le modèle que dessinent `@dzcalendar/dom`, les composants de framework et les futurs portages natifs.

### Installation

```bash
npm install @dzcalendar/core
```

`@tzslot/core` (`^2.3.0`) et `@dzcalendar/rrule` sont des dépendances et viennent avec. Paquets compagnons : `@dzcalendar/dom` (dessine un calendrier à partir du noyau), `@dzcalendar/ical` (fichiers et flux `.ics`), `@dzcalendar/slots` (créneaux réservables).

Entrées : `@dzcalendar/core` (tout ce qui suit sauf mention), `@dzcalendar/core/recurrence` (charge le moteur des événements récurrents), `@dzcalendar/core/views` (modèles de la liste et du multi-mois) et `@dzcalendar/core/live` (sources d'événements poussées).

### Démarrage rapide

```ts
import { createKernel, dayInfo, loadTemporal, Temporal, viewWindow } from '@dzcalendar/core';

// Temporal natif : instantané. Sinon, charge le polyfill une fois.
await loadTemporal();

const zone = 'Europe/Paris';
const kernel = createKernel({ timeZone: zone, locale: 'fr-FR', initialView: 'dayGridWeek', initialDate: Temporal.PlainDate.from('2026-10-21') });

// Un service de nuit à travers la fin de l'heure d'été (dimanche 25 octobre 2026, 03:00 devient 02:00).
const result = kernel.run({
  type: 'event.create',
  event: { id: 'shift', title: 'Service de nuit', start: '2026-10-25T01:00[Europe/Paris]', end: '2026-10-25T04:00[Europe/Paris]' },
});
console.log(result.ok); // true

// Ce que montre ce jour.
const day = Temporal.PlainDate.from('2026-10-25');
console.log(dayInfo(day, zone).lengthMinutes); // 1500 : un jour de 25 heures
const [shift] = kernel.store.snapshot.queryInstances(viewWindow(day, day.add({ days: 1 }), zone));
// Quatre heures écoulées, pas trois : 01:00 et 02:00 (+02:00), puis 02:00 et 03:00 (+01:00).
const ev = shift!.event;
if (ev.allDay) throw new Error('a timed event');
console.log((ev.end.epochMilliseconds - ev.start.epochMilliseconds) / 60_000); // 240

// L'annulation est intégrée.
kernel.history.undo();
console.log(kernel.store.snapshot.counts.events); // 0

kernel.destroy();
```

Les événements récurrents demandent le moteur de récurrence, importé une fois :

```ts
import '@dzcalendar/core/recurrence';
import { createKernel, loadTemporal, Temporal, viewWindow } from '@dzcalendar/core';

await loadTemporal();

const kernel = createKernel({ timeZone: 'Europe/Paris', locale: 'fr-FR' });
kernel.setEvents([{ id: 'rounds', title: 'Tournée', start: '2026-10-19T08:00[Europe/Paris]', duration: { hours: 1 }, rrule: 'FREQ=WEEKLY;BYDAY=MO' }]);

// La semaine du lundi 26 octobre 2026 : les horloges ont reculé la veille, l'heure murale reste 08:00.
const week = viewWindow(Temporal.PlainDate.from('2026-10-26'), Temporal.PlainDate.from('2026-11-02'), 'Europe/Paris');
console.log(kernel.store.snapshot.queryInstances(week).map((i) => i.event.start.toString()));
// ['2026-10-26T08:00:00+01:00[Europe/Paris]']

// Supprimer cette seule occurrence.
kernel.run({ type: 'event.delete', id: 'rounds', key: '2026-10-26T08:00:00+01:00[Europe/Paris]', scope: 'this' });
console.log(kernel.store.snapshot.queryInstances(week).length); // 0

kernel.destroy();
```

### Temporal

Temporal vient uniquement de `@tzslot/core/lazy`, réexporté ici : `Temporal`, `usingPolyfill` (vrai quand l'environnement n'a pas de Temporal natif : un diagnostic, pas de la logique), `loadTemporal()` et `temporalReady()` (vrai quand Temporal peut être lu maintenant). Là où la plateforme n'a pas de Temporal natif, faites `await loadTemporal()` une fois au démarrage (il charge le polyfill une fois ; une micro-tâche là où c'est natif) ; toucher Temporal avant lève une `ReferenceError` qui nomme `loadTemporal`. Aucun module ici ne lit Temporal à l'import. Dans un calendrier créé par `@dzcalendar/dom`, `await calendar.ready` fait la même chose. Un seul polyfill, un seul jeu de classes, pour une application qui utilise cette bibliothèque et `@tzslot/core` ensemble.

Types réexportés : `PlainDate`, `PlainTime`, `PlainDateTime`, `ZonedDateTime`, `Instant`, `Duration`, `DurationLike`, `Weekday` (ISO, 1 lundi ... 7 dimanche), `PlainYearMonth`, `ZoneId` (un nom IANA ou `UTC`), `EpochMs`. Comparez les valeurs Temporal avec `.toString()` ; sous le polyfill, les objets Temporal ne passent pas à `Intl.DateTimeFormat#format` : utilisez `formatTemporal`.

### API

#### Événements

| Export | Rôle |
| --- | --- |
| `normalizeEvent(input, ctx, path?)` | Une `EventInput` lâche en un `CalEvent` strict (ou une `Series` quand il y a un `rrule`), ou les raisons pour lesquelles ce n'est pas possible : `{ ok: true, value, problems }` ou `{ ok: false, problems }`. Ne lève jamais sur des données ; chaque supposition est un avertissement. Un `ctx` invalide lève. |
| `normalizeMany(inputs, ctx, sourceId?, indexes?)` | Plusieurs entrées, chacune jugée seule ; renvoie `{ items, report }`. Un id répété rejette la seconde entrée. Avec un `sourceId`, un événement sans id en reçoit un dérivé de ce qu'il est : une nouvelle récupération donne le même id. |
| `itemEvent(normalized)` | L'événement qu'un `Normalized` représente : l'événement lui-même, ou l'événement de base d'une série (son modèle, à son premier début). |
| `DEFAULT_TIMED_DURATION`, `DEFAULT_ALL_DAY_DURATION` | `{ hours: 1 }` et `{ days: 1 }`. |
| `createIdGenerator(prefix = 'dz')` | Un `IdGenerator` (`() => string`) pour les événements fournis sans id. |
| `toInput(event)` | Un événement stocké réécrit en `EventInput`. |

Types : `EventInput` (lâche : `id`, `title`, `start`, `end`, `duration`, `allDay`, `timeZone`, `resourceId(s)`, `rrule`, `exdate`, `rdate`, `seriesId`, `recurrenceId`, `display`, `status`, `busy`, `editable` et ses variantes, `classNames`, `tone`, `url`, `extendedProps`, `ongoing`), `CalEvent` = `TimedEvent` (début et fin sont des `ZonedDateTime`, éventuellement de fuseaux différents) | `AllDayEvent` (`PlainDate`, `end` exclu, sans fuseau), `EventId`, `ResourceId`, `TemporalInput` (un objet Temporal ou une chaîne, jamais un `Date`), `EventDisplay` (`'auto' | 'block' | 'list-item' | 'background' | 'inverse-background' | 'marker' | 'none'`), `EventStatus` (`'confirmed' | 'tentative' | 'cancelled'`), `NormalizeContext` (`displayZone`, `defaultEventZone?`, `defaultTimedDuration?`, `defaultAllDayDuration?`, `strictZones?`, `newId`, `now?`, `knownResources?`), `Normalized`, `NormalizeResult`, `NormalizationReport` (`accepted`, `rejected`, `problems`).

#### Fuseaux horaires et jours

| Export | Rôle |
| --- | --- |
| `dayInfo(date, zone)` | Un `DayInfo` : instants `start` et `end` (un jour ne commence pas toujours à minuit), `lengthMinutes` (1380, 1500, 1410 à Lord Howe, 0 pour un jour sauté), `kind` (`'normal' \| 'short' \| 'long' \| 'skipped' \| 'irregular'`), `transitions`. |
| `dayInfos(from, count, zone)` | `count` jours consécutifs, le fuseau interrogé une seule fois. |
| `transitionsBetween(from, to, zone)` | Chaque changement de décalage dans `[from, to)` : `at`, décalages avant et après, `deltaMinutes`, `wallBefore`, `wallAfter`, `kind` (`'gap' \| 'repeat'`). |
| `resolveWall(date, time, zone, policy)` | Une heure murale transformée en instant selon une `WallPolicy` (`'compatible' \| 'earlier' \| 'later' \| 'reject' \| { preferOffset }`) : `{ instant, exists, ambiguous, other, offsetMatched }`. |
| `isValidZone(zone)`, `isOffsetZone(zone)` | Un fuseau que Temporal accepte ; un simple décalage comme `+02:00` (valide, mais pas un lieu). |
| `isQuietDay(date, zone)` | Aucun changement d'heure ne peut toucher une heure murale à cette date (mis en cache). |
| `epochDay(date)`, `fromEpochDay(n)` | Une date en numéro de jour depuis 1970-01-01, et inversement. |

#### Intervalles

Intervalles semi-ouverts `[start, end)` en millisecondes d'époque (`MsSpan { s, e }` ; `Interval { start, end }` en instants) : `normalizeIntervals` (trie, retire les vides, fusionne), `unionSpans`, `intersectSpans`, `subtractSpans`, `spansToIntervals`.

#### Le store

| Export | Rôle |
| --- | --- |
| `createEventStore(initial?)` | Un `EventStore` : `snapshot` (`StoreSnapshot` immuable), `apply(mutations, cause)`, `replaceSourceChunk(s)`, `subscribe(fn)`. Une transaction, une notification. |
| `StoreSnapshot` | Un état immuable : `version`, `counts`, `getEvent(id)`, `getSeries(id)`, `allEvents()`, `allSeries()`, `isSourceOwned(id, kind?)`, `queryInstances(window, options?)` (les événements qu'une fenêtre montre, occurrences de séries comprises, dans un ordre stable). `StoreSnapshot.EMPTY`. |
| `viewWindow(startDate, endDate, zone)` | Une `ViewWindow` : des jours entiers dans un fuseau (instants et dates, fin exclue). |
| `datesWindow(startDate, endDate, zone)` | Des dates entières telles qu'elles existent partout sur terre : ce sur quoi on récupère le chunk d'une source. |
| `eventEquals(a, b)`, `sameValue(a, b)`, `stamp(prev, next, revision)` | Égalité structurelle d'événements ; de valeurs de type JSON ; la règle de révision du store (un événement égal garde son objet). |
| `invert(mutation)`, `isEmptyChange(change)` | La mutation inverse ; un changement qui n'a rien fait. |
| `PersistentOrderedMap`, `PersistentIntervalTree` | Les index persistants du store (table triée immuable ; arbre d'intervalles avec `insert`, `remove`, `overlapping`). |

Types : `EventStore`, `ViewWindow`, `EventInstance` (`key`, `event`, `origin: 'single' | 'occurrence' | 'override'`), `QueryOptions` (`resourceId?`, `includeBackground?`, `onProblem?`), `Mutation` (`{ kind: 'event' | 'series', before?, after? }`), `StoreChange` (`version`, `added`, `updated`, `removed`, `dirtySpans`, `dirtyDays`, `cause`, `seriesTouched`, `seriesChanged`, `problems`, `applied`), `ChangeCause` (`'command' | 'source' | 'undo' | 'redo' | 'api'`).

#### Commandes et annulation

| Export | Rôle |
| --- | --- |
| `applyCommand(snapshot, command, ctx)` | Transforme une `Command` en mutations qui l'exécutent. Pure, tout ou rien : rien n'est appliqué. Renvoie `{ ok: true, mutations, problems }` ou `{ ok: false, problems, violations? }`. |
| `createHistory(store, ctx, options?)` | Un `History` : `run(command)`, `undo()`, `redo()`, `canUndo`, `canRedo`, `revert(applied)`, `canRevert(applied)`, `transaction(label, fn)`, `clear()`, `destroy()`. Options : `limit` (200), `mergeKey` (un glisser devient une seule entrée), `onDropped`. `ctx` peut être une fonction lue à chaque commande. |

`Command` est de la donnée simple (à journaliser, envoyer, générer) : `event.create`, `event.update` (avec un `EventPatch` ; un champ absent est conservé, `null` l'efface), `event.move`, `event.resize`, `event.delete`, `series.delete`, `series.split` (« celle-ci et les suivantes » sans le glisser), `series.rule` (`null` arrête la répétition), `event.repeat`, et `batch`. Celles qui portent sur une occurrence prennent une `Reach` : `scope` (`'this' | 'following' | 'all'`) et `key` (le début d'origine de l'occurrence). `CommandContext` porte `normalize`, `weekStart?`, `rules?`, `external?`.

#### Événements récurrents

Importez `@dzcalendar/core/recurrence` une fois (il branche le moteur : `useRecurrence`) ; sans lui, un événement avec `rrule` est refusé avec `recurrence-not-loaded`. Les fonctions pures sont exportées par l'entrée principale :

| Export | Rôle |
| --- | --- |
| `expandSeries(series, window, { limit? })` | Les occurrences d'une série qui rencontrent une fenêtre, en événements (celles qui ont commencé avant et y entrent comprises). Limite `DEFAULT_OCCURRENCE_LIMIT` (2000), puis `too-many-occurrences`. |
| `seriesSpan(series)` | Où une série se place dans un index. |
| `materialize(series, start)`, `occurrenceLength(base)` | L'occurrence qui commence à `start` en événement ; la durée de chaque occurrence (jours entiers à l'heure murale, le reste en temps écoulé). |
| `keyOf`, `escapeId`, `occurrenceKey(seriesId, key)`, `parseInstanceKey`, `seriesEquals` | Clés d'occurrence et clés d'instance (`id`, ou `seriesId@key`). Une clé est le début d'origine en entier, décalage compris : les deux 02:30 d'une nuit de retour à l'heure d'hiver sont deux occurrences. |
| `editOccurrence`, `deleteOccurrence`, `deleteSeries`, `isOccurrence`, `startOfKey` | L'édition de séries en mutations : une occurrence, les suivantes, ou toutes (`EditScope` ; `EditOptions.overrides: 'keep' \| 'drop'`). |
| `parseRRule`, `serializeRRule`, `rebaseRule`, `splitRule`, `countBefore` | Réexportés de `@dzcalendar/rrule`, avec les types `RRule`, `RRuleSet`, `Frequency`, `RRuleWeekday`. |

Types : `Series` (`id`, `revision`, `base`, `set`, `overrides`, `sourceId?`, `splitFrom?`), `SeriesWindow`, `EditScope`, `OccurrenceRef`, `EditOptions`.

#### Règles et interaction

| Export | Rôle |
| --- | --- |
| `validateProposal(snapshot, placement, rules, opts?)` | Ce qui s'oppose à un placement : `Violation[]` (`'constraint' \| 'overlap' \| 'allow' \| 'valid-range' \| 'not-editable'`), les contrôles les moins chers d'abord. Types `Placement`, `ConstraintSpec`, `OverlapFn`, `RulesContext`. |
| `businessIntervals(from, to, input, displayZone)` | Les plages ouvertes des horaires d'ouverture en intervalles, chaque règle lue dans son propre fuseau. |
| `assertBusinessHours(input)` | Lève sur une règle illisible : c'est de la configuration, dite une fois. Types `BusinessHoursRule` (`daysOfWeek`, `start`, `end`, `timeZone?`), `BusinessHoursInput` (`true` = du lundi au vendredi 09:00-17:00, `false`, une règle, ou une liste). |
| `proposeMove(ctx, event, grab, over)`, `proposeResize(ctx, event, edge, over)` | Où va un événement pour un `Hit` de pointeur ou de clavier, aimanté à l'heure murale, avec `valid`, `violations`, et les indicateurs `ambiguity` / `skipped` pour les heures répétées et sautées. Pareil pour tous les périphériques. |
| `isUnchanged(proposal)`, `selectionBetween(ctx, a, b)`, `commandFor(instance, proposal, scope?)` | Si une proposition ne change rien ; la plage entre deux hits ; la `Command` qui exécute une proposition. |
| `intentFor(key, ctx)`, `stepHit`, `eventHit`, `grabStep`, `heldEvent` | Le modèle du clavier : ce que veut dire une touche (`Intent`), déplacer un hit d'un pas, le bord d'un événement en hit, une pression en mode saisie, l'événement tel que tenu. Types `Hit`, `InteractionContext`, `Proposal`, `Selection`, `KeyLike`, `KeyContext`, `KeyMode`, `Step`, `Intent`. |
| `actionsFor(target, ctx)` | Les entrées intégrées du menu contextuel pour une cible (`ActionTarget`), en données (`ActionItem`, `ActionLabels`, `ActionContext`, `CreateRequest`). |

#### Sources

Une source est une spécification (`EventSourceSpec` : `id`, `fetch`, `chunk`, `staleAfter?`, `retry?`, `zoneDependent?`, `defaults?`, `save?`, `live?`, `forgot?`).

| Export | Rôle |
| --- | --- |
| `arraySource(id, events, defaults?)`, `loadStaticSource(store, spec, ctx)` | Une liste fixe, un seul chunk pour tout le temps ; charge une source synchrone non découpée directement dans un store. |
| `jsonSource(id, options)` | Des événements depuis une URL qui répond en JSON : `start`, `end` et `timeZone` dans la requête (`startParam`, `endParam`, `zoneParam`, `params`, `method`, `headers`, `map`, `chunk`, `fetchImpl`). Un mois par requête par défaut. |
| `fnSource(id, fn, options?)` | Des événements issus de votre fonction de `{ window, signal, sourceId }`, synchrone ou non. |
| `createSourceManager(options)` | Récupère chaque source chunk par chunk quand le calendrier bouge et garde le store à jour : `add`, `remove`, `get`, `ids`, `setRange`, `refetch`, `loading`, `idle()`, `hold(start, end)`, `forgot`, `destroy`. Par défaut 4 requêtes à la fois (`maxConcurrent`) et 12 chunks gardés au-delà de ce qui est affiché (`keepChunks`). Émet des `SourceNotice` : `loading`, `error`, `problems`, `save-error`, `saved`. |
| `chunkAt(unit, date)`, `chunksCovering(unit, start, end, prefetch?)` | Les chunks (`'none' \| 'week' \| 'month' \| 'year'`) où tombe une date, ou que demande `[start, end)`. |
| `exportInputs(snapshot, keep?)`, `eventInput`, `seriesInput` | Ce qu'un snapshot contient réécrit en entrées (séries d'abord, puis événements, par id) : le point de départ d'un export. |

Types : `FetchRequest`, `SourceFetch`, `SourceResult` (des événements, ou `{ events, problems? }`), `ChunkPolicy` (`unit`, `prefetch`), `SourceEdit`, `SaveRequest` (`sourceId`, `edits`, `cause`), `AbortSignalLike`, `PlatformAbortSignal`, `JsonSourceOptions`, `FetchLike`, `SourceManager`, `SourceManagerOptions`, `Timers`, `Chunk`.

`@dzcalendar/core/live` ajoute des sources à qui l'on dit plutôt qu'on ne demande : `liveSource(id, { connect, defaults? })` pour n'importe quel flux (WebSocket, MQTT...), dont `connect(emit)` l'ouvre et renvoie comment le fermer ; `sseSource(id, url, { map, events?, withCredentials?, reopenAfterMs?, defaults? })` pour les Server-Sent Events. Un message est un `LiveMessage` : `{ create }`, `{ update, patch }`, `{ remove }` ou `{ reset }`.

```ts
import type { EventInput } from '@dzcalendar/core';
import { liveSource, sseSource } from '@dzcalendar/core/live';

// Server-Sent Events : chaque message est un événement à créer.
export const feed = sseSource('feed', '/events/stream', { map: (data) => ({ create: data as EventInput }) });

// Tout autre transport : un WebSocket.
export const sockets = liveSource('sockets', {
  connect(emit) {
    const ws = new WebSocket('wss://example.org/events');
    ws.onmessage = (m) => emit({ create: JSON.parse(String(m.data)) as EventInput });
    return () => ws.close();
  },
});
```

#### Mise en page et projection

| Export | Rôle |
| --- | --- |
| `layoutColumn(items, options)` | Placement côte à côte (ou en cascade) des événements qui se chevauchent dans une colonne de temps, en unités d'axe : `ColPlacement` (`lane`, `lanes`, `left`, `width`, `z`). |
| `packLanes(items)`, `computeOverflow(lanes, items, dayCount, maxLanes)` | Empilement de barres en lignes ; ce qui tient dans `maxLanes` jour par jour, avec les décomptes « +N ». |
| `PrefixSums`, `visibleRange`, `visible2D` | Défilement virtuel : positions d'éléments de tailles variables (arbre de Fenwick) et plage d'indices visible. |
| `segmentTimed(instance, days, options?)`, `segmentAllDay(instance, dateIndex)`, `splitByWeek(segments, weeks)`, `dateIndex(dates)` | Un événement découpé en vrais jours du fuseau d'affichage (23, 24 ou 25 heures, ou aucun), barres de journée sur les colonnes affichées, barres coupées en fin de semaine. Types `Segment`, `TimedSegment`, `SegmentTimedOptions`, `DateIndex`. |
| `buildColumnAxis(date, zone, options?)` | L'axe vertical d'une colonne de jour : `'wall'` (minutes d'horloge, une heure sautée est une bande, une heure répétée partage ses positions) ou `'elapsed'` (minutes réelles, un jour de 25 heures fait 25 heures de haut) ; `toPosition`, `toEndPosition`, `fromPosition`, `ticks`. |

#### Vues et noyau

| Export | Rôle |
| --- | --- |
| `createKernel(options)` | Le calendrier sans écran : état (vue, date, plage, titre), store, sources, historique, commandes. Voir plus bas. |
| `BUILTIN_VIEWS` | `dayGridMonth`, `dayGridWeek`, `dayGridDay`, `timeGridWeek`, `timeGridDay`, `listDay`, `listWeek`, `listMonth`, `listYear`, `multiMonthYear`, et celles en `resource...` (`resourceTimeGridDay`, `resourceTimeGridWeek`, `resourceDayGridDay`, `resourceDayGridWeek`, `resourceDayGridMonth`). |
| `registerViewSpec(spec)`, `registeredViewSpecs()` | Les vues qu'apporte un plugin. |
| `computeViewRange(anchor, spec, ctx)`, `navigate(anchor, spec, direction, ctx)` | Les dates qu'une vue couvre autour d'une ancre (`ViewRange`) ; l'ancre après `'prev' \| 'next' \| 'today' \| { to }`. Types `ViewSpec`, `ViewSettings`, `ViewFamily`, `ViewRange`, `NavContext`, `NavDirection`. |
| `buildTimeGridModel`, `buildTimeGridColumn`, `updateTimeGridModel`, `locateNow`, `slotInstant` | Tout ce que dessine une grille horaire, en données, reconstruit seulement là où un changement a touché (les colonnes intactes gardent leur identité). Types `TimeGridModel`, `TimeGridColumn`, `TimeGridOptions`, `PlacedTimed`, `MoreTimed`, `AllDayBar`, `Reading`, `AvailableSlot`, `PlacedSlot`, `ResourceHead`, `ResourceGroupHead`. |
| `buildDayGridModel`, `updateDayGridModel` | Un mois (ou une semaine, ou un jour) en lignes de barres. Types `DayGridModel`, `DayGridWeek`, `DayGridBar`, `DayGridOptions`. |
| `registerModelFamily(family, f)`, `assertTimeline`, `assertTimeGrid`, `timeStep`, `timeSpan`, `followBefore` | Les familles de modèles du noyau et la validation des réglages de frise et de grille horaire (une `RangeError` pour un réglage inacceptable). |

Le noyau (`CalendarKernel`) porte `store`, `history`, `sources`, et : `getState()` (`KernelState` : `date`, `view`, `range`, `timeZone`, `locale`, `firstDay`, `title`, `today`), `setView`, `navigate`, `setTimeZone`, `setLocale`, `setOptions`, `setFirstDay`, `setTitleFormat`, `setRules`, `getOptions`, `setEvents(events)`, `batch(fn)`, `refreshToday`, `refreshOngoing`, `forgetBefore`, `viewModel()`, `viewProblems()`, `stateAt`, `modelAt`, `now()`, `getProblems()`, `whenLoaded()`, `setResources`, `getResources`, `getResourceProblems`, `run(command, { validate?, external? })`, `rules()`, `subscribe(fn)` (`KernelEvent` : `state`, `store`, `source`) et `destroy()`. Options (`KernelOptions`) : `timeZone`, `locale`, `firstDay?`, `titleFormat?`, `initialDate?`, `initialView?`, `views?`, `store?` (partager un store entre noyaux), `events?`, `rules?`, `historyLimit?`, `sources?`, `onSource?`, `resources?`, plus `timeGrid`, `dayGrid`, `timeline`, `businessHours`, `availableSlots`, `hiddenDays`, `resourceOrder`, `resourceGroupField`, `showUnassigned`, `collapsedResources`, `collapsedGroups`. Types `CalendarKernel`, `KernelOptions`, `KernelState`, `KernelEvent`, `ViewModel`, `ModelFamily`, `ModelOptions`, `StateCause`, `TitleFormat`, `TitleFormatArg`.

`@dzcalendar/core/views` contient les modèles qu'on ne paie que si on s'en sert : `buildListModel(range, snapshot, { displayZone, includeEmpty? })` (types `ListModel`, `ListDay`, `ListEntry`, `ListOptions`), `buildMultiMonthModel` et `updateMultiMonthModel` (type `MultiMonthModel`).

#### Ressources

| Export | Rôle |
| --- | --- |
| `buildResourceTree(inputs, { orderBy? })` | Les ressources en arbre vérifié : `{ tree, problems }`. Ne lève jamais (`invalid-resource`, `duplicate-id`, `unknown-resource`, `resource-cycle`). `EMPTY_TREE`. |
| `fieldOf(resource, name)` | Un champ d'une ressource : le sien, sinon ce que l'application a donné, sinon ses `extendedProps`. |
| `flattenRows(tree, state?, filter?)`, `columnResources(tree, groupBy?)`, `groupValue(resource, field)` | Les lignes d'une frise (dépliées, repliées, groupées) et les colonnes d'une vue par ressource. |
| `UNASSIGNED`, `UNASSIGNED_RESOURCE`, `instancesOf(snapshot, window, resource, all, options?)` | La pseudo-ressource « Non affecté » et ce que montre la colonne d'une ressource. |

Types : `Resource`, `ResourceInput` (`id`, `title?`, `parentId?`, `order?`, `timeZone?`, `businessHours?`, `eventConstraint?`, `eventOverlap?`, `classNames?`, `extendedProps?`), `ResourceNode`, `ResourceTree`, `ResourceOrder`, `ResourceRow`, `RowState`, `ColumnResources`.

#### Formatage

| Export | Rôle |
| --- | --- |
| `formatTemporal(value, options, locale)`, `formatToPartsTemporal(...)` | Formate une valeur Temporal sans `Date` et sans donner Temporal à Intl (millisecondes d'époque plus le fuseau). |
| `formatRangeTitle(a, b, options, locale, { separator? })` | « 15-21 mars 2026 », avec le formatage de plages d'Intl. Pour des titres, pas pour des heures à travers un changement d'heure. |
| `weekdayNames(locale, width, firstDay)`, `monthNames(locale, width)` | Les noms dans une langue. |
| `weekRulesFor(locale)`, `weekNumber(date, rules)` | Les règles de semaine de la langue (`firstDay`, `minimalDays`) et le numéro de semaine d'une date selon elles. Types `Fmt`, `Formattable`, `WeekRules`. |

### Problèmes

Une mauvaise entrée ne lève jamais : elle devient un `Problem` (`{ code, severity: 'error' | 'warning', path, sourceId?, detail? }`). Une erreur rejette l'événement ; un avertissement accompagne un événement accepté. Les phrases appartiennent aux messages traduits de la couche DOM. Les codes (`ProblemCode`) :

| Groupe | Codes |
| --- | --- |
| Forme | `invalid-event`, `missing-start`, `invalid-start`, `invalid-end`, `invalid-duration`, `end-before-start`, `date-object-rejected` (un `Date` est refusé), `foreign-temporal` (un objet Temporal d'une autre copie est relu depuis sa chaîne) |
| Identité | `invalid-id`, `duplicate-id`, `unknown-event` |
| Fuseaux et heures murales | `unknown-zone`, `zone-defaulted`, `offset-only`, `offset-mismatch`, `wall-time-skipped`, `wall-time-ambiguous` |
| Journée, repères, en cours | `allday-with-time`, `allday-zone-ignored`, `marker-all-day`, `marker-length-ignored`, `ongoing-not-timed` |
| Ressources | `unknown-resource`, `invalid-resource`, `resource-cycle` |
| Récurrence | `invalid-rrule`, `recurrence-not-loaded`, `invalid-exdate`, `invalid-rdate`, `too-many-occurrences`, `unknown-occurrence`, `invalid-edit`, `invalid-recurrence-id`, `orphan-override` |
| iCalendar | `ical-syntax`, `ical-unsupported`, `zone-guessed`, `zone-fixed-offset` (de `@dzcalendar/ical`) |
| Créneaux | `invalid-availability`, `invalid-slot-query` (de `@dzcalendar/slots`) |
| Application | `calendar-not-ready`, `invalid-export`, `invalid-option`, `compat-unsupported` |

Les commandes refusées par les règles répondent avec des `violations` (`constraint`, `overlap`, `allow`, `valid-range`, `not-editable`).

### Documentation

- [Événements](https://plinthworks.github.io/dzcalendar/fr/guides/events/) et [sources d'événements](https://plinthworks.github.io/dzcalendar/fr/guides/event-sources/)
- [Récurrence](https://plinthworks.github.io/dzcalendar/fr/guides/recurrence/)
- [Fuseaux horaires](https://plinthworks.github.io/dzcalendar/fr/guides/time-zones/)
- [Vues](https://plinthworks.github.io/dzcalendar/fr/guides/views/)
- [Ressources et frise](https://plinthworks.github.io/dzcalendar/fr/guides/resources-timeline/)
- [Glisser-déposer](https://plinthworks.github.io/dzcalendar/fr/guides/drag-and-drop/) et [clavier et accessibilité](https://plinthworks.github.io/dzcalendar/fr/guides/keyboard-accessibility/)
- Options : [`kernel`](https://plinthworks.github.io/dzcalendar/fr/options/kernel/), [`store`](https://plinthworks.github.io/dzcalendar/fr/options/store/), [`sources`](https://plinthworks.github.io/dzcalendar/fr/options/sources/), [`events`](https://plinthworks.github.io/dzcalendar/fr/options/events/), [`rules`](https://plinthworks.github.io/dzcalendar/fr/options/rules/), [`business-hours`](https://plinthworks.github.io/dzcalendar/fr/options/business-hours/), [`time-zone`](https://plinthworks.github.io/dzcalendar/fr/options/time-zone/)
- [Accueil de la documentation](https://plinthworks.github.io/dzcalendar/fr/)

### Licence

MIT
