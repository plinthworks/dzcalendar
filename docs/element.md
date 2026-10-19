# The Web Component — `@dzcalendar/element`

`<dz-calendar>` for any page or framework (plain HTML, React, Vue, Svelte,
a CMS).

```html
<script type="module">
  import '@dzcalendar/element/define';
  import '@dzcalendar/theme/dzcalendar.css';
  const cal = document.querySelector('dz-calendar');
  cal.events = [{ id: 'a', title: 'Consultation', start: '2026-10-21T09:00[Europe/Paris]' }];
  cal.addEventListener('dz-event-click', (e) => console.log(e.detail.event.title));
</script>
<dz-calendar view="timeGridWeek" time-zone="Europe/Paris" locale="fr-FR" editable selectable></dz-calendar>
```

`defineDzCalendar(name)` defines it under another name (`DzCalendarElement`
is the class); `@dzcalendar/element/define` defines `dz-calendar`.

## Attributes (live)

`view`, `date` (ISO), `time-zone`, `locale`, `theme`, `scheme`, `density`,
`editable`, `selectable`, `week-numbers`, `weekends`, `now-indicator`
(booleans: present, or `"false"`; taken away, back to the calendar's
default). Taking away `view`, `date`, `time-zone` or `locale` keeps the
current value. `shadow` and `stylesheet` are read when it first connects
(the mode is kept afterwards). It is a block (`display: block`); its height
is `--dz-height`.

## Properties

`events`, `resources`, `sources` (live; what cannot be read is a
`dz-problem`, never a throw); `options` (any other option —
`businessHours`, `hooks`, `motion`…). A new `options` object with the same
values changes nothing; a live key (the zone, the theme, `editable`,
`businessHours`…) changes in place, events, edits and undo kept; any other
key makes the calendar again on the same store (events and edits kept,
the undo history not) and fires `dz-remade` (`detail.calendar`: the new
one). `calendar` is the DOM calendar (`run`, `undo`, `kernel`…);
`problems` every problem seen (the last 100). Methods:
`navigate('prev' | 'next' | 'today')`, `update(changes)`, `undo()`,
`redo()`. Properties set before the element is defined are taken.

## Events

`dz-dates-set` (`{ view, date, range, title, timeZone }`, drawn and on every
move), `dz-select`, `dz-unselect`, `dz-date-click`, `dz-event-click`,
`dz-event-open`, `dz-create-request`, `dz-slot-click`, `dz-command-refused`,
`dz-proposal-refused`, `dz-resource-problems`, `dz-problem`, `dz-remade`.
They bubble and are composed (they cross a shadow root).
`dz-command-refused`'s detail is `{ result, command }`. Bad input never
throws: an attribute or a property that cannot be read is a `dz-problem`
(`invalid-option`, `path` like `attribute:time-zone`, `detail` a short code:
`unknown-zone`, `unknown-view`, `not-a-date`, `not-a-list`, `refused`), sent
after the current task (a page that listens once the element is parsed
hears it). At mount, what would leave no calendar (an unknown zone or view,
a bad source) is left out and said; the calendar is drawn.

Three events offer something on screen only when listened to on the element
(or given as a callback in `options`): `dz-event-open` ("Open" in the
menu, Enter on an event), `dz-create-request` ("New event here"),
`dz-slot-click` (bookable slots as buttons). Nobody listening, nothing is
offered that would do nothing.

## With Angular

Use `@dzcalendar/angular` (its `<dz-calendar>` component), not this
element: both use the tag name. In an Angular application that also needs
the element, define it under another name: `defineDzCalendar('dz-calendar-wc')`.

## In the page, or isolated

By default it lives in the page: the page's CSS, a theme, Tailwind apply as
anywhere. With `shadow` it is isolated in a shadow root: the calendar's own
CSS is injected there, the page's does not reach in. Style it then with the
palette (`--tz-*`, `--dz-*`, inherited through the shadow root), a theme
linked in (`stylesheet="/path/dzcalendar.css"`) and its parts:
`::part(calendar)`, `::part(toolbar)`.
