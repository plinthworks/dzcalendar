# @dzcalendar/compat-fullcalendar

Moving an application from FullCalendar: its options and callbacks translated to DzCalendar at run time, every guess and every option without an equivalent reported.

**English** · [Français](#français)

## What it is

You hand `createFromFullCalendar` the options object your FullCalendar application already has. You get a DzCalendar calendar (same view, same dates, same events, same editing, same callbacks) and a list of `problems`: what was guessed, and what has no equivalent. The calendar is drawn anyway. Nothing throws.

This package describes and reproduces **observable behaviour** only. It contains no FullCalendar code, and imports nothing from it: your application drops the `@fullcalendar/*` packages. Its companion `@dzcalendar/migrate` (the `dz-migrate` command) rewrites your source code to use it.

What it does for you:

- reads **view and date options** (`initialView`, `initialDate`, `firstDay`, `weekends`, `hiddenDays`, custom `views`, `visibleRange`), with the days of the week converted;
- reads **events and sources**: arrays, JSON feeds (a URL), functions, iCalendar feeds; recurring events by `daysOfWeek` or by `rrule`;
- reads **editing and rules**: `editable`, `selectable`, constraints, overlap, `eventAllow`, `selectAllow`, `validRange`;
- reads **resources** (nested `children` flattened), resource columns, and every **render hook** (`eventContent`, `dayCellDidMount`, …);
- calls your **callbacks** (`eventClick`, `dateClick`, `select`, `datesSet`, `eventDrop`, `eventResize`, `eventChange`, …) with the same information, as plain objects;
- provides `Draggable` for dragging elements of the page onto the calendar.

## Install

```bash
npm install @dzcalendar/core @dzcalendar/dom @dzcalendar/theme @dzcalendar/compat-fullcalendar
```

It depends on `@dzcalendar/core`, `@dzcalendar/dom` and `@dzcalendar/ical`. A view of the list, multi-month or timeline family needs its own import (see [Views that need an import](#views-that-need-an-import)).

## Quick start

```ts
import '@dzcalendar/theme/dzcalendar.css';
import { createFromFullCalendar } from '@dzcalendar/compat-fullcalendar';
import type { DateClickArg, EventClickArg } from '@dzcalendar/compat-fullcalendar';

const { calendar, problems, detach } = createFromFullCalendar(element, {
  timeZone: 'Europe/Paris',
  initialView: 'timeGridWeek',
  initialDate: '2026-10-21',
  firstDay: 1,
  headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek' },
  slotMinTime: '07:00:00',
  slotMaxTime: '20:00:00',
  editable: true,
  selectable: true,
  events: [
    { id: 'a', title: 'Consultation', start: '2026-10-21T09:00:00', end: '2026-10-21T09:45:00' },
    { id: 'b', title: 'Holiday', start: '2026-10-26', end: '2026-10-29', allDay: true },
  ],
  eventClick: (arg: EventClickArg) => console.log(arg.event.title, arg.event.start),
  dateClick: (arg: DateClickArg) => console.log(arg.dateStr, arg.allDay),
});

// The first event had a wall time without a zone: read in the calendar's zone, and said.
for (const p of problems) console.log(p.severity, p.code, p.path, p.detail);

// Later: wire out the callbacks and destroy.
detach();
calendar.destroy();
```

`calendar` is a normal DzCalendar `CalendarInstance` (`update`, `navigate`, `run`, `undo`, …): you can move to the native API one option at a time.

## Behaviour: where it differs on purpose

- **Zones.** A time without an offset or a zone is a wall time: it is read in the calendar's zone, and said (`zone-guessed`). A `Date` (or epoch milliseconds) is an instant. `timeZone: 'local'` is the browser's zone, said; `'UTC'` is UTC; an IANA name is itself. With no `timeZone` at all, the browser's zone is used, and said (or the one given in the `timeZone` of `CompatOptions`).
- **Days of the week** count from Monday = 1 to Sunday = 7 (ISO); FullCalendar counts Sunday = 0. Converted everywhere (`firstDay`, `hiddenDays`, `daysOfWeek`).
- **Colours** are not given per event: an event names a tone and the theme decides its colour. A colour is kept in `extendedProps.color` (and its siblings) and said (`compat-unsupported … tone`).
- **Callbacks** receive plain objects (`event` with `id`, `title`, `start` and `end` as `Date`, `allDay`, `extendedProps`…), not live objects with methods. Changing an event is a command (`calendar.run`).
- **A refused move is undone through the history**: `revert()` is an undo.
- **`eventDrop`, `eventResize`, `eventChange`** follow a person's change (a gesture, the keyboard, the menu, the editor), not the application's own `calendar.run`, a source's delivery or an undo. An occurrence moved alone is the series' event (its id), dropped.
- **`jsEvent`** is a stand-in (`type`, `preventDefault`, `stopPropagation`): the calendar hands no native event to these callbacks. A click on an event with a `url` follows it unless `eventClick` returns `false` or calls `preventDefault()`.
- **`datesSet`**, `view.activeStart/activeEnd` are the grid shown (a month's padding days too); `currentStart/currentEnd` the period itself. `datesSet` is called once per view and dates.
- **`views: {…}`**: what concerns the first view (its family's entry, then its own) is laid over the options; the others are said (`per-view`).
- **A series without `startRecur`** runs from 3 January 2000 (FullCalendar's runs from always).
- **Nothing throws.** An option the calendar refuses is left out and said (`invalid-option`). The problems are written once to the console (`{ warn: false }` to stop it).

## API

### `createFromFullCalendar(el, fullCalendarOptions, compat?)`

```text
createFromFullCalendar(
  el: HTMLElement,
  fullCalendarOptions: unknown,
  compat?: CompatOptions,
): { readonly calendar: CalendarInstance; readonly problems: readonly Problem[]; detach(): void }

interface CompatOptions {
  readonly warn?: boolean;       // say the problems once with console.warn; default true
  readonly timeZone?: string;    // the zone when the options name none; default the browser's, said
}
```

Makes the calendar from the other library's options and wires the callbacks that follow it. Each option the calendar refuses is found key by key and left out (`invalid-option`). `detach()` takes the wired callbacks off. In a browser that loads Temporal after the page (Safari), the calendar is a deferred one: it is translated and made once Temporal has arrived (`calendar.ready`), and the problems join the list then.

### `applyFullCalendar(calendar, fullCalendarOptions, how?)`

```text
applyFullCalendar(
  calendar: CalendarInstance,
  fullCalendarOptions: unknown,
  how?: { readonly initial?: boolean },
): { readonly problems: readonly Problem[]; detach(): void }
```

Lays the options on a calendar that already exists (one an Angular `<dz-calendar>` made). What can change live is updated key by key; events, sources and resources are replaced (sources no longer given are removed; the options own the events: none given is none); the callbacks are wired. `initialView` and `initialDate` apply only the first time (`initial: false` afterwards, so that options changing do not send the calendar back). `virtualizeAbove` and `autoPrint` cannot change after creation: they are left out and reported as `compat-unsupported … at-creation`.

### `fromFullCalendar(options, how?)`

```text
fromFullCalendar(given: unknown, how?: { readonly zone?: ZoneId }): Translation

interface Translation {
  readonly options: CalendarOptions;            // DzCalendar's options (@dzcalendar/dom)
  readonly problems: readonly Problem[];
  attach(calendar: CalendarInstance): () => void;   // wires datesSet, eventDrop, loading…; returns the way to unwire
}
```

The translation alone, without creating a calendar: for a framework wrapper, a test, or to look at what your options become. Never throws.

### `toEvent`, `eventInfo`

```text
toEvent(raw: unknown, zone: ZoneId, path: string, problems: Problem[], defaults?: EventDefaults): EventInput | null
eventInfo(ev: CalEvent, zone: ZoneId): Record<string, unknown>    // an event as a plain object the callbacks read
```

`toEvent` turns one FullCalendar-shaped event into a DzCalendar `EventInput` (null when it cannot be read: the problem is pushed to `problems`). `eventInfo` is the reverse direction: an event as callbacks receive it.

### `Draggable`

```text
class Draggable {
  constructor(containerEl: HTMLElement, settings?: DraggableSettings)
  readonly containerEl: HTMLElement
  readonly settings: DraggableSettings
  destroy(): void
}
interface DraggableSettings {
  readonly itemSelector?: string;                                  // every matching element inside the container, those added later too
  readonly eventData?: Record<string, unknown> | ((el: HTMLElement) => Record<string, unknown>);
}
```

Makes elements of the page draggable onto a calendar with `droppable: true`. The event data may carry a `duration` as `"00:30"`, `{ minutes: 30 }` or milliseconds, `className` / `classNames`, and `create: false` (drop without creating an event). Without `eventData`, the element's text is the title. The data is read when the drag starts. `destroy()` takes everything back.

### Types

The names an application imports from the other library, exported here so that only the import path changes:

```text
CalendarOptions, EventInput, EventSourceInput   // loose records
EventApi            { id, groupId, title, start: Date, end: Date, startStr, endStr, allDay, url, classNames, display, extendedProps, resourceIds }
ViewApi             { type, title, activeStart, activeEnd, currentStart, currentEnd }
EventClickArg       { event, el, jsEvent, view }
DateClickArg        { date, dateStr, allDay, resource?, jsEvent, view }
DateSelectArg       { start, end, startStr, endStr, allDay, resource?, jsEvent, view }
EventChangeArg      { event, oldEvent, relatedEvents, revert() }
EventDropArg, EventResizeDoneArg, EventAddArg, EventRemoveArg
DatesSetArg         { start, end, startStr, endStr, timeZone, view }
EventContentArg, EventMountArg   { event, el, timeText, view, isStart, isEnd }
FullCalendarOptions, CompatOptions, Translation, JsEventLike, DraggableSettings
```

## What it translates

| What the application gives | What DzCalendar does |
|---|---|
| `initialView`, `initialDate` | The same (view names are shared). |
| `timeZone` | See Behaviour. |
| `locale`, `direction` | The locale; right to left follows it (`direction: 'rtl'` is said: `from-locale`). |
| `firstDay`, `weekends`, `hiddenDays` | The same, Monday = 1. |
| `events`, `eventSources` | Arrays as events; a URL a JSON source (start, end and timeZone parameters, `extraParams`, `method`); a function a source given the dates; `format: 'ics'` an iCalendar source. |
| An event's `start`, `end`, `allDay`, `title`, `id`, `groupId`, `url`, `classNames`, `extendedProps`, `resourceId(s)`, `display`, `editable`… | The same fields. |
| An event's `daysOfWeek` + `startTime` / `endTime` / `startRecur` / `endRecur` | A weekly series (RRULE). |
| An event's `rrule` (text or object), `duration`, `exdate` | A series. |
| `editable`, `selectable` | The same. |
| `eventStartEditable`, `eventDurationEditable`, `eventResourceEditable` | Per event (`startEditable`…), on every event that does not say, sources' events too. |
| `slotMinTime`, `slotMaxTime`, `scrollTime`, `snapDuration`, `slotDuration` | The time grid's hours, the first scroll, the snap, the slot. |
| `businessHours` | The same shape, days converted. |
| `eventConstraint`, `eventOverlap`, `eventAllow`, `selectAllow`, `validRange` | The rules (`constraint`, `overlap`, `allow`, `validRange`). |
| `nowIndicator`, `weekNumbers`, `dayMaxEventRows` / `dayMaxEvents`, `eventMaxStack`, `allDaySlot`, `displayEventTime` | The same (lanes, stack). |
| `titleFormat`, `dayHeaderFormat`, `slotLabelFormat`, `eventTimeFormat`, `listDayFormat`, `listDaySideFormat`, `dayPopoverFormat` | `formats` (their own keys and format functions are said). |
| `views: { x: { type, duration, dayCount, dateIncrement, visibleRange } }`, `visibleRange` | Custom views by settings; a function `visibleRange` and `buttonText` are said. |
| `droppable`, `drop`, `eventReceive`, `eventLeave`; `Draggable` | The same, their arguments rebuilt; `Draggable` from this package. |
| `headerToolbar`, `customButtons` | Kept whole (`left` / `right` become `start` / `end`; `false`: no header); `prevYear` / `nextYear` are said and left out; a button's `icon` becomes the class `fc-icon fc-icon-<name>`. |
| `resources`, `resourceGroupField`, `resourceOrder`, `resourceAreaColumns` | The same (nested `children` flattened with their parent; the columns become `viewOptions.timeline.areaColumns`). |
| `<name>ClassNames`, `<name>Content`, `<name>DidMount`, `<name>WillUnmount` for event, dayHeader, dayCell, slotLabel, slotLane, allDay, moreLink, dayPopover, nowIndicator, weekNumber, noEvents, view, resourceLabel, resourceLane, resourceGroupLabel, resourceGroupLane, resourceAreaHeader | The render hooks, their arguments rebuilt; content may be text, `{ html }` or `{ domNodes }`. |
| `eventClick`, `dateClick`, `select`, `unselect`, `datesSet`, `eventsSet`, `loading` | Called with the same information. |
| `eventDrop`, `eventResize`, `eventChange`, `eventAdd`, `eventRemove` | Called after a person's change, with `revert()`. |
| `eventClassNames`, `eventDisplay` | On every event that does not say. |
| `plugins`, `schedulerLicenseKey`, `themeSystem`, `lazyFetching`, `progressiveEventRendering`, `handleWindowResize`, `windowResizeDelay`, `rerenderDelay`, `selectMirror` | Nothing to do (built in, or the theme is ours); left out silently. |

### What it reports

Each problem is `{ code, severity, path, detail }`: a short machine-readable detail, never a sentence.

| Code | When |
|---|---|
| `compat-unsupported` | An option with no equivalent. `detail` says why: `css` (`height`, `contentHeight`, `aspectRatio`, `expandRows`, … are CSS now: `--dz-height`), `tone` (`eventColor` and the colour fields: events name tones), `locale` (`weekNumberFormat`: the locale's format), `intl` (a format's own keys, such as `meridiem` or `omitZeroMinute`), `none` (no equivalent), `per-view` (a view's own options beyond the first view), `built-in` (a `duration`, `dayCount` or `visibleRange` given to a built-in view: give it a `type`), `function` (a function `visibleRange` or format), `messages` (a view's `buttonText`), `at-creation` (an option that cannot change on an existing calendar), `rules` (an event's own `overlap` and `constraint`), `google` (`googleCalendarId`), `from-locale` (`direction`). A view that cannot be drawn is said with the import that draws it (for instance `listWeek:@dzcalendar/dom/list`). |
| `zone-guessed` | A time without a zone was read in the calendar's zone (`detail`: the zone), or the browser's zone was used. |
| `unknown-zone` | `timeZone` is not an IANA zone (error). |
| `invalid-option` | An option could not be read, or the calendar refused it; it is left out (error). |
| `invalid-event` | An event or a source could not be read (error). |
| `invalid-start`, `invalid-end`, `invalid-exdate` | A date of an event could not be read (error). |
| `invalid-resource` | A resource without an id (error). |

### Views that need an import

A view of the list, multi-month or timeline family is drawn only once its entry is imported, and the translation says so for the toolbar's views and the first view:

| Views | Import |
|---|---|
| `listDay`, `listWeek`, `listMonth`, `listYear` | `import '@dzcalendar/dom/list'` |
| `multiMonthYear` | `import '@dzcalendar/dom/multimonth'` |
| `timeline…`, `resourceTimeline…` | `import '@dzcalendar/pro'` |

## Recipes

### Translate first, create yourself

```ts
import { createCalendar } from '@dzcalendar/dom';
import { fromFullCalendar } from '@dzcalendar/compat-fullcalendar';

const translation = fromFullCalendar({
  timeZone: 'Europe/Paris',
  initialView: 'dayGridMonth',
  height: 600,
  events: [{ title: 'Standup', daysOfWeek: [1, 2, 3, 4, 5], startTime: '09:30', endTime: '09:45' }],
});

// What your options became, and what was said.
console.log(translation.options.initialView, translation.problems.map((p) => `${p.code} ${p.path} ${p.detail ?? ''}`));

const calendar = createCalendar(element, translation.options);
const unwire = translation.attach(calendar);

// Later.
unwire();
calendar.destroy();
```

### A callback that can refuse a move

```ts
import { createFromFullCalendar } from '@dzcalendar/compat-fullcalendar';
import type { EventDropArg } from '@dzcalendar/compat-fullcalendar';

const { calendar } = createFromFullCalendar(element, {
  timeZone: 'Europe/Paris',
  initialView: 'timeGridWeek',
  editable: true,
  events: [{ id: 'a', title: 'Consultation', start: '2026-10-21T09:00:00+02:00', end: '2026-10-21T09:45:00+02:00' }],
  eventDrop: (info: EventDropArg) => {
    // The server said no: revert() is an undo through the calendar's history.
    if (info.event.start.getHours() < 8) info.revert();
  },
});

console.log(calendar.kernel.getState().view.type);
```

### Elements of the page dropped onto the calendar

```ts
import { Draggable, createFromFullCalendar } from '@dzcalendar/compat-fullcalendar';

const { calendar } = createFromFullCalendar(element, {
  timeZone: 'Europe/Paris',
  initialView: 'timeGridWeek',
  editable: true,
  droppable: true,
});

const list = document.createElement('ul');
list.innerHTML = '<li class="task">Prepare the report</li><li class="task">Call the supplier</li>';
document.body.append(list);

const draggable = new Draggable(list, {
  itemSelector: '.task',
  eventData: (el) => ({ title: el.textContent ?? '', duration: '01:00' }),
});

// Later.
draggable.destroy();
calendar.destroy();
```

### Laying options on a calendar that exists

```ts
import { createCalendar } from '@dzcalendar/dom';
import { applyFullCalendar } from '@dzcalendar/compat-fullcalendar';

const calendar = createCalendar(element, { timeZone: 'Europe/Paris' });

// The first time: the view and the date apply.
const first = applyFullCalendar(calendar, { initialView: 'dayGridMonth', events: [{ id: 'a', title: 'One', start: '2026-10-21' }] });
console.log(first.problems.length);
first.detach();

// Afterwards: `initial: false`, so that changing options does not send the calendar back to its first view.
const next = applyFullCalendar(calendar, { initialView: 'dayGridMonth', events: [{ id: 'b', title: 'Two', start: '2026-10-22' }] }, { initial: false });
next.detach();
```

## Documentation

- [Migrating from FullCalendar](https://plinthworks.github.io/dzcalendar/getting-started/migrating-from-fullcalendar/)
- [Installation](https://plinthworks.github.io/dzcalendar/getting-started/installation/)
- [Views](https://plinthworks.github.io/dzcalendar/guides/views/), [event sources](https://plinthworks.github.io/dzcalendar/guides/event-sources/), [time zones](https://plinthworks.github.io/dzcalendar/guides/time-zones/), [drag and drop](https://plinthworks.github.io/dzcalendar/guides/drag-and-drop/)
- [All options](https://plinthworks.github.io/dzcalendar/options/)

## License

MIT

---

## Français

Passer une application de FullCalendar à DzCalendar : ses options et ses callbacks traduits à l'exécution, chaque supposition et chaque option sans équivalent signalées.

[English](#dzcalendarcompat-fullcalendar) · **Français**

### Ce que c'est

Vous donnez à `createFromFullCalendar` l'objet d'options que votre application FullCalendar possède déjà. Vous recevez un calendrier DzCalendar (même vue, mêmes dates, mêmes événements, même édition, mêmes callbacks) et une liste de `problems` : ce qui a été deviné, et ce qui n'a pas d'équivalent. Le calendrier est dessiné quand même. Rien ne lève d'exception.

Ce paquet décrit et reproduit uniquement le **comportement observable**. Il ne contient aucun code de FullCalendar et n'en importe rien : votre application abandonne les paquets `@fullcalendar/*`. Son compagnon `@dzcalendar/migrate` (la commande `dz-migrate`) réécrit votre code source pour l'utiliser.

Ce qu'il fait pour vous :

- lit les **options de vue et de date** (`initialView`, `initialDate`, `firstDay`, `weekends`, `hiddenDays`, `views` personnalisées, `visibleRange`), jours de la semaine convertis ;
- lit les **événements et les sources** : tableaux, flux JSON (une URL), fonctions, flux iCalendar ; événements récurrents par `daysOfWeek` ou par `rrule` ;
- lit l'**édition et les règles** : `editable`, `selectable`, contraintes, chevauchement, `eventAllow`, `selectAllow`, `validRange` ;
- lit les **ressources** (`children` imbriqués aplatis), les colonnes de ressources, et tous les **hooks de rendu** (`eventContent`, `dayCellDidMount`, …) ;
- appelle vos **callbacks** (`eventClick`, `dateClick`, `select`, `datesSet`, `eventDrop`, `eventResize`, `eventChange`, …) avec les mêmes informations, sous forme d'objets simples ;
- fournit `Draggable` pour glisser des éléments de la page sur le calendrier.

### Installation

```bash
npm install @dzcalendar/core @dzcalendar/dom @dzcalendar/theme @dzcalendar/compat-fullcalendar
```

Il dépend de `@dzcalendar/core`, `@dzcalendar/dom` et `@dzcalendar/ical`. Une vue de la famille liste, multi-mois ou timeline demande son propre import (voir [Vues qui demandent un import](#vues-qui-demandent-un-import)).

### Démarrage rapide

```ts
import '@dzcalendar/theme/dzcalendar.css';
import { createFromFullCalendar } from '@dzcalendar/compat-fullcalendar';
import type { DateClickArg, EventClickArg } from '@dzcalendar/compat-fullcalendar';

const { calendar, problems, detach } = createFromFullCalendar(element, {
  timeZone: 'Europe/Paris',
  locale: 'fr',
  initialView: 'timeGridWeek',
  initialDate: '2026-10-21',
  firstDay: 1,
  headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek' },
  slotMinTime: '07:00:00',
  slotMaxTime: '20:00:00',
  editable: true,
  selectable: true,
  events: [
    { id: 'a', title: 'Consultation', start: '2026-10-21T09:00:00', end: '2026-10-21T09:45:00' },
    { id: 'b', title: 'Congés', start: '2026-10-26', end: '2026-10-29', allDay: true },
  ],
  eventClick: (arg: EventClickArg) => console.log(arg.event.title, arg.event.start),
  dateClick: (arg: DateClickArg) => console.log(arg.dateStr, arg.allDay),
});

// Le premier événement avait une heure murale sans fuseau : lue dans le fuseau du calendrier, et signalée.
for (const p of problems) console.log(p.severity, p.code, p.path, p.detail);

// Plus tard : débrancher les callbacks et détruire.
detach();
calendar.destroy();
```

`calendar` est un `CalendarInstance` DzCalendar ordinaire (`update`, `navigate`, `run`, `undo`, …) : vous pouvez passer à l'API native une option à la fois.

### Comportement : où il diffère exprès

- **Fuseaux.** Une heure sans décalage ni fuseau est une heure murale : elle est lue dans le fuseau du calendrier, et signalée (`zone-guessed`). Une `Date` (ou des millisecondes depuis l'epoch) est un instant. `timeZone: 'local'` est le fuseau du navigateur, signalé ; `'UTC'` est UTC ; un nom IANA est lui-même. Sans aucun `timeZone`, le fuseau du navigateur est utilisé, et signalé (ou celui donné dans le `timeZone` de `CompatOptions`).
- **Les jours de la semaine** se comptent du lundi = 1 au dimanche = 7 (ISO) ; FullCalendar compte dimanche = 0. Converti partout (`firstDay`, `hiddenDays`, `daysOfWeek`).
- **Les couleurs** ne sont pas données par événement : un événement nomme une teinte et le thème décide de sa couleur. Une couleur est gardée dans `extendedProps.color` (et ses voisines) et signalée (`compat-unsupported … tone`).
- **Les callbacks** reçoivent des objets simples (`event` avec `id`, `title`, `start` et `end` en `Date`, `allDay`, `extendedProps`…), pas des objets vivants avec des méthodes. Modifier un événement est une commande (`calendar.run`).
- **Un déplacement refusé est défait par l'historique** : `revert()` est une annulation.
- **`eventDrop`, `eventResize`, `eventChange`** suivent la modification d'une personne (un geste, le clavier, le menu, l'éditeur), pas le `calendar.run` de l'application, la livraison d'une source ni une annulation. Une occurrence déplacée seule est l'événement de la série (son id), déposé.
- **`jsEvent`** est un substitut (`type`, `preventDefault`, `stopPropagation`) : le calendrier ne remet aucun événement natif à ces callbacks. Un clic sur un événement avec une `url` la suit, sauf si `eventClick` renvoie `false` ou appelle `preventDefault()`.
- **`datesSet`**, `view.activeStart/activeEnd` sont la grille affichée (les jours de remplissage d'un mois aussi) ; `currentStart/currentEnd` la période elle-même. `datesSet` est appelé une fois par vue et par dates.
- **`views: {…}`** : ce qui concerne la première vue (l'entrée de sa famille, puis la sienne) est posé sur les options ; les autres sont signalées (`per-view`).
- **Une série sans `startRecur`** court depuis le 3 janvier 2000 (celle de FullCalendar court depuis toujours).
- **Rien ne lève.** Une option que le calendrier refuse est laissée de côté et signalée (`invalid-option`). Les problèmes sont écrits une fois dans la console (`{ warn: false }` pour l'arrêter).

### API

#### `createFromFullCalendar(el, fullCalendarOptions, compat?)`

```text
createFromFullCalendar(
  el: HTMLElement,
  fullCalendarOptions: unknown,
  compat?: CompatOptions,
): { readonly calendar: CalendarInstance; readonly problems: readonly Problem[]; detach(): void }

interface CompatOptions {
  readonly warn?: boolean;       // dire les problèmes une fois avec console.warn ; true par défaut
  readonly timeZone?: string;    // le fuseau quand les options n'en nomment aucun ; par défaut celui du navigateur, signalé
}
```

Fait le calendrier à partir des options de l'autre bibliothèque et branche les callbacks qui le suivent. Chaque option que le calendrier refuse est trouvée clé par clé et laissée de côté (`invalid-option`). `detach()` débranche les callbacks. Dans un navigateur qui charge Temporal après la page (Safari), le calendrier est différé : il est traduit et fait quand Temporal est arrivé (`calendar.ready`), et les problèmes rejoignent la liste à ce moment-là.

#### `applyFullCalendar(calendar, fullCalendarOptions, how?)`

```text
applyFullCalendar(
  calendar: CalendarInstance,
  fullCalendarOptions: unknown,
  how?: { readonly initial?: boolean },
): { readonly problems: readonly Problem[]; detach(): void }
```

Pose les options sur un calendrier qui existe déjà (un `<dz-calendar>` d'Angular en a fait un). Ce qui peut changer en direct est mis à jour clé par clé ; événements, sources et ressources sont remplacés (les sources qui ne sont plus données sont retirées ; les options possèdent les événements : aucun donné veut dire aucun) ; les callbacks sont branchés. `initialView` et `initialDate` ne s'appliquent que la première fois (`initial: false` ensuite, pour que des options qui changent ne renvoient pas le calendrier en arrière). `virtualizeAbove` et `autoPrint` ne peuvent pas changer après la création : elles sont laissées de côté et signalées `compat-unsupported … at-creation`.

#### `fromFullCalendar(options, how?)`

```text
fromFullCalendar(given: unknown, how?: { readonly zone?: ZoneId }): Translation

interface Translation {
  readonly options: CalendarOptions;            // les options de DzCalendar (@dzcalendar/dom)
  readonly problems: readonly Problem[];
  attach(calendar: CalendarInstance): () => void;   // branche datesSet, eventDrop, loading… ; rend le moyen de débrancher
}
```

La traduction seule, sans créer de calendrier : pour une enveloppe de framework, un test, ou pour voir ce que deviennent vos options. Ne lève jamais.

#### `toEvent`, `eventInfo`

```text
toEvent(raw: unknown, zone: ZoneId, path: string, problems: Problem[], defaults?: EventDefaults): EventInput | null
eventInfo(ev: CalEvent, zone: ZoneId): Record<string, unknown>    // un événement en objet simple lu par les callbacks
```

`toEvent` change un événement à la forme de FullCalendar en `EventInput` de DzCalendar (null s'il ne peut pas être lu : le problème est ajouté à `problems`). `eventInfo` va dans l'autre sens : un événement tel que les callbacks le reçoivent.

#### `Draggable`

```text
class Draggable {
  constructor(containerEl: HTMLElement, settings?: DraggableSettings)
  readonly containerEl: HTMLElement
  readonly settings: DraggableSettings
  destroy(): void
}
interface DraggableSettings {
  readonly itemSelector?: string;                                  // chaque élément correspondant dans le conteneur, ceux ajoutés plus tard aussi
  readonly eventData?: Record<string, unknown> | ((el: HTMLElement) => Record<string, unknown>);
}
```

Rend des éléments de la page déplaçables sur un calendrier avec `droppable: true`. Les données d'événement peuvent porter une `duration` sous la forme `"00:30"`, `{ minutes: 30 }` ou des millisecondes, `className` / `classNames`, et `create: false` (déposer sans créer d'événement). Sans `eventData`, le texte de l'élément est le titre. Les données sont lues au début du glissement. `destroy()` reprend tout.

#### Types

Les noms qu'une application importe de l'autre bibliothèque, exportés ici pour que seul le chemin d'import change :

```text
CalendarOptions, EventInput, EventSourceInput   // enregistrements lâches
EventApi            { id, groupId, title, start: Date, end: Date, startStr, endStr, allDay, url, classNames, display, extendedProps, resourceIds }
ViewApi             { type, title, activeStart, activeEnd, currentStart, currentEnd }
EventClickArg       { event, el, jsEvent, view }
DateClickArg        { date, dateStr, allDay, resource?, jsEvent, view }
DateSelectArg       { start, end, startStr, endStr, allDay, resource?, jsEvent, view }
EventChangeArg      { event, oldEvent, relatedEvents, revert() }
EventDropArg, EventResizeDoneArg, EventAddArg, EventRemoveArg
DatesSetArg         { start, end, startStr, endStr, timeZone, view }
EventContentArg, EventMountArg   { event, el, timeText, view, isStart, isEnd }
FullCalendarOptions, CompatOptions, Translation, JsEventLike, DraggableSettings
```

### Ce qu'il traduit

| Ce que l'application donne | Ce que fait DzCalendar |
|---|---|
| `initialView`, `initialDate` | Pareil (les noms de vues sont partagés). |
| `timeZone` | Voir Comportement. |
| `locale`, `direction` | La langue ; le sens droite-gauche la suit (`direction: 'rtl'` est signalé : `from-locale`). |
| `firstDay`, `weekends`, `hiddenDays` | Pareil, lundi = 1. |
| `events`, `eventSources` | Des tableaux en événements ; une URL en source JSON (paramètres start, end et timeZone, `extraParams`, `method`) ; une fonction en source à laquelle on donne les dates ; `format: 'ics'` en source iCalendar. |
| `start`, `end`, `allDay`, `title`, `id`, `groupId`, `url`, `classNames`, `extendedProps`, `resourceId(s)`, `display`, `editable`… d'un événement | Les mêmes champs. |
| `daysOfWeek` + `startTime` / `endTime` / `startRecur` / `endRecur` d'un événement | Une série hebdomadaire (RRULE). |
| `rrule` (texte ou objet), `duration`, `exdate` d'un événement | Une série. |
| `editable`, `selectable` | Pareil. |
| `eventStartEditable`, `eventDurationEditable`, `eventResourceEditable` | Par événement (`startEditable`…), sur chaque événement qui ne dit rien, ceux des sources aussi. |
| `slotMinTime`, `slotMaxTime`, `scrollTime`, `snapDuration`, `slotDuration` | Les heures de la grille horaire, le premier défilement, l'aimantation, le créneau. |
| `businessHours` | La même forme, jours convertis. |
| `eventConstraint`, `eventOverlap`, `eventAllow`, `selectAllow`, `validRange` | Les règles (`constraint`, `overlap`, `allow`, `validRange`). |
| `nowIndicator`, `weekNumbers`, `dayMaxEventRows` / `dayMaxEvents`, `eventMaxStack`, `allDaySlot`, `displayEventTime` | Pareil (couloirs, pile). |
| `titleFormat`, `dayHeaderFormat`, `slotLabelFormat`, `eventTimeFormat`, `listDayFormat`, `listDaySideFormat`, `dayPopoverFormat` | `formats` (leurs propres clés et fonctions de format sont signalées). |
| `views: { x: { type, duration, dayCount, dateIncrement, visibleRange } }`, `visibleRange` | Des vues personnalisées par réglages ; un `visibleRange` fonction et `buttonText` sont signalés. |
| `droppable`, `drop`, `eventReceive`, `eventLeave` ; `Draggable` | Pareil, arguments reconstruits ; `Draggable` vient de ce paquet. |
| `headerToolbar`, `customButtons` | Gardés entiers (`left` / `right` deviennent `start` / `end` ; `false` : pas d'en-tête) ; `prevYear` / `nextYear` sont signalés et omis ; l'`icon` d'un bouton devient la classe `fc-icon fc-icon-<nom>`. |
| `resources`, `resourceGroupField`, `resourceOrder`, `resourceAreaColumns` | Pareil (`children` imbriqués aplatis avec leur parent ; les colonnes deviennent `viewOptions.timeline.areaColumns`). |
| `<nom>ClassNames`, `<nom>Content`, `<nom>DidMount`, `<nom>WillUnmount` pour event, dayHeader, dayCell, slotLabel, slotLane, allDay, moreLink, dayPopover, nowIndicator, weekNumber, noEvents, view, resourceLabel, resourceLane, resourceGroupLabel, resourceGroupLane, resourceAreaHeader | Les hooks de rendu, arguments reconstruits ; le contenu peut être du texte, `{ html }` ou `{ domNodes }`. |
| `eventClick`, `dateClick`, `select`, `unselect`, `datesSet`, `eventsSet`, `loading` | Appelés avec les mêmes informations. |
| `eventDrop`, `eventResize`, `eventChange`, `eventAdd`, `eventRemove` | Appelés après la modification d'une personne, avec `revert()`. |
| `eventClassNames`, `eventDisplay` | Sur chaque événement qui ne dit rien. |
| `plugins`, `schedulerLicenseKey`, `themeSystem`, `lazyFetching`, `progressiveEventRendering`, `handleWindowResize`, `windowResizeDelay`, `rerenderDelay`, `selectMirror` | Rien à faire (intégré, ou le thème est le nôtre) ; omis sans rien dire. |

#### Ce qu'il signale

Chaque problème est `{ code, severity, path, detail }` : un court détail lisible par une machine, jamais une phrase.

| Code | Quand |
|---|---|
| `compat-unsupported` | Une option sans équivalent. `detail` dit pourquoi : `css` (`height`, `contentHeight`, `aspectRatio`, `expandRows`, … relèvent désormais du CSS : `--dz-height`), `tone` (`eventColor` et les champs de couleur : les événements nomment des teintes), `locale` (`weekNumberFormat` : le format de la langue), `intl` (les clés propres à un format, comme `meridiem` ou `omitZeroMinute`), `none` (pas d'équivalent), `per-view` (les options propres à une vue au-delà de la première), `built-in` (une `duration`, un `dayCount` ou un `visibleRange` donné à une vue intégrée : donnez-lui un `type`), `function` (un `visibleRange` ou un format fonction), `messages` (le `buttonText` d'une vue), `at-creation` (une option qui ne peut pas changer sur un calendrier existant), `rules` (les `overlap` et `constraint` propres à un événement), `google` (`googleCalendarId`), `from-locale` (`direction`). Une vue qui ne peut pas être dessinée est signalée avec l'import qui la dessine (par exemple `listWeek:@dzcalendar/dom/list`). |
| `zone-guessed` | Une heure sans fuseau a été lue dans le fuseau du calendrier (`detail` : le fuseau), ou le fuseau du navigateur a été utilisé. |
| `unknown-zone` | `timeZone` n'est pas un fuseau IANA (erreur). |
| `invalid-option` | Une option n'a pas pu être lue, ou le calendrier l'a refusée ; elle est laissée de côté (erreur). |
| `invalid-event` | Un événement ou une source n'a pas pu être lu (erreur). |
| `invalid-start`, `invalid-end`, `invalid-exdate` | Une date d'événement n'a pas pu être lue (erreur). |
| `invalid-resource` | Une ressource sans id (erreur). |

#### Vues qui demandent un import

Une vue de la famille liste, multi-mois ou timeline n'est dessinée qu'une fois son entrée importée, et la traduction le dit pour les vues de la barre d'outils et la première vue :

| Vues | Import |
|---|---|
| `listDay`, `listWeek`, `listMonth`, `listYear` | `import '@dzcalendar/dom/list'` |
| `multiMonthYear` | `import '@dzcalendar/dom/multimonth'` |
| `timeline…`, `resourceTimeline…` | `import '@dzcalendar/pro'` |

### Recettes

#### Traduire d'abord, créer soi-même

```ts
import { createCalendar } from '@dzcalendar/dom';
import { fromFullCalendar } from '@dzcalendar/compat-fullcalendar';

const translation = fromFullCalendar({
  timeZone: 'Europe/Paris',
  initialView: 'dayGridMonth',
  height: 600,
  events: [{ title: 'Point quotidien', daysOfWeek: [1, 2, 3, 4, 5], startTime: '09:30', endTime: '09:45' }],
});

// Ce que vos options sont devenues, et ce qui a été dit.
console.log(translation.options.initialView, translation.problems.map((p) => `${p.code} ${p.path} ${p.detail ?? ''}`));

const calendar = createCalendar(element, translation.options);
const unwire = translation.attach(calendar);

// Plus tard.
unwire();
calendar.destroy();
```

#### Un callback qui peut refuser un déplacement

```ts
import { createFromFullCalendar } from '@dzcalendar/compat-fullcalendar';
import type { EventDropArg } from '@dzcalendar/compat-fullcalendar';

const { calendar } = createFromFullCalendar(element, {
  timeZone: 'Europe/Paris',
  initialView: 'timeGridWeek',
  editable: true,
  events: [{ id: 'a', title: 'Consultation', start: '2026-10-21T09:00:00+02:00', end: '2026-10-21T09:45:00+02:00' }],
  eventDrop: (info: EventDropArg) => {
    // Le serveur a dit non : revert() est une annulation par l'historique du calendrier.
    if (info.event.start.getHours() < 8) info.revert();
  },
});

console.log(calendar.kernel.getState().view.type);
```

#### Des éléments de la page déposés sur le calendrier

```ts
import { Draggable, createFromFullCalendar } from '@dzcalendar/compat-fullcalendar';

const { calendar } = createFromFullCalendar(element, {
  timeZone: 'Europe/Paris',
  initialView: 'timeGridWeek',
  editable: true,
  droppable: true,
});

const list = document.createElement('ul');
list.innerHTML = '<li class="task">Préparer le rapport</li><li class="task">Appeler le fournisseur</li>';
document.body.append(list);

const draggable = new Draggable(list, {
  itemSelector: '.task',
  eventData: (el) => ({ title: el.textContent ?? '', duration: '01:00' }),
});

// Plus tard.
draggable.destroy();
calendar.destroy();
```

#### Poser des options sur un calendrier qui existe

```ts
import { createCalendar } from '@dzcalendar/dom';
import { applyFullCalendar } from '@dzcalendar/compat-fullcalendar';

const calendar = createCalendar(element, { timeZone: 'Europe/Paris' });

// La première fois : la vue et la date s'appliquent.
const first = applyFullCalendar(calendar, { initialView: 'dayGridMonth', events: [{ id: 'a', title: 'Un', start: '2026-10-21' }] });
console.log(first.problems.length);
first.detach();

// Ensuite : `initial: false`, pour que des options qui changent ne renvoient pas le calendrier à sa première vue.
const next = applyFullCalendar(calendar, { initialView: 'dayGridMonth', events: [{ id: 'b', title: 'Deux', start: '2026-10-22' }] }, { initial: false });
next.detach();
```

### Documentation

- [Migrer depuis FullCalendar](https://plinthworks.github.io/dzcalendar/fr/getting-started/migrating-from-fullcalendar/)
- [Installation](https://plinthworks.github.io/dzcalendar/fr/getting-started/installation/)
- [Vues](https://plinthworks.github.io/dzcalendar/fr/guides/views/), [sources d'événements](https://plinthworks.github.io/dzcalendar/fr/guides/event-sources/), [fuseaux horaires](https://plinthworks.github.io/dzcalendar/fr/guides/time-zones/), [glisser-déposer](https://plinthworks.github.io/dzcalendar/fr/guides/drag-and-drop/)
- [Toutes les options](https://plinthworks.github.io/dzcalendar/fr/options/)

### Licence

MIT
