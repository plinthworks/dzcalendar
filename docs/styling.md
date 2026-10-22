# Styling DzCalendar — the contract

What an application may rely on to change how the calendar looks: the
**parts** (classes named dz-…), their **states** (`data-*` attributes), the
**tokens** (custom properties named --dz-…) and the **cascade layers** they
live in. This page is the contract: every part and token the calendar uses
is listed here, and a test (`packages/dom/test/styling-contract.test.ts`)
fails when the code and this page disagree. **A part or token renamed or
removed is a major version**; one added is a minor version.

`docs/theming.md` says how to use the themes; this page is the reference.

## Six ways to change it, lightest first

1. **Tokens** — `.agenda { --dz-accent: #0f766e; --dz-radius: 10px; }`.
2. **Your own rules** — any rule of yours outside a cascade layer wins over
   the calendar's (they are in `@layer dzcalendar.base, dzcalendar.theme`),
   whatever its specificity: `.dz-ev { border-radius: 0 }`.
3. **States** — `[data-today]`, `[data-past]`… on the parts below; with
   Tailwind, `data-[today]:bg-emerald-50` on an element you class.
4. **Classes on any part** — `hooks.<element>.class` (docs/behaviors/
   render-hooks.md) puts your classes (Tailwind utilities, a design
   system's) on the calendar's own elements.
5. **Your own content** — `hooks.<element>.content` and the frameworks'
   templates replace what a part shows.
6. **No look at all** — `look: 'none'` keeps the structure (grids,
   positions, sizes, scrolling, what a layout needs) and drops every colour,
   border, shadow, radius, font and transition, for that calendar only:
   your classes (`hooks.<element>.class`, Tailwind) or your design system
   draw it. The theme's CSS may stay imported: its look is kept from an
   unstyled calendar too. What is drawn only by colour is then yours to
   draw: the now line (`hooks.nowIndicator`), today, the grid's lines, a
   ghost's place, the focus ring of the keyboard's cursor.
   Borders are the look too: a 1-px line's room goes back to the content.
   Kept (no colour of ours): resets (a button as plain text), the page's
   own colour (`Canvas`, the page's scheme) under what sticks or floats (a
   list's day head, the timeline's heads and resource column, the editor),
   opacity (a disabled entry, an event being moved); the editor's buttons and
   fields are the browser's own. Type is the look: heads and rows that size
   to their text follow your font sizes.
   A page with no unstyled calendar pays nothing for this; the first one
   guards the sheets of its document (or shadow root). A page that includes
   the CSS itself (`injectStyles: false`) uses `lookGuardedCss(DZ_CSS)`.

## States (`data-*`)

Present when true, absent when not (`[data-today]`, `data-[today]:`); the
classes beside them (`.dz-dg__cell--today`…) stay too. Rename one and the
contract test fails, as for a part.

| Where | States |
|---|---|
| a day: `.dz-dg__cell`, `.dz-tg__col`, `.dz-tg__dayhead`, `.dz-list__day` (a year's cells too) | `data-date`, `data-weekday` (ISO, Monday `1` … Sunday `7`), `data-today`, `data-past`, `data-future`, `data-outside` (a month's padding day), `data-closed` (business hours closed all that day), `data-folded` (a day that did not exist in the zone), `data-resource` (its column's resource) |
| an event, every view: `.dz-ev`, `.dz-bar`, `.dz-list__ev`, `.dz-tl__ev` (the "+N" panel's bars too) | `data-event-id`, `data-series-id`, `data-tone` (its tone's name), `data-all-day`, `data-background`, `data-past` / `data-future`, `data-selected` (touch), `data-moving` (being moved by a pointer or the keyboard); on a grid's blocks and bars (`.dz-ev`, `.dz-bar` in a grid, `.dz-tl__ev` — not a list's entries nor the panel's bars): `data-continues-before` / `data-continues-after`, the same as the classes ending in `--cont-start` / `--cont-end` (cut by the period's edge) |
| a preview: `.dz-ghost` | `data-invalid` (the rules refuse that place); `data-time` holds the time shown (a value, not a state) |
| a free slot: `.dz-slot` | `data-seats` (seats left, a group session) |
| the calendar: `.dz-cal` | `data-view` (the view's type), `data-dz-theme`, `data-dz-scheme` (`light` / `dark` when forced), `data-dz-density`, `data-dz-event-style`, `data-dz-look` (`none` when unstyled), `data-editable`, `data-loading` |
| a view's surface: `.dz-tg`, `.dz-dg`, `.dz-tl` | `data-dragging`, `data-selecting`, `data-grabbing` (the keyboard holds an event), `data-dropping` (something dragged in is over it) |
| a header button | `aria-pressed` (the view shown, a toggle on: Tailwind's `aria-pressed:`); a view button's `data-view` names the view it shows |
| an ancestor of yours | `data-theme="dark"` / `"light"` on any ancestor is read as the scheme when `scheme` is `'auto'` |

- **Past and future are read when drawn**: a day's when its view is drawn
  (and again when today moves); an event's when its content is drawn (a
  timed event that ends while the page is open keeps `data-future` until it
  is drawn again). A timed event is past once it has ended (a zero-length
  one, from its start), future before it starts — the whole event, not a
  piece of it; an all-day event is neither.
- The timeline's heads carry no day states; its events do.
- **Internal** (the calendar's bookkeeping, not to be relied on):
  `data-key`, `data-segment`, `data-col`, `data-resize-start`,
  `data-resize-end`, `data-dz-classes`, `data-item`, `data-button`,
  `data-action`, `data-sub-side`, `data-dz-gone`, `data-dz-layers`,
  `data-dz-roll`, `data-dzcalendar`.

## The element (`<dz-calendar>`)

Its shadow root exposes two parts: `dz-calendar::part(calendar)` (the
calendar) and `dz-calendar::part(toolbar)` (its header).

## Tokens

### Set by you (the theme API)

| Token | What |
|---|---|
| `--dz-bg`, `--dz-bg-raised`, `--dz-fg`, `--dz-fg-muted`, `--dz-border` | surfaces, text, lines |
| `--dz-accent`, `--dz-accent-fg` | the accent (today, the pressed view, focus rings) and text on it |
| `--dz-danger`, `--dz-warning` | refusals, warnings |
| `--dz-radius`, `--dz-event-radius`, `--dz-font` | corners, an event's corners, the font |
| `--dz-line`, `--dz-today-bg`, `--dz-outside-bg`, `--dz-off-bg`, `--dz-now` | grid lines, today, a month's padding days, closed hours, the now line |
| `--dz-gap-stripe`, `--dz-repeat-bg` | a skipped hour's stripes, a repeated hour's band (clock changes) |
| `--dz-event-bg`, `--dz-event-fg`, `--dz-on-tone`, `--dz-tone-*` | an event's surface and text; text on a solid tone; each tone (the green one is --dz-tone-green; your `defineTheme` tones) |
| `--dz-slot-bg`, `--dz-slot-border`, `--dz-slot-fg`, `--dz-slot-hover-bg` | free slots (`availableSlots`) |
| `--dz-badge-bg`, `--dz-resource-border` | "+N", a resource's boundary |
| `--dz-minute`, `--dz-bar-height`, `--dz-gutter-width`, `--dz-day-head`, `--dz-week-min`, `--dz-allday-max`, `--dz-height` | sizes: a minute's height (the scale), a month bar, the hours' gutter, a day head, a month week's least height, the all-day row's most, the calendar's |

### Set by the calendar on an element (read them, do not set them)

`--dz-event-accent`, `--dz-tone-on` (an event's tone and its text on a solid block: set on the event, so a `--dz-tone-on` of yours on an ancestor does not reach it — set `--dz-on-tone`, or a tone's own `--dz-tone-<name>-on`),
`--dz-len`, `--dz-cols`, `--dz-line-offset` (a time grid column's length,
a grid's columns, where the hour lines fall), `--dz-mm-cols`,
`--dz-mm-min`, `--dz-mm-week-min` (a year's months), `--dz-tl-area`,
`--dz-tl-area-cols`, `--dz-tl-grouprow`, `--dz-tl-lane`, `--dz-tl-lanes`,
`--dz-tl-len`, `--dz-tl-line`, `--dz-tl-row`, `--dz-tl-slot` (the
timeline's geometry). Unprefixed ones (`--t`, `--h`, `--gx`…) are
positions, private.

The --dzc-… and --dzp-… properties are the theme's own palette, private: the calendar reads a --dz-… one first, then the tzslot palette's --tz-… one, then its own. Set the --dz-… ones.

## Parts

### The calendar and its header

| Part | What |
|---|---|
| `.dz-cal`, `.dz-cal--no-now` | the calendar's element; without the now line |
| `.dz-toolbar`, `.dz-toolbar__section`, `.dz-toolbar__section--start`, `.dz-toolbar__section--center`, `.dz-toolbar__section--end`, `.dz-toolbar__section--*` | the header and its three places |
| `.dz-toolbar__group`, `.dz-toolbar__views` | joined buttons; the view switcher |
| `.dz-toolbar__btn`, `.dz-toolbar__prev`, `.dz-toolbar__next`, `.dz-toolbar__today`, `.dz-toolbar__view`, `.dz-toolbar__title` | the header's buttons and title |
| `.dz-toolbar__custom`, `.dz-toolbar__icon`, `.dz-toolbar__text`, `.dz-toolbar__item` | an application's button (`customButtons`), its icon and words; an application's place (`headerItems`) |
| `.dz-editable`, `.dz-loading`, `.dz-dragging`, `.dz-selecting`, `.dz-grabbing`, `.dz-dropping` | the calendar or a view while editable, loading, dragging, selecting, holding an event, receiving a drop |
| `.dz-empty` | "no resources" |
| `.dz-tpl`, `.dz-tpl--*`, `.dz-tpl--header-item`, `.dz-dayhead__content` | where a framework's template is drawn (`dz-tpl--<element>`) |

### Events (every view)

| Part | What |
|---|---|
| `.dz-ev`, `.dz-ev--bg`, `.dz-ev--labelled`, `.dz-ev--selected`, `.dz-ev--source`, `.dz-ev--cont-start`, `.dz-ev--cont-end` | a time grid's event block; a background one; one with a label; selected (touch); being moved; cut at its start, its end |
| `.dz-ev__content`, `.dz-ev__title`, `.dz-ev__time`, `.dz-ev__real`, `.dz-ev__offset` | its content (a template's), title, hours, real length, offset (a repeated hour) |
| `.dz-bar`, `.dz-bar--bg`, `.dz-bar--timed`, `.dz-bar--cont-start`, `.dz-bar--cont-end`, `.dz-bar--in-popover`, `.dz-bar__time` | a bar (a month, the all-day row, the "+N" panel) and its time |
| `.dz-more`, `.dz-more--tg`, `.dz-more--tl` | "+N" (a month, a time grid, a timeline) |
| `.dz-event--invalid` | a preview the rules refuse |
| `.dz-focus` | the keyboard's focus drawn on a bar or a "+N" (what a focus ring would show) |

### The time grid (`timeGridWeek`, `timeGridDay`, resource columns)

| Part | What |
|---|---|
| `.dz-tg`, `.dz-tg__head`, `.dz-tg__heads`, `.dz-tg__corner`, `.dz-tg__row` | the view, its head, the day heads' row, the corner (week number), a row |
| `.dz-tg__dayhead`, `.dz-tg__dayhead--today`, `.dz-tg__dayhead-weekday`, `.dz-tg__dayhead-date`, `.dz-tg__dayhead-text`, `.dz-tg__dayhead-alt`, `.dz-tg__dayhead-note` | a day's head: weekday, date, the words of `formats.dayHeader`, the second calendar's date, a day's length on a clock change |
| `.dz-tg__groups`, `.dz-tg__group`, `.dz-tg__resources`, `.dz-tg__resource` | resource groups' and resources' heads |
| `.dz-tg__allday`, `.dz-tg__allday--none`, `.dz-tg__allday-label`, `.dz-tg__allday-track` | the all-day row (hidden), its label, its bars |
| `.dz-tg__body`, `.dz-tg__grid`, `.dz-tg__gutter`, `.dz-tick`, `.dz-tg__lanes`, `.dz-tg__slotlane` | the scrolling hours, the grid, the hours' labels, a slot's row (`hooks.slotLane`) |
| `.dz-tg__cols`, `.dz-tg__col`, `.dz-tg__col--today`, `.dz-tg__col--resource-start`, `.dz-tg__col--folded`, `.dz-tg__folded-label` | a day's column; today; a resource's first; a day that did not exist |
| `.dz-tg__hours`, `.dz-off`, `.dz-tg__bands`, `.dz-band`, `.dz-band--gap`, `.dz-band--repeat`, `.dz-band--*` | closed hours; clock-change bands (a skipped hour, a repeated one) |
| `.dz-tg__bg`, `.dz-tg__events`, `.dz-tg__mores`, `.dz-tg__slots`, `.dz-slot` | a column's backgrounds, events, "+N", free slots |
| `.dz-now` | the now line |
| `.dz-cursor` | the keyboard's place |

### The day grid and the month (`dayGridMonth`, `dayGridWeek`…)

| Part | What |
|---|---|
| `.dz-dg`, `.dz-dg--month`, `.dz-dg--grow`, `.dz-dg__head`, `.dz-dg__body` | the view (a month; weeks that grow) |
| `.dz-dg__weekdays`, `.dz-dg__weekday`, `.dz-dg__groups`, `.dz-dg__group`, `.dz-dg__resources`, `.dz-dg__resource` | weekday heads; resource groups and resources |
| `.dz-dg__week`, `.dz-dg__cells`, `.dz-dg__cell`, `.dz-dg__cell--today`, `.dz-dg__cell--outside`, `.dz-dg__cell--closed`, `.dz-dg__cell--resource-start` | a week, a day's cell and its states |
| `.dz-dg__num`, `.dz-dg__alt`, `.dz-dg__wk` | the day's number, the second calendar's date, the week's number |
| `.dz-dg__items`, `.dz-dg__item`, `.dz-dg__bars`, `.dz-dg__mores` | a day's events for the keyboard, the bars drawn across days, "+N" |

### A year (`multiMonthYear`)

`.dz-mm`, `.dz-mm__month`, `.dz-mm__title`, `.dz-mm__go`, `.dz-mm__grid`,
`.dz-mm__rows` — the year, a month, its title and link, its grid.

### The list (`listWeek`…)

| Part | What |
|---|---|
| `.dz-list`, `.dz-list__body`, `.dz-list__day`, `.dz-list__head`, `.dz-list__date`, `.dz-list__alt`, `.dz-list__len`, `.dz-list__side` | the list, a day, its heading: date, second calendar, length, `formats.listDaySide` |
| `.dz-list__items`, `.dz-list__li`, `.dz-list__ev`, `.dz-list__dot`, `.dz-list__time`, `.dz-list__title` | an entry: its dot, time, title |
| `.dz-list__empty`, `.dz-list__gap` | "nothing to show"; the space of entries not drawn |

### The timeline (Pro)

| Part | What |
|---|---|
| `.dz-tl`, `.dz-tl--days`, `.dz-tl--resources`, `.dz-tl__scroller`, `.dz-tl__scroll`, `.dz-tl__sheet`, `.dz-tl__body` | the view (in days; with resources) and its scrolling sheet |
| `.dz-tl__head`, `.dz-tl__corner`, `.dz-tl__colhead`, `.dz-tl__resizer`, `.dz-tl__timehead`, `.dz-tl__groups`, `.dz-tl__group`, `.dz-tl__group-text`, `.dz-tl__slots`, `.dz-tl__slot` | the heads: the resource columns' and their resizers, time groups (days, months) and slots |
| `.dz-tl__rows`, `.dz-tl__row`, `.dz-tl__row--group`, `.dz-tl__row--unassigned`, `.dz-tl__area`, `.dz-tl__cell`, `.dz-tl__cell--group`, `.dz-tl__title`, `.dz-tl__expander`, `.dz-tl__group-name` | a row (a group's, "Unassigned"), its resource cells, title, fold button |
| `.dz-tl__lane`, `.dz-tl__lines`, `.dz-tl__line`, `.dz-tl__line--major`, `.dz-tl__line-host`, `.dz-tl__offs`, `.dz-tl__off` | a row's lane, the slot lines, closed hours |
| `.dz-tl__bars`, `.dz-tl__bgs`, `.dz-tl__ev`, `.dz-tl__ev--bg`, `.dz-tl__ev--cont-start`, `.dz-tl__ev--cont-end`, `.dz-tl__ev-title`, `.dz-tl__ev-time`, `.dz-tl__mores` | events, backgrounds, "+N" |
| `.dz-tl__now`, `.dz-tl__cursor` | the now line, the keyboard's place |

### Overlays

| Part | What |
|---|---|
| `.dz-pop`, `.dz-pop__head`, `.dz-pop__title`, `.dz-pop__close`, `.dz-pop__list` | the "+N" panel |
| `.dz-menu`, `.dz-menu__item`, `.dz-menu__label`, `.dz-menu__shortcut`, `.dz-menu__reason`, `.dz-menu__chevron`, `.dz-menu__sub` | the context menu |
| `.dz-ghosts`, `.dz-ghost`, `.dz-ghost--armed`, `.dz-ghost--select`, `.dz-ghost__title`, `.dz-ghost__handle`, `.dz-ghost__handle--start`, `.dz-ghost__handle--end` | a drag's or a selection's preview |
| `.dz-draggable`, `.dz-draggable--dragging`, `.dz-draggable--held`, `.dz-drag-avatar` | an element made draggable (`makeDraggable`), its picture under the pointer |
| `.dz-editor`, `.dz-editor-backdrop`, `.dz-editor__form`, `.dz-editor__title`, `.dz-editor__row`, `.dz-editor__field`, `.dz-editor__label`, `.dz-editor__input`, `.dz-editor__num`, `.dz-editor__unit`, `.dz-editor__when`, `.dz-editor__group`, `.dz-editor__days`, `.dz-editor__radios`, `.dz-editor__checks`, `.dz-editor__check`, `.dz-editor__note`, `.dz-editor__error`, `.dz-editor__actions`, `.dz-editor__btn`, `.dz-editor__btn--primary`, `.dz-editor__btn--danger` | the Pro's event editor |
| `.dz-custom` | a view of one's own (`defineView`) |

### Print (Pro)

`.dz-print`, `.dz-print__page`, `.dz-print__page--flow`, `.dz-print__title`,
`.dz-print__body`, `.dz-print__foot` — printed pages.

### Internal (not to be styled)

`.dz-live`, `.dz-sr` (said, not seen), `.dz-probe`, `.dz-tl__probe`,
`.dz-tl__sr` (measures, words for assistive technology), `.dz-leave`,
`.dz-leaving` (motion).
They are listed so that the test knows them; their look is the calendar's
business.
