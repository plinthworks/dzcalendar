# Angular

Observable behaviour of FullCalendar's Angular component (`@fullcalendar/angular`,
public documentation), described in our own words; no implementation read.

## What the developer does
Puts a calendar in an Angular application, binds its events and its view,
reacts to clicks, customises how an event looks, reads the title for a
header of their own.

## What they observe (reference behaviour)
- One `[options]` object input; changing it is detected by reference (a
  `deepChangeDetection` flag compares deeply, at a cost).
- Content injection by `<ng-template #eventContent>`.
- No Angular-side state for the title or the range: an application calls
  the API object (`getApi()`) and listens to `datesSet`.

## What DzCalendar does — and where it differs on purpose
- **Signal inputs per option** (`events`, `sources`, `timeZone`, `locale`,
  `axis`, `editable`, `selectable`, `businessHours`, `weekends`,
  `weekNumbers`, `hiddenDays`, `messages`) plus `[options]` for the rest;
  an unbound input changes nothing. Events are diffed by the store (by id,
  by value): a new array with the same events redraws nothing — no deep
  change detection.
- **Two-way `[(view)]`, `[(date)]`, `[(selection)]`**: the toolbar and the
  keyboard write the bindings; a value the calendar emitted, handed back,
  changes nothing.
- **`CalendarController`**, provided by each `<dz-calendar>`: `title()`,
  `range()`, `view()`, `date()`, `canUndo()`, `canRedo()`, `loading()`,
  `problems()` as signals, and `prev()`, `next()`, `today()`, `goTo()`,
  `changeView()`, `dispatch()`, `undo()`, `redo()`, `refetch()`. A header of
  one's own is a few lines of template (`cal.controller.title()`).
- **`dzEventContent`**: each event gets its own embedded view, in the
  component's container, its nodes moved into the event's node (as a portal
  does): a change of the event checks that view alone, and a signal of the
  application read in the template refreshes that view alone — no global
  `tick()`. Destroyed with the event's node, or when the template changes.
- **Signals only, Angular 19 and later** (the owner's choice): signal
  inputs, `model()`, `output()`, `contentChild()`; no decorator inputs.
  Built against 21 and checked by building a fresh application on 19, 20,
  21 and 22 (`npm run test:package`).
- **Zoneless first**: the calendar runs outside change detection and writes
  signals. Under zone.js every call into it (inputs, the controller) runs
  outside the zone; what it emits comes back in (tested with zone.js).
- **Simple to plug**: `imports: [DZ_CALENDAR]` and `<dz-calendar [events]="…" />`;
  no provider needed (zone: the browser's, words: `<html lang>`).
- **A bad value never stops the others**: an unknown view, every day hidden —
  reported to Angular's `ErrorHandler`, the binding gets the real view and
  date back, and the other changes of that round still apply. Callbacks
  given in `[options]` cannot silence the outputs (`onEventClick` and the
  others are the component's).
- `[(selection)]` follows a selection the calendar clears itself (a click
  elsewhere, Escape, another period or view family) through `onUnselect`.
- The widget is created when the component is (inputs come in on the first
  change detection); creation-time options (`views`, `rules`, `scrollTime`…)
  come from `provideDzCalendar({ … })`, at the application or the component.
- Outputs: `dateClick`, `eventClick`, `eventOpen`, `createRequest`,
  `selected` (not `select`: a native `select` event bubbling to the host
  would fire it), `sourceNotice`, `problems`. Saving an edit is a source's
  `save` (Phase 9), not an output with `revert()`.

## Tests
- `packages/angular/test/calendar.test.ts`: templates compiled for real
  (Analog's Vite plugin) under `provideZonelessChangeDetection`.
- `npm run pack:local`, then a throwaway application installs the tarballs
  and runs `ng build` (strict templates, library types checked).
- `scripts/browser.mjs`: `playground/angular.html` in Chrome, axe included.
