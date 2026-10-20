# Resources — one column per doctor, room or machine

A resource is whatever events are booked on. Resource views draw one column
per resource and date; each column shows its resource's events, its own
business hours (read in its own zone), and checks its own rules. Everything
here is in `@dzcalendar/core` and `@dzcalendar/dom` (MIT); the timeline comes
with `@dzcalendar/pro`.

```ts
createCalendar(host, {
  initialView: 'resourceTimeGridDay',
  resources: [
    { id: 'benali', title: 'Dre Benali', service: 'Cardiology' },
    { id: 'haddad', title: 'Dr Haddad', service: 'Cardiology', timeZone: 'Asia/Riyadh',
      businessHours: { daysOfWeek: [7, 1, 2, 3, 4], start: '08:00', end: '12:00' }, eventConstraint: 'businessHours' },
  ],
  resourceGroupField: 'service',
  events: [{ id: 'a', title: 'Visit', start: '2026-10-21T09:00[Europe/Paris]', resourceId: 'benali' }],
  editable: true,
});
```

## Views

| View | What it shows |
|---|---|
| `resourceTimeGridDay` | the hours of one day, a column per resource (no row of dates: the title says the day) |
| `resourceTimeGridWeek` | each resource's seven days side by side, under its name |
| `resourceDayGridDay`, `resourceDayGridWeek` | the same as rows of days |
| `resourceDayGridMonth` | each week row holds every resource's week |

They are the time grid and the day grid given resources (`ViewSpec.resources`),
so everything those views do works here: drag, resize, select, the context
menu, the keyboard, "+N", bookable slots, windowing. A custom view takes
`resources: true` too. Resources go first: a resource's days are side by
side (dates above resources is not offered).

## Resources

```ts
interface ResourceInput {
  id: string;
  title?: string;
  parentId?: string;          // a tree: a department above its doctors
  order?: number;             // siblings by this first (lowest first)
  timeZone?: string;          // where its business hours are read
  businessHours?: BusinessHoursInput;   // its own, over the calendar's
  eventConstraint?: ConstraintSpec;     // where its events may go, over the calendar's
  eventOverlap?: boolean;     // false: no two of its events overlap; true: they may
  classNames?: string[];      // on its head
  extendedProps?: object;
  [field: string]: unknown;   // your own fields: ordering, grouping
}
```

- **Order:** depth first, children right under their parent. Siblings go by
  `order`, then by `resourceOrder` (`'title'`, `'-title'` descending,
  `'unit,title'`, or a comparison), then as given. Fields are read from the
  resource, then from `extendedProps`. Numbers compare as numbers, text by
  code unit (the same order on every machine), absent values last.
- **Groups:** `resourceGroupField: 'service'` puts a head over each run of
  resources sharing the value, in the order the groups first come. Grouping
  applies to the roots; each root's subtree stays in its group.
- **Bad input never throws.** `kernel.setResources(list)` (and the
  `resources` option) returns what it could not read — the calendar hands it
  to `onResourceProblems(problems)` (Angular: `(resourceProblems)`):
  `invalid-resource` (not an object, no id — refused; a field that cannot be
  read — dropped with a warning), `duplicate-id` (the second one refused),
  `unknown-zone`, `unknown-resource` (an unknown parent: the resource becomes
  a root), `resource-cycle` (the first resource of a cycle, in input order,
  becomes a root). `kernel.getResourceProblems()` reads them again. A
  `resourceOrder` comparison that throws leaves the input order
  (`invalid-resource` at `resourceOrder`).
- `update({ resources })` replaces them (the same array again changes
  nothing); `update({ resourceOrder, resourceGroupField })` reorders.
- An event goes on resources with `resourceId` or `resourceIds`. An event
  on two resources is drawn in both columns. Events on no resource are not
  shown in resource views (the timeline has an "Unassigned" row).
- No resources at all (none given, or not loaded yet): "No resources to
  show" in place of the columns (`noResources`, `.dz-empty`).
- Slots: `availableSlots` entries with a `resourceId` show in that
  resource's columns only. A resource's `timeZone` is not handed to
  `findSlots`: give the provider's availability its zone there.

## Zones and hours

Every column is drawn in the calendar's zone. A
resource's `timeZone` is where its hours are read: a doctor in Riyadh open
08:00–12:00 is shaded outside 07:00–11:00 in Paris in October, and outside
06:00–10:00 from the 25th, when Paris falls back an hour. A resource without
hours of its own takes the calendar's `businessHours`, read in its zone.

## Rules

Each resource an event goes on checks, in its own zone:

- its `eventConstraint`, else the calendar's `rules.constraint` — and
  `'businessHours'` means its own hours (else the calendar's);
- its `eventOverlap` for the events it shares: `false` refuses an overlap
  even if the calendar allows them, `true` allows it even if the calendar
  refuses them. Events on different resources never meet; an event on no
  resource meets every event.

A refused drop is said and handed to `onCommandRefused` with the violations
(`constraint` with the resource's id, `overlap` with the other event's).

## Moving between resources

A drag from one resource's column to another's swaps that resource for the
new one and keeps the others: an event on Dr A and Dr C, dragged from A to B,
ends up on B and C. A resize keeps the resources. A selection, a date click
(`onDateClick`) and the context menu's "New event" carry the column's
`resourceId`.

## Keyboard and screen readers

- Each column's name starts with its resource ("Dr Haddad, Wednesday
  21 October"); a day grid's cell too. The heads themselves are hidden from
  screen readers (the columns say whose they are).
- Left and right stay in the days of the cursor's resource (past the last
  one, the next period, same resource). **Alt+Left and Alt+Right** go to the
  previous or next resource, the same day and time; past the last one:
  "No further". Page Up and Down change the period.
- Holding an event (M), Alt+Left/Right move it to the next resource, the
  same day and time; plain arrows move it in time, on its resource. What is
  said starts with the new resources' names. Resources replaced while an
  event is held let it go ("Move cancelled"); a cursor whose column went
  away starts again at its home.

## Look

- Heads: `.dz-tg__resource` / `.dz-dg__resource` (with the resource's
  `classNames`, and `data-resource`), groups `.dz-tg__group` /
  `.dz-dg__group`. Where a resource's days start, a 2 px line
  (`--dz-resource-border`).
- `hooks.resource.content({ resource }, el)` (`ResourceContentCtx`) draws a head (a photo, a
  specialty); null keeps the title.
- Angular: `[resources]`; `resourceOrder` and `resourceGroupField` in
  `[options]`.

## Limits (on purpose, for now)

- No horizontal scrolling: forty resources over a week are 280 thin columns.
  Use the day view for many resources, or the timeline (15b).
- No per-column zone (K.6), no dates above resources.
- Events whose resource is unknown are kept but shown in no resource view;
  `unknown-resource` is not reported for them (resources may arrive after
  the events).
