# The event editor — `@dzcalendar/pro/editor`

A ready-made editor: a modal dialog with the usual
recurrences. It opens on an event, an occurrence of a series, or a new
event; it saves through the calendar's history (checked against its rules,
undoable with Ctrl+Z) and resolves with what happened.

```ts
import { editorHandlers, openEventEditor } from '@dzcalendar/pro/editor';

cal.update(editorHandlers(cal)); // "Open" and "New event here" (context menu) open it
const outcome = await openEventEditor(cal, { instance }); // 'saved' | 'deleted' | 'cancelled'
await openEventEditor(cal, { create: { allDay: false, start: instant, resourceId: 'r1' } });
```

Angular: `<dz-calendar dzEventEditor (editorClosed)="…">` (`@dzcalendar/pro-angular`).
It takes over `onEventOpen` and `onCreateRequest`.

## What it edits

- **Title**, **when** — tzslot's `createDateTimeRange`: both ends on the
  event's zone, the measured length (a night across a clock change says
  its real hours), the repeated hour, whole days (its own switch) — the
  **zone** (the event's wall clock; changing it keeps the moments),
  **resources** (when the calendar has some), **colour** (a tone).
- **Repeats**: does not repeat; every N days, weeks (on chosen weekdays),
  months (on the day, on the n-th weekday — "the 3rd Wednesday" — or the
  last one), years; ends never, on a date (that whole day, inclusive) or
  after N times. A rule beyond that (hours, set positions, several rules) is
  shown as written, "custom", and kept unless another is picked. WKST is
  the calendar's (a rule created here takes the locale's first day).
- **An occurrence**: "this event / this and following / all events" (the
  calendar's words). The repeat belongs to the series: it shows with "all
  events" only. "All events" with another rule → the series takes it
  (`series.rule` command: excluded dates and moved occurrences kept, its
  own WKST too); moved at the same time, the new rule moves with it (a
  Wednesday rule moved to Thursday repeats on Thursdays). With "does not
  repeat" → the series stops: its first occurrence becomes the event (same
  id, every field kept), moved occurrences stand alone. A single event made
  to repeat keeps its id and every field (`event.repeat` command).
- A rule read another way (its own WKST, `COUNT` instead of a date…) is
  compared as a form, not as text: saving a title does not rewrite it.
  Nothing changed → nothing is written (no empty change of an occurrence).
- A flight's end keeps its own zone (Paris → Tokyo) unless the zone is
  changed in the dialog.
- "This and following" with another rule is not offered: the repeat shows
  with "all events" only (a split series is `event.update` with
  `scope: 'following'`, which keeps the rule).
- Only what changed is sent: a title edited on an event that already
  overlaps another is not refused for its times.
- Checked before saving: a start and an end, a whole interval and count
  (1 or more), at least one weekday, a last date given and not before the
  first. The message is said in the dialog, the field marked
  (`aria-invalid`) and focused.
- A refusal of the rules (constraint, overlap, a resource's own rules,
  `allow`) is said in the dialog, which stays open. A series is checked on
  its occurrences (a year of them, 500 at most), not only its first: a
  daily rule landing on a booked day is refused. A problem code is said in
  words (`problem(code)`).

## Accessibility

`role="dialog"`, `aria-modal`, named by its heading; the title takes the
focus, Tab stays inside (and a focus that leaves for the page comes back;
tzslot's pickers, opened on the body, count as inside). Escape cancels —
not while one of tzslot's pickers is open: Escape closes the picker. A
click outside cancels an untouched form only. The focus goes back to where
it was; opened from the context menu, to the event. The refusal is a
`role="alert"`.

One editor per calendar: a second `openEventEditor` returns the one already
open. Destroying the calendar closes it (`cal.onDestroy`, new in
`@dzcalendar/dom`).

Known upstream: tzslot's date fields carry `aria-haspopup` on a textbox (an
axe "aria-allowed-attr" finding) — to fix in tzslot; the browser check
leaves `.tz-dtr` out and checks the rest of the dialog in full.

## Words and look

`editorMessagesFor(locale)` — English, French, Arabic, Spanish, German;
`defineEditorLocale` adds one; `messages` overrides some. tzslot's widget
has its own words in English, French and Arabic: under Spanish or German its
few labels (the length, "all day") are in English until tzslot has them.
The look reads the calendar's palette (the page's `--tz-*` first, as
`.dz-cal`) and hands it to tzslot's widget and pickers; `EDITOR_CSS` under
`injectStyles: false`.

Size: 10.3 kB gzip; with tzslot's widget, 36.4 kB — what opening the editor
costs. `@tzslot/dom` is an optional peer dependency (install it with the
editor); `@dzcalendar/pro-angular` fetches the editor on its first opening,
not with the application.
