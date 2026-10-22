# Behaviour sheet — the header's layout and the application's buttons

What a developer does: says what the calendar's header holds and where —
the arrows, "today", the title, the view buttons — and adds buttons of their
own (reload, a business view, "blocked slots"). What they observe in the
other library: three places (start, centre, end), names separated by a
space for separate groups and by a comma for buttons joined together, and a
table of the application's buttons, each with its words, an icon, a hint and
what a click does; `false` and there is no header. Written in our own words
from its public documentation; the names are ours where they differ.

## What DzCalendar does

```ts
headerToolbar: {
  start: 'prev,next today',
  center: 'title',
  end: 'reload blocked dayGridMonth,timeGridWeek,timeGridDay',
},
customButtons: {
  reload: { text: 'Reload', icon: 'my-icon-refresh', click: () => calendar.refetch() },
  blocked: { text: 'Blocked slots', active: () => mode === 'blocked', click: () => toggle() },
},
```

- **Names**: `prev`, `next`, `today`, `title`, a view's type, the name of
  one of `customButtons`. An unknown name, or a view this renderer cannot
  draw, is left out and said once in the console. An application's button
  under a built-in name takes its place.
- **Groups**: a space separates groups; a comma joins buttons into one group
  (drawn as one piece). A group of view buttons is the view switcher (its
  current view pressed).
- **`false`**: no header at all (the application draws its own, with
  `calendar.navigate`, `calendar.kernel.getState().title`, …).
- **Without `headerToolbar`**: the header as before — the arrows and "today"
  with the title at the start, the views of `headerViews` at the end.
- **An application's button**: `text` (its words, its accessible name),
  `hint` (on hover; the accessible name when there is no text), `icon` (a
  class put on an `aria-hidden` span before the words: the application's
  icon font or a mask), `click(event, el)`, `active` (a boolean, or a
  function re-read each time the calendar draws): the button is then a
  toggle (`aria-pressed`) and drawn pressed like the current view.
- Both are live through `update()`: the header is redrawn only when its
  layout changed or a button looks different (words, hint, icon, a toggle or
  not). New functions for the same buttons — a framework's closures, made
  at each render — are taken without redrawing: the button keeps the focus.
  A focused piece the new layout moves keeps the focus too.
- A click re-reads the toggles at once (`aria-pressed` follows).
- A `click` that throws is reported (an unhandled rejection); the calendar
  goes on. A button without a `click` function, a place that is not a
  string, a `headerToolbar` that is not an object or `false`: left out (the
  header as by default), said once in the console — nothing throws. A
  button with neither words nor hint is named by its key, and said.
- Joined buttons that are not views are one piece to the eye only (no
  group role); joined views are the view switcher, a named group.
- React: a prop given `undefined` leaves the calendar's value; give the
  layout you want back (`{ start: 'prev today next title', end: '…' }`).

## The application's places (`headerItems`)

`headerItems: { filter: { content, class, didMount, willUnmount } }` and the
name in `headerToolbar`: a place of the application's (a menu, a filter, a
badge) — React `headerItems`, Vue `#header-item-<name>`, Angular
`<ng-template dzHeaderItem="name">`. Its context: `name`, `view`, `title`;
`content` is asked again when the view or the title changes — return the
same node to keep a control's focus and value (the frameworks do). A
place is kept by name across layouts; its name leaving the layout lets it
go. Order of names: a button of the application's, then a place, then the
calendar's own (`prev`, `title`, a view).

## Where we differ on purpose

- No icon font of ours: `icon` is a class of the application's.
- `prevYear` / `nextYear` are not names here (the compat says so).
- The look (grouped buttons, a centred title, the pressed view filled)
  belongs to the CSS pass; the structure is in place for it.
