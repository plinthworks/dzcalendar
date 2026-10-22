# Custom views

Three ways, from the lightest to the most control.

## 1. By settings: a family, and what differs

`views` takes, beside the built-in views, a view's settings: its `family`
(`timeGrid`, `dayGrid`, `list`, `multiMonth`, the Pro's `timeline`) and what
changes. Its type is its key; the rest is a plain view's (one day, aligned on
the date, every day shown).

```ts
createCalendar(el, {
  timeZone: 'Africa/Algiers',
  initialView: 'troisJours',
  headerViews: ['troisJours', 'quinzaine', 'congres', 'timeGridWeek'],
  views: {
    // Three days from the date shown; previous / next move by three.
    troisJours: { family: 'timeGrid', duration: { days: 3 } },
    // Two weeks, aligned on the week's first day, moving one week at a time.
    quinzaine: { family: 'dayGrid', duration: { weeks: 2 }, alignment: 'week', dateIncrement: { weeks: 1 } },
    // A fixed period: a congress, 3 to 12 November (the end is exclusive).
    congres: { family: 'timeGrid', visibleRange: { start: Temporal.PlainDate.from('2026-11-03'), end: Temporal.PlainDate.from('2026-11-13') } },
  },
  messages: { views: { troisJours: '3 jours', quinzaine: 'Quinzaine', congres: 'Congrès' } },
});
```

- `duration`, `alignment` (`'day'`, `'week'`, `'month'`, `'year'`, `'none'`),
  `dateIncrement` (how far previous / next move), `dayCount` (count shown
  days: four weekdays skipping a hidden weekend), `hiddenDays`,
  `fixedWeekCount` and `showNonCurrentDates` (month grids), `resources`
  (one column per resource).
- **`visibleRange`**: the period shown whatever the date; previous, next
  and "today" stay on it (hide them in `headerToolbar` for such a view). In
  a day grid its rows start on the week's first day; the arrows and "today"
  are disabled while it is shown. A range that ends before it starts, or
  whose days are all hidden, is refused (`RangeError`), and the calendar
  stays on the view it showed. In a multi-month view it is one grid.
- Settings are checked when the calendar is made: a duration or a step of
  nothing, a day count below 1, a range not made of `PlainDate`s are
  refused. A month grid of several months (`{ family: 'dayGrid', duration:
  { months: 2 }, alignment: 'month' }`) shows them in one grid of weeks;
  `fixedWeekCount` is true by default, as for the built-in month.
- A whole `ViewSpec` is taken too (`{ ...BUILTIN_VIEWS.timeGridWeek, type:
  'semaine', hiddenDays: [5] }`).

## 2. A drawing of your own: `defineView`

The calendar keeps the header, the title, navigation and the sources; you
draw the days.

```ts
import { defineView } from '@dzcalendar/dom/custom';

const agenda = defineView({
  type: 'agenda',
  duration: { days: 3 },
  render(el, data, api) {
    // data.days: every shown day with its events in the calendar's zone (empty days too);
    // data.instances: each event once; data.range, data.state, data.locale, data.messages.
    el.replaceChildren(...data.days.map((d) => /* … */ document.createElement('section')));
    // api.open(instance) does what a click does elsewhere; api.menu(…), api.announce(text).
  },
  destroy(el) {},
});
createCalendar(el, { views: { agenda }, initialView: 'agenda' });
```

`render` runs again on every change, on the same `el`. A throw is reported
and what was drawn stays.

## 3. A family of your own: `registerView`

For gestures and the keyboard as the built-in views have them: a model
family in the kernel (`registerModelFamily(family, { build, update? })`,
pure, given the range and the store's snapshot) and a renderer in the DOM
(`registerView(family, (ctx) => ({ element, body, render, tick, destroy,
surface? }))`). `surface` takes pointer gestures (drag, resize, select)
through `InteractionSurface`; `ViewCtx` gives the kernel, the frame
scheduler, the locale, the zone, the hooks and the formats. The Pro's
timeline is written this way (`packages/pro/src/timeline`).

## From FullCalendar

`views: { congres: { type: 'timeGrid', visibleRange: { start, end } } }`,
`{ type: 'timeGrid', duration: { days: 4 } }`, `dayCount`, `dateIncrement`,
and a calendar-wide `visibleRange` are translated by
`@dzcalendar/compat-fullcalendar`; a `visibleRange` given as a function and
a view's `buttonText` are said (give the words in `messages.views`).
