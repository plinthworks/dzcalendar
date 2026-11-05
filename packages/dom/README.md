# @dzcalendar/dom

DzCalendar in plain DOM: `createCalendar(element, options)` draws a calendar, with no framework.

**English** · [Français](#français)

## What it is

`@dzcalendar/dom` is the calendar itself: the time grid and day grid views, drag, resize, selection, keyboard and touch, a context menu, "+N" panels, themes, locales and a motion hook. Every event keeps its own time zone, and days of 23 h, 25 h or 23 h 30 are drawn as they are. It is built on Temporal (through `@dzcalendar/core`); frameworks wrap it (`@dzcalendar/angular`, `react`, `vue`) and `@dzcalendar/element` offers it as a Web Component.

## Install

```bash
npm install @dzcalendar/core @dzcalendar/dom @dzcalendar/theme
```

- `@dzcalendar/core` is required: Temporal, the event store, the commands and the recurrence engine (`@dzcalendar/core/recurrence`, imported once for repeating events).
- `@dzcalendar/theme` is the optional stylesheet (`@dzcalendar/theme/dzcalendar.css`). Without it the calendar is drawn with the platform's colours; or use `look: 'none'` and draw it yourself.
- `@dzcalendar/motion-gsap` is optional (GSAP motion).

## Quick start

```html
<div id="agenda"></div>
```

```ts
import '@dzcalendar/theme/dzcalendar.css';
import { Temporal, loadTemporal } from '@dzcalendar/core';
import '@dzcalendar/core/recurrence'; // repeating events (rrule)
import { createCalendar } from '@dzcalendar/dom';

// At once where the browser has Temporal; Safari fetches its polyfill first.
await loadTemporal();

const calendar = createCalendar(document.getElementById('agenda')!, {
  timeZone: 'Europe/Paris', // the zone the calendar is drawn in
  locale: 'en-US',
  initialView: 'timeGridWeek',
  initialDate: Temporal.PlainDate.from('2026-10-21'),
  editable: true,
  selectable: true,
  events: [
    { id: 'a', title: 'Consultation', start: '2026-10-21T09:00[Europe/Paris]', duration: { minutes: 45 } },
    // Its own zone: drawn at 17:00 in Paris.
    { id: 'b', title: 'Call Chicago', start: '2026-10-22T10:00[America/Chicago]', duration: { hours: 1 } },
    { id: 'c', title: 'Day off', start: '2026-10-23', allDay: true },
    { id: 'w', title: 'Rounds', start: '2026-10-19T08:00[Europe/Paris]', duration: { hours: 2 }, rrule: 'FREQ=WEEKLY;BYDAY=MO,WE' },
  ],
  onEventClick: (instance) => console.log(instance.event.title),
  onSelect: (selection) => console.log(String(selection.start), String(selection.end)),
});

// Later: change only what is asked, draw once.
calendar.update({ view: 'dayGridMonth', theme: 'night', scheme: 'dark' });
```

Moments are Temporal values or ISO 8601 strings that carry an IANA zone (`2026-10-21T09:00[Europe/Paris]`). Bad event data never throws: it is left out and reported (`calendar.kernel.getProblems()`). An option the calendar cannot take (an unknown view or theme, a bad zone) throws a `RangeError` from `createCalendar` or `update` and changes nothing.

## Entries

| Import | What it gives |
|---|---|
| `@dzcalendar/dom` | `createCalendar` and everything of `/base`, with the time grid and day grid views registered. |
| `@dzcalendar/dom/base` | The same without any view: add the ones you use (`/timegrid`, `/daygrid`, `/list`, `/multimonth`). |
| `@dzcalendar/dom/timegrid` | Registers the time grid views (`timeGridWeek`, `timeGridDay`, resource columns). Already in the main entry. |
| `@dzcalendar/dom/daygrid` | Registers the day grid views (`dayGridMonth`, `dayGridWeek`…) and exports `createDayGridView`. Already in the main entry. |
| `@dzcalendar/dom/list` | Registers the list views (`listDay`, `listWeek`, `listMonth`, `listYear`); exports `LIST_CSS`. |
| `@dzcalendar/dom/multimonth` | Registers the multi-month view (`multiMonthYear`); exports `MULTIMONTH_CSS`. |
| `@dzcalendar/dom/custom` | `defineView`: a view of your own from a render function. |
| `@dzcalendar/dom/drag` | `makeDraggable`: an element of the page that can be dropped on a calendar. |
| `@dzcalendar/dom/toolkit` | What a view family is built with (`registerView`, `h`, `KeyedList`, `ensureStyles`…): a plugin API. |
| `@dzcalendar/dom/locales/ar`, `/es`, `/de` | The calendar's words in Arabic, Spanish, German (see Messages and locales). |

```ts
import { createCalendar } from '@dzcalendar/dom/base';
import '@dzcalendar/dom/timegrid';
import '@dzcalendar/dom/list';
import '@dzcalendar/dom/multimonth';

createCalendar(element, { initialView: 'listWeek', headerViews: ['timeGridWeek', 'listWeek', 'multiMonthYear'] });
```

A view whose entry was not imported fails with a message that names the import to add.

## API

### Main entry (`@dzcalendar/dom`, `@dzcalendar/dom/base`)

```text
createCalendar(host: HTMLElement, options?: CalendarOptions): CalendarInstance

types:  CalendarOptions, CalendarInstance, CalendarUpdate, LiveSettings, DateClick, EventChange,
        EventLeave, DropInfo, CalendarProblem, CustomButton, HeaderToolbar, DzMessages, ProblemWords,
        ThemeTokens, ThemeColor, ThemeName, MotionAdapter, MotionChange, MotionSide, MotionEnter,
        ViewController, ViewCtx, ViewFactory, CalendarHooks, EventHooks, ElementHooks, EventContentCtx,
        ResourceHooks, ResourceContentCtx, ContextMenuCtx, MenuHook, ScopeRequest, DayHeaderHooks,
        the per-element hook contexts (DayCellCtx, DayHeaderCtx, SlotLabelCtx… see Render hooks),
        DateFormatArg, EventTimeFormatArg, EventTimeRangeFormatArg, FormatSpec, Formats, MonthFormatArg,
        TimeFormatArg, WeekFormatArg, InteractionSurface, KeyboardSurface, Box

words and locales:  EN, FR, defineLocale(code, messages), messagesForLocale(locale)
themes:             defineTheme(name, tokens), themeCss(name), THEME_NAMES
styles:             DZ_CSS, ensureStyles, lookGuardedCss(css)
motion:             NO_MOTION, WAAPI_MOTION, createWaapiMotion()
views:              registerView(spec/family), hasRenderer(family)
```

### `@dzcalendar/dom/custom`

```text
defineView(def: CustomViewDef): ViewSpec
types: CustomViewDef, CustomViewData, CustomViewApi
```

### `@dzcalendar/dom/drag`

```text
makeDraggable(el: HTMLElement, spec: DraggableSpec): () => void   // returns the clean-up
interface DraggableSpec { event: EventInput | (() => EventInput); data?: unknown; create?: boolean }
```

### `@dzcalendar/dom/toolkit`

```text
registerView, scrollEased, ensureStyles, deferredCalendar, KeyedList, h, contentsHost, attachMenuTriggers,
timeLabels, startReadingOf, applyEventLook, dayStates, drawNow, moreText, fillEvent, unmountEvent,
timedContent, formatMinutes, RowWindow, onScrollFrame, NodePool, altDate, resourceName, noResourcesNote,
decorate, holder, undecorate, undecorateAll, lookGuardedCss, weekWords, written, anyTarget, heldOn, holdOn,
targetAt, TEMPLATE_ELEMENTS, templateClass, templateHooks, templateShape, handles, mayDelete, mayMove,
mayResize, activeIn, targetOf
types: ViewController, ViewCtx, ViewFactory, EventContentCtx, InteractionSurface, KeyboardSurface, Box,
       DzMessages, Keyed, Changed, ResolveTarget, TimeLabels, Carried, DropTarget, PageHold, TemplateElement,
       TemplateSource, ResourceContentCtx, ResourceHooks
```

The toolkit is for building view families and framework wrappers; it is versioned with the main entry but is not what an application usually needs. A view of your own is simpler with `defineView`:

```ts
import { createCalendar } from '@dzcalendar/dom';
import { defineView } from '@dzcalendar/dom/custom';

const agenda = defineView({
  type: 'agenda',
  duration: { days: 3 },
  render(el, data) {
    // Drawn again on every change; `el` is kept.
    el.textContent = `${data.instances.length} event(s) in ${data.zone}`;
  },
});

createCalendar(element, { views: { agenda }, initialView: 'agenda', headerViews: ['agenda', 'dayGridMonth'] });
```

`makeDraggable` makes a page element droppable on a calendar that has `droppable`:

```ts
import { createCalendar } from '@dzcalendar/dom';
import { makeDraggable } from '@dzcalendar/dom/drag';

const stop = makeDraggable(element, {
  event: { title: 'Follow-up', duration: { minutes: 30 } },
  data: { patientId: 42 }, // given back to onDrop
});

createCalendar(document.body, {
  editable: true,
  droppable: true,
  onDrop: (drop) => console.log(drop.data, String(drop.date), drop.allDay),
});

stop(); // nothing is left on the element
```

A pointer drags it (a finger holds 300 ms first); the keyboard picks it up with Enter, Tab reaches a calendar, the arrows move, Enter puts it down, Escape cancels.

## `createCalendar` options

Every option is optional. *Live* options can also be given to `update()`; those marked *(creation only)* are read when the calendar is made. `createCalendar` accepts `Partial<KernelOptions>` (core's options, such as `events`, `timeZone`, `businessHours`) and the DOM's own settings; the option facts are generated from the types (`website/src/generated/options.json`). Each option has a page at `https://plinthworks.github.io/dzcalendar/options/<name-in-kebab-case>/`.

### Data and rules

| Option | Type | What it does |
|---|---|---|
| `events` | `EventInput[]` | Events, loaded as an array source named "events". |
| `sources` | `EventSourceSpec[]` | Sources fetched as the calendar moves (function, URL, feed…); the whole list, sources gone are removed. |
| `resources` | `ResourceInput[]` | What the resource views show as columns (a timeline: rows). |
| `store` | `EventStore` | A store to share: several calendars (several zones) on one store show the same events. *(creation only)* |
| `kernel` | `CalendarKernel` | A kernel built elsewhere (shared store, tests); otherwise one is made from the options. *(creation only)* |
| `rules` | `RulesContext` | What edits are checked against (constraint, overlap, allow, valid range); business hours come from `businessHours`. |
| `businessHours` | `BusinessHoursInput` | Opening hours: shaded outside in the time grid and checked by `rules`. A rule, several, `true` (Monday-Friday 09:00-17:00) or `false`. |
| `availableSlots` | `AvailableSlot[] \| null` | Bookable slots drawn in the time grid (compared by identity: a new array redraws). |
| `forget` | `{ olderThan } \| null` | Each minute, events that ended more than `olderThan` ago leave the calendar (not its undo); for screens left open for weeks. |
| `historyLimit` | `number` | Undo entries kept. Default 200. *(creation only)* |

### Time, place and views

| Option | Type | What it does |
|---|---|---|
| `timeZone` | `ZoneId` | The zone the calendar is drawn in. Default: the browser's (a `zone-from-browser` problem says so). |
| `locale` | `string` | BCP 47 tag: dates, numbers, the calendar's words, first day, reading direction. Default: the page's language. |
| `firstDay` | `Weekday` | First day of the week (ISO, Monday = 1). Default: the locale's. |
| `hiddenDays` | `Weekday[]` | Weekdays no view shows (ISO; 6 and 7 for the weekend). |
| `weekends` | `boolean` | False hides Saturday and Sunday. Default true. |
| `weekNumbers` | `boolean` | A number per week (month rows, week corner). Default false. |
| `displayCalendar` | `string \| null` | The calendar dates are written in (`islamic-umalqura`, `persian`…; Intl's names). Data and grids stay Gregorian. Default: the locale's. |
| `secondaryCalendar` | `string \| null` | A second calendar shown beside the dates. Default none. |
| `initialDate` | `PlainDate` | The date shown first. Default: today in `timeZone`. *(creation only)* |
| `initialView` | `string` | The view shown first (`timeGridWeek`, `dayGridMonth`…). Default `timeGridWeek`; with `/base`, the first family imported of time grid, day grid, list, year. *(creation only)* |
| `views` | `Record<string, ViewSpec \| ViewSettings>` | Views added to (and overriding) the built-in ones: a whole spec (`defineView`) or settings. *(creation only)* |
| `viewOptions` | `Record<string, unknown>` | Options of a plugin's views, by family. |

### Header and formats

| Option | Type | What it does |
|---|---|---|
| `headerToolbar` | `HeaderToolbar \| false` | `{ start, center, end }`: what the header holds (`'prev,next today'`: a space between groups, a comma inside one); false: no header. |
| `headerViews` | `string[]` | The view switcher's buttons. Default: month, week, day. |
| `customButtons` | `Record<string, CustomButton>` | The application's buttons (`text`, `hint`, `icon`, `click`, `active`), named in `headerToolbar`. |
| `headerItems` | `Record<string, ElementHooks<HeaderItemCtx>>` | The application's places in the header (a menu, a filter, a badge), named in `headerToolbar`. |
| `titleFormat` | `TitleFormat` | How the title is written. Default: the month, a week's days, a day in full. *(creation only; later `formats.title`)* |
| `formats` | `Formats` | How each place is written: `title`, `dayHeader`, `dayCell`, `slotLabel`, `eventTime`, `eventTimeRange`, `listDay`, `listDaySide`, `monthHeader`, `morePopover`, `weekNumber` (Intl options or a function; `weekNumber` a function only). |

### Grids, timeline and performance

| Option | Type | What it does |
|---|---|---|
| `allDaySlot` | `boolean` | The time grid's all-day row; false: none. Default true. |
| `scrollTime` | `DurationLike` | Where the time grid is scrolled to on first paint (given to `update`: when a view is next shown). Default `PT8H`. |
| `snapMinutes` | `number` | Minutes gestures and context-menu moments snap to. Default 15. |
| `timeGrid` | `TimeGridOptions` | The time grid's own options (axis, slot minutes, label minutes…), merged key by key. |
| `eventMaxStack` | `number \| 'auto' \| null` | Overlapping events side by side before "+N". Default `'auto'`; null: all. |
| `dayMaxLanes` | `number \| 'auto' \| null` | Lanes a month day shows before "+N"; null: every event. Default null in a month, `'auto'` in a year. |
| `multiMonthMaxColumns` | `number` | Months side by side at most in a multi-month view (1: a stack). Default 3. |
| `displayEventTime` | `boolean` | An event's time beside its title. Default true. |
| `nowIndicator` | `boolean` | The line at the current time. Default true. |
| `nowRefresh` | `DurationLike` | How often the now line moves (a second to an hour). Default a minute. |
| `timeline` | `{ slot, maxLanes, fillLanes, … }` | A timeline's scale and rows (read by the Pro family). |
| `collapsedResources` | `string[]` | Timeline rows: resources (by id) whose children are hidden. |
| `collapsedGroups` | `string[]` | Timeline rows: groups (by `resourceGroupField` value) shut. |
| `resourceGroupField` | `string` | Resource views group their columns (a timeline its rows) by this field. |
| `resourceOrder` | `ResourceOrder` | How sibling resources are ordered after their `order`: field names (`'-title'` descending) or a comparison. |
| `showUnassigned` | `boolean` | Adds an "Unassigned" column (a timeline: a row) for events on no known resource. Default false. |
| `virtualizeAbove` | `number` | Above this many events in a view only what is on screen is mounted. Default 500; `Infinity` never windows. *(creation only)* |

### Interaction

| Option | Type | What it does |
|---|---|---|
| `editable` | `boolean` | Events can be dragged and resized; the context menu offers editing. Default false. |
| `selectable` | `boolean` | Dragging across empty time selects it (`onSelect`). Default false. |
| `eventResizableFromStart` | `boolean` | Events can be resized from their start too. Default false. |
| `dragEdgeNavigate` | `boolean` | Holding a dragged event at the side goes to the previous/next period. Default true. |
| `droppable` | `boolean \| (data) => boolean` | What may be dropped here from the page (`makeDraggable`) or another calendar. Default false. |
| `keyboardUndo` | `boolean` | Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z (or Ctrl/Cmd+Y) undo and redo inside an `editable` calendar. Default true. |
| `contextMenu` | `MenuHook` | Keep, reorder, add to or replace the context menu's entries; null or `[]` leaves the browser's menu. |
| `chooseScope` | `(request) => EditScope \| null` | A gesture on an occurrence of a series: how far it reaches; resolve null to cancel. Default: a "this / following / all" menu. |
| `autoPrint` | `boolean` | Prepares for printing on `beforeprint` and restores on `afterprint`. Default false. *(creation only)* |

### Look, words and motion

| Option | Type | What it does |
|---|---|---|
| `theme` | `string` | A family (`standard`, `slate`, `night`, `pastel`, `frost`, `solar`, `contrast`) or one made with `defineTheme`. Default `standard`. |
| `scheme` | `'auto' \| 'light' \| 'dark'` | Light, dark, or the page's. Default `auto`. |
| `density` | `'compact' \| 'comfortable' \| 'spacious'` | Default `comfortable`. |
| `eventStyle` | `'tinted' \| 'solid'` | Events tinted with their tone's edge (default) or filled blocks of their tone. |
| `look` | `'styled' \| 'none'` | `none`: structure only, every colour, border, shadow and type yours. Default `styled`. |
| `cssLayers` | `boolean` | The CSS in cascade layers (default true: a page rule outside a layer wins). False for a page whose reset is unlayered (Tailwind 3, Bootstrap). *(creation only)* |
| `injectStyles` | `boolean` | False under a CSP without inline styles: include `DZ_CSS` yourself. Default true. *(creation only)* |
| `hooks` | `CalendarHooks` | The calendar's elements made the application's: classes, content and mounts per element (see Render hooks). |
| `messages` | `Partial<DzMessages>` | Any of the calendar's words, over the locale's. |
| `motion` | `MotionAdapter` | The motion adapter (`createGsapMotion()`, `NO_MOTION`, your own). Default: the built-in WAAPI base. |

### Callbacks

| Option | Type | What it does |
|---|---|---|
| `onSelect` | `(selection) => void` | A selection was made (`selectable`). |
| `onUnselect` | `() => void` | The selection shown went away (not when the application cleared it). |
| `onDateClick` | `(click: DateClick) => void` | A day or a moment was clicked. |
| `onEventClick` | `(instance) => void` | An event was clicked. |
| `onEventOpen` | `(instance) => void` | "Open" from the context menu (offered only when given). |
| `onCreateRequest` | `(request) => void` | "New event here" from the context menu: open your own editor (offered only when given). |
| `onSlotClick` | `(slot: AvailableSlot) => void` | A free slot of `availableSlots` was clicked; the calendar creates nothing, the application books it. |
| `onEventChange` | `(change: EventChange) => void` | After a person's change: persist it, and `revert()` it if the server refuses. |
| `onEventReceive` | `(change: EventChange) => void` | An event came in (dropped from the page or another calendar); `revert()` takes it back. |
| `onEventLeave` | `(leave: EventLeave) => void` | An event of this calendar was dropped on another one; `revert()` puts it back on both. |
| `onDrop` | `(drop: DropInfo) => void` | An element of the page was dropped and its event made. |
| `onCommandRefused` | `(result, command) => void` | A command from the calendar's UI was refused: why (problems, rule violations). |
| `onProposalRefused` | `(proposal) => void` | A gesture dropped where the rules refuse it. |
| `onFollowChange` | `(following: boolean) => void` | A timeline following the present paused, or took it up again. |
| `onResourceToggle` | `(state) => void` | A resource or group was folded or unfolded: the state to keep. |
| `onResourceProblems` | `(problems) => void` | What the resources given could not be read as. |
| `onProblem` | `(problem: CalendarProblem) => void` | Something the calendar could not do as asked; without it, said once per code on the console. |
| `onSource` | `(notice: SourceNotice) => void` | Loading, fetch errors, problems in a delivery, saves refused. *(creation only)* |

## The `CalendarInstance`

`createCalendar` returns:

| Member | What it does |
|---|---|
| `ready: Promise<void>` | Resolved once drawn: at once where Temporal is native, after its polyfill on Safari. Until then `update`, `navigate`, `select`, `refetch`, `onDestroy` and `destroy` wait in line, `run`/`undo`/`redo` refuse, and reading `kernel` throws. Rejected with the `RangeError` of an option it could not take. |
| `kernel: CalendarKernel` | The core kernel: state, store, sources, problems, `setEvents`, `setResources`, `subscribe`. |
| `element: HTMLElement` | The calendar's root (`.dz-cal`). |
| `update(changes: CalendarUpdate)` | Changes what was asked and nothing else, draws once; an equal value is a no-op (no flicker, scroll and focus kept). Takes the view (`view`), the date (`date`) and every live option. |
| `navigate('prev' \| 'next' \| 'today')` | Moves the period (a timeline with `timeline.step` slides by it; `today` takes up following the present). |
| `shift(by: DurationLike): boolean` | Slides a timeline by a duration (`{ minutes: -15 }`); false when the view does not slide. |
| `run(cmd, opts?)` | Runs a command through the history (undoable); `{ validate: true }` checks it against the rules as a gesture would be. Returns `{ ok, problems… }`, never throws. |
| `undo()`, `redo()` | Step through the history; false when there is nothing to do. |
| `refetch(sourceId?)` | Fetches one source again, or all; what is shown stays until the answers replace it. |
| `preparePrint()` | Draws everything now, nothing windowed; returns the function that puts the windowing back. |
| `select(selection \| null)` | Shows a selection (null clears it) as if a person made it; `onSelect` is not called. |
| `onDestroy(fn)` | Runs `fn` when the calendar is destroyed; returns the way to take it back. |
| `motion: MotionAdapter` | The motion in force. |
| `getOptions(): CalendarOptions` | The options in force (what was given with every `update` laid over it); what a copy is made from. |
| `destroy()` | Removes the calendar and everything it listens to. |

```ts
import { createCalendar } from '@dzcalendar/dom';

const calendar = createCalendar(element, { timeZone: 'Europe/Paris', editable: true });

const result = calendar.run({ type: 'event.create', event: { id: 'x', title: 'Visit', start: '2026-10-21T09:00[Europe/Paris]', duration: { minutes: 30 } } });
if (!result.ok) console.log(result.problems);

calendar.undo();
calendar.navigate('next');
calendar.update({ timeZone: 'America/Chicago' });
calendar.destroy();
```

The commands are `event.create`, `event.update`, `event.move`, `event.resize`, `event.delete`, `series.delete`, `series.split`, `series.rule`, `event.repeat` and `batch`. A person's drag, resize or menu choice runs the same commands.

## Callbacks

The `on…` options above are the calendar's callbacks. Persisting an edit and refusing it afterwards:

```ts
import { createCalendar } from '@dzcalendar/dom';

createCalendar(element, {
  editable: true,
  onEventChange: async (change) => {
    const ok = await fetch('/api/events', { method: 'POST', body: JSON.stringify(change.after) }).then((r) => r.ok);
    if (!ok) change.revert(); // takes back exactly this change
  },
  onProblem: (problem) => console.warn(problem.code, problem.detail),
});
```

`onEventOpen`, `onCreateRequest` and `onSlotClick` change what is offered on screen: "Open" and "New event here" exist only when their callback is given, and free slots can be clicked only with `onSlotClick` (without it they only show the free time, `aria-disabled`).

## Render hooks

`hooks` makes the calendar's own elements yours. Each element takes `class` (a string, a list or a function of its context), `content` (a function of its context returning a string or a node in place of ours; null keeps ours), `didMount` (once in the page; may return its clean-up) and `willUnmount`.

| Hook | Element |
|---|---|
| `event` | An event, in every view (context: `instance`, `segment`, `timeText`, `displayZone`, `family`, `background`). |
| `resource` | A resource's head (a column's, a timeline row's). |
| `dayHeader`, `dayCell`, `dayLane` | A day's head, a month cell, a time grid column. |
| `slotLabel`, `slotLane` | An hour label of the gutter; a slot's row (drawn only when the hook is given). |
| `allDayLabel`, `moreLink`, `morePopover`, `nowIndicator`, `weekNumber` | The all-day label, "+N", its panel, the now line, a week number. |
| `noEvents`, `listDayHeader`, `monthHeader`, `view` | The list's empty state, a list day's heading, a multi-month month's title, the view's root. |
| `resourceLane`, `resourceGroupHeader`, `resourceGroupLane`, `resourceAreaHeader` | Timeline rows, groups and the resource column head. |

```ts
import { createCalendar } from '@dzcalendar/dom';

createCalendar(element, {
  hooks: {
    event: {
      class: (ctx) => (ctx.timeText ? 'has-time' : null),
      content: (ctx) => {
        const b = document.createElement('b');
        b.textContent = ctx.instance.event.title;
        return b;
      },
    },
    dayCell: { class: (ctx) => (ctx.today ? 'is-today' : null) },
  },
});
```

## Messages and locales

English and French words are built in (`EN`, `FR`). Dates, months, weekdays and numbers are written by `Intl` for every locale; only the calendar's own words ("Today", "+3 more", menus, what a screen reader hears) come in bundles. Arabic, Spanish and German are one import each, registered for every locale of the language (`ar` also turns the calendar right to left from the locale). `defineLocale` registers a complete set; `messages` overrides single words on one calendar.

```ts
import { EN, createCalendar, defineLocale, messagesForLocale } from '@dzcalendar/dom';
import '@dzcalendar/dom/locales/es'; // also: …/locales/ar, …/locales/de

// A language of your own: a complete DzMessages, here English with one word changed.
defineLocale('pt', { ...EN, today: 'Hoje' });

createCalendar(element, { locale: 'es-ES', timeZone: 'Europe/Madrid' });
createCalendar(element, { locale: 'en-GB', messages: { today: 'Now' } });

console.log(messagesForLocale('pt-BR').today); // "Hoje": the exact tag, then the language, else English
```

Each locale entry also exports its words: `messagesAr(locale?)` and `AR`, `messagesEs(locale?)` and `ES`, `messagesDe(locale?)` and `DE`.

## Styling contract

The calendar is styled by **parts** (classes `dz-…`), **states** (`data-*` attributes) and **tokens** (custom properties `--dz-…`), all in the cascade layers `dzcalendar.base` and `dzcalendar.theme`. A part or token renamed or removed is a major version; one added is a minor. The full list is in `docs/styling.md` of the repository, and a test fails when the code and that page disagree. Six ways to change it, lightest first:

1. Tokens: `.agenda { --dz-accent: #0f766e; --dz-radius: 10px; }`.
2. Your own rules: any rule outside a cascade layer wins whatever its specificity.
3. States: `[data-today]`, `[data-past]`… (Tailwind: `data-[today]:bg-emerald-50`).
4. Classes on any part: `hooks.<element>.class`.
5. Your own content: `hooks.<element>.content`.
6. No look at all: `look: 'none'` keeps the structure and drops every colour, border, shadow and font.

```css
.agenda {
  --dz-accent: #0f766e;
  --dz-radius: 10px;
  --dz-height: 48rem;
}
.dz-ev[data-tone='red'] { font-weight: 600; }
.dz-dg__cell[data-today] { outline: 2px solid var(--dz-accent); }
```

Main states: a day (`.dz-dg__cell`, `.dz-tg__col`, `.dz-tg__dayhead`, `.dz-list__day`) has `data-date`, `data-weekday` (ISO, Monday 1), `data-today`, `data-past`, `data-future`, `data-outside`, `data-closed`; an event (`.dz-ev`, `.dz-bar`, `.dz-list__ev`, `.dz-tl__ev`) has `data-event-id`, `data-series-id`, `data-tone`, `data-all-day`, `data-background`; the calendar (`.dz-cal`) has `data-view`, `data-dz-theme`, `data-dz-scheme`, `data-dz-density`, `data-dz-event-style`, `data-dz-look`, `data-editable`, `data-loading`; a view's surface has `data-dragging`, `data-selecting`, `data-grabbing`, `data-dropping`; header buttons have `aria-pressed`. `data-theme="dark"` on an ancestor is read as the scheme when `scheme` is `'auto'`; `data-dz-keep-selection` on an element keeps the selection on a press.

Main parts: `.dz-cal`, `.dz-toolbar` (`__section`, `__group`, `__btn`, `__title`), `.dz-ev` and `.dz-bar` (events), `.dz-more` ("+N"), `.dz-tg` (time grid: `__head`, `__dayhead`, `__gutter`, `__col`, `__allday`, `.dz-now`, `.dz-band--gap`, `.dz-band--repeat`), `.dz-dg` (day grid and month: `__week`, `__cell`, `__num`), `.dz-mm` (year), `.dz-list`, `.dz-tl` (timeline), `.dz-pop`, `.dz-menu`, `.dz-ghost`, `.dz-editor`, `.dz-custom`, `.dz-draggable`.

Tokens you set: `--dz-bg`, `--dz-bg-raised`, `--dz-fg`, `--dz-fg-muted`, `--dz-border`, `--dz-accent`, `--dz-accent-fg`, `--dz-danger`, `--dz-warning`, `--dz-radius`, `--dz-event-radius`, `--dz-font`; the header's (`--dz-title-size`, `--dz-button-*`); events (`--dz-event-bg`, `--dz-event-fg`, `--dz-event-tint`, `--dz-event-shade`, `--dz-on-tone`, `--dz-tone-<name>`); grid (`--dz-line`, `--dz-today-bg`, `--dz-outside-bg`, `--dz-off-bg`, `--dz-now`, `--dz-gap-stripe`, `--dz-repeat-bg`); free slots (`--dz-slot-*`); sizes (`--dz-minute`, `--dz-bar-height`, `--dz-gutter-width`, `--dz-day-head`, `--dz-week-min`, `--dz-allday-max`, `--dz-height`, `--dz-target-min`). The `--dzc-…` and `--dzp-…` properties are the theme's private palette: set the `--dz-…` ones. A timed event is a size container: put a `position: fixed` tooltip in `body`, not inside it.

Under a CSP without inline styles, set `injectStyles: false` and include `DZ_CSS` (and `LIST_CSS`, `MULTIMONTH_CSS`, `themeCss(name)`) yourself; for an unstyled calendar wrap them with `lookGuardedCss`.

## Themes

Seven ready-made families, from `@dzcalendar/theme`: `standard`, `slate`, `night`, `pastel`, `frost`, `solar`, `contrast` (`theme: 'night'`). `scheme` is `'auto'` (the page's), `'light'` or `'dark'`; `density` is `'compact'`, `'comfortable'` or `'spacious'`; `eventStyle` is `'tinted'` or `'solid'`. Your own family:

```ts
import { createCalendar, defineTheme } from '@dzcalendar/dom';

// A colour is one value, or a [light, dark] pair that follows the scheme.
defineTheme('clinic', {
  accent: ['#0a7d5a', '#3ddc97'],
  radius: '8px',
  tones: { brand: ['#0a7d5a', '#3ddc97'] },
});

createCalendar(element, {
  theme: 'clinic',
  events: [{ id: 'a', title: 'Consultation', start: '2026-10-21T09:00[Europe/Paris]', tone: 'brand' }],
});
```

`ThemeTokens` takes `bg`, `bgRaised`, `fg`, `fgMuted`, `border`, `accent`, `accentFg`, `danger`, `warning`, `radius`, `font`, `todayBg`, `now`, `eventBg`, `eventFg`, `eventAccent` and `tones`; a left-out token keeps the standard family's value. A name is lowercase letters, digits and dashes, and cannot be a ready-made family's. See `@dzcalendar/theme` for the stylesheet, its Sass API and the Tailwind files.

## Motion

By default a light Web Animations base moves the calendar (the period slides, events and menus fade in). `motion: NO_MOTION` turns everything off; `motion: createGsapMotion()` (`@dzcalendar/motion-gsap`) adds the full set; your own `MotionAdapter` can implement any of `beforeChange`, `afterChange`, `titleChange`, `nowTick`, `viewChange`, `eventsEnter`, `eventsLeave`, `wantsLeave`, `seatsChange`, `scroll`, `stopScroll`, `dragStart`, `dropRejected`, `captureLayout`, `animateLayout`, `dropSettle`, `overlayOpen`, `overlayClose`, `destroy`. Adapters must honour `prefers-reduced-motion`.

```ts
import { NO_MOTION, createCalendar } from '@dzcalendar/dom';

const calendar = createCalendar(element, { motion: NO_MOTION });
calendar.update({ motion: { destroy: () => console.log('swapped out') } });
```

## Documentation

- [Getting started: vanilla JavaScript](https://plinthworks.github.io/dzcalendar/getting-started/vanilla/), [installation](https://plinthworks.github.io/dzcalendar/getting-started/installation/)
- [All options](https://plinthworks.github.io/dzcalendar/options/), each at `https://plinthworks.github.io/dzcalendar/options/<option-in-kebab-case>/`, for example [`initialView`](https://plinthworks.github.io/dzcalendar/options/initial-view/) and [`onEventClick`](https://plinthworks.github.io/dzcalendar/options/on-event-click/)
- [Views](https://plinthworks.github.io/dzcalendar/guides/views/)
- [Events](https://plinthworks.github.io/dzcalendar/guides/events/)
- [Time zones](https://plinthworks.github.io/dzcalendar/guides/time-zones/)
- [Recurrence](https://plinthworks.github.io/dzcalendar/guides/recurrence/)
- [Event sources](https://plinthworks.github.io/dzcalendar/guides/event-sources/)
- [Selection](https://plinthworks.github.io/dzcalendar/guides/selection/)
- [Drag and drop](https://plinthworks.github.io/dzcalendar/guides/drag-and-drop/)
- [Keyboard and accessibility](https://plinthworks.github.io/dzcalendar/guides/keyboard-accessibility/)
- [Languages](https://plinthworks.github.io/dzcalendar/guides/languages/)
- [Theming](https://plinthworks.github.io/dzcalendar/guides/theming/)
- [Tailwind](https://plinthworks.github.io/dzcalendar/guides/tailwind/)
- [Unstyled calendar](https://plinthworks.github.io/dzcalendar/guides/unstyled/)
- [Resources and timeline](https://plinthworks.github.io/dzcalendar/guides/resources-timeline/)
- [Editor](https://plinthworks.github.io/dzcalendar/guides/editor/)
- [Print and export](https://plinthworks.github.io/dzcalendar/guides/print-export/)
- [Migrating from FullCalendar](https://plinthworks.github.io/dzcalendar/getting-started/migrating-from-fullcalendar/)

## License

MIT

## Français

DzCalendar en DOM pur : `createCalendar(element, options)` dessine un calendrier, sans framework.

### Présentation

`@dzcalendar/dom` est le calendrier lui-même : les vues en grille horaire et en grille de jours, le glisser, le redimensionnement, la sélection, le clavier et le tactile, un menu contextuel, les panneaux « +N », les thèmes, les locales et un point d'entrée pour le mouvement. Chaque événement garde son propre fuseau horaire, et les jours de 23 h, 25 h ou 23 h 30 sont dessinés tels quels. Il repose sur Temporal (via `@dzcalendar/core`) ; les frameworks l'enveloppent (`@dzcalendar/angular`, `react`, `vue`) et `@dzcalendar/element` l'offre en Web Component.

### Installation

```bash
npm install @dzcalendar/core @dzcalendar/dom @dzcalendar/theme
```

- `@dzcalendar/core` est obligatoire : Temporal, le store d'événements, les commandes et le moteur de récurrence (`@dzcalendar/core/recurrence`, importé une fois pour les événements récurrents).
- `@dzcalendar/theme` est la feuille de style optionnelle (`@dzcalendar/theme/dzcalendar.css`). Sans elle, le calendrier utilise les couleurs de la plateforme ; ou utilisez `look: 'none'` et dessinez-le vous-même.
- `@dzcalendar/motion-gsap` est optionnel (mouvement GSAP).

### Démarrage rapide

```html
<div id="agenda"></div>
```

```ts
import '@dzcalendar/theme/dzcalendar.css';
import { Temporal, loadTemporal } from '@dzcalendar/core';
import '@dzcalendar/core/recurrence'; // événements récurrents (rrule)
import { createCalendar } from '@dzcalendar/dom';

// Aussitôt là où le navigateur a Temporal ; Safari charge d'abord son polyfill.
await loadTemporal();

const calendar = createCalendar(document.getElementById('agenda')!, {
  timeZone: 'Europe/Paris', // le fuseau dans lequel le calendrier est dessiné
  locale: 'fr-FR',
  initialView: 'timeGridWeek',
  initialDate: Temporal.PlainDate.from('2026-10-21'),
  editable: true,
  selectable: true,
  events: [
    { id: 'a', title: 'Consultation', start: '2026-10-21T09:00[Europe/Paris]', duration: { minutes: 45 } },
    // Son propre fuseau : dessiné à 17 h à Paris.
    { id: 'b', title: 'Appel Chicago', start: '2026-10-22T10:00[America/Chicago]', duration: { hours: 1 } },
    { id: 'c', title: 'Jour de congé', start: '2026-10-23', allDay: true },
    { id: 'w', title: 'Tournée', start: '2026-10-19T08:00[Europe/Paris]', duration: { hours: 2 }, rrule: 'FREQ=WEEKLY;BYDAY=MO,WE' },
  ],
  onEventClick: (instance) => console.log(instance.event.title),
  onSelect: (selection) => console.log(String(selection.start), String(selection.end)),
});

// Plus tard : ne change que ce qui est demandé, dessine une seule fois.
calendar.update({ view: 'dayGridMonth', theme: 'night', scheme: 'dark' });
```

Les moments sont des valeurs Temporal ou des chaînes ISO 8601 portant un fuseau IANA (`2026-10-21T09:00[Europe/Paris]`). Une donnée d'événement invalide ne lève jamais d'exception : elle est écartée et signalée (`calendar.kernel.getProblems()`). Une option que le calendrier ne peut pas prendre (vue ou thème inconnu, fuseau invalide) lève une `RangeError` depuis `createCalendar` ou `update` et ne change rien.

### Points d'entrée

| Import | Ce qu'il apporte |
|---|---|
| `@dzcalendar/dom` | `createCalendar` et tout `/base`, avec les vues grille horaire et grille de jours enregistrées. |
| `@dzcalendar/dom/base` | La même chose sans aucune vue : ajoutez celles que vous utilisez (`/timegrid`, `/daygrid`, `/list`, `/multimonth`). |
| `@dzcalendar/dom/timegrid` | Enregistre les vues en grille horaire (`timeGridWeek`, `timeGridDay`, colonnes de ressources). Déjà dans l'entrée principale. |
| `@dzcalendar/dom/daygrid` | Enregistre les vues en grille de jours (`dayGridMonth`, `dayGridWeek`…) et exporte `createDayGridView`. Déjà dans l'entrée principale. |
| `@dzcalendar/dom/list` | Enregistre les vues liste (`listDay`, `listWeek`, `listMonth`, `listYear`) ; exporte `LIST_CSS`. |
| `@dzcalendar/dom/multimonth` | Enregistre la vue multi-mois (`multiMonthYear`) ; exporte `MULTIMONTH_CSS`. |
| `@dzcalendar/dom/custom` | `defineView` : une vue à vous à partir d'une fonction de rendu. |
| `@dzcalendar/dom/drag` | `makeDraggable` : un élément de la page que l'on peut déposer sur un calendrier. |
| `@dzcalendar/dom/toolkit` | Ce avec quoi on construit une famille de vues (`registerView`, `h`, `KeyedList`, `ensureStyles`…) : une API de plugin. |
| `@dzcalendar/dom/locales/ar`, `/es`, `/de` | Les mots du calendrier en arabe, espagnol, allemand (voir Messages et locales). |

```ts
import { createCalendar } from '@dzcalendar/dom/base';
import '@dzcalendar/dom/timegrid';
import '@dzcalendar/dom/list';
import '@dzcalendar/dom/multimonth';

createCalendar(element, { initialView: 'listWeek', headerViews: ['timeGridWeek', 'listWeek', 'multiMonthYear'] });
```

Une vue dont l'entrée n'a pas été importée échoue avec un message qui nomme l'import à ajouter.

### API

#### Entrée principale (`@dzcalendar/dom`, `@dzcalendar/dom/base`)

```text
createCalendar(host: HTMLElement, options?: CalendarOptions): CalendarInstance

types :  CalendarOptions, CalendarInstance, CalendarUpdate, LiveSettings, DateClick, EventChange,
         EventLeave, DropInfo, CalendarProblem, CustomButton, HeaderToolbar, DzMessages, ProblemWords,
         ThemeTokens, ThemeColor, ThemeName, MotionAdapter, MotionChange, MotionSide, MotionEnter,
         ViewController, ViewCtx, ViewFactory, CalendarHooks, EventHooks, ElementHooks, EventContentCtx,
         ResourceHooks, ResourceContentCtx, ContextMenuCtx, MenuHook, ScopeRequest, DayHeaderHooks,
         les contextes de hooks par élément (DayCellCtx, DayHeaderCtx, SlotLabelCtx… voir Hooks de rendu),
         DateFormatArg, EventTimeFormatArg, EventTimeRangeFormatArg, FormatSpec, Formats, MonthFormatArg,
         TimeFormatArg, WeekFormatArg, InteractionSurface, KeyboardSurface, Box

mots et locales :  EN, FR, defineLocale(code, messages), messagesForLocale(locale)
thèmes :           defineTheme(name, tokens), themeCss(name), THEME_NAMES
styles :           DZ_CSS, ensureStyles, lookGuardedCss(css)
mouvement :        NO_MOTION, WAAPI_MOTION, createWaapiMotion()
vues :             registerView(spec/famille), hasRenderer(famille)
```

#### `@dzcalendar/dom/custom`

```text
defineView(def: CustomViewDef): ViewSpec
types : CustomViewDef, CustomViewData, CustomViewApi
```

#### `@dzcalendar/dom/drag`

```text
makeDraggable(el: HTMLElement, spec: DraggableSpec): () => void   // renvoie le nettoyage
interface DraggableSpec { event: EventInput | (() => EventInput); data?: unknown; create?: boolean }
```

#### `@dzcalendar/dom/toolkit`

```text
registerView, scrollEased, ensureStyles, deferredCalendar, KeyedList, h, contentsHost, attachMenuTriggers,
timeLabels, startReadingOf, applyEventLook, dayStates, drawNow, moreText, fillEvent, unmountEvent,
timedContent, formatMinutes, RowWindow, onScrollFrame, NodePool, altDate, resourceName, noResourcesNote,
decorate, holder, undecorate, undecorateAll, lookGuardedCss, weekWords, written, anyTarget, heldOn, holdOn,
targetAt, TEMPLATE_ELEMENTS, templateClass, templateHooks, templateShape, handles, mayDelete, mayMove,
mayResize, activeIn, targetOf
types : ViewController, ViewCtx, ViewFactory, EventContentCtx, InteractionSurface, KeyboardSurface, Box,
        DzMessages, Keyed, Changed, ResolveTarget, TimeLabels, Carried, DropTarget, PageHold, TemplateElement,
        TemplateSource, ResourceContentCtx, ResourceHooks
```

Le toolkit sert à construire des familles de vues et des wrappers de frameworks ; il est versionné avec l'entrée principale mais n'est pas ce dont une application a d'ordinaire besoin. Une vue à vous est plus simple avec `defineView` :

```ts
import { createCalendar } from '@dzcalendar/dom';
import { defineView } from '@dzcalendar/dom/custom';

const agenda = defineView({
  type: 'agenda',
  duration: { days: 3 },
  render(el, data) {
    // Dessinée à nouveau à chaque changement ; `el` est conservé.
    el.textContent = `${data.instances.length} événement(s) en ${data.zone}`;
  },
});

createCalendar(element, { views: { agenda }, initialView: 'agenda', headerViews: ['agenda', 'dayGridMonth'] });
```

`makeDraggable` rend un élément de la page déposable sur un calendrier qui a `droppable` :

```ts
import { createCalendar } from '@dzcalendar/dom';
import { makeDraggable } from '@dzcalendar/dom/drag';

const stop = makeDraggable(element, {
  event: { title: 'Suivi', duration: { minutes: 30 } },
  data: { patientId: 42 }, // rendu à onDrop
});

createCalendar(document.body, {
  editable: true,
  droppable: true,
  onDrop: (drop) => console.log(drop.data, String(drop.date), drop.allDay),
});

stop(); // il ne reste rien sur l'élément
```

Un pointeur le fait glisser (un doigt le maintient d'abord 300 ms) ; au clavier, Entrée le saisit, Tab atteint un calendrier, les flèches déplacent, Entrée le dépose, Échap annule.

### Options de `createCalendar`

Toutes les options sont facultatives. Les options *dynamiques* peuvent aussi être données à `update()` ; celles marquées *(à la création seulement)* sont lues à la création du calendrier. `createCalendar` accepte `Partial<KernelOptions>` (les options de core, comme `events`, `timeZone`, `businessHours`) et les réglages propres au DOM ; les faits sur les options sont générés depuis les types (`website/src/generated/options.json`). Chaque option a une page sur `https://plinthworks.github.io/dzcalendar/fr/options/<nom-en-kebab-case>/`.

#### Données et règles

| Option | Type | Rôle |
|---|---|---|
| `events` | `EventInput[]` | Les événements, chargés comme une source tableau nommée « events ». |
| `sources` | `EventSourceSpec[]` | Sources chargées au fil de la navigation (fonction, URL, flux…) ; la liste entière, les sources retirées disparaissent. |
| `resources` | `ResourceInput[]` | Ce que les vues par ressource montrent en colonnes (une timeline : en lignes). |
| `store` | `EventStore` | Un store à partager : plusieurs calendriers (plusieurs fuseaux) sur un même store montrent les mêmes événements. *(à la création seulement)* |
| `kernel` | `CalendarKernel` | Un noyau construit ailleurs (store partagé, tests) ; sinon il est créé à partir des options. *(à la création seulement)* |
| `rules` | `RulesContext` | Ce que les modifications doivent respecter (contrainte, chevauchement, autorisation, plage valide) ; les horaires viennent de `businessHours`. |
| `businessHours` | `BusinessHoursInput` | Horaires d'ouverture : grisés en dehors dans la grille horaire et vérifiés par `rules`. Une règle, plusieurs, `true` (lundi-vendredi 9 h-17 h) ou `false`. |
| `availableSlots` | `AvailableSlot[] \| null` | Créneaux réservables dessinés dans la grille horaire (comparés par identité : un nouveau tableau redessine). |
| `forget` | `{ olderThan } \| null` | Chaque minute, les événements terminés depuis plus de `olderThan` quittent le calendrier (pas son historique d'annulation) ; pour les écrans laissés ouverts des semaines. |
| `historyLimit` | `number` | Entrées d'annulation conservées. Défaut : 200. *(à la création seulement)* |

#### Temps, lieu et vues

| Option | Type | Rôle |
|---|---|---|
| `timeZone` | `ZoneId` | Le fuseau dans lequel le calendrier est dessiné. Défaut : celui du navigateur (un problème `zone-from-browser` le signale). |
| `locale` | `string` | Balise BCP 47 : dates, nombres, mots du calendrier, premier jour, sens de lecture. Défaut : la langue de la page. |
| `firstDay` | `Weekday` | Premier jour de la semaine (ISO, lundi = 1). Défaut : celui de la locale. |
| `hiddenDays` | `Weekday[]` | Jours de semaine qu'aucune vue n'affiche (ISO ; 6 et 7 pour le week-end). |
| `weekends` | `boolean` | False masque samedi et dimanche. Défaut : true. |
| `weekNumbers` | `boolean` | Un numéro par semaine (lignes du mois, coin de la semaine). Défaut : false. |
| `displayCalendar` | `string \| null` | Le calendrier dans lequel les dates sont écrites (`islamic-umalqura`, `persian`… ; noms d'Intl). Les données et les grilles restent grégoriennes. Défaut : celui de la locale. |
| `secondaryCalendar` | `string \| null` | Un second calendrier affiché à côté des dates. Défaut : aucun. |
| `initialDate` | `PlainDate` | La date affichée au départ. Défaut : aujourd'hui dans `timeZone`. *(à la création seulement)* |
| `initialView` | `string` | La vue affichée au départ (`timeGridWeek`, `dayGridMonth`…). Défaut : `timeGridWeek` ; avec `/base`, la première famille importée parmi grille horaire, grille de jours, liste, année. *(à la création seulement)* |
| `views` | `Record<string, ViewSpec \| ViewSettings>` | Vues ajoutées aux vues intégrées (ou les remplaçant) : une spec complète (`defineView`) ou des réglages. *(à la création seulement)* |
| `viewOptions` | `Record<string, unknown>` | Options des vues d'un plugin, par famille. |

#### En-tête et formats

| Option | Type | Rôle |
|---|---|---|
| `headerToolbar` | `HeaderToolbar \| false` | `{ start, center, end }` : le contenu de l'en-tête (`'prev,next today'` : espace entre groupes, virgule dans un groupe) ; false : pas d'en-tête. |
| `headerViews` | `string[]` | Les boutons du sélecteur de vue. Défaut : mois, semaine, jour. |
| `customButtons` | `Record<string, CustomButton>` | Les boutons de l'application (`text`, `hint`, `icon`, `click`, `active`), nommés dans `headerToolbar`. |
| `headerItems` | `Record<string, ElementHooks<HeaderItemCtx>>` | Les emplacements de l'application dans l'en-tête (menu, filtre, pastille), nommés dans `headerToolbar`. |
| `titleFormat` | `TitleFormat` | La façon d'écrire le titre. Défaut : le mois, les jours d'une semaine, un jour en entier. *(à la création seulement ; ensuite `formats.title`)* |
| `formats` | `Formats` | La façon d'écrire chaque endroit : `title`, `dayHeader`, `dayCell`, `slotLabel`, `eventTime`, `eventTimeRange`, `listDay`, `listDaySide`, `monthHeader`, `morePopover`, `weekNumber` (options Intl ou fonction ; `weekNumber` une fonction seulement). |

#### Grilles, timeline et performance

| Option | Type | Rôle |
|---|---|---|
| `allDaySlot` | `boolean` | La ligne « journée entière » de la grille horaire ; false : aucune. Défaut : true. |
| `scrollTime` | `DurationLike` | Où la grille horaire est défilée au premier affichage (donné à `update` : au prochain affichage d'une vue). Défaut : `PT8H`. |
| `snapMinutes` | `number` | Minutes sur lesquelles s'alignent les gestes et les moments du menu contextuel. Défaut : 15. |
| `timeGrid` | `TimeGridOptions` | Les options propres à la grille horaire (axe, minutes de créneau, minutes d'étiquette…), fusionnées clé par clé. |
| `eventMaxStack` | `number \| 'auto' \| null` | Événements côte à côte avant « +N ». Défaut : `'auto'` ; null : tous. |
| `dayMaxLanes` | `number \| 'auto' \| null` | Lignes qu'un jour du mois affiche avant « +N » ; null : tous les événements. Par défaut null dans un mois, `'auto'` dans une année. |
| `multiMonthMaxColumns` | `number` | Mois côte à côte au plus dans la vue multi-mois (1 : empilés). Défaut : 3. |
| `displayEventTime` | `boolean` | L'heure d'un événement à côté de son titre. Défaut : true. |
| `nowIndicator` | `boolean` | La ligne de l'heure courante. Défaut : true. |
| `nowRefresh` | `DurationLike` | La fréquence de déplacement de la ligne « maintenant » (d'une seconde à une heure). Défaut : une minute. |
| `timeline` | `{ slot, maxLanes, fillLanes, … }` | L'échelle et les lignes d'une timeline (lues par la famille Pro). |
| `collapsedResources` | `string[]` | Lignes de timeline : ressources (par id) dont les enfants sont masqués. |
| `collapsedGroups` | `string[]` | Lignes de timeline : groupes (par valeur de `resourceGroupField`) repliés. |
| `resourceGroupField` | `string` | Les vues par ressource regroupent leurs colonnes (une timeline ses lignes) selon ce champ. |
| `resourceOrder` | `ResourceOrder` | L'ordre des ressources sœurs après leur `order` : noms de champs (`'-title'` décroissant) ou comparaison. |
| `showUnassigned` | `boolean` | Ajoute une colonne « Non assigné » (timeline : une ligne) pour les événements sans ressource connue. Défaut : false. |
| `virtualizeAbove` | `number` | Au-delà de ce nombre d'événements dans une vue, seul ce qui est à l'écran est monté. Défaut : 500 ; `Infinity` ne fenêtre jamais. *(à la création seulement)* |

#### Interaction

| Option | Type | Rôle |
|---|---|---|
| `editable` | `boolean` | Les événements peuvent être déplacés et redimensionnés ; le menu contextuel propose l'édition. Défaut : false. |
| `selectable` | `boolean` | Glisser sur du temps vide le sélectionne (`onSelect`). Défaut : false. |
| `eventResizableFromStart` | `boolean` | Les événements peuvent aussi être redimensionnés par leur début. Défaut : false. |
| `dragEdgeNavigate` | `boolean` | Maintenir un événement glissé sur le bord passe à la période précédente/suivante. Défaut : true. |
| `droppable` | `boolean \| (data) => boolean` | Ce qui peut être déposé ici depuis la page (`makeDraggable`) ou un autre calendrier. Par défaut false. |
| `keyboardUndo` | `boolean` | Ctrl/Cmd+Z et Ctrl/Cmd+Maj+Z (ou Ctrl/Cmd+Y) annulent et rétablissent dans un calendrier `editable`. Défaut : true. |
| `contextMenu` | `MenuHook` | Garder, réordonner, compléter ou remplacer les entrées du menu contextuel ; null ou `[]` laisse le menu du navigateur. |
| `chooseScope` | `(request) => EditScope \| null` | Un geste sur une occurrence d'une série : jusqu'où il porte ; résoudre null annule. Défaut : un menu « celle-ci / suivantes / toutes ». |
| `autoPrint` | `boolean` | Prépare l'impression sur `beforeprint` et restaure sur `afterprint`. Défaut : false. *(à la création seulement)* |

#### Apparence, mots et mouvement

| Option | Type | Rôle |
|---|---|---|
| `theme` | `string` | Une famille (`standard`, `slate`, `night`, `pastel`, `frost`, `solar`, `contrast`) ou une famille créée avec `defineTheme`. Défaut : `standard`. |
| `scheme` | `'auto' \| 'light' \| 'dark'` | Clair, sombre, ou celui de la page. Défaut : `auto`. |
| `density` | `'compact' \| 'comfortable' \| 'spacious'` | Défaut : `comfortable`. |
| `eventStyle` | `'tinted' \| 'solid'` | Événements teintés avec le bord de leur ton (défaut) ou blocs pleins de leur ton. |
| `look` | `'styled' \| 'none'` | `none` : la structure seule, toutes les couleurs, bordures, ombres et typographies sont les vôtres. Défaut : `styled`. |
| `cssLayers` | `boolean` | Le CSS dans des couches de cascade (défaut true : une règle de la page hors couche gagne). False pour une page dont le reset n'est pas en couche (Tailwind 3, Bootstrap). *(à la création seulement)* |
| `injectStyles` | `boolean` | False sous une CSP sans styles en ligne : incluez `DZ_CSS` vous-même. Défaut : true. *(à la création seulement)* |
| `hooks` | `CalendarHooks` | Les éléments du calendrier rendus à l'application : classes, contenu et montages par élément (voir Hooks de rendu). |
| `messages` | `Partial<DzMessages>` | N'importe lesquels des mots du calendrier, par-dessus ceux de la locale. |
| `motion` | `MotionAdapter` | L'adaptateur de mouvement (`createGsapMotion()`, `NO_MOTION`, le vôtre). Défaut : la base WAAPI intégrée. |

#### Callbacks

| Option | Type | Rôle |
|---|---|---|
| `onSelect` | `(selection) => void` | Une sélection a été faite (`selectable`). |
| `onUnselect` | `() => void` | La sélection affichée a disparu (pas quand l'application l'a effacée). |
| `onDateClick` | `(click: DateClick) => void` | Un jour ou un moment a été cliqué. |
| `onEventClick` | `(instance) => void` | Un événement a été cliqué. |
| `onEventOpen` | `(instance) => void` | « Ouvrir » depuis le menu contextuel (proposé seulement s'il est donné). |
| `onCreateRequest` | `(request) => void` | « Nouvel événement ici » depuis le menu contextuel : ouvrez votre éditeur (proposé seulement s'il est donné). |
| `onSlotClick` | `(slot: AvailableSlot) => void` | Un créneau libre de `availableSlots` a été cliqué ; le calendrier ne crée rien, l'application le réserve. |
| `onEventChange` | `(change: EventChange) => void` | Après une modification de la personne : la persister, et `revert()` si le serveur refuse. |
| `onEventReceive` | `(change: EventChange) => void` | Un événement est arrivé (déposé depuis la page ou un autre calendrier) ; `revert()` le reprend. |
| `onEventLeave` | `(leave: EventLeave) => void` | Un événement de ce calendrier a été déposé sur un autre ; `revert()` le remet sur les deux. |
| `onDrop` | `(drop: DropInfo) => void` | Un élément de la page a été déposé et son événement créé. |
| `onCommandRefused` | `(result, command) => void` | Une commande issue de l'interface a été refusée : pourquoi (problèmes, règles violées). |
| `onProposalRefused` | `(proposal) => void` | Un geste déposé là où les règles le refusent. |
| `onFollowChange` | `(following: boolean) => void` | Une timeline qui suit le présent s'est mise en pause, ou l'a repris. |
| `onResourceToggle` | `(state) => void` | Une ressource ou un groupe a été replié ou déplié : l'état à conserver. |
| `onResourceProblems` | `(problems) => void` | Ce que les ressources fournies n'ont pas pu être lues comme. |
| `onProblem` | `(problem: CalendarProblem) => void` | Quelque chose que le calendrier n'a pas pu faire comme demandé ; sans lui, dit une fois par code dans la console. |
| `onSource` | `(notice: SourceNotice) => void` | Chargement, erreurs de récupération, problèmes dans une livraison, enregistrements refusés. *(à la création seulement)* |

### Le `CalendarInstance`

`createCalendar` renvoie :

| Membre | Rôle |
|---|---|
| `ready: Promise<void>` | Résolue une fois dessiné : aussitôt là où Temporal est natif, après son polyfill sur Safari. D'ici là `update`, `navigate`, `select`, `refetch`, `onDestroy` et `destroy` attendent, `run`/`undo`/`redo` refusent, et lire `kernel` lève une exception. Rejetée avec la `RangeError` d'une option refusée. |
| `kernel: CalendarKernel` | Le noyau de core : état, store, sources, problèmes, `setEvents`, `setResources`, `subscribe`. |
| `element: HTMLElement` | La racine du calendrier (`.dz-cal`). |
| `update(changes: CalendarUpdate)` | Change ce qui est demandé et rien d'autre, dessine une fois ; une valeur égale ne fait rien (pas de scintillement, défilement et focus conservés). Prend la vue (`view`), la date (`date`) et toutes les options dynamiques. |
| `navigate('prev' \| 'next' \| 'today')` | Déplace la période (une timeline avec `timeline.step` glisse de ce pas ; `today` reprend le suivi du présent). |
| `shift(by: DurationLike): boolean` | Fait glisser une timeline d'une durée (`{ minutes: -15 }`) ; false si la vue ne glisse pas. |
| `run(cmd, opts?)` | Exécute une commande dans l'historique (annulable) ; `{ validate: true }` la vérifie contre les règles comme le ferait un geste. Renvoie `{ ok, problems… }`, ne lève jamais. |
| `undo()`, `redo()` | Parcourent l'historique ; false s'il n'y a rien à faire. |
| `refetch(sourceId?)` | Recharge une source, ou toutes ; ce qui est affiché reste jusqu'aux réponses. |
| `preparePrint()` | Dessine tout maintenant, sans fenêtrage ; renvoie la fonction qui rétablit le fenêtrage. |
| `select(selection \| null)` | Affiche une sélection (null l'efface) comme si une personne l'avait faite ; `onSelect` n'est pas appelé. |
| `onDestroy(fn)` | Exécute `fn` à la destruction du calendrier ; renvoie le moyen de l'annuler. |
| `motion: MotionAdapter` | Le mouvement en vigueur. |
| `getOptions(): CalendarOptions` | Les options en vigueur (ce qui a été donné, chaque `update` par-dessus) ; de quoi faire une copie. |
| `destroy()` | Retire le calendrier et tout ce qu'il écoute. |

```ts
import { createCalendar } from '@dzcalendar/dom';

const calendar = createCalendar(element, { timeZone: 'Europe/Paris', editable: true });

const result = calendar.run({ type: 'event.create', event: { id: 'x', title: 'Visite', start: '2026-10-21T09:00[Europe/Paris]', duration: { minutes: 30 } } });
if (!result.ok) console.log(result.problems);

calendar.undo();
calendar.navigate('next');
calendar.update({ timeZone: 'America/Chicago' });
calendar.destroy();
```

Les commandes sont `event.create`, `event.update`, `event.move`, `event.resize`, `event.delete`, `series.delete`, `series.split`, `series.rule`, `event.repeat` et `batch`. Un glissement, un redimensionnement ou un choix de menu d'une personne exécute les mêmes commandes.

### Callbacks

Les options `on…` ci-dessus sont les callbacks du calendrier. Persister une modification, puis la refuser :

```ts
import { createCalendar } from '@dzcalendar/dom';

createCalendar(element, {
  editable: true,
  onEventChange: async (change) => {
    const ok = await fetch('/api/events', { method: 'POST', body: JSON.stringify(change.after) }).then((r) => r.ok);
    if (!ok) change.revert(); // reprend exactement cette modification
  },
  onProblem: (problem) => console.warn(problem.code, problem.detail),
});
```

`onEventOpen`, `onCreateRequest` et `onSlotClick` changent ce qui est proposé à l'écran : « Ouvrir » et « Nouvel événement ici » n'existent que si leur callback est donné, et les créneaux libres ne sont cliquables qu'avec `onSlotClick` (sans lui ils montrent seulement le temps libre, `aria-disabled`).

### Hooks de rendu

`hooks` rend à l'application les éléments du calendrier. Chaque élément accepte `class` (une chaîne, une liste ou une fonction de son contexte), `content` (une fonction de son contexte qui renvoie une chaîne ou un nœud à la place du nôtre ; null garde le nôtre), `didMount` (une fois dans la page ; peut renvoyer son nettoyage) et `willUnmount`.

| Hook | Élément |
|---|---|
| `event` | Un événement, dans toutes les vues (contexte : `instance`, `segment`, `timeText`, `displayZone`, `family`, `background`). |
| `resource` | L'en-tête d'une ressource (d'une colonne, d'une ligne de timeline). |
| `dayHeader`, `dayCell`, `dayLane` | L'en-tête d'un jour, une cellule du mois, une colonne de la grille horaire. |
| `slotLabel`, `slotLane` | Une étiquette d'heure de la gouttière ; la ligne d'un créneau (dessinée seulement si le hook est donné). |
| `allDayLabel`, `moreLink`, `morePopover`, `nowIndicator`, `weekNumber` | L'étiquette « journée entière », « +N », son panneau, la ligne « maintenant », un numéro de semaine. |
| `noEvents`, `listDayHeader`, `monthHeader`, `view` | L'état vide de la liste, le titre d'un jour de liste, le titre d'un mois en vue multi-mois, la racine de la vue. |
| `resourceLane`, `resourceGroupHeader`, `resourceGroupLane`, `resourceAreaHeader` | Les lignes, groupes et l'en-tête de colonne des ressources d'une timeline. |

```ts
import { createCalendar } from '@dzcalendar/dom';

createCalendar(element, {
  hooks: {
    event: {
      class: (ctx) => (ctx.timeText ? 'has-time' : null),
      content: (ctx) => {
        const b = document.createElement('b');
        b.textContent = ctx.instance.event.title;
        return b;
      },
    },
    dayCell: { class: (ctx) => (ctx.today ? 'is-today' : null) },
  },
});
```

### Messages et locales

Les mots anglais et français sont intégrés (`EN`, `FR`). Les dates, mois, jours et nombres sont écrits par `Intl` pour toutes les locales ; seuls les mots propres au calendrier (« Aujourd'hui », « +3 de plus », les menus, ce qu'entend un lecteur d'écran) viennent par lots. L'arabe, l'espagnol et l'allemand sont un import chacun, enregistrés pour toutes les locales de la langue (`ar` met aussi le calendrier de droite à gauche d'après la locale). `defineLocale` enregistre un jeu complet ; `messages` remplace des mots isolés sur un calendrier.

```ts
import { EN, createCalendar, defineLocale, messagesForLocale } from '@dzcalendar/dom';
import '@dzcalendar/dom/locales/es'; // aussi : …/locales/ar, …/locales/de

// Une langue à vous : un DzMessages complet, ici l'anglais avec un mot changé.
defineLocale('pt', { ...EN, today: 'Hoje' });

createCalendar(element, { locale: 'es-ES', timeZone: 'Europe/Madrid' });
createCalendar(element, { locale: 'fr-FR', messages: { today: 'Maintenant' } });

console.log(messagesForLocale('pt-BR').today); // « Hoje » : la balise exacte, puis la langue, sinon l'anglais
```

Chaque entrée de locale exporte aussi ses mots : `messagesAr(locale?)` et `AR`, `messagesEs(locale?)` et `ES`, `messagesDe(locale?)` et `DE`.

### Contrat de style

Le calendrier se style par des **parties** (classes `dz-…`), des **états** (attributs `data-*`) et des **tokens** (propriétés personnalisées `--dz-…`), le tout dans les couches de cascade `dzcalendar.base` et `dzcalendar.theme`. Une partie ou un token renommé ou retiré est une version majeure ; un ajout est une version mineure. La liste complète est dans `docs/styling.md` du dépôt, et un test échoue si le code et cette page divergent. Six façons de le changer, de la plus légère à la plus lourde :

1. Les tokens : `.agenda { --dz-accent: #0f766e; --dz-radius: 10px; }`.
2. Vos propres règles : toute règle hors couche de cascade gagne, quelle que soit sa spécificité.
3. Les états : `[data-today]`, `[data-past]`… (Tailwind : `data-[today]:bg-emerald-50`).
4. Des classes sur n'importe quelle partie : `hooks.<élément>.class`.
5. Votre propre contenu : `hooks.<élément>.content`.
6. Aucun style : `look: 'none'` garde la structure et retire couleurs, bordures, ombres et polices.

```css
.agenda {
  --dz-accent: #0f766e;
  --dz-radius: 10px;
  --dz-height: 48rem;
}
.dz-ev[data-tone='red'] { font-weight: 600; }
.dz-dg__cell[data-today] { outline: 2px solid var(--dz-accent); }
```

États principaux : un jour (`.dz-dg__cell`, `.dz-tg__col`, `.dz-tg__dayhead`, `.dz-list__day`) a `data-date`, `data-weekday` (ISO, lundi 1), `data-today`, `data-past`, `data-future`, `data-outside`, `data-closed` ; un événement (`.dz-ev`, `.dz-bar`, `.dz-list__ev`, `.dz-tl__ev`) a `data-event-id`, `data-series-id`, `data-tone`, `data-all-day`, `data-background` ; le calendrier (`.dz-cal`) a `data-view`, `data-dz-theme`, `data-dz-scheme`, `data-dz-density`, `data-dz-event-style`, `data-dz-look`, `data-editable`, `data-loading` ; la surface d'une vue a `data-dragging`, `data-selecting`, `data-grabbing`, `data-dropping` ; les boutons de l'en-tête ont `aria-pressed`. `data-theme="dark"` sur un ancêtre est lu comme le schéma quand `scheme` vaut `'auto'` ; `data-dz-keep-selection` sur un élément conserve la sélection quand on le presse.

Parties principales : `.dz-cal`, `.dz-toolbar` (`__section`, `__group`, `__btn`, `__title`), `.dz-ev` et `.dz-bar` (événements), `.dz-more` (« +N »), `.dz-tg` (grille horaire : `__head`, `__dayhead`, `__gutter`, `__col`, `__allday`, `.dz-now`, `.dz-band--gap`, `.dz-band--repeat`), `.dz-dg` (grille de jours et mois : `__week`, `__cell`, `__num`), `.dz-mm` (année), `.dz-list`, `.dz-tl` (timeline), `.dz-pop`, `.dz-menu`, `.dz-ghost`, `.dz-editor`, `.dz-custom`, `.dz-draggable`.

Tokens que vous définissez : `--dz-bg`, `--dz-bg-raised`, `--dz-fg`, `--dz-fg-muted`, `--dz-border`, `--dz-accent`, `--dz-accent-fg`, `--dz-danger`, `--dz-warning`, `--dz-radius`, `--dz-event-radius`, `--dz-font` ; ceux de l'en-tête (`--dz-title-size`, `--dz-button-*`) ; les événements (`--dz-event-bg`, `--dz-event-fg`, `--dz-event-tint`, `--dz-event-shade`, `--dz-on-tone`, `--dz-tone-<nom>`) ; la grille (`--dz-line`, `--dz-today-bg`, `--dz-outside-bg`, `--dz-off-bg`, `--dz-now`, `--dz-gap-stripe`, `--dz-repeat-bg`) ; les créneaux libres (`--dz-slot-*`) ; les tailles (`--dz-minute`, `--dz-bar-height`, `--dz-gutter-width`, `--dz-day-head`, `--dz-week-min`, `--dz-allday-max`, `--dz-height`, `--dz-target-min`). Les propriétés `--dzc-…` et `--dzp-…` sont la palette privée du thème : définissez les `--dz-…`. Un événement horaire est un conteneur de taille : placez une infobulle `position: fixed` dans `body`, pas dedans.

Sous une CSP sans styles en ligne, mettez `injectStyles: false` et incluez vous-même `DZ_CSS` (et `LIST_CSS`, `MULTIMONTH_CSS`, `themeCss(name)`) ; pour un calendrier sans style, enveloppez-les avec `lookGuardedCss`.

### Thèmes

Sept familles prêtes à l'emploi, de `@dzcalendar/theme` : `standard`, `slate`, `night`, `pastel`, `frost`, `solar`, `contrast` (`theme: 'night'`). `scheme` vaut `'auto'` (celui de la page), `'light'` ou `'dark'` ; `density` vaut `'compact'`, `'comfortable'` ou `'spacious'` ; `eventStyle` vaut `'tinted'` ou `'solid'`. Votre propre famille :

```ts
import { createCalendar, defineTheme } from '@dzcalendar/dom';

// Une couleur est une valeur, ou une paire [clair, sombre] qui suit le schéma.
defineTheme('clinic', {
  accent: ['#0a7d5a', '#3ddc97'],
  radius: '8px',
  tones: { brand: ['#0a7d5a', '#3ddc97'] },
});

createCalendar(element, {
  theme: 'clinic',
  events: [{ id: 'a', title: 'Consultation', start: '2026-10-21T09:00[Europe/Paris]', tone: 'brand' }],
});
```

`ThemeTokens` accepte `bg`, `bgRaised`, `fg`, `fgMuted`, `border`, `accent`, `accentFg`, `danger`, `warning`, `radius`, `font`, `todayBg`, `now`, `eventBg`, `eventFg`, `eventAccent` et `tones` ; un token omis garde la valeur de la famille standard. Un nom est fait de minuscules, chiffres et tirets, et ne peut pas être celui d'une famille prête à l'emploi. Voir `@dzcalendar/theme` pour la feuille de style, son API Sass et les fichiers Tailwind.

### Mouvement

Par défaut, une base légère en Web Animations anime le calendrier (la période glisse, les événements et les menus apparaissent en fondu). `motion: NO_MOTION` coupe tout ; `motion: createGsapMotion()` (`@dzcalendar/motion-gsap`) ajoute l'ensemble complet ; votre propre `MotionAdapter` peut implémenter n'importe lequel de `beforeChange`, `afterChange`, `titleChange`, `nowTick`, `viewChange`, `eventsEnter`, `eventsLeave`, `wantsLeave`, `seatsChange`, `scroll`, `stopScroll`, `dragStart`, `dropRejected`, `captureLayout`, `animateLayout`, `dropSettle`, `overlayOpen`, `overlayClose`, `destroy`. Les adaptateurs doivent respecter `prefers-reduced-motion`.

```ts
import { NO_MOTION, createCalendar } from '@dzcalendar/dom';

const calendar = createCalendar(element, { motion: NO_MOTION });
calendar.update({ motion: { destroy: () => console.log('remplacé') } });
```

### Documentation

- [Prise en main : JavaScript pur](https://plinthworks.github.io/dzcalendar/fr/getting-started/vanilla/), [installation](https://plinthworks.github.io/dzcalendar/fr/getting-started/installation/)
- [Toutes les options](https://plinthworks.github.io/dzcalendar/fr/options/), chacune sur `https://plinthworks.github.io/dzcalendar/fr/options/<option-en-kebab-case>/`, par exemple [`initialView`](https://plinthworks.github.io/dzcalendar/fr/options/initial-view/) et [`onEventClick`](https://plinthworks.github.io/dzcalendar/fr/options/on-event-click/)
- [Vues](https://plinthworks.github.io/dzcalendar/fr/guides/views/)
- [Événements](https://plinthworks.github.io/dzcalendar/fr/guides/events/)
- [Fuseaux horaires](https://plinthworks.github.io/dzcalendar/fr/guides/time-zones/)
- [Récurrence](https://plinthworks.github.io/dzcalendar/fr/guides/recurrence/)
- [Sources d'événements](https://plinthworks.github.io/dzcalendar/fr/guides/event-sources/)
- [Sélection](https://plinthworks.github.io/dzcalendar/fr/guides/selection/)
- [Glisser-déposer](https://plinthworks.github.io/dzcalendar/fr/guides/drag-and-drop/)
- [Clavier et accessibilité](https://plinthworks.github.io/dzcalendar/fr/guides/keyboard-accessibility/)
- [Langues](https://plinthworks.github.io/dzcalendar/fr/guides/languages/)
- [Thèmes](https://plinthworks.github.io/dzcalendar/fr/guides/theming/)
- [Tailwind](https://plinthworks.github.io/dzcalendar/fr/guides/tailwind/)
- [Calendrier sans style](https://plinthworks.github.io/dzcalendar/fr/guides/unstyled/)
- [Ressources et timeline](https://plinthworks.github.io/dzcalendar/fr/guides/resources-timeline/)
- [Éditeur](https://plinthworks.github.io/dzcalendar/fr/guides/editor/)
- [Impression et export](https://plinthworks.github.io/dzcalendar/fr/guides/print-export/)
- [Migrer depuis FullCalendar](https://plinthworks.github.io/dzcalendar/fr/getting-started/migrating-from-fullcalendar/)

### Licence

MIT
