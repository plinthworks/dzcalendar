# Theming DzCalendar

A calendar that looks right with one import, and that an application can
change entirely without fighting it.

## 1. Use it as it is

```ts
import '@dzcalendar/theme/dzcalendar.css';
createCalendar(host, { theme: 'slate', scheme: 'auto', density: 'comfortable' });
```

- `theme`: `'standard'` (default), `'slate'`, `'night'`, `'pastel'`, `'frost'`,
  `'solar'`, `'contrast'`, or one of your own (`defineTheme`). Every family has
  a light and a dark palette, all checked for WCAG AA contrast by axe in
  Chrome; `contrast` is the high-contrast family.
- `scheme`: `'auto'` follows the system (`prefers-color-scheme`), `'light'` or
  `'dark'` forces it.
- `density`: `'compact'`, `'comfortable'`, `'spacious'` — the height of a
  minute, of a bar, the type size.
- All three change live: `cal.update({ theme: 'night', scheme: 'dark' })`. In
  Angular: `<dz-calendar theme="night" scheme="dark" density="compact">`.

Without the theme CSS the calendar still works and reads in system colours —
but the ready-made families (`'slate'`…) are in that CSS: without it they
change nothing. In a shadow root, load the theme CSS *inside* that root (the
document's sheets do not reach it); `defineTheme` themes are put there by the
calendar itself. `THEME_NAMES` (exported) lists them; an unknown `theme`,
`scheme` or `density` is refused with a RangeError.

## 2. Change anything — your rules always win

All of the calendar's CSS lives in two cascade layers, `dzcalendar.base` then
`dzcalendar.theme`. **Any rule of yours outside a layer wins over both,
whatever its specificity** — no `!important`, no copying our selectors:

```css
.dz-ev { border-radius: 0; }          /* square events */
.dz-toolbar { display: none; }        /* your own header (see CalendarController) */
```

(Cascade layers: Chrome 99, Safari 15.4, Firefox 97.) One exception: while
an event is dragged, the grabbing cursor is `!important` in the base layer.

### Beside a CSS framework

The calendar is built on no framework — plain CSS. What matters is the
page's **global reset**, which touches every element:

| Your page | Reset | Do |
|---|---|---|
| Tailwind CSS v4 | in `@layer base` | `@import '@dzcalendar/theme/tailwind.css';` before `@import 'tailwindcss';` |
| Tailwind CSS v3 | unlayered preflight | `cssLayers: false` + `@import '@dzcalendar/theme/tailwind3.css';` after `@tailwind base;` |
| Bootstrap 5, normalize.css, older CSS | unlayered | `cssLayers: false` + `@dzcalendar/theme/unlayered.css` |
| Plain modern CSS | none | nothing |

- Layered (the default), the calendar's sheet is appended, so its layers come
  after any the page declared first (Tailwind 4's `base`): the preflight does
  not reset it. `tailwind.css` also puts it *before* Tailwind's utilities, so
  utilities on your own markup inside the calendar win.
- `cssLayers: false` (in Angular `provideDzCalendar({ cssLayers: false })`;
  the first calendar of a document decides): the same CSS outside any layer,
  inserted first. Its class selectors outweigh a reset's `*` and element
  rules; a rule of yours of the same weight, written after, wins.
- Checked in Chrome against the real Tailwind 3 preflight, Bootstrap 5.3
  reboot and Tailwind 4's layered preflight (`npm run test:browser`): every
  element of a week, a month and a list keeps the borders, paddings, margins
  and colours it has on a bare page. The one thing a reset still changes is a
  pointer cursor on events (they are `role="button"`).

**Under a Content-Security-Policy without inline styles** (`injectStyles:
false`): include `DZ_CSS`, `LIST_CSS`, `MULTIMONTH_CSS` (from their entries)
and, for a `defineTheme` theme, `themeCss('clinic')` in your own stylesheet.

**In a shadow root**, load the theme CSS inside the root; its sizes are on `:root, :host`.

## 3. Change the colours — tokens

The palette is shared with tzslot (`--tz-*`), so a page using both libraries
sets it once. The calendar's own tokens are `--dz-*`.

| Token | What |
|---|---|
| `--tz-bg`, `--tz-bg-raised` | backgrounds (page, raised: popovers, outside days) |
| `--tz-fg`, `--tz-fg-muted` | text, secondary text |
| `--tz-border` | lines |
| `--tz-accent`, `--tz-accent-fg` | accent (today, selected view, focus) and the text on it |
| `--tz-danger`, `--tz-warning` | refusals; clock-change marks |
| `--tz-radius`, `--tz-font` | corner radius, font |
| `--dz-today-bg`, `--dz-now` | today's column/cell; the current-time line |
| `--dz-event-bg`, `--dz-event-fg`, `--dz-event-accent` | events (by default derived from the accent or the event's tone) |
| `--dz-tone-<name>` | named event tones (`tone: 'green'` on an event) |
| `--dz-height`, `--dz-minute`, `--dz-bar-height`, `--dz-gutter-width` | sizes |
| `--dz-allday-max` | how tall the all-day row grows before it scrolls |

```css
:root { --tz-accent: #0a7d5a; }      /* any family follows: the page first */
.dz-cal { --dz-radius: 2px; }
```

**The page first.** A family (ready-made or `defineTheme`) gives *defaults*
(`--dzp-*`); the calendar reads `--dz-x`, else the page's `--tz-x` (set on
`:root` or any ancestor), else the family's, else a system colour. So a
`--tz-accent` on `:root` recolours a calendar in `'slate'` too. The flip side:
a page loading tzslot's theme (which sets `--tz-*` on `:root`) shows tzslot's
palette whatever family is chosen. The palette is resolved on `.dz-cal`: set
`--tz-*` on the calendar or an ancestor, not on an event (events have
`--dz-event-*` and tones).

A value may be a `light-dark(light, dark)` pair where the browser supports it
(Safari 17.5+); a family's own light and dark need no such support.

## 4. A theme of your own

```ts
import { defineTheme } from '@dzcalendar/dom';
defineTheme('clinic', {
  accent: ['#0a7d5a', '#3ddc97'],          // [light, dark]
  bg: ['#ffffff', '#0f1915'],
  radius: '4px',
  tones: { urgent: ['#b91c1c', '#f87171'] },
});
createCalendar(host, { theme: 'clinic' });
```

It is injected in the `dzcalendar.theme` layer (outside any layer with
`cssLayers: false`), so your plain CSS still wins, and so does a `--tz-*` of
your page. Only the tokens listed above are accepted; values are checked (no
`;`, `{`, `url(` …). Defined again, calendars using it follow at once, in
shadow roots too.
In SCSS, the theme's variables are `!default`:
`@use '@dzcalendar/theme/dzcalendar' with ($accent: (#0a7d5a, #3ddc97));`.

## 5. Calendars of the dates

- `displayCalendar: 'islamic-umalqura'` writes titles, day numbers and labels
  in that calendar (any Intl calendar: `persian`, `hebrew`…). Data and grids
  stay Gregorian.
- `secondaryCalendar: 'islamic-umalqura'` shows that calendar's day beside
  each date (its month on the 1st), in headings and in what a screen reader
  says; it is not shown when it is the calendar already displayed. For an
  Arabic Hijri calendar with the Gregorian date beside it:
  `{ locale: 'ar-SA', displayCalendar: 'islamic-umalqura', secondaryCalendar: 'gregory' }`
  (write `displayCalendar` explicitly: engines differ on `ar-SA`'s default).
- Titles name every month of the display calendar the period covers (a
  Gregorian month in Hijri reads "Rabiʻ II – Jumada I 1448 AH"). Week numbers
  stay ISO/locale weeks. Umm al-Qura through Intl is the civil table, not the
  sighting-based dates of Ramadan and the Eids. A calendar Intl does not
  support is refused (RangeError).
- Browser baseline: Safari / iOS 15.4, Chrome 99, Firefox 97 (cascade
  layers). Light and dark need no `light-dark()`: each family's two palettes
  are plain values switched by `scheme`, `[data-theme]` and
  `prefers-color-scheme`. Where `color-mix()` is missing (Safari before 16.2),
  tints (events, today, outside days) fall back to the raised background.
  With `cssLayers: false` the CSS also works before cascade layers.

## 6. Words

See `docs/i18n.md`: English and French built in, Arabic, Spanish and German as
imports (`import '@dzcalendar/dom/locales/ar'`), `messages: { today: '…' }` to
change any word, `defineLocale` for a new language.

## 7. Printing

The theme's print sheet prints what scrolls whole, in colour; call
`cal.preparePrint()` (or set `autoPrint: true`) so everything is mounted and
no event hides behind "+N".
