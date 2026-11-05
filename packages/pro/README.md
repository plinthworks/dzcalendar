# @dzcalendar/pro

The timeline, slot capacity, the event editor, paged printing and exports (PDF, PNG, XLSX, CSV, ICS) for DzCalendar, without dependencies.

**English** · [Français](#français)

## What it is

`@dzcalendar/pro` is the part of DzCalendar that goes beyond the day, week and month grids. It is MIT-licensed and a code boundary only: there is no licence key.

- **The timeline family**: resources in rows along an axis of *elapsed* time. A 25-hour day is 25 hours wide, a 23-hour day 23 hours; slots follow the wall clock, so on a fall-back night 02:00 appears twice. Eight views are registered by `import '@dzcalendar/pro'`: `timelineDay`, `timelineWeek`, `timelineMonth`, `timelineYear` (one row for every event) and `resourceTimelineDay`, `resourceTimelineWeek`, `resourceTimelineMonth`, `resourceTimelineYear` (a row per resource). Your own timeline views are declared with `views: { x: { family: 'timeline', duration } }`.
- **Resources**: a tree (`parentId`), groups (`resourceGroupField`), an optional "Unassigned" row, and a resource area whose columns are set with `viewOptions.timeline.areaColumns`.
- **Supervision**: events still running (`ongoing: true`), moments (`display: 'marker'`), labelled background events, `forget`, `nowRefresh`, `onFollowChange`, `calendar.shift()`, and live sources (`liveSource`, `sseSource` from `@dzcalendar/core/live`).
- **Slots with seats** (`@dzcalendar/pro/slots`), **the event and recurrence editor** (`@dzcalendar/pro/editor`), **paged printing** (`@dzcalendar/pro/print`) and **exports** (`@dzcalendar/pro/export`).

Rows have a fixed height and a "+N" link past their lanes. Only what meets the view is mounted, in both directions.

## Install

```bash
npm install @dzcalendar/core @dzcalendar/dom @dzcalendar/theme @dzcalendar/pro
```

`@dzcalendar/pro` depends on `@dzcalendar/core`, `@dzcalendar/dom`, `@dzcalendar/slots` and `@dzcalendar/ical`. `@tzslot/dom` is an optional peer dependency.

## Quick start

Import the package once (it registers the timeline family and its views), then create the calendar as usual.

```ts
import '@dzcalendar/theme/dzcalendar.css';
import { Temporal } from '@dzcalendar/core';
import { createCalendar } from '@dzcalendar/dom';
import '@dzcalendar/pro';

const calendar = createCalendar(element, {
  timeZone: 'Europe/Paris',
  initialView: 'resourceTimelineWeek',
  initialDate: Temporal.PlainDate.from('2026-10-21'),
  resources: [
    { id: 'cardio', title: 'Cardiology' },
    { id: 'benali', title: 'Dr Benali', parentId: 'cardio', service: 'Cardiology' },
    { id: 'haddad', title: 'Dr Haddad', parentId: 'cardio', service: 'Cardiology' },
    { id: 'room1', title: 'Room 1', service: 'Imaging' },
  ],
  events: [
    { id: 'a', title: 'Consultation', start: '2026-10-21T09:00[Europe/Paris]', duration: { minutes: 45 }, resourceId: 'benali' },
    { id: 'b', title: 'Scan', start: '2026-10-21T14:00[Europe/Paris]', duration: { minutes: 30 }, resourceId: 'room1' },
  ],
  // The scale and the lanes of the timeline.
  timeline: { slot: 120, maxLanes: 2 },
  // The columns of the resource area.
  viewOptions: {
    timeline: {
      areaColumns: [
        { field: 'title', header: 'Name', width: 180 },
        { field: 'service', header: 'Service', width: 120 },
      ],
    },
  },
});

// Later: back to the default slot, lanes unchanged.
calendar.update({ timeline: { slot: undefined } });
```

The theme is `@dzcalendar/theme` (the same `--tz-*` palette as tzslot's); the timeline reads its own tokens (`--dz-tl-slot`, `--dz-tl-tick-font`) on top of it.

## The views

| View | Shows | Default slot |
|---|---|---|
| `timelineDay` / `resourceTimelineDay` | one day | 30 minutes |
| `timelineWeek` / `resourceTimelineWeek` | one week | 1 hour |
| `timelineMonth` / `resourceTimelineMonth` | one month | 1 day |
| `timelineYear` / `resourceTimelineYear` | one year | 1 day |

`timeline…` views draw one row of every event; `resourceTimeline…` views draw a row per resource, with the resource area on the left. A view's `duration` and `dateIncrement` are whole days or more (a date plus minutes is the same date; such a step is refused with a `RangeError`).

### Custom timeline views

```ts
import { createCalendar } from '@dzcalendar/dom';
import '@dzcalendar/pro';

const calendar = createCalendar(element, {
  timeZone: 'Europe/Paris',
  // Three days at once, a row per resource.
  views: { supervision: { family: 'timeline', resources: true, duration: { days: 3 } } },
  initialView: 'supervision',
  headerViews: [],
  resources: [
    { id: 'import', title: 'Order import' },
    { id: 'billing', title: 'Billing' },
  ],
});

calendar.update({ timeline: { step: { minutes: 15 }, span: { hours: 4 } } });
```

## Options

Everything goes through the calendar's options (`createCalendar(element, options)` and `calendar.update(changes)`). A value that cannot be taken throws a `RangeError` at creation or `update()`, before anything changes.

### `timeline`

Merged key by key with `update({ timeline })`; `slot: undefined` goes back to the default.

| Member | Type | What it does |
|---|---|---|
| `slot` | `number \| 'day'` | Width of a slot in time: whole minutes that divide a day (5, 15, 30, 60, 120…), or `'day'`. Default 30 minutes for a day, an hour up to a week, a day beyond. |
| `maxLanes` | `number` | Lanes of a resource's row (whole number of 1 or more, default 3); the last holds "+N" when more events overlap. |
| `fillLanes` | `number` | Lanes of a timeline without resources (default 12): a starting value, in a browser the one row fills the view and the lanes are measured. |
| `step` | `DurationLike` | What ◀ ▶ and `navigate('prev' \| 'next')` slide the axis by (`{ minutes: 15 }`, `'PT30M'`) instead of changing period. Hours and minutes, longer than nothing. |
| `follow` | `boolean \| { before?: DurationLike }` | Keeps the present in view. `true`: the present's slot at the left edge. `{ before: { minutes: 5 } }`: the present that far from the left edge, the axis gliding each minute. Default `false`. |
| `span` | `DurationLike` | The time shown at once (`{ hours: 4 }`): a slot's width is the room shared by that many slots, measured again on resize. Days, hours and minutes. |
| `ticks` | `number \| { every: number; label?: number }` | Small ticks inside each slot, as on a ruler: `5` is a tick and its time every 5 minutes; `{ every: 1, label: 5 }` a mark each minute and the time every fifth. Whole minutes dividing a day; `label` a multiple of `every`. |

A wall-clock slot that crosses a clock change keeps its true width. The width on screen is the stylesheet's `--dz-tl-slot` unless a `span` sets it.

`step`: at the end of the axis the next or previous period comes in, landing where the slide was going; a one-day view stops at midnight on the way, a view of several days slides across it. PageUp and PageDown slide by it too.

`follow`: it pauses as soon as the person moves along time (a scroll of more than 24 px from where the view put it, a slide, a period without the present); "Today" (`navigate('today')`) takes it up again. With `{ before }` the glide is the motion adapter's eased scroll (`@dzcalendar/motion-gsap`), else the browser's smooth scroll, at once under `prefers-reduced-motion`.

### `viewOptions.timeline`

```text
interface AreaColumn {
  field: string;     // read from the resource: its own fields, what was given, its extendedProps
  header?: string;   // the column's head; default the field's name ("Resource", translated, for `title`)
  width?: number;    // pixels; default 160 for the first column, 110 for the others
}
interface TimelineViewOptions {
  areaColumns?: readonly AreaColumn[];   // default: one column, the resource's title
}
```

### Other options the timeline reads

| Option | What it does for a timeline |
|---|---|
| `resources` | The rows: `{ id, title, parentId?, order?, timeZone?, businessHours?, extendedProps? … }`. |
| `resourceGroupField` | Groups the rows by a field: a head over each run. |
| `resourceOrder` | How siblings are ordered after their `order`. |
| `showUnassigned` | An "Unassigned" row first, for events on no known resource; a drop there removes the resource the event was taken from. |
| `collapsedResources`, `collapsedGroups` | Folded branches and groups; `onResourceToggle` reports a person's choice. |
| `businessHours` | Shaded outside, per row (a resource's own hours are read in its zone). |
| `nowRefresh` | How often the now line moves and a followed timeline glides. From a second to an hour, default a minute. |
| `forget` | `{ olderThan }` (or `null`): events that ended longer ago leave the calendar. |
| `onFollowChange` | `(following: boolean) => void`: called when following is paused or taken up again (not for the option as first read). |
| `hooks.resource.content`, `hooks.event.content` | Draw a row head or an event card yourself. |

### Events on a timeline

- **Running events.** `ongoing: true` draws an event from its start to now; its end follows the present (moved each minute by the calendar, a change of cause `'api'`: no undo, no `onEventChange`), never before the expected end (its `end` or `duration` as given); while that end is ahead, the part past now is drawn only in dashes. Its end is open (dashed, with stripes, still under reduced motion) and its time reads "11:02 – running". `event.update({ ongoing: false })` finishes it, at its `end` if given, else now. A date alone or a series cannot run (problem `ongoing-not-timed`).
- **Markers.** `display: 'marker'` is a moment: a line across its row, its flag (the title, or the content hook's) in a lane beside it. It has a start only: an `end` or `duration` is ignored (`marker-length-ignored`), a date alone refused (`marker-all-day`).
- **Background events.** `display: 'background'` is a tint behind the row's events (a maintenance window). The event content hook gives it a label (`background: true` in its argument), drawn at its start and kept in view while the row scrolls.
- **`forget`.** Each minute, and when the calendar is made, the events that ended more than `olderThan` ago leave the store (no undo, no `onEventChange`); a series and an event still running stay.

### Methods

```text
calendar.shift(by: DurationLike): boolean
  // Slides a timeline along time by any hours and minutes ({ minutes: -15 }: back); the next or
  // previous period comes in when the axis ends. Pauses `timeline.follow`. False when the view
  // is not a timeline. A day or more (or nothing) throws a RangeError, as `step` does.
calendar.navigate('prev' | 'next' | 'today')
  // With `timeline.step`, prev/next slide by it; 'today' also takes up following.
```

## Supervision

A timeline made for watching what runs now: processes in rows, runs as bars, alerts as markers, maintenance windows behind, fed by a live source. This is a condensed version of `playground/supervision.ts`.

```ts
import { createCalendar } from '@dzcalendar/dom';
import { liveSource } from '@dzcalendar/core/live';
import type { EventInput } from '@dzcalendar/core';
import '@dzcalendar/pro';

const ZONE = 'Europe/Paris';
const processes = [
  { id: 'import', title: 'Order import' },
  { id: 'billing', title: 'Billing' },
  { id: 'backup', title: 'Backup' },
];

const history: EventInput[] = [
  // A finished run.
  { id: 'billing-1', title: 'Billing', start: '2026-10-21T08:00[Europe/Paris]', duration: { minutes: 90 }, resourceId: 'billing', tone: 'green' },
  // Still running: drawn from its start to now, with 70 minutes expected.
  { id: 'backup-now', title: 'Backup', start: '2026-10-21T09:00[Europe/Paris]', duration: { minutes: 70 }, resourceId: 'backup', tone: 'blue', ongoing: true },
  // A moment: a line and its flag.
  { id: 'alert-1', title: 'Alert', start: '2026-10-21T08:40[Europe/Paris]', resourceId: 'import', display: 'marker', tone: 'amber' },
  // A maintenance window, behind the runs.
  { id: 'maint-1', title: 'Maintenance', start: '2026-10-21T11:00[Europe/Paris]', duration: { hours: 3 }, resourceId: 'billing', display: 'background', tone: 'violet' },
];

const calendar = createCalendar(element, {
  timeZone: ZONE,
  views: { supervision: { family: 'timeline', resources: true, duration: { days: 3 } } },
  initialView: 'supervision',
  headerViews: [],
  resources: processes,
  events: history,
  // The present 5 minutes from the left edge, gliding; a ruler: a mark each minute, the time every 5.
  timeline: { slot: 15, step: { minutes: 15 }, follow: { before: { minutes: 5 } }, ticks: { every: 1, label: 5 }, maxLanes: 2 },
  // The now line and the axis move every 30 seconds.
  nowRefresh: { seconds: 30 },
  // A screen left open: what ended more than two days ago is forgotten.
  forget: { olderThan: { days: 2 } },
  hooks: {
    event: {
      content: ({ instance }) => {
        const label = document.createElement('span');
        label.textContent = instance.event.title;
        return label;
      },
    },
  },
  // Following paused (the person went into the past): say so, until "Today".
  onFollowChange: (following) => {
    document.title = following ? 'Live' : 'Paused: press Today';
  },
});

// A feed: `liveSource` takes any transport; `sseSource` does it for Server-Sent Events.
const feed = liveSource('feed', {
  connect(emit) {
    const timer = setInterval(() => {
      emit({ create: { id: `run-${Date.now()}`, title: 'Import', start: new Date().toISOString(), duration: { minutes: 10 }, resourceId: 'import', ongoing: true } });
    }, 60_000);
    return () => clearInterval(timer);
  },
});
calendar.update({ sources: [feed] });

// A button "back 45 minutes".
document.querySelector('button')?.addEventListener('click', () => calendar.shift({ minutes: -45 }));
```

### Live sources from `@dzcalendar/core/live`

A live source is told rather than asked. `liveSource(id, { connect, defaults? })` opens any feed (WebSocket, MQTT…) and hands each message to `emit`; `connect` answers how to close it. A message is one of:

```text
{ create: EventInput }                       // an event made
{ update: string; patch: Partial<EventInput> }   // an event changed (extendedProps merged); { ongoing: false } without an end ends it now
{ remove: string }                           // an event gone
{ reset: readonly EventInput[] }             // the whole list anew (a reconnection)
```

`emit` takes one message or an array of them (one redraw). The feed is the authority: a person's edit to one of its events lasts until its next message.

```ts
import { createCalendar } from '@dzcalendar/dom';
import { sseSource } from '@dzcalendar/core/live';
import '@dzcalendar/pro';

const runs = sseSource('runs', '/api/runs/stream', {
  // A message's data (JSON read, else the text) turned into what it says.
  map: (data) => {
    const run = data as { id: string; process: string; start: string; done?: boolean };
    return run.done ? { update: run.id, patch: { ongoing: false } } : { create: { id: run.id, title: run.process, start: run.start, resourceId: run.process, duration: { minutes: 10 }, ongoing: true } };
  },
  events: ['run'],
  reopenAfterMs: 5000,
});

createCalendar(element, {
  timeZone: 'Europe/Paris',
  initialView: 'resourceTimelineDay',
  resources: [{ id: 'import', title: 'Order import' }],
  timeline: { follow: true },
  sources: [runs],
});
```

`sseSource(id, url, options)` options: `map(data, event)` (returns a message, several, or `null`), `events` (named events listened to besides `message`), `withCredentials`, `reopenAfterMs` (milliseconds before opening the stream again once the server closed it for good, default 5000; the browser itself reconnects a dropped stream), `defaults`. Without an `EventSource` (a server render) it opens nothing.

## The entries

| Entry | What it is |
|---|---|
| `@dzcalendar/pro` | The timeline: registers the family and its eight views; `createTimelineView`, `TIMELINE_CSS`, and everything of `/model`. |
| `@dzcalendar/pro/model` | The timeline without a screen: axis, model, views. No DOM: a server, a worker or a native port can use it. |
| `@dzcalendar/pro/slots` | Bookable slots with seats (capacity). |
| `@dzcalendar/pro/editor` | The event and recurrence editor, a modal dialog. |
| `@dzcalendar/pro/export` | PDF, PNG, XLSX, CSV and ICS, without dependencies. Loaded on demand. |
| `@dzcalendar/pro/print` | Paged printing by the browser. |

### `@dzcalendar/pro`

```text
import '@dzcalendar/pro'                  // registers the 'timeline' family and TIMELINE_VIEWS
export * from '@dzcalendar/pro/model'
createTimelineView(ctx: ViewCtx): ViewController   // the view's constructor, for @dzcalendar/dom/toolkit
type AreaColumn, TimelineViewOptions               // see viewOptions.timeline
TIMELINE_CSS: string                                // the stylesheet; injected by default
```

The timeline's styles are injected unless the calendar is created with `injectStyles: false` (under a CSP without inline styles): include `TIMELINE_CSS` yourself then.

### `@dzcalendar/pro/model`

```text
buildTimelineAxis(range: ViewRange, zone: ZoneId, o?: { slot?: number | 'day' }): TimelineAxis
defaultSlot(range: ViewRange): number | 'day'     // 30 for a day, 60 up to a week, 'day' beyond
validSlot(s: unknown): s is number | 'day'        // whole minutes dividing 1440, or 'day'
buildTimelineModel(range: ViewRange, snap: StoreSnapshot, o: TimelineOptions): TimelineModel
updateTimelineModel(prev: TimelineModel, snap: StoreSnapshot, change: StoreChange): TimelineModel
timelineNow(model: TimelineModel, now: Instant): number | null   // the present's position on the axis
TIMELINE_VIEWS: Readonly<Record<string, ViewSpec>>  // the eight views

type TimelineSlot   { start, end: Instant; date: PlainDate; time: PlainTime | null; pass: 'first' | 'second' | null; offset: string }
type TimelineGroup  { date: PlainDate; start, end: Instant; lengthMinutes: number }   // 1380, 1440, 1500 for a day
type TimelineAxis   { unit: 'time' | 'day'; slotMinutes; start; end; slots; groups; length;
                      toPosition(i: Instant | number): number; fromPosition(x: number): Instant; slotAt(i: Instant): number }
type TimelineAxisOptions { slot?: number | 'day' }
type TimelineOptions { displayZone; slot?; rows?; resources?; maxLanes?; fillLanes?; businessHours? }
type TimelineModel  { version; range; options; axis; rows: readonly TimelineRow[]; maxLanes }
type TimelineRow    // { kind: 'resource' | 'group' | 'all', … } with events, background, more, offHours, lanes
type TimelineBar    { segment; from; to; lane }
type TimelineMore   { key; from; to; events }       // a "+N"
```

```ts
import { Temporal, computeViewRange } from '@dzcalendar/core';
import { TIMELINE_VIEWS, buildTimelineAxis } from '@dzcalendar/pro/model';

// The week of the clocks going back in Paris, as the axis sees it.
const range = computeViewRange(Temporal.PlainDate.from('2026-10-21'), TIMELINE_VIEWS['timelineWeek']!, { firstDay: 1, today: Temporal.PlainDate.from('2026-10-21') });
const axis = buildTimelineAxis(range, 'Europe/Paris');

// 7 day heads: six of 24 hours and the Sunday of 25; 169 hourly slots.
console.log(axis.groups.map((g) => g.lengthMinutes / 60), axis.length);
```

### `@dzcalendar/pro/slots`

The same names as `@dzcalendar/slots` (`findSlots`, `checkSlot`), where a booking takes its seats rather than the whole slot. A slot is offered while a seat remains; with `capacity: 1` and no seats it gives the free engine's answer exactly. The same answer on the server.

```text
findSlots(q: SeatsQuery): { slots: SeatedSlot[]; problems: Problem[] }
checkSlot(q: SeatsCheckQuery, start: Moment): SeatsCheck
seatedBusyFromEvents(events: Iterable<CalEvent | EventInstance>, zone: ZoneId, field = 'seats'): SeatedBusy[]
resourceSeats(resource: Resource, events: Iterable<CalEvent | EventInstance>, zone: ZoneId,
              o?: { field?: string; seatsField?: string }): { capacity: number; busy: SeatedBusy[] }

SeatsQuery      = SlotQuery (@dzcalendar/slots) without `busy`, plus { capacity?: number; busy?: readonly SeatedBusy[] }
SeatsCheckQuery = CheckQuery without `busy`, plus the same
SeatedBusy      = Busy plus { seats?: number }     // whole number >= 1, default 1; ignored on a 'block'
SeatedSlot      = Slot plus { seats: number; capacity: number }   // seats still free
SeatsRefusal    = SlotRefusal | 'full'
SeatsCheck      = { ok: true; slot: SeatedSlot } | { ok: false; reason: SeatsRefusal; problems?: readonly Problem[] }
```

`SlotQuery` carries `availability`, `from`, `to`, `duration` (minutes), and optionally `step`, `bufferBefore`, `bufferAfter`, `minNotice`, `maxAdvanceDays`, `now`, `maxPerDay` (counts bookings, not seats). `seatedBusyFromEvents` reads a timed event's `extendedProps[field]` as the seats it takes (a group booking); `resourceSeats` reads a resource's `extendedProps[field]` (field default `'capacity'`) as its capacity, 1 when it has none, and the seats its events take from their `extendedProps[seatsField]` (default `'seats'`).

```ts
import { checkSlot, findSlots } from '@dzcalendar/pro/slots';

const query = {
  availability: { timeZone: 'Europe/Paris', weekly: [{ days: [1, 2, 3, 4, 5] as const, from: '09:00', to: '12:00' }] },
  from: '2026-10-21T00:00:00[Europe/Paris]',
  to: '2026-10-22T00:00:00[Europe/Paris]',
  duration: 60,
  // A class of 8 places, 5 already taken from 10:00 to 11:00.
  capacity: 8,
  busy: [{ start: '2026-10-21T10:00:00[Europe/Paris]', end: '2026-10-21T11:00:00[Europe/Paris]', seats: 5 }],
};

const { slots, problems } = findSlots(query);
// 09:00, 10:00 (3 seats left), 11:00.
console.log(slots.map((s) => `${s.start.toString()} ${s.seats}/${s.capacity}`), problems.length);

// What a server asks before saving a booking.
const verdict = checkSlot(query, '2026-10-21T10:00:00[Europe/Paris]');
console.log(verdict.ok ? verdict.slot.seats : verdict.reason);
```

### `@dzcalendar/pro/editor`

The event and recurrence editor: a modal dialog, the usual recurrences (daily, weekly on chosen days, monthly on the day, the n-th or the last weekday, yearly; every N; never, until a date or a count), a rule beyond them kept as written. It saves through the calendar's history (checked against its rules, undoable). An occurrence of a series asks how far an edit reaches, in the calendar's words (its `messages` included); its recurrence is edited on the whole series. An event the person may not change (the calendar's `editable`, the event's own, as the context menu reads them) opens read-only: Close, no Save, no Delete. Importing it brings `@dzcalendar/core/recurrence` with it.

```text
openEventEditor(cal: CalendarInstance, target: EditorTarget, o?: EditorOptions): Promise<EditorOutcome>
editorHandlers(cal: CalendarInstance, o?: EditorOptions): { onEventOpen, onCreateRequest }
   // cal.update(editorHandlers(cal)): "Open" and "New event here" go to the editor

EditorTarget  = { instance: EventInstance } | { create: EditorCreate }
EditorCreate  = CreateRequest & { end?: Instant | ZonedDateTime }   // timed: a selection's end (after start)
              | CreateRequest & { end?: PlainDate }                 // whole days: exclusive end (after start)
                                       // an unusable end is left out, a warning Problem (onProblem)
EditorOutcome = 'saved' | 'deleted' | 'cancelled'
EditorOptions {
  messages?: Partial<EditorMessages>   // words over the locale's
  container?: HTMLElement              // where the dialog goes; default the calendar's element (its theme applies)
  stepMinutes?: number                 // minutes the time arrows move by; default 15
  defaultMinutes?: number              // length of a new timed event without an end; default 60
  tones?: readonly string[]            // theme tokens --dz-tone-*; default blue, green, red, amber, violet, slate
  injectStyles?: boolean               // false under a CSP without inline styles: include EDITOR_CSS; default true
  onProblem?: (p: Problem) => void     // what it could not use (a create end); without it, the console once per code
}

readRepeat(rules: readonly RRule[] | null, start: PlainDate, zone: ZoneId, text: string): RepeatForm
writeRepeat(form: RepeatForm, start: PlainDate, o: { allDay: boolean; zone: ZoneId }): string | null
                                       // the form back to its rule (RRULE text); null: does not repeat
nthOf(date: PlainDate): { n: number; last: boolean; weekday: Weekday }
type RepeatForm, RepeatFreq ('none' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'), RepeatEnd ({ kind: 'never' } | { kind: 'until'; date } | { kind: 'count'; count })

editorMessagesFor(locale: string): EditorMessages   // the language's words, else English
defineEditorLocale(language: string, messages: EditorMessages): void
EDITOR_EN, EDITOR_FR, EDITOR_AR, EDITOR_ES, EDITOR_DE: EditorMessages
EDITOR_CSS: string
```

```ts
import { viewWindow } from '@dzcalendar/core';
import { createCalendar } from '@dzcalendar/dom';
import { editorHandlers, openEventEditor } from '@dzcalendar/pro/editor';

const calendar = createCalendar(element, {
  timeZone: 'Europe/Paris',
  locale: 'fr',
  initialView: 'timeGridWeek',
  editable: true,
  events: [{ id: 'a', title: 'Consultation', start: '2026-10-21T09:00[Europe/Paris]', duration: { minutes: 45 } }],
});

// "Open" on an event and "New event here" from the context menu go to the editor.
calendar.update(editorHandlers(calendar, { stepMinutes: 5, tones: ['blue', 'green', 'red'] }));

// Or open it yourself, for an event of the store.
const range = calendar.kernel.getState().range;
const [first] = calendar.kernel.store.snapshot.queryInstances(viewWindow(range.start, range.end, 'Europe/Paris'));
if (first) {
  void openEventEditor(calendar, { instance: first }).then((outcome) => console.log(outcome));
}
```

### `@dzcalendar/pro/export`

Exports without dependencies: PDF (the view's sheets drawn on a canvas, the browser shaping every script, put in a PDF written here), PNG, XLSX and CSV (a row per occurrence: the event's own zones, the display zone, the real elapsed duration; real Excel dates; right to left in Arabic and Hebrew), and ICS (through `@dzcalendar/ical`: a series whole with its rule and moved occurrences, each event in its own zone with its VTIMEZONE). Bad input never throws: a failed export is `{ blob: null, problems }`.

```text
exportXLSX(cal, o?: RangeOptions): Promise<ExportResult>
exportCSV(cal, o?: RangeOptions & { separator?: ',' | ';' | '\t' }): Promise<ExportResult>   // UTF-8 with a BOM, CRLF; ';' for a French Excel
exportICS(cal, o?: RangeOptions & { all?: boolean; name?: string }): Promise<ExportResult>   // all: everything the calendar holds
exportPDF(cal, o?: ImageOptions & { title?: string }): Promise<ExportResult>                 // A4 landscape by default (portrait for a list)
exportPNG(cal, o?: ImageOptions): Promise<{ blobs: readonly Blob[]; problems: readonly Problem[] }>   // one image per sheet
download(blob: Blob, filename: string, doc?: Document): void        // an <a download> clicked
downloadExport(cal, kind: ExportKind, filename: string, o?: object): Promise<readonly Problem[]>
   // ExportKind = 'pdf' | 'png' | 'xlsx' | 'csv' | 'ics'; PNG sheets: one file, or a zip of them; never rejects

ExportResult  { blob: Blob | null; problems: readonly Problem[] }
RangeOptions  { from?: PlainDate; to?: PlainDate (exclusive; default what is shown); messages?: Partial<ExportMessages> }
ImageOptions  extends PageOptions { scale?: number (device pixels per CSS pixel, default 2, up to 4); messages? }
PageOptions   { view?: string; from?: PlainDate; to?: PlainDate; paper?: 'a4' | 'letter' | 'a3'; orientation?: 'portrait' | 'landscape' }
```

Lower-level building blocks, also exported:

```text
occurrenceRows(snap, o: RowsOptions): OccurrenceRow[]    excelSerial(...)       // the rows of a sheet
toCSV(rows, words, separator), rowsTable(...), toXLSX(rows, words, { rtl }), zip(files), crc32(...)
pdfFromJpegs(pages: PdfPage[], { title }): Uint8Array
PAPER (sizes in points), sheetSize(paper, orientation) (CSS pixels), periodsFor(kernel, options), paintSheets(kernel, periods, o), MAX_PERIODS (60), MAX_SHEETS (300)
Pen, paintTimeGrid, paintDayGrid, dayGridLanes, paintList, paintTimeline, drawSheet, paintContext, readStyle, readFormat   // painting to canvas operations
EXPORT_EN, EXPORT_FR, EXPORT_AR, EXPORT_ES, EXPORT_DE, exportMessagesFor(locale), defineExportLocale(lang, messages)
types: OccurrenceRow, RowsOptions, PdfPage, Paper, Orientation, PageOptions, PagePeriod, Op, Box, PaintStyle, PaintFormat, PaintContext, PageSlot, ExportMessages
```

```ts
import { createCalendar } from '@dzcalendar/dom';
import { Temporal } from '@dzcalendar/core';
import { download, downloadExport, exportICS, exportXLSX } from '@dzcalendar/pro/export';

const calendar = createCalendar(element, {
  timeZone: 'Europe/Paris',
  initialView: 'dayGridMonth',
  initialDate: Temporal.PlainDate.from('2026-10-21'),
  events: [{ id: 'a', title: 'Consultation', start: '2026-10-21T09:00[Europe/Paris]', duration: { minutes: 45 } }],
});

// A sheet of what is shown, then of a chosen range.
const shown = await exportXLSX(calendar);
const range = await exportICS(calendar, { from: Temporal.PlainDate.from('2026-10-01'), to: Temporal.PlainDate.from('2026-11-01'), name: 'October' });
if (range.blob) download(range.blob, 'october.ics');
if (shown.problems.length > 0) console.warn(shown.problems);

// Or made and saved in one call, as a button would.
const problems = await downloadExport(calendar, 'pdf', 'agenda.pdf', { paper: 'a4', orientation: 'landscape' });
console.log(problems.length);
```

### `@dzcalendar/pro/print`

Real A4 / Letter / A3 sheets in the DOM: a copy of the calendar per period (a week, a day, a month; N resources of a timeline per sheet), sharing its store (nothing fetched again), sized to the sheet, each with the period's title and "n / of", then `window.print()`. The text is the browser's, in any script, selectable in "Save as PDF". Bad input never throws: it is a problem and nothing is left behind. One print job per document: a second call closes the first.

```text
printPages(cal: CalendarInstance, o?: PrintOptions): Promise<PrintJob>
PrintOptions extends PageOptions {
  rowsPerPage?: number              // a resource timeline: rows per sheet; default what the sheet's height holds
  print?: boolean                   // false: the sheets are built and left to you (job.close() takes them away); no window.print()
  messages?: Partial<ExportMessages>
}
PrintJob { pages: readonly HTMLElement[]   // each a .dz-print__page
           problems: readonly Problem[]
           close(): void }          // destroys the copies, lets the held dates go; called after printing by itself
periodsFor(kernel, options), sheetSize(paper, orientation)      // the same as in /export
type PageOptions, PagePeriod
```

```ts
import { Temporal } from '@dzcalendar/core';
import { createCalendar } from '@dzcalendar/dom';
import '@dzcalendar/pro';
import { printPages } from '@dzcalendar/pro/print';

const calendar = createCalendar(element, {
  timeZone: 'Europe/Paris',
  initialView: 'resourceTimelineWeek',
  initialDate: Temporal.PlainDate.from('2026-10-21'),
  resources: [
    { id: 'benali', title: 'Dr Benali' },
    { id: 'room1', title: 'Room 1' },
  ],
});

// A week of the timeline on A4 sheets, 12 resources at most per sheet.
const job = await printPages(calendar, { paper: 'a4', rowsPerPage: 12 });
if (job.problems.length > 0) console.warn(job.problems);

// Without printing: the sheets are yours until close().
const sheets = await printPages(calendar, { print: false });
console.log(sheets.pages.length);
sheets.close();
```

## Recipes

### A process's last status in its row head

The store tells what changed (`kernel.subscribe`, `store` events); the application reads each process's summary again and gives the resources anew (`extendedProps`) only when one differs; `hooks.resource.content` draws it. The full version is in `playground/supervision.ts`.

```ts
import { createCalendar } from '@dzcalendar/dom';
import '@dzcalendar/pro';

interface Summary {
  readonly failures: number;
}

const processes = [{ id: 'import', title: 'Order import' }, { id: 'billing', title: 'Billing' }];
const calendar = createCalendar(element, {
  timeZone: 'Europe/Paris',
  initialView: 'resourceTimelineDay',
  resources: processes,
  hooks: {
    resource: {
      content: ({ resource }) => {
        const failures = (resource.extendedProps as Partial<Summary>).failures ?? 0;
        const box = document.createElement('div');
        box.textContent = failures > 0 ? `${resource.title} (${failures} failed)` : resource.title;
        return box;
      },
    },
  },
});

let said = '';
function summarize(): void {
  const resources = processes.map((p) => {
    let failures = 0;
    for (const e of calendar.kernel.store.snapshot.allEvents()) if (e.resourceIds[0] === p.id && e.tone === 'red') failures++;
    return { ...p, extendedProps: { failures } satisfies Summary };
  });
  const text = JSON.stringify(resources);
  // Only when one differs: the heads redraw, nothing else.
  if (text === said) return;
  said = text;
  calendar.update({ resources });
}

let queued = false;
calendar.kernel.subscribe((e) => {
  if (e.type !== 'store' || queued) return;
  queued = true;
  queueMicrotask(() => ((queued = false), summarize()));
});
summarize();
```

### A window of four hours that slides with the clock

```ts
import { createCalendar } from '@dzcalendar/dom';
import '@dzcalendar/pro';

const calendar = createCalendar(element, {
  timeZone: 'Europe/Paris',
  initialView: 'resourceTimelineDay',
  resources: [{ id: 'import', title: 'Order import' }],
  // Four hours fill the room, whatever its width; the present stays where it is.
  timeline: { slot: 15, span: { hours: 4 }, follow: { before: { minutes: 5 } } },
  nowRefresh: { seconds: 5 },
});

// Changing the span keeps the moment at the centre in place.
calendar.update({ timeline: { span: { hours: 12 }, slot: 30 } });
```

## Documentation

- [The `timeline` option](https://plinthworks.github.io/dzcalendar/options/timeline/)
- [`resources`](https://plinthworks.github.io/dzcalendar/options/resources/), [`collapsedResources`](https://plinthworks.github.io/dzcalendar/options/collapsed-resources/), [`collapsedGroups`](https://plinthworks.github.io/dzcalendar/options/collapsed-groups/), [`resourceGroupField`](https://plinthworks.github.io/dzcalendar/options/resource-group-field/), [`resourceOrder`](https://plinthworks.github.io/dzcalendar/options/resource-order/), [`showUnassigned`](https://plinthworks.github.io/dzcalendar/options/show-unassigned/)
- [`nowRefresh`](https://plinthworks.github.io/dzcalendar/options/now-refresh/), [`forget`](https://plinthworks.github.io/dzcalendar/options/forget/), [`onFollowChange`](https://plinthworks.github.io/dzcalendar/options/on-follow-change/), [`viewOptions`](https://plinthworks.github.io/dzcalendar/options/view-options/), [`views`](https://plinthworks.github.io/dzcalendar/options/views/)
- [Resources and timeline](https://plinthworks.github.io/dzcalendar/guides/resources-timeline/), [the editor](https://plinthworks.github.io/dzcalendar/guides/editor/), [print and export](https://plinthworks.github.io/dzcalendar/guides/print-export/), [event sources](https://plinthworks.github.io/dzcalendar/guides/event-sources/), [time zones](https://plinthworks.github.io/dzcalendar/guides/time-zones/)
- [All options](https://plinthworks.github.io/dzcalendar/options/)

## License

MIT

---

## Français

Pour DzCalendar : la timeline, la capacité des créneaux, l'éditeur d'événements, l'impression paginée et les exports (PDF, PNG, XLSX, CSV, ICS), sans dépendance.

[English](#dzcalendarpro) · **Français**

### Ce que c'est

`@dzcalendar/pro` est la partie de DzCalendar qui va au-delà des grilles du jour, de la semaine et du mois. Elle est sous licence MIT et ne constitue qu'une frontière de code : il n'y a pas de clé de licence.

- **La famille timeline** : des ressources en lignes le long d'un axe de temps *écoulé*. Un jour de 25 heures est large de 25 heures, un jour de 23 heures de 23 heures ; les créneaux suivent l'horloge murale, si bien que la nuit du retour à l'heure d'hiver, 02:00 apparaît deux fois. Huit vues sont enregistrées par `import '@dzcalendar/pro'` : `timelineDay`, `timelineWeek`, `timelineMonth`, `timelineYear` (une ligne pour tous les événements) et `resourceTimelineDay`, `resourceTimelineWeek`, `resourceTimelineMonth`, `resourceTimelineYear` (une ligne par ressource). Vos propres vues timeline se déclarent avec `views: { x: { family: 'timeline', duration } }`.
- **Les ressources** : un arbre (`parentId`), des groupes (`resourceGroupField`), une ligne « Non assignés » facultative, et une zone de ressources dont les colonnes se règlent avec `viewOptions.timeline.areaColumns`.
- **La supervision** : événements en cours (`ongoing: true`), instants (`display: 'marker'`), événements d'arrière-plan étiquetés, `forget`, `nowRefresh`, `onFollowChange`, `calendar.shift()`, et sources en direct (`liveSource`, `sseSource` de `@dzcalendar/core/live`).
- **Créneaux avec places** (`@dzcalendar/pro/slots`), **éditeur d'événements et de récurrences** (`@dzcalendar/pro/editor`), **impression paginée** (`@dzcalendar/pro/print`) et **exports** (`@dzcalendar/pro/export`).

Les lignes ont une hauteur fixe et un lien « +N » au-delà de leurs couloirs. Seul ce qui rencontre la vue est monté, dans les deux sens.

### Installation

```bash
npm install @dzcalendar/core @dzcalendar/dom @dzcalendar/theme @dzcalendar/pro
```

`@dzcalendar/pro` dépend de `@dzcalendar/core`, `@dzcalendar/dom`, `@dzcalendar/slots` et `@dzcalendar/ical`. `@tzslot/dom` est une dépendance homologue facultative.

### Démarrage rapide

Importez le paquet une fois (il enregistre la famille timeline et ses vues), puis créez le calendrier comme d'habitude.

```ts
import '@dzcalendar/theme/dzcalendar.css';
import { Temporal } from '@dzcalendar/core';
import { createCalendar } from '@dzcalendar/dom';
import '@dzcalendar/pro';

const calendar = createCalendar(element, {
  timeZone: 'Europe/Paris',
  locale: 'fr',
  initialView: 'resourceTimelineWeek',
  initialDate: Temporal.PlainDate.from('2026-10-21'),
  resources: [
    { id: 'cardio', title: 'Cardiologie' },
    { id: 'benali', title: 'Dr Benali', parentId: 'cardio', service: 'Cardiologie' },
    { id: 'haddad', title: 'Dr Haddad', parentId: 'cardio', service: 'Cardiologie' },
    { id: 'salle1', title: 'Salle 1', service: 'Imagerie' },
  ],
  events: [
    { id: 'a', title: 'Consultation', start: '2026-10-21T09:00[Europe/Paris]', duration: { minutes: 45 }, resourceId: 'benali' },
    { id: 'b', title: 'Scanner', start: '2026-10-21T14:00[Europe/Paris]', duration: { minutes: 30 }, resourceId: 'salle1' },
  ],
  // L'échelle et les couloirs de la timeline.
  timeline: { slot: 120, maxLanes: 2 },
  // Les colonnes de la zone de ressources.
  viewOptions: {
    timeline: {
      areaColumns: [
        { field: 'title', header: 'Nom', width: 180 },
        { field: 'service', header: 'Service', width: 120 },
      ],
    },
  },
});

// Plus tard : retour au créneau par défaut, couloirs inchangés.
calendar.update({ timeline: { slot: undefined } });
```

Le thème est `@dzcalendar/theme` (la même palette `--tz-*` que celle de tzslot) ; la timeline lit en plus ses propres jetons (`--dz-tl-slot`, `--dz-tl-tick-font`).

### Les vues

| Vue | Montre | Créneau par défaut |
|---|---|---|
| `timelineDay` / `resourceTimelineDay` | un jour | 30 minutes |
| `timelineWeek` / `resourceTimelineWeek` | une semaine | 1 heure |
| `timelineMonth` / `resourceTimelineMonth` | un mois | 1 jour |
| `timelineYear` / `resourceTimelineYear` | une année | 1 jour |

Les vues `timeline…` dessinent une seule ligne de tous les événements ; les vues `resourceTimeline…` dessinent une ligne par ressource, avec la zone de ressources à gauche. La `duration` et le `dateIncrement` d'une vue sont des jours entiers ou plus (une date plus des minutes est la même date ; un tel pas est refusé par une `RangeError`).

#### Vues timeline personnalisées

```ts
import { createCalendar } from '@dzcalendar/dom';
import '@dzcalendar/pro';

const calendar = createCalendar(element, {
  timeZone: 'Europe/Paris',
  // Trois jours à la fois, une ligne par ressource.
  views: { supervision: { family: 'timeline', resources: true, duration: { days: 3 } } },
  initialView: 'supervision',
  headerViews: [],
  resources: [
    { id: 'import', title: 'Import des commandes' },
    { id: 'billing', title: 'Facturation' },
  ],
});

calendar.update({ timeline: { step: { minutes: 15 }, span: { hours: 4 } } });
```

### Options

Tout passe par les options du calendrier (`createCalendar(element, options)` et `calendar.update(changes)`). Une valeur inacceptable lève une `RangeError` à la création ou à `update()`, avant que rien ne change.

#### `timeline`

Fusionnée clé par clé avec `update({ timeline })` ; `slot: undefined` revient à la valeur par défaut.

| Membre | Type | Effet |
|---|---|---|
| `slot` | `number \| 'day'` | Largeur d'un créneau dans le temps : un nombre entier de minutes qui divise un jour (5, 15, 30, 60, 120…), ou `'day'`. Par défaut 30 minutes pour un jour, une heure jusqu'à une semaine, un jour au-delà. |
| `maxLanes` | `number` | Couloirs de la ligne d'une ressource (entier d'au moins 1, 3 par défaut) ; le dernier porte « +N » quand davantage d'événements se chevauchent. |
| `fillLanes` | `number` | Couloirs d'une timeline sans ressources (12 par défaut) : une valeur de départ, dans un navigateur la ligne unique remplit la vue et les couloirs sont mesurés. |
| `step` | `DurationLike` | De combien ◀ ▶ et `navigate('prev' \| 'next')` font glisser l'axe (`{ minutes: 15 }`, `'PT30M'`) au lieu de changer de période. Heures et minutes, plus long que zéro. |
| `follow` | `boolean \| { before?: DurationLike }` | Garde le présent en vue. `true` : le créneau du présent au bord gauche. `{ before: { minutes: 5 } }` : le présent à cette distance du bord gauche, l'axe glissant chaque minute. `false` par défaut. |
| `span` | `DurationLike` | Le temps montré d'un coup (`{ hours: 4 }`) : la largeur d'un créneau est la place partagée entre autant de créneaux, mesurée de nouveau au redimensionnement. Jours, heures et minutes. |
| `ticks` | `number \| { every: number; label?: number }` | Petits traits dans chaque créneau, comme sur une règle : `5` donne un trait et son heure toutes les 5 minutes ; `{ every: 1, label: 5 }` un repère par minute et l'heure toutes les cinq. Minutes entières divisant un jour ; `label` multiple de `every`. |

Un créneau d'horloge murale qui traverse un changement d'heure garde sa vraie largeur. La largeur à l'écran est celle de la feuille de style, `--dz-tl-slot`, sauf si un `span` la fixe.

`step` : en bout d'axe, la période suivante ou précédente entre, là où le glissement allait ; une vue d'un jour s'arrête à minuit au passage, une vue de plusieurs jours le traverse. PageUp et PageDown glissent aussi de ce pas.

`follow` : le suivi se met en pause dès que la personne se déplace dans le temps (un défilement de plus de 24 px depuis l'endroit où la vue l'avait mis, un glissement, une période sans le présent) ; « Aujourd'hui » (`navigate('today')`) le reprend. Avec `{ before }`, le glissement est le défilement adouci de l'adaptateur de mouvement (`@dzcalendar/motion-gsap`), sinon celui, doux, du navigateur, immédiat avec `prefers-reduced-motion`.

#### `viewOptions.timeline`

```text
interface AreaColumn {
  field: string;     // lu sur la ressource : ses champs propres, ce qui a été donné, son extendedProps
  header?: string;   // l'en-tête de la colonne ; par défaut le nom du champ (« Ressource », traduit, pour `title`)
  width?: number;    // en pixels ; par défaut 160 pour la première colonne, 110 pour les autres
}
interface TimelineViewOptions {
  areaColumns?: readonly AreaColumn[];   // par défaut : une colonne, le titre de la ressource
}
```

#### Autres options lues par la timeline

| Option | Effet pour une timeline |
|---|---|
| `resources` | Les lignes : `{ id, title, parentId?, order?, timeZone?, businessHours?, extendedProps? … }`. |
| `resourceGroupField` | Regroupe les lignes selon un champ : un en-tête au-dessus de chaque série. |
| `resourceOrder` | L'ordre des frères après leur `order`. |
| `showUnassigned` | Une ligne « Non assignés » en premier, pour les événements sans ressource connue ; un dépôt dessus retire la ressource dont l'événement provenait. |
| `collapsedResources`, `collapsedGroups` | Branches et groupes repliés ; `onResourceToggle` rapporte le choix d'une personne. |
| `businessHours` | Grisé en dehors, par ligne (les heures propres d'une ressource sont lues dans son fuseau). |
| `nowRefresh` | À quelle fréquence la ligne du présent avance et une timeline suivie glisse. D'une seconde à une heure, une minute par défaut. |
| `forget` | `{ olderThan }` (ou `null`) : les événements terminés depuis plus longtemps quittent le calendrier. |
| `onFollowChange` | `(following: boolean) => void` : appelé quand le suivi est mis en pause ou repris (pas pour l'option telle que lue au départ). |
| `hooks.resource.content`, `hooks.event.content` | Dessinent vous-même un en-tête de ligne ou une carte d'événement. |

#### Les événements sur une timeline

- **Événements en cours.** `ongoing: true` dessine un événement de son début à maintenant ; sa fin suit le présent (déplacée chaque minute par le calendrier, un changement de cause `'api'` : ni annulation, ni `onEventChange`), jamais avant la fin attendue (son `end` ou sa `duration` tels que donnés) ; tant que cette fin est à venir, la partie au-delà de maintenant n'est dessinée qu'en pointillés. Sa fin est ouverte (pointillée, rayée, même avec mouvement réduit) et son heure se lit « 11:02 – en cours ». `event.update({ ongoing: false })` le termine, à son `end` s'il en a un, sinon maintenant. Une date seule ou une série ne peut pas être en cours (problème `ongoing-not-timed`).
- **Repères.** `display: 'marker'` est un instant : un trait sur sa ligne, son drapeau (le titre, ou celui du hook de contenu) dans un couloir à côté. Il n'a qu'un début : un `end` ou une `duration` est ignoré (`marker-length-ignored`), une date seule refusée (`marker-all-day`).
- **Événements d'arrière-plan.** `display: 'background'` est une teinte derrière les événements de la ligne (une fenêtre de maintenance). Le hook de contenu d'événement lui donne une étiquette (`background: true` dans son argument), dessinée à son début et gardée en vue pendant que la ligne défile.
- **`forget`.** Chaque minute, et à la création du calendrier, les événements terminés depuis plus de `olderThan` quittent le store (ni annulation, ni `onEventChange`) ; une série et un événement en cours restent.

#### Méthodes

```text
calendar.shift(by: DurationLike): boolean
  // Fait glisser une timeline dans le temps de n'importe quelles heures et minutes ({ minutes: -15 } : en arrière) ;
  // la période suivante ou précédente entre quand l'axe se termine. Met `timeline.follow` en pause.
  // False quand la vue n'est pas une timeline. Un jour ou plus (ou rien) lève une RangeError, comme `step`.
calendar.navigate('prev' | 'next' | 'today')
  // Avec `timeline.step`, prev/next glissent de ce pas ; 'today' reprend aussi le suivi.
```

### Supervision

Une timeline faite pour surveiller ce qui tourne maintenant : des processus en lignes, des exécutions en barres, des alertes en repères, des maintenances derrière, alimentée par une source en direct. C'est une version condensée de `playground/supervision.ts`.

```ts
import { createCalendar } from '@dzcalendar/dom';
import { liveSource } from '@dzcalendar/core/live';
import type { EventInput } from '@dzcalendar/core';
import '@dzcalendar/pro';

const ZONE = 'Europe/Paris';
const processes = [
  { id: 'import', title: 'Import des commandes' },
  { id: 'billing', title: 'Facturation' },
  { id: 'backup', title: 'Sauvegarde' },
];

const history: EventInput[] = [
  // Une exécution terminée.
  { id: 'billing-1', title: 'Facturation', start: '2026-10-21T08:00[Europe/Paris]', duration: { minutes: 90 }, resourceId: 'billing', tone: 'green' },
  // Encore en cours : dessinée de son début à maintenant, 70 minutes attendues.
  { id: 'backup-now', title: 'Sauvegarde', start: '2026-10-21T09:00[Europe/Paris]', duration: { minutes: 70 }, resourceId: 'backup', tone: 'blue', ongoing: true },
  // Un instant : un trait et son drapeau.
  { id: 'alert-1', title: 'Alerte', start: '2026-10-21T08:40[Europe/Paris]', resourceId: 'import', display: 'marker', tone: 'amber' },
  // Une fenêtre de maintenance, derrière les exécutions.
  { id: 'maint-1', title: 'Maintenance', start: '2026-10-21T11:00[Europe/Paris]', duration: { hours: 3 }, resourceId: 'billing', display: 'background', tone: 'violet' },
];

const calendar = createCalendar(element, {
  timeZone: ZONE,
  locale: 'fr',
  views: { supervision: { family: 'timeline', resources: true, duration: { days: 3 } } },
  initialView: 'supervision',
  headerViews: [],
  resources: processes,
  events: history,
  // Le présent à 5 minutes du bord gauche, en glissant ; une règle : un repère par minute, l'heure toutes les 5.
  timeline: { slot: 15, step: { minutes: 15 }, follow: { before: { minutes: 5 } }, ticks: { every: 1, label: 5 }, maxLanes: 2 },
  // La ligne du présent et l'axe avancent toutes les 30 secondes.
  nowRefresh: { seconds: 30 },
  // Un écran laissé ouvert : ce qui s'est terminé il y a plus de deux jours est oublié.
  forget: { olderThan: { days: 2 } },
  hooks: {
    event: {
      content: ({ instance }) => {
        const label = document.createElement('span');
        label.textContent = instance.event.title;
        return label;
      },
    },
  },
  // Suivi en pause (la personne est allée dans le passé) : on le dit, jusqu'à « Aujourd'hui ».
  onFollowChange: (following) => {
    document.title = following ? 'En direct' : 'En pause : appuyez sur Aujourd’hui';
  },
});

// Un flux : `liveSource` prend n'importe quel transport ; `sseSource` le fait pour les Server-Sent Events.
const feed = liveSource('feed', {
  connect(emit) {
    const timer = setInterval(() => {
      emit({ create: { id: `run-${Date.now()}`, title: 'Import', start: new Date().toISOString(), duration: { minutes: 10 }, resourceId: 'import', ongoing: true } });
    }, 60_000);
    return () => clearInterval(timer);
  },
});
calendar.update({ sources: [feed] });

// Un bouton « reculer de 45 minutes ».
document.querySelector('button')?.addEventListener('click', () => calendar.shift({ minutes: -45 }));
```

#### Sources en direct de `@dzcalendar/core/live`

Une source en direct est informée plutôt qu'interrogée. `liveSource(id, { connect, defaults? })` ouvre n'importe quel flux (WebSocket, MQTT…) et remet chaque message à `emit` ; `connect` répond en donnant le moyen de le fermer. Un message est l'un de :

```text
{ create: EventInput }                       // un événement créé
{ update: string; patch: Partial<EventInput> }   // un événement modifié (extendedProps fusionnés) ; { ongoing: false } sans fin le termine maintenant
{ remove: string }                           // un événement disparu
{ reset: readonly EventInput[] }             // toute la liste à nouveau (une reconnexion)
```

`emit` prend un message ou un tableau de messages (un seul redessin). Le flux fait autorité : la modification d'un de ses événements par une personne dure jusqu'à son message suivant.

```ts
import { createCalendar } from '@dzcalendar/dom';
import { sseSource } from '@dzcalendar/core/live';
import '@dzcalendar/pro';

const runs = sseSource('runs', '/api/runs/stream', {
  // Les données d'un message (JSON lu, sinon le texte) changées en ce qu'elles disent.
  map: (data) => {
    const run = data as { id: string; process: string; start: string; done?: boolean };
    return run.done ? { update: run.id, patch: { ongoing: false } } : { create: { id: run.id, title: run.process, start: run.start, resourceId: run.process, duration: { minutes: 10 }, ongoing: true } };
  },
  events: ['run'],
  reopenAfterMs: 5000,
});

createCalendar(element, {
  timeZone: 'Europe/Paris',
  initialView: 'resourceTimelineDay',
  resources: [{ id: 'import', title: 'Import des commandes' }],
  timeline: { follow: true },
  sources: [runs],
});
```

Options de `sseSource(id, url, options)` : `map(data, event)` (rend un message, plusieurs, ou `null`), `events` (les événements nommés écoutés en plus de `message`), `withCredentials`, `reopenAfterMs` (millisecondes avant de rouvrir le flux une fois que le serveur l'a fermé pour de bon, 5000 par défaut ; le navigateur reconnecte lui-même un flux interrompu), `defaults`. Sans `EventSource` (un rendu serveur), elle n'ouvre rien.

### Les points d'entrée

| Entrée | Ce que c'est |
|---|---|
| `@dzcalendar/pro` | La timeline : enregistre la famille et ses huit vues ; `createTimelineView`, `TIMELINE_CSS`, et tout `/model`. |
| `@dzcalendar/pro/model` | La timeline sans écran : axe, modèle, vues. Pas de DOM : un serveur, un worker ou un port natif peut l'utiliser. |
| `@dzcalendar/pro/slots` | Créneaux réservables avec places (capacité). |
| `@dzcalendar/pro/editor` | L'éditeur d'événements et de récurrences, une boîte de dialogue modale. |
| `@dzcalendar/pro/export` | PDF, PNG, XLSX, CSV et ICS, sans dépendance. Chargé à la demande. |
| `@dzcalendar/pro/print` | Impression paginée par le navigateur. |

#### `@dzcalendar/pro`

```text
import '@dzcalendar/pro'                  // enregistre la famille 'timeline' et TIMELINE_VIEWS
export * from '@dzcalendar/pro/model'
createTimelineView(ctx: ViewCtx): ViewController   // le constructeur de la vue, pour @dzcalendar/dom/toolkit
type AreaColumn, TimelineViewOptions               // voir viewOptions.timeline
TIMELINE_CSS: string                                // la feuille de style ; injectée par défaut
```

Les styles de la timeline sont injectés sauf si le calendrier est créé avec `injectStyles: false` (sous une CSP sans style en ligne) : incluez alors `TIMELINE_CSS` vous-même.

#### `@dzcalendar/pro/model`

```text
buildTimelineAxis(range: ViewRange, zone: ZoneId, o?: { slot?: number | 'day' }): TimelineAxis
defaultSlot(range: ViewRange): number | 'day'     // 30 pour un jour, 60 jusqu'à une semaine, 'day' au-delà
validSlot(s: unknown): s is number | 'day'        // minutes entières divisant 1440, ou 'day'
buildTimelineModel(range: ViewRange, snap: StoreSnapshot, o: TimelineOptions): TimelineModel
updateTimelineModel(prev: TimelineModel, snap: StoreSnapshot, change: StoreChange): TimelineModel
timelineNow(model: TimelineModel, now: Instant): number | null   // la position du présent sur l'axe
TIMELINE_VIEWS: Readonly<Record<string, ViewSpec>>  // les huit vues

type TimelineSlot   { start, end: Instant; date: PlainDate; time: PlainTime | null; pass: 'first' | 'second' | null; offset: string }
type TimelineGroup  { date: PlainDate; start, end: Instant; lengthMinutes: number }   // 1380, 1440, 1500 pour un jour
type TimelineAxis   { unit: 'time' | 'day'; slotMinutes; start; end; slots; groups; length;
                      toPosition(i: Instant | number): number; fromPosition(x: number): Instant; slotAt(i: Instant): number }
type TimelineAxisOptions { slot?: number | 'day' }
type TimelineOptions { displayZone; slot?; rows?; resources?; maxLanes?; fillLanes?; businessHours? }
type TimelineModel  { version; range; options; axis; rows: readonly TimelineRow[]; maxLanes }
type TimelineRow    // { kind: 'resource' | 'group' | 'all', … } avec events, background, more, offHours, lanes
type TimelineBar    { segment; from; to; lane }
type TimelineMore   { key; from; to; events }       // un « +N »
```

```ts
import { Temporal, computeViewRange } from '@dzcalendar/core';
import { TIMELINE_VIEWS, buildTimelineAxis } from '@dzcalendar/pro/model';

// La semaine du retour à l'heure d'hiver à Paris, vue par l'axe.
const range = computeViewRange(Temporal.PlainDate.from('2026-10-21'), TIMELINE_VIEWS['timelineWeek']!, { firstDay: 1, today: Temporal.PlainDate.from('2026-10-21') });
const axis = buildTimelineAxis(range, 'Europe/Paris');

// 7 en-têtes de jour : six de 24 heures et le dimanche de 25 ; 169 créneaux horaires.
console.log(axis.groups.map((g) => g.lengthMinutes / 60), axis.length);
```

#### `@dzcalendar/pro/slots`

Les mêmes noms que `@dzcalendar/slots` (`findSlots`, `checkSlot`), où une réservation prend ses places plutôt que tout le créneau. Un créneau est proposé tant qu'il reste une place ; avec `capacity: 1` et sans places, c'est exactement la réponse du moteur libre. La même réponse sur le serveur.

```text
findSlots(q: SeatsQuery): { slots: SeatedSlot[]; problems: Problem[] }
checkSlot(q: SeatsCheckQuery, start: Moment): SeatsCheck
seatedBusyFromEvents(events: Iterable<CalEvent | EventInstance>, zone: ZoneId, field = 'seats'): SeatedBusy[]
resourceSeats(resource: Resource, events: Iterable<CalEvent | EventInstance>, zone: ZoneId,
              o?: { field?: string; seatsField?: string }): { capacity: number; busy: SeatedBusy[] }

SeatsQuery      = SlotQuery (@dzcalendar/slots) sans `busy`, plus { capacity?: number; busy?: readonly SeatedBusy[] }
SeatsCheckQuery = CheckQuery sans `busy`, plus la même chose
SeatedBusy      = Busy plus { seats?: number }     // entier >= 1, 1 par défaut ; ignoré pour un 'block'
SeatedSlot      = Slot plus { seats: number; capacity: number }   // places encore libres
SeatsRefusal    = SlotRefusal | 'full'
SeatsCheck      = { ok: true; slot: SeatedSlot } | { ok: false; reason: SeatsRefusal; problems?: readonly Problem[] }
```

`SlotQuery` porte `availability`, `from`, `to`, `duration` (minutes), et en option `step`, `bufferBefore`, `bufferAfter`, `minNotice`, `maxAdvanceDays`, `now`, `maxPerDay` (compte des réservations, pas des places). `seatedBusyFromEvents` lit `extendedProps[field]` d'un événement horaire comme les places qu'il prend (une réservation de groupe) ; `resourceSeats` lit `extendedProps[field]` d'une ressource (champ `'capacity'` par défaut) comme sa capacité, 1 si elle n'en a pas, et les places que prennent ses événements dans leur `extendedProps[seatsField]` (`'seats'` par défaut).

```ts
import { checkSlot, findSlots } from '@dzcalendar/pro/slots';

const query = {
  availability: { timeZone: 'Europe/Paris', weekly: [{ days: [1, 2, 3, 4, 5] as const, from: '09:00', to: '12:00' }] },
  from: '2026-10-21T00:00:00[Europe/Paris]',
  to: '2026-10-22T00:00:00[Europe/Paris]',
  duration: 60,
  // Un cours de 8 places, 5 déjà prises de 10:00 à 11:00.
  capacity: 8,
  busy: [{ start: '2026-10-21T10:00:00[Europe/Paris]', end: '2026-10-21T11:00:00[Europe/Paris]', seats: 5 }],
};

const { slots, problems } = findSlots(query);
// 09:00, 10:00 (3 places restantes), 11:00.
console.log(slots.map((s) => `${s.start.toString()} ${s.seats}/${s.capacity}`), problems.length);

// Ce qu'un serveur demande avant d'enregistrer une réservation.
const verdict = checkSlot(query, '2026-10-21T10:00:00[Europe/Paris]');
console.log(verdict.ok ? verdict.slot.seats : verdict.reason);
```

#### `@dzcalendar/pro/editor`

L'éditeur d'événements et de récurrences : une boîte de dialogue modale, les récurrences usuelles (quotidienne, hebdomadaire sur des jours choisis, mensuelle le jour du mois, le n-ième ou le dernier jour de semaine, annuelle ; toutes les N ; jamais, jusqu'à une date ou un nombre de fois), une règle au-delà gardée telle qu'écrite. Il enregistre par l'historique du calendrier (vérifié contre ses règles, annulable). Une occurrence d'une série demande jusqu'où va la modification, dans les mots du calendrier (son `messages` compris) ; sa récurrence se modifie sur la série entière. Un événement que la personne ne peut pas modifier (le `editable` du calendrier, celui de l'événement, lus comme le menu contextuel les lit) s'ouvre en lecture seule : Fermer, ni Enregistrer ni Supprimer. L'importer apporte `@dzcalendar/core/recurrence`.

```text
openEventEditor(cal: CalendarInstance, target: EditorTarget, o?: EditorOptions): Promise<EditorOutcome>
editorHandlers(cal: CalendarInstance, o?: EditorOptions): { onEventOpen, onCreateRequest }
   // cal.update(editorHandlers(cal)) : « Ouvrir » et « Nouvel événement ici » vont à l'éditeur

EditorTarget  = { instance: EventInstance } | { create: EditorCreate }
EditorCreate  = CreateRequest & { end?: Instant | ZonedDateTime }   // horaire : la fin d'une sélection (après le début)
              | CreateRequest & { end?: PlainDate }                 // journées entières : fin exclue (après le début)
                                       // une fin inutilisable est laissée, un Problem d'avertissement (onProblem)
EditorOutcome = 'saved' | 'deleted' | 'cancelled'
EditorOptions {
  messages?: Partial<EditorMessages>   // des mots par-dessus ceux de la langue
  container?: HTMLElement              // où va la boîte ; par défaut l'élément du calendrier (son thème s'applique)
  stepMinutes?: number                 // minutes dont avancent les flèches de l'heure ; 15 par défaut
  defaultMinutes?: number              // durée d'un nouvel événement horaire sans fin ; 60 par défaut
  tones?: readonly string[]            // jetons de thème --dz-tone-* ; par défaut blue, green, red, amber, violet, slate
  injectStyles?: boolean               // false sous une CSP sans style en ligne : incluez EDITOR_CSS ; true par défaut
  onProblem?: (p: Problem) => void     // ce qu'il n'a pu utiliser (une fin de création) ; sans lui, la console une fois par code
}

readRepeat(rules: readonly RRule[] | null, start: PlainDate, zone: ZoneId, text: string): RepeatForm
writeRepeat(form: RepeatForm, start: PlainDate, o: { allDay: boolean; zone: ZoneId }): string | null
                                       // le formulaire reconverti en sa règle (texte RRULE) ; null : ne se répète pas
nthOf(date: PlainDate): { n: number; last: boolean; weekday: Weekday }
type RepeatForm, RepeatFreq ('none' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'), RepeatEnd ({ kind: 'never' } | { kind: 'until'; date } | { kind: 'count'; count })

editorMessagesFor(locale: string): EditorMessages   // les mots de la langue, sinon l'anglais
defineEditorLocale(language: string, messages: EditorMessages): void
EDITOR_EN, EDITOR_FR, EDITOR_AR, EDITOR_ES, EDITOR_DE: EditorMessages
EDITOR_CSS: string
```

```ts
import { viewWindow } from '@dzcalendar/core';
import { createCalendar } from '@dzcalendar/dom';
import { editorHandlers, openEventEditor } from '@dzcalendar/pro/editor';

const calendar = createCalendar(element, {
  timeZone: 'Europe/Paris',
  locale: 'fr',
  initialView: 'timeGridWeek',
  editable: true,
  events: [{ id: 'a', title: 'Consultation', start: '2026-10-21T09:00[Europe/Paris]', duration: { minutes: 45 } }],
});

// « Ouvrir » sur un événement et « Nouvel événement ici » du menu contextuel vont à l'éditeur.
calendar.update(editorHandlers(calendar, { stepMinutes: 5, tones: ['blue', 'green', 'red'] }));

// Ou ouvrez-le vous-même, pour un événement du store.
const range = calendar.kernel.getState().range;
const [first] = calendar.kernel.store.snapshot.queryInstances(viewWindow(range.start, range.end, 'Europe/Paris'));
if (first) {
  void openEventEditor(calendar, { instance: first }).then((outcome) => console.log(outcome));
}
```

#### `@dzcalendar/pro/export`

Des exports sans dépendance : PDF (les feuilles de la vue dessinées sur un canvas, le navigateur formant chaque écriture, mises dans un PDF écrit ici), PNG, XLSX et CSV (une ligne par occurrence : les fuseaux propres de l'événement, le fuseau d'affichage, la vraie durée écoulée ; de vraies dates Excel ; de droite à gauche en arabe et en hébreu), et ICS (par `@dzcalendar/ical` : une série entière avec sa règle et ses occurrences déplacées, chaque événement dans son fuseau avec son VTIMEZONE). Une entrée invalide ne lève jamais : un export en échec rend `{ blob: null, problems }`.

```text
exportXLSX(cal, o?: RangeOptions): Promise<ExportResult>
exportCSV(cal, o?: RangeOptions & { separator?: ',' | ';' | '\t' }): Promise<ExportResult>   // UTF-8 avec BOM, CRLF ; ';' pour un Excel français
exportICS(cal, o?: RangeOptions & { all?: boolean; name?: string }): Promise<ExportResult>   // all : tout ce que le calendrier contient
exportPDF(cal, o?: ImageOptions & { title?: string }): Promise<ExportResult>                 // A4 paysage par défaut (portrait pour une liste)
exportPNG(cal, o?: ImageOptions): Promise<{ blobs: readonly Blob[]; problems: readonly Problem[] }>   // une image par feuille
download(blob: Blob, filename: string, doc?: Document): void        // un <a download> cliqué
downloadExport(cal, kind: ExportKind, filename: string, o?: object): Promise<readonly Problem[]>
   // ExportKind = 'pdf' | 'png' | 'xlsx' | 'csv' | 'ics' ; feuilles PNG : un fichier, ou un zip ; ne rejette jamais

ExportResult  { blob: Blob | null; problems: readonly Problem[] }
RangeOptions  { from?: PlainDate; to?: PlainDate (exclusif ; par défaut ce qui est affiché) ; messages?: Partial<ExportMessages> }
ImageOptions  extends PageOptions { scale?: number (pixels d'appareil par pixel CSS, 2 par défaut, jusqu'à 4) ; messages? }
PageOptions   { view?: string; from?: PlainDate; to?: PlainDate; paper?: 'a4' | 'letter' | 'a3'; orientation?: 'portrait' | 'landscape' }
```

Briques de plus bas niveau, également exportées :

```text
occurrenceRows(snap, o: RowsOptions): OccurrenceRow[]    excelSerial(...)       // les lignes d'une feuille
toCSV(rows, words, separator), rowsTable(...), toXLSX(rows, words, { rtl }), zip(files), crc32(...)
pdfFromJpegs(pages: PdfPage[], { title }): Uint8Array
PAPER (tailles en points), sheetSize(paper, orientation) (pixels CSS), periodsFor(kernel, options), paintSheets(kernel, periods, o), MAX_PERIODS (60), MAX_SHEETS (300)
Pen, paintTimeGrid, paintDayGrid, dayGridLanes, paintList, paintTimeline, drawSheet, paintContext, readStyle, readFormat   // dessin en opérations de canvas
EXPORT_EN, EXPORT_FR, EXPORT_AR, EXPORT_ES, EXPORT_DE, exportMessagesFor(locale), defineExportLocale(lang, messages)
types : OccurrenceRow, RowsOptions, PdfPage, Paper, Orientation, PageOptions, PagePeriod, Op, Box, PaintStyle, PaintFormat, PaintContext, PageSlot, ExportMessages
```

```ts
import { createCalendar } from '@dzcalendar/dom';
import { Temporal } from '@dzcalendar/core';
import { download, downloadExport, exportICS, exportXLSX } from '@dzcalendar/pro/export';

const calendar = createCalendar(element, {
  timeZone: 'Europe/Paris',
  locale: 'fr',
  initialView: 'dayGridMonth',
  initialDate: Temporal.PlainDate.from('2026-10-21'),
  events: [{ id: 'a', title: 'Consultation', start: '2026-10-21T09:00[Europe/Paris]', duration: { minutes: 45 } }],
});

// Une feuille de ce qui est affiché, puis d'une plage choisie.
const shown = await exportXLSX(calendar);
const range = await exportICS(calendar, { from: Temporal.PlainDate.from('2026-10-01'), to: Temporal.PlainDate.from('2026-11-01'), name: 'Octobre' });
if (range.blob) download(range.blob, 'octobre.ics');
if (shown.problems.length > 0) console.warn(shown.problems);

// Ou fait et enregistré en un appel, comme le ferait un bouton.
const problems = await downloadExport(calendar, 'pdf', 'agenda.pdf', { paper: 'a4', orientation: 'landscape' });
console.log(problems.length);
```

#### `@dzcalendar/pro/print`

De vraies feuilles A4 / Letter / A3 dans le DOM : une copie du calendrier par période (une semaine, un jour, un mois ; N ressources d'une timeline par feuille), partageant son store (rien n'est rechargé), à la taille de la feuille, chacune avec le titre de la période et « n / sur », puis `window.print()`. Le texte est celui du navigateur, dans n'importe quelle écriture, sélectionnable dans « Enregistrer en PDF ». Une entrée invalide ne lève jamais : c'est un problème et rien n'est laissé derrière. Un travail d'impression par document : un second appel ferme le premier.

```text
printPages(cal: CalendarInstance, o?: PrintOptions): Promise<PrintJob>
PrintOptions extends PageOptions {
  rowsPerPage?: number              // une timeline de ressources : lignes par feuille ; par défaut ce que la hauteur de la feuille contient
  print?: boolean                   // false : les feuilles sont construites et vous sont laissées (job.close() les retire) ; pas de window.print()
  messages?: Partial<ExportMessages>
}
PrintJob { pages: readonly HTMLElement[]   // chacune un .dz-print__page
           problems: readonly Problem[]
           close(): void }          // détruit les copies, relâche les dates retenues ; appelé de lui-même après l'impression
periodsFor(kernel, options), sheetSize(paper, orientation)      // les mêmes que dans /export
type PageOptions, PagePeriod
```

```ts
import { Temporal } from '@dzcalendar/core';
import { createCalendar } from '@dzcalendar/dom';
import '@dzcalendar/pro';
import { printPages } from '@dzcalendar/pro/print';

const calendar = createCalendar(element, {
  timeZone: 'Europe/Paris',
  locale: 'fr',
  initialView: 'resourceTimelineWeek',
  initialDate: Temporal.PlainDate.from('2026-10-21'),
  resources: [
    { id: 'benali', title: 'Dr Benali' },
    { id: 'salle1', title: 'Salle 1' },
  ],
});

// Une semaine de la timeline sur des feuilles A4, 12 ressources au plus par feuille.
const job = await printPages(calendar, { paper: 'a4', rowsPerPage: 12 });
if (job.problems.length > 0) console.warn(job.problems);

// Sans imprimer : les feuilles sont à vous jusqu'à close().
const sheets = await printPages(calendar, { print: false });
console.log(sheets.pages.length);
sheets.close();
```

### Recettes

#### Le dernier statut d'un processus dans l'en-tête de sa ligne

Le store dit ce qui a changé (`kernel.subscribe`, événements `store`) ; l'application relit le résumé de chaque processus et redonne les ressources (`extendedProps`) seulement quand l'un diffère ; `hooks.resource.content` le dessine. La version complète est dans `playground/supervision.ts`.

```ts
import { createCalendar } from '@dzcalendar/dom';
import '@dzcalendar/pro';

interface Summary {
  readonly failures: number;
}

const processes = [{ id: 'import', title: 'Import des commandes' }, { id: 'billing', title: 'Facturation' }];
const calendar = createCalendar(element, {
  timeZone: 'Europe/Paris',
  locale: 'fr',
  initialView: 'resourceTimelineDay',
  resources: processes,
  hooks: {
    resource: {
      content: ({ resource }) => {
        const failures = (resource.extendedProps as Partial<Summary>).failures ?? 0;
        const box = document.createElement('div');
        box.textContent = failures > 0 ? `${resource.title} (${failures} échec${failures > 1 ? 's' : ''})` : resource.title;
        return box;
      },
    },
  },
});

let said = '';
function summarize(): void {
  const resources = processes.map((p) => {
    let failures = 0;
    for (const e of calendar.kernel.store.snapshot.allEvents()) if (e.resourceIds[0] === p.id && e.tone === 'red') failures++;
    return { ...p, extendedProps: { failures } satisfies Summary };
  });
  const text = JSON.stringify(resources);
  // Seulement quand l'un diffère : les en-têtes se redessinent, rien d'autre.
  if (text === said) return;
  said = text;
  calendar.update({ resources });
}

let queued = false;
calendar.kernel.subscribe((e) => {
  if (e.type !== 'store' || queued) return;
  queued = true;
  queueMicrotask(() => ((queued = false), summarize()));
});
summarize();
```

#### Une fenêtre de quatre heures qui glisse avec l'horloge

```ts
import { createCalendar } from '@dzcalendar/dom';
import '@dzcalendar/pro';

const calendar = createCalendar(element, {
  timeZone: 'Europe/Paris',
  initialView: 'resourceTimelineDay',
  resources: [{ id: 'import', title: 'Import des commandes' }],
  // Quatre heures remplissent la place, quelle que soit sa largeur ; le présent reste où il est.
  timeline: { slot: 15, span: { hours: 4 }, follow: { before: { minutes: 5 } } },
  nowRefresh: { seconds: 5 },
});

// Changer le span garde en place le moment du centre.
calendar.update({ timeline: { span: { hours: 12 }, slot: 30 } });
```

### Documentation

- [L'option `timeline`](https://plinthworks.github.io/dzcalendar/fr/options/timeline/)
- [`resources`](https://plinthworks.github.io/dzcalendar/fr/options/resources/), [`collapsedResources`](https://plinthworks.github.io/dzcalendar/fr/options/collapsed-resources/), [`collapsedGroups`](https://plinthworks.github.io/dzcalendar/fr/options/collapsed-groups/), [`resourceGroupField`](https://plinthworks.github.io/dzcalendar/fr/options/resource-group-field/), [`resourceOrder`](https://plinthworks.github.io/dzcalendar/fr/options/resource-order/), [`showUnassigned`](https://plinthworks.github.io/dzcalendar/fr/options/show-unassigned/)
- [`nowRefresh`](https://plinthworks.github.io/dzcalendar/fr/options/now-refresh/), [`forget`](https://plinthworks.github.io/dzcalendar/fr/options/forget/), [`onFollowChange`](https://plinthworks.github.io/dzcalendar/fr/options/on-follow-change/), [`viewOptions`](https://plinthworks.github.io/dzcalendar/fr/options/view-options/), [`views`](https://plinthworks.github.io/dzcalendar/fr/options/views/)
- [Ressources et timeline](https://plinthworks.github.io/dzcalendar/fr/guides/resources-timeline/), [l'éditeur](https://plinthworks.github.io/dzcalendar/fr/guides/editor/), [impression et export](https://plinthworks.github.io/dzcalendar/fr/guides/print-export/), [sources d'événements](https://plinthworks.github.io/dzcalendar/fr/guides/event-sources/), [fuseaux horaires](https://plinthworks.github.io/dzcalendar/fr/guides/time-zones/)
- [Toutes les options](https://plinthworks.github.io/dzcalendar/fr/options/)

### Licence

MIT
