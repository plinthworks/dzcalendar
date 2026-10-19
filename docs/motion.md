# Motion — `@dzcalendar/dom` hooks, `@dzcalendar/motion-gsap`

Three levels (owner's decisions):

- **Nothing to install:** a light Web Animations base, the default — the
  period slides its way, new events fade in, a menu or a "+N" panel opens.
  Transform and opacity only; nothing where `Element.animate` is missing.
- **`motion: createGsapMotion()`** (`@dzcalendar/motion-gsap`, GSAP 3.13+
  as the application's own dependency): everything below.
- **`motion: NO_MOTION`:** nothing moves.

Under `prefers-reduced-motion: reduce`, nothing moves at any level (and
the setting is followed if it changes while the page is open). GSAP is
never in `@dzcalendar/dom` (a test checks it). Nothing is ever hidden with
`visibility` (opacity only): a focused event keeps the focus. One adapter
may serve several calendars in turn; `update({ motion })` swaps it (the old
one's animations finish first); `NO_MOTION` turns everything off.

```ts
import { createGsapMotion } from '@dzcalendar/motion-gsap';
createCalendar(el, { motion: createGsapMotion() }); // "sober"
createCalendar(el, { motion: createGsapMotion({ preset: 'expressive', zone: 0.9, effects: { odometer: false } }) });
```

## Presets

| | sober (default) | expressive |
|---|---|---|
| feel | soft curves, 200–350 ms, no bounce | springs, a little squash, bounces |
| a period | 0.30 s, slides 4 % | 0.42 s, 7 % |
| a zone change | 0.50 s | 0.70 s |
| month → day | 0.42 s | 0.55 s |

Any value of `MotionPreset` (`view`, `enter`, `drop`, `zone`, `morph`,
`odometer`, `dst`, `slide`, `ease`, `move`, `settle`, `pop`, `stagger`,
`tilt`, `leave`) can be given over the preset.

## Effects (each on by default, `effects: { name: false }` turns one off)

- **`zone`** — the calendar's zone changes (and nothing else: the same
  view and dates): every event that moves glides from its old place to its
  new one — 150 at most. The instant stays; only the wall clock it is read
  on moves. Events that appear (another day now) fade in. A second change
  mid-glide carries on from where the events are seen.
- **`dst`** — a day with a clock change comes into view: its repeated hour
  (a 25-hour day, wall axis) unfolds, its skipped hour folds in, and the
  day's "25 h" note pops.
- **`now`** — once a minute the "now" line glides to its new place (in
  its column: a scroll is not a move) with a soft pulse, every minute.
- **`morph`** — from a grid of day cells (a month, a year's month) to a
  single day: the day opens out of its cell (when the cell is on screen),
  its events settling in.
- **`odometer`** — on a move of dates or views, the title's changed words
  roll up (forward) or down (back); with other words altogether the title
  rolls whole. The title itself already says the new words for assistive
  technology; only a copy marked `aria-hidden` (`data-dz-roll`) rolls over
  it. A new locale or zone simply says its words.
- **`today`** — "today" from more than six weeks away: a long, fast run
  that way, then a soft stop.
- **`depth`** — the day heads travel half the body's way when a period
  slides.

- **`drag`** — a moved event leans with the gesture's speed (3° sober, 9°
  expressive) and glides from slot to slot instead of snapping; a resize
  does not lean. Dropped, it settles; thrown (with `InertiaPlugin`), it
  lands with the speed it was let go with. Refused, it says "no", turns
  upright and goes back.
- **`leave`** — a deleted event (or occurrence) dissolves: the calendar
  hands the motion a copy of it as it was (`.dz-leave` layer, no ids,
  `aria-hidden`). Undone within a minute, it gathers back.
- **`enter`** — an event made from a selection pours out of it; new events
  otherwise arrive as a wave (a third of a second at most).
- **`overlay`** — a context menu grows out of the point it was opened at, a
  "+N" panel out of its link (its events cascading in), the editor out of
  the event (or the selection) — and closes back into it.
- **`seats`** — a slot's seats left roll and pop when a booking changes
  them.
- **`scroll`** — "today" from another date scrolls the hours (or the
  timeline) to now: eased, and stopped by the person's own wheel, touch or
  key. The scroll itself happens without motion too (a behaviour of the
  calendar since 17b).
- **`rows`** — a timeline's group or parent folding or unfolding: the rows
  that stay slide, the rows that open unroll (the rows that close go at
  once).

Plugins are the application's (owner's decision): `createGsapMotion({ plugins:
{ InertiaPlugin, ScrollToPlugin } })`. Without `InertiaPlugin` a drop simply
settles; without `ScrollToPlugin` the scroll properties are tweened
directly.

## Writing an adapter

`MotionAdapter` (all optional): `beforeChange(change)` — the old screen is
still drawn, return what you need of it — then `afterChange(state, change,
body)` once redrawn (return `true` when you animated the change yourself:
`viewChange` and `eventsEnter` are then not called for it);
`titleChange(title, from, to, change)`; `nowTick(nodes)`;
`eventsEnter(nodes, { cause, from? })`; `eventsLeave(copies, info)` (return
a promise: the copies are removed when it settles, or after 2 s) with
`wantsLeave()` (false: nothing is captured); `seatsChange(nodes)`;
`scroll(el, { top, left })` (true: you move it; views use the toolkit's
`scrollEased`); `overlayOpen(el, origin?)`, `overlayClose(el, origin?)`
(the editor waits for it); `dragStart(ghosts, kind)` (the live array;
places in `--gx` / `--gy`); `viewChange`,
`eventsEnter`, `dragStart`, `dropRejected`, `captureLayout` /
`animateLayout` (FLIP), `dropSettle`, `overlayOpen`, `destroy`.
`MotionChange` says the causes (`navigate`, `view`, `zone`, `locale`…), the
direction, and the view, family, date, zone and title before and after.
Every state change comes through (`options` and `resources` too, after a
measure): pick by `causes`. Several changes before one paint arrive as one.
Never change text or layout properties: the calendar's places are custom
properties its CSS reads.
