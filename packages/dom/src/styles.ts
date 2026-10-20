/**
 * The layout the calendar needs to be usable at all: grids, positions, the
 * reset that turns a <button> into a toolbar control. Taste lives in
 * @dzcalendar/theme.
 *
 * Every colour is `var(--dz-specific, var(--dzc-palette))`: the calendar's
 * own variable if set, else the palette, resolved once on .dz-cal — tzslot's
 * --tz-* if the page sets it (one palette dresses both libraries), else the
 * chosen family's --dzp-* (the theme), else something legible with no theme.
 *
 * Positions are axis minutes times `--dz-minute` (the height of one minute),
 * never measured pixels: the core computes, CSS draws, nothing is read back.
 * Sizes are read with fallbacks and never declared on `.dz-cal`, so a value
 * set on any ancestor (the host, the page) reaches the calendar.
 *
 * In the cascade layer `dzcalendar.base` (the theme is `dzcalendar.theme`,
 * after it): a page's own rules, outside any layer, win over both whatever
 * their specificity — `.dz-ev { border-radius: 0 }` is enough, no
 * `!important`. `injectStyles: false` and include `DZ_CSS` yourself under a
 * Content-Security-Policy without inline styles.
 */
export const DZ_CSS = `
@layer dzcalendar.base, dzcalendar.theme;
@layer dzcalendar.base {
.dz-cal {
  /* The palette, resolved once here: the page's --tz-* first, then the family's --dzp-* defaults, then system colours. */
  --dzc-fg: var(--tz-fg, var(--dzp-fg, CanvasText));
  --dzc-bg: var(--tz-bg, var(--dzp-bg, Canvas));
  --dzc-font: var(--tz-font, var(--dzp-font, inherit));
  --dzc-border: var(--tz-border, var(--dzp-border, GrayText));
  --dzc-radius: var(--tz-radius, var(--dzp-radius, 0.375rem));
  --dzc-accent: var(--tz-accent, var(--dzp-accent, Highlight));
  --dzc-fg-muted: var(--tz-fg-muted, var(--dzp-fg-muted, GrayText));
  --dzc-accent-fg: var(--tz-accent-fg, var(--dzp-accent-fg, HighlightText));
  --dzc-warning: var(--tz-warning, var(--dzp-warning, #b45309));
  --dzc-danger: var(--tz-danger, var(--dzp-danger, #b91c1c));
  --dzc-bg-raised: var(--tz-bg-raised, var(--dzp-bg-raised, ButtonFace));
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: var(--dz-height, 40rem);
  color: var(--dz-fg, var(--dzc-fg));
  background: var(--dz-bg, var(--dzc-bg));
  font-family: var(--dz-font, var(--dzc-font));
  color-scheme: var(--tz-color-scheme, var(--dzp-color-scheme, light dark));
}
.dz-toolbar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.25rem;
}
.dz-toolbar__title { margin: 0; margin-inline-start: 0.5rem; font-size: 1.125rem; font-weight: 600; flex: 1; }
.dz-toolbar__btn {
  border: 1px solid var(--dz-border, var(--dzc-border));
  border-radius: var(--dz-radius, var(--dzc-radius));
  background: transparent;
  color: inherit;
  font: inherit;
  padding: 0.25rem 0.625rem;
  cursor: pointer;
}
.dz-toolbar__btn:focus-visible { outline: 2px solid var(--dz-accent, var(--dzc-accent)); outline-offset: 2px; }

.dz-tg { display: flex; flex-direction: column; flex: 1; min-height: 0; border: 1px solid var(--dz-border, var(--dzc-border)); border-radius: var(--dz-radius, var(--dzc-radius)); overflow: hidden; }
.dz-tg__row {
  display: grid;
  grid-template-columns: var(--dz-gutter-width, 3.75rem) repeat(var(--dz-cols, 7), minmax(0, 1fr));
}
/* The body may show a scrollbar; the rows above reserve the same gutter so columns line up. */
.dz-tg__head, .dz-tg__allday, .dz-tg__body { scrollbar-gutter: stable; }
.dz-tg__head { overflow-y: hidden; }
/* A crowded all-day row scrolls on its own: a thousand all-day events must not squeeze the hours to nothing. */
.dz-tg__allday { overflow-y: auto; max-height: var(--dz-allday-max, 10.5rem); flex: none; }
.dz-tg__head { border-bottom: 1px solid var(--dz-border, var(--dzc-border)); }
.dz-tg__dayhead { padding: 0.375rem 0.25rem; text-align: center; font-size: 0.8125rem; min-width: 0; }
.dz-tg__dayhead-weekday { display: block; color: var(--dz-fg-muted, var(--dzc-fg-muted)); font-size: 0.6875rem; text-transform: uppercase; letter-spacing: 0.04em; }
.dz-tg__dayhead-date { display: inline-block; min-width: 1.75rem; padding: 0.125rem 0.25rem; border-radius: 999px; font-size: 1rem; font-weight: 600; }
.dz-tg__dayhead--today .dz-tg__dayhead-date { background: var(--dz-accent, var(--dzc-accent)); color: var(--dz-accent-fg, var(--dzc-accent-fg)); }
.dz-tg__dayhead-note { display: block; font-size: 0.625rem; color: var(--dz-warning, var(--dzc-warning)); }
/* Resource views: a row of groups, a row of resources, each over its columns (placed by grid-row / grid-column). */
.dz-tg__resource, .dz-dg__resource { padding: 0.375rem 0.25rem; text-align: center; font-size: 0.8125rem; font-weight: 600; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; border-inline-start: 1px solid var(--dz-border, var(--dzc-border)); }
.dz-tg__group, .dz-dg__group { padding: 0.25rem; text-align: center; font-size: 0.6875rem; color: var(--dz-fg-muted, var(--dzc-fg-muted)); text-transform: uppercase; letter-spacing: 0.04em; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; border-inline-start: 1px solid var(--dz-border, var(--dzc-border)); border-bottom: 1px solid var(--dz-border, var(--dzc-border)); }
.dz-tg__corner { grid-column: 1; }
/* Where one resource's days end and the next one's begin. */
.dz-empty { margin: 0; padding: 2rem 1rem; text-align: center; color: var(--dz-fg-muted, var(--dzc-fg-muted)); }
.dz-tg__col.dz-tg__col--resource-start, .dz-dg__cell.dz-dg__cell--resource-start { border-inline-start: 2px solid var(--dz-resource-border, var(--dz-border, var(--dzc-border))); }

.dz-tg__allday { border-bottom: 1px solid var(--dz-border, var(--dzc-border)); min-height: calc(var(--dz-bar-height, 1.375rem) + 0.5rem); }
.dz-tg__allday-label { font-size: 0.6875rem; color: var(--dz-fg-muted, var(--dzc-fg-muted)); padding: 0.375rem 0.25rem; text-align: end; }
.dz-tg__allday-track {
  grid-column: 2 / -1;
  display: grid;
  grid-template-columns: repeat(var(--dz-cols, 7), minmax(0, 1fr));
  grid-auto-rows: var(--dz-bar-height, 1.375rem);
  row-gap: 2px;
  padding: 0.25rem 0;
  position: relative;
}
.dz-bar {
  grid-row: calc(var(--lane) + 1);
  grid-column: calc(var(--col) + 1) / span var(--span);
  margin: 0 2px;
  padding: 0 0.375rem;
  border-radius: var(--dz-event-radius, var(--dz-radius, var(--dzc-radius)));
  font-size: 0.75rem;
  line-height: var(--dz-bar-height, 1.375rem);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  background: var(--dz-event-bg, color-mix(in srgb, var(--dz-event-accent, var(--dz-accent, var(--dzc-accent))) 18%, var(--dz-bg, var(--dzc-bg))));
  color: var(--dz-event-fg, var(--dz-fg, var(--dzc-fg)));
  border-inline-start: 3px solid var(--dz-event-accent, var(--dz-accent, var(--dzc-accent)));
}
.dz-bar--cont-start { border-start-start-radius: 0; border-end-start-radius: 0; margin-inline-start: 0; }
.dz-bar--cont-end { border-start-end-radius: 0; border-end-end-radius: 0; margin-inline-end: 0; }
.dz-bar--bg { grid-row: 1 / -1; opacity: 0.35; border: 0; z-index: 0; }

.dz-tg__body { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
.dz-tg__grid { position: relative; align-items: start; }
.dz-tg__gutter { position: relative; height: calc(var(--dz-len) * var(--dz-minute, 1.2px)); }
.dz-tick {
  position: absolute;
  inset-inline-end: 0.375rem;
  top: calc(var(--t) * var(--dz-minute, 1.2px));
  transform: translateY(-50%);
  font-size: 0.6875rem;
  color: var(--dz-fg-muted, var(--dzc-fg-muted));
  font-variant-numeric: tabular-nums;
}
.dz-tick:first-child { transform: none; }
.dz-tg__col {
  position: relative;
  height: calc(var(--dz-len) * var(--dz-minute, 1.2px));
  border-inline-start: 1px solid var(--dz-border, var(--dzc-border));
  background-image: repeating-linear-gradient(
    to bottom,
    var(--dz-line, color-mix(in srgb, var(--dz-border, var(--dzc-border)) 70%, transparent)) 0 1px,
    transparent 1px calc(60 * var(--dz-minute, 1.2px))
  );
  background-position-y: calc(var(--dz-line-offset, 0) * var(--dz-minute, 1.2px));
  min-width: 0;
}
.dz-tg__col--today { background-color: var(--dz-today-bg, color-mix(in srgb, var(--dz-accent, var(--dzc-accent)) 5%, transparent)); }
.dz-tg__col--folded {
  height: auto;
  align-self: stretch;
  background: repeating-linear-gradient(135deg, transparent 0 6px, color-mix(in srgb, var(--dz-border, var(--dzc-border)) 60%, transparent) 6px 7px);
  writing-mode: vertical-rl;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  color: var(--dz-fg-muted, var(--dzc-fg-muted));
}

.dz-band {
  position: absolute;
  box-sizing: border-box;
  inset-inline: 0;
  top: calc(var(--t) * var(--dz-minute, 1.2px));
  height: calc(var(--h) * var(--dz-minute, 1.2px));
  font-size: 0.625rem;
  padding: 0.125rem 0.25rem;
  overflow: hidden;
  pointer-events: none;
  z-index: 0;
}
.dz-band--gap {
  background: repeating-linear-gradient(135deg, transparent 0 5px, var(--dz-gap-stripe, color-mix(in srgb, var(--dz-fg-muted, var(--dzc-fg-muted)) 35%, transparent)) 5px 6px);
  color: var(--dz-fg-muted, var(--dzc-fg-muted));
}
.dz-band--repeat {
  background: var(--dz-repeat-bg, color-mix(in srgb, var(--dz-warning, var(--dzc-warning)) 14%, transparent));
  border-block: 1px dashed var(--dz-warning, var(--dzc-warning));
  color: var(--dz-warning, var(--dzc-warning));
}

.dz-ev {
  position: absolute;
  top: calc(var(--t) * var(--dz-minute, 1.2px));
  height: calc(var(--h) * var(--dz-minute, 1.2px));
  inset-inline-start: calc(var(--l) * 100%);
  width: calc(var(--w) * 100% - 3px);
  box-sizing: border-box;
  padding: 0.125rem 0.375rem;
  /* Its own radius: a page's --tz-radius set for its popovers would turn a 22 px block into a pill. */
  border-radius: var(--dz-event-radius, var(--dz-radius, var(--dzc-radius)));
  overflow: hidden;
  font-size: 0.75rem;
  line-height: 1.25;
  background: var(--dz-event-bg, color-mix(in srgb, var(--dz-event-accent, var(--dz-accent, var(--dzc-accent))) 18%, var(--dz-bg, var(--dzc-bg))));
  color: var(--dz-event-fg, var(--dz-fg, var(--dzc-fg)));
  border-inline-start: 3px solid var(--dz-event-accent, var(--dz-accent, var(--dzc-accent)));
  z-index: 1;
  cursor: default;
}
.dz-ev:focus-visible { outline: 2px solid var(--dz-accent, var(--dzc-accent)); outline-offset: 1px; z-index: 3; }
.dz-ev--cont-start { border-start-start-radius: 0; border-start-end-radius: 0; }
.dz-ev--cont-end { border-end-start-radius: 0; border-end-end-radius: 0; }
.dz-ev--bg { z-index: 0; opacity: 0.35; border: 0; }
/* A background with its own content: the tint mixed in, the label at full strength. */
.dz-ev--bg.dz-ev--labelled { overflow: visible; opacity: 1; background: color-mix(in srgb, var(--dz-event-accent, var(--dz-accent, var(--dzc-accent))) 22%, transparent); color: var(--dz-fg, var(--dzc-fg)); pointer-events: none; }
/* Its label stays at the top of what is shown: the column starts at midnight, the grid is scrolled to the morning. */
.dz-ev--bg.dz-ev--labelled > * { position: sticky; top: 0; }
.dz-ev__time { display: block; font-size: 0.6875rem; opacity: 0.85; font-variant-numeric: tabular-nums; white-space: nowrap; }
.dz-ev__title { display: block; font-weight: 600; overflow: hidden; text-overflow: ellipsis; }
.dz-ev__offset, .dz-ev__real {
  display: inline-block;
  margin-inline-start: 0.25rem;
  padding: 0 0.25rem;
  border-radius: 0.25rem;
  font-size: 0.625rem;
  background: var(--dz-badge-bg, color-mix(in srgb, var(--dz-warning, var(--dzc-warning)) 20%, transparent));
  color: var(--dz-warning, var(--dzc-warning));
}
/* eventStyle: 'solid' — a block of its tone, its text the theme's colour for text on a tone. */
.dz-cal[data-dz-event-style='solid'] :is(.dz-ev:not(.dz-ev--bg), .dz-bar:not(.dz-bar--bg)) {
  --dz-event-bg: var(--dz-event-accent, var(--dz-accent, var(--dzc-accent)));
  /* A tone of the application's may say its own text colour (--dz-tone-<name>-on); else the theme's (--dz-on-tone). */
  --dz-event-fg: var(--dz-tone-on, var(--dz-on-tone, var(--dz-bg, var(--dzc-bg))));
  background: var(--dz-event-bg);
  color: var(--dz-event-fg);
}
.dz-cal[data-dz-event-style='solid'] .dz-bar--timed { padding-inline-start: 0.375rem; }
.dz-cal[data-dz-event-style='solid'] .dz-bar--timed::before { display: none; }
/* allDaySlot: false — the row folds (its keyboard cursor stays focusable). */
.dz-tg__allday--none { min-height: 0; height: 0; padding-block: 0; border-block-width: 0; overflow: hidden; }
/* nowIndicator: false, at any time (the timeline's line too). */
.dz-cal--no-now .dz-now, .dz-cal--no-now .dz-tl__now { display: none; }
.dz-now {
  position: absolute;
  inset-inline: 0;
  top: calc(var(--t) * var(--dz-minute, 1.2px));
  border-top: 2px solid var(--dz-now, var(--dzc-danger));
  z-index: 2;
  pointer-events: none;
}
.dz-now::before {
  content: '';
  position: absolute;
  inset-inline-start: -4px;
  top: -5px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--dz-now, var(--dzc-danger));
}
/* ── toolbar: view switcher ─────────────────────────────────────────────── */
.dz-toolbar__views { display: inline-flex; }
.dz-toolbar__view { border-radius: 0; margin-inline-start: -1px; }
.dz-toolbar__view:first-child { border-start-start-radius: var(--dz-radius, var(--dzc-radius)); border-end-start-radius: var(--dz-radius, var(--dzc-radius)); }
.dz-toolbar__view:last-child { border-start-end-radius: var(--dz-radius, var(--dzc-radius)); border-end-end-radius: var(--dz-radius, var(--dzc-radius)); }
.dz-toolbar__view[aria-pressed='true'] { background: var(--dz-accent, var(--dzc-accent)); color: var(--dz-accent-fg, var(--dzc-accent-fg)); border-color: var(--dz-accent, var(--dzc-accent)); }

/* ── time grid: free slots (availableSlots), over the hours, under the events ── */
.dz-slot {
  position: absolute;
  inset-inline: 2px;
  top: calc(var(--t) * var(--dz-minute, 1.2px));
  height: calc(var(--h) * var(--dz-minute, 1.2px));
  box-sizing: border-box;
  margin: 0;
  padding: 0 0.25rem;
  display: flex;
  align-items: flex-start;
  overflow: hidden;
  border: 1px dashed var(--dz-slot-border, var(--dz-accent, var(--dzc-accent)));
  border-radius: var(--dz-radius, var(--dzc-radius));
  background: var(--dz-slot-bg, color-mix(in srgb, var(--dz-accent, var(--dzc-accent)) 8%, transparent));
  color: var(--dz-slot-fg, var(--dz-fg, var(--dzc-fg)));
  font: inherit;
  font-size: 0.6875rem;
  line-height: 1.3;
  font-variant-numeric: tabular-nums;
  text-align: start;
  cursor: pointer;
  z-index: 0;
}
.dz-slot[aria-disabled] { cursor: inherit; }
.dz-slot:not([aria-disabled]):hover { background: var(--dz-slot-hover-bg, color-mix(in srgb, var(--dz-accent, var(--dzc-accent)) 18%, transparent)); }
.dz-slot:focus-visible { outline: 2px solid var(--dz-accent, var(--dzc-accent)); outline-offset: 1px; z-index: 3; }

/* ── time grid: hours outside business hours ────────────────────────────── */
.dz-off {
  position: absolute;
  inset-inline: 0;
  top: calc(var(--t) * var(--dz-minute, 1.2px));
  height: calc(var(--h) * var(--dz-minute, 1.2px));
  background: var(--dz-off-bg, color-mix(in srgb, var(--dz-fg-muted, var(--dzc-fg-muted)) 9%, transparent));
  pointer-events: none;
  z-index: 0;
}

/* ── day grid ───────────────────────────────────────────────────────────── */
.dz-dg { display: flex; flex-direction: column; flex: 1; min-height: 0; border: 1px solid var(--dz-border, var(--dzc-border)); border-radius: var(--dz-radius, var(--dzc-radius)); overflow: hidden; }
.dz-dg__head { display: grid; grid-template-columns: repeat(var(--dz-cols, 7), minmax(0, 1fr)); border-bottom: 1px solid var(--dz-border, var(--dzc-border)); }
.dz-dg__weekday { padding: 0.375rem 0.25rem; text-align: center; font-size: 0.6875rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--dz-fg-muted, var(--dzc-fg-muted)); }
.dz-dg__body { display: flex; flex-direction: column; flex: 1; min-height: 0; overflow-y: auto; }
.dz-dg--month .dz-dg__week { flex: 1 1 0; min-height: var(--dz-week-min, 5.5rem); }
.dz-dg--grow .dz-dg__week { flex: 1 0 auto; }
.dz-dg__week {
  display: grid;
  position: relative;
  grid-template-columns: repeat(var(--dz-cols, 7), minmax(0, 1fr));
  grid-template-rows: var(--dz-day-head, 1.75rem) repeat(var(--lanes, 1), var(--dz-bar-height, 1.375rem)) 1fr;
  row-gap: 2px;
  border-bottom: 1px solid var(--dz-border, var(--dzc-border));
}
.dz-dg__week:last-child { border-bottom: 0; }
.dz-dg__cell {
  grid-row: 1 / -1;
  grid-column: calc(var(--col) + 1);
  border-inline-start: 1px solid var(--dz-border, var(--dzc-border));
  padding: 0.125rem 0.25rem;
  min-width: 0;
  z-index: 0;
}
.dz-dg__cell:first-child { border-inline-start: 0; }
.dz-dg__cell--outside { background: var(--dz-outside-bg, color-mix(in srgb, var(--dz-fg-muted, var(--dzc-fg-muted)) 6%, transparent)); }
.dz-dg__cell--outside .dz-dg__num { opacity: 0.45; }
.dz-dg__cell--closed { background-image: repeating-linear-gradient(135deg, transparent 0 7px, color-mix(in srgb, var(--dz-border, var(--dzc-border)) 45%, transparent) 7px 8px); }
.dz-dg__cell--today { background-color: var(--dz-today-bg, color-mix(in srgb, var(--dz-accent, var(--dzc-accent)) 7%, transparent)); }
.dz-dg__num {
  display: inline-block;
  min-width: 1.5rem;
  padding: 0.0625rem 0.375rem;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 0.8125rem;
  text-align: center;
  cursor: pointer;
}
.dz-dg__alt, .dz-tg__dayhead-alt { font-size: 0.6875rem; color: var(--dz-fg-muted, var(--dzc-fg-muted)); }
.dz-dg__alt { margin-inline-start: 0.25rem; }
.dz-tg__dayhead-alt { display: block; }
.dz-dg__wk { border: 0; padding: 0 0.25rem; background: transparent; color: var(--dz-fg-muted, var(--dzc-fg-muted)); font: inherit; font-size: 0.6875rem; cursor: pointer; }
.dz-tg__corner { font-size: 0.6875rem; color: var(--dz-fg-muted, var(--dzc-fg-muted)); text-align: center; align-self: end; }
.dz-dg__cell--today .dz-dg__num { background: var(--dz-accent, var(--dzc-accent)); color: var(--dz-accent-fg, var(--dzc-accent-fg)); font-weight: 600; }
.dz-dg__week .dz-bar { grid-row: calc(var(--lane) + 2); z-index: 1; position: relative; }
.dz-dg__week .dz-bar--bg { grid-row: 2 / -1; z-index: 0; }
.dz-bar--timed { background: transparent; border-inline-start-width: 0; padding-inline-start: 0.25rem; }
.dz-bar--timed::before {
  content: '';
  display: inline-block;
  width: 0.5rem;
  height: 0.5rem;
  margin-inline-end: 0.25rem;
  border-radius: 50%;
  background: var(--dz-event-accent, var(--dz-accent, var(--dzc-accent)));
}
.dz-bar__time { font-variant-numeric: tabular-nums; opacity: 0.85; }
.dz-more {
  grid-row: calc(var(--lane) + 2);
  grid-column: calc(var(--col) + 1);
  z-index: 1;
  margin: 0 2px;
  padding: 0 0.375rem;
  border: 0;
  border-radius: var(--dz-radius, var(--dzc-radius));
  background: transparent;
  color: var(--dz-fg-muted, var(--dzc-fg-muted));
  font: inherit;
  font-size: 0.75rem;
  font-weight: 600;
  text-align: start;
  cursor: pointer;
  white-space: nowrap;
}
/* In a time grid: where the hidden events are, in the cluster's last lane. */
.dz-more--tg {
  position: absolute;
  top: calc(var(--t) * var(--dz-minute, 1.2px));
  height: calc(var(--h) * var(--dz-minute, 1.2px));
  inset-inline-start: calc(var(--l) * 100%);
  width: calc(var(--w) * 100% - 3px);
  margin: 0;
  box-sizing: border-box;
  border: 1px dashed var(--dz-border, var(--dzc-border));
  background: var(--dz-bg, var(--dzc-bg));
  overflow: hidden;
  align-content: start;
  z-index: 2;
}
.dz-more:hover, .dz-more:focus-visible { background: var(--dz-bg-raised, var(--dzc-bg-raised)); outline-offset: 1px; }

/* ── popover and context menu: inside .dz-cal, so they carry its theme ──── */
.dz-pop, .dz-menu {
  position: fixed;
  inset: auto;
  margin: 0;
  z-index: 50;
  min-width: 12rem;
  max-width: min(22rem, 90vw);
  padding: 0.375rem;
  border: 1px solid var(--dz-border, var(--dzc-border));
  border-radius: calc(var(--dz-radius, var(--dzc-radius)) * 1.5);
  background: var(--dz-bg, var(--dzc-bg));
  color: var(--dz-fg, var(--dzc-fg));
  box-shadow: 0 10px 30px -12px rgb(0 0 0 / 0.35);
}
.dz-pop[hidden], .dz-menu[hidden] { display: none; }
.dz-pop__head { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 0.125rem 0.25rem 0.375rem; }
.dz-pop__title { margin: 0; font-size: 0.875rem; font-weight: 600; }
.dz-pop__close { border: 0; background: transparent; color: inherit; font: inherit; font-size: 1.125rem; line-height: 1; cursor: pointer; padding: 0.125rem 0.375rem; border-radius: var(--dz-radius, var(--dzc-radius)); }
.dz-pop__list { display: grid; gap: 2px; max-height: 18rem; overflow-y: auto; }
.dz-bar--in-popover { margin: 0; }
/* The UA gives [popover] overflow:auto: a sub-menu would make it scroll sideways under itself. */
.dz-menu { display: grid; gap: 1px; overflow: visible; }
.dz-menu__item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  border: 0;
  border-radius: var(--dz-radius, var(--dzc-radius));
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 0.875rem;
  text-align: start;
  padding: 0.375rem 0.625rem;
  cursor: pointer;
}
.dz-menu__item:hover, .dz-menu__item:focus-visible { background: var(--dz-bg-raised, var(--dzc-bg-raised)); outline: 2px solid transparent; }
.dz-menu__item[aria-disabled='true'] { opacity: 0.55; cursor: not-allowed; }
.dz-menu__reason { font-size: 0.75rem; color: var(--dz-fg-muted, var(--dzc-fg-muted)); }
.dz-menu__item[aria-haspopup] { position: relative; padding-inline-end: 1.75rem; }
.dz-menu__chevron { position: absolute; inset-inline-end: 0.5rem; top: 50%; transform: translateY(-50%); color: var(--dz-fg-muted, var(--dzc-fg-muted)); }
.dz-menu__item[aria-expanded='true'] { background: var(--dz-bg-raised, var(--dzc-bg-raised)); }
/* A sub-menu sits beside its entry, inside the menu's box (the fixed menu is its containing block). */
.dz-menu__sub { position: absolute; inset-inline-start: calc(100% - 0.25rem); }
.dz-menu[data-sub-side='start'] .dz-menu__sub { inset-inline-start: auto; inset-inline-end: calc(100% - 0.25rem); }
.dz-menu__shortcut { margin-inline-start: auto; font-size: 0.75rem; color: var(--dz-fg-muted, var(--dzc-fg-muted)); }

/* Long press opens the context menu: no iOS callout or text selection in the way. */
.dz-tg__body, .dz-dg__body { -webkit-touch-callout: none; user-select: none; }
.dz-probe { position: absolute; visibility: hidden; pointer-events: none; left: -9999px; height: var(--dz-bar-height, 1.375rem); width: 1px; }
.dz-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
/* ── gestures: ghosts, handles, the selected event on touch ─────────────── */
.dz-tg, .dz-dg { position: relative; }
.dz-ghosts { position: absolute; inset: 0; pointer-events: none; z-index: 30; }
.dz-ghost {
  position: absolute;
  left: var(--gx);
  top: var(--gy);
  width: var(--gw);
  height: var(--gh);
  box-sizing: border-box;
  overflow: hidden;
  padding: 2px 6px;
  border-radius: var(--dz-radius, var(--dzc-radius));
  border-inline-start: 3px solid var(--dz-event-accent, var(--dz-accent, var(--dzc-accent)));
  background: color-mix(in srgb, var(--dz-event-accent, var(--dz-accent, var(--dzc-accent))) 24%, var(--dz-bg, var(--dzc-bg)));
  color: var(--dz-fg, var(--dzc-fg));
  box-shadow: 0 10px 24px -12px rgb(0 0 0 / 0.5);
  font-size: 0.75rem;
  line-height: 1.25;
}
.dz-ghost[data-time]:not([data-time=''])::before { content: attr(data-time); display: block; font-weight: 600; }
.dz-ghost__title { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dz-ghost--select { border: 1px dashed var(--dz-accent, var(--dzc-accent)); background: color-mix(in srgb, var(--dz-accent, var(--dzc-accent)) 16%, transparent); box-shadow: none; }
.dz-ghost.dz-event--invalid { border-color: var(--dz-danger, var(--dzc-danger)); background: color-mix(in srgb, var(--dz-danger, var(--dzc-danger)) 16%, var(--dz-bg, var(--dzc-bg))); }
.dz-ev--source { opacity: 0.35; }
.dz-dragging, .dz-dragging * { cursor: grabbing !important; }
.dz-selecting { cursor: cell; }
.dz-editable .dz-ev:not(.dz-ev--bg), .dz-editable .dz-bar:not(.dz-bar--bg) { cursor: grab; }
/* Resize: a thin strip at the edge that can be pulled (drawn by CSS, found by position on press). */
.dz-editable .dz-ev[data-resize-end]::after { content: ''; position: absolute; inset-inline: 0; bottom: 0; height: 6px; cursor: ns-resize; }
.dz-editable .dz-bar[data-resize-end]::after { content: ''; position: absolute; inset-block: 0; inset-inline-end: 0; width: 6px; cursor: ew-resize; }
.dz-tg__allday-track .dz-bar { position: relative; }
/* Touch: a tapped event is selected — its handles grow, and it alone stops the page from scrolling under a finger. */
.dz-ev, .dz-bar { touch-action: pan-x pan-y; }
.dz-ev--selected { outline: 2px solid var(--dz-accent, var(--dzc-accent)); outline-offset: 1px; touch-action: none; z-index: 4; }
.dz-ev--selected[data-resize-end]::after { height: 14px; background: linear-gradient(transparent 5px, var(--dz-accent, var(--dzc-accent)) 5px 8px, transparent 8px); }
.dz-live { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
/* ── keyboard: the time grid's cursor, a month's cells and their items ───── */
.dz-tg__allday { position: relative; }
.dz-cursor { position: absolute; grid-row: 1; inset-inline: 1px; z-index: 5; pointer-events: none; box-sizing: border-box; border-radius: var(--dz-radius, var(--dzc-radius)); opacity: 0; }
.dz-tg__grid > .dz-cursor { top: calc(var(--t, 0) * var(--dz-minute, 1.2px)); height: calc(var(--h, 15) * var(--dz-minute, 1.2px)); }
.dz-tg__allday > .dz-cursor { inset-block: 2px; }
.dz-cursor:focus { opacity: 1; outline: 2px solid var(--dz-accent, var(--dzc-accent)); outline-offset: -2px; background: color-mix(in srgb, var(--dz-accent, var(--dzc-accent)) 12%, transparent); }
.dz-dg__cell:focus-visible { outline: 2px solid var(--dz-accent, var(--dzc-accent)); outline-offset: -2px; }
/* A cell's events for the keyboard and screen readers: heard, not seen — the focus ring is drawn on the bar (or "+N"). */
.dz-dg__items { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.dz-bar.dz-focus, .dz-more.dz-focus { outline: 2px solid var(--dz-accent, var(--dzc-accent)); outline-offset: 1px; z-index: 3; }
.dz-grabbing .dz-ev--source { opacity: 0.35; }
/* A finger's selection: two handles to pull its ends. */
.dz-ghost--armed { box-shadow: none; overflow: visible; }
.dz-ghost__handle { position: absolute; inset-inline-start: 50%; width: 24px; height: 24px; margin-inline-start: -12px; pointer-events: auto; touch-action: none; }
.dz-ghost__handle::before { content: ''; position: absolute; inset: 7px; border-radius: 50%; background: var(--dz-bg, var(--dzc-bg)); border: 2px solid var(--dz-accent, var(--dzc-accent)); }
.dz-ghost__handle--start { top: -12px; }
.dz-ghost__handle--end { bottom: -12px; }
.dz-dg .dz-ghost__handle { top: 50%; bottom: auto; margin-top: -12px; }
.dz-dg .dz-ghost__handle--start { inset-inline-start: -12px; margin-inline-start: 0; }
.dz-dg .dz-ghost__handle--end { inset-inline-start: auto; inset-inline-end: -12px; margin-inline-start: 0; }
@media (forced-colors: active) {
  .dz-ghost { border: 2px solid Highlight; }
  .dz-menu__item:focus-visible, .dz-more:focus-visible, .dz-pop__close:focus-visible, .dz-dg__num:focus-visible, .dz-cursor:focus, .dz-dg__cell:focus-visible, .dz-focus { outline: 2px solid Highlight; }
  .dz-ev:not(.dz-ev--bg), .dz-bar:not(.dz-bar--bg) { border: 1px solid CanvasText; }
  .dz-band--gap, .dz-band--repeat { border: 1px dashed CanvasText; }
  /* What a filled background meant is drawn in system colours (a forced palette drops backgrounds). */
  .dz-toolbar__view[aria-pressed='true'], .dz-dg__cell--today .dz-dg__num, .dz-list__dot { forced-color-adjust: none; background: Highlight; color: HighlightText; }
  .dz-bar--timed::before, .dz-now::before { forced-color-adjust: none; background: CanvasText; }
  .dz-now { border-top-color: CanvasText; }
  .dz-dg__cell--today { outline: 2px solid Highlight; outline-offset: -2px; }
  .dz-dg__cell--outside .dz-dg__num { opacity: 1; color: GrayText; }
  .dz-slot { border: 1px dashed ButtonText; }
}
/* Without color-mix() (Safari before 16.2): plain palette colours instead of the tints, never nothing. */
@supports not (color: color-mix(in srgb, red 50%, blue)) {
  .dz-ev:not(.dz-ev--bg), .dz-bar:not(.dz-bar--bg) { background: var(--dz-event-bg, var(--dz-bg-raised, var(--dzc-bg-raised))); }
  .dz-tg__col { background-image: repeating-linear-gradient(to bottom, var(--dz-line, var(--dz-border, var(--dzc-border))) 0 1px, transparent 1px calc(60 * var(--dz-minute, 1.2px))); }
  .dz-tg__col--today, .dz-dg__cell--today { background-color: var(--dz-today-bg, var(--dz-bg-raised, var(--dzc-bg-raised))); }
  .dz-tg__col--folded { background: repeating-linear-gradient(135deg, transparent 0 6px, var(--dz-border, var(--dzc-border)) 6px 7px); }
  .dz-band--gap { background: repeating-linear-gradient(135deg, transparent 0 5px, var(--dz-gap-stripe, var(--dz-border, var(--dzc-border))) 5px 6px); }
  .dz-band--repeat { background: var(--dz-repeat-bg, var(--dz-bg-raised, var(--dzc-bg-raised))); }
  .dz-ev__offset, .dz-ev__real { background: var(--dz-badge-bg, var(--dz-bg-raised, var(--dzc-bg-raised))); }
  .dz-off { background: var(--dz-off-bg, var(--dz-bg-raised, var(--dzc-bg-raised))); }
  .dz-dg__cell--outside { background: var(--dz-outside-bg, var(--dz-bg-raised, var(--dzc-bg-raised))); }
  .dz-dg__cell--closed { background-image: repeating-linear-gradient(135deg, transparent 0 7px, var(--dz-border, var(--dzc-border)) 7px 8px); }
  .dz-ghost, .dz-ghost--select, .dz-ghost.dz-event--invalid { background: var(--dz-bg-raised, var(--dzc-bg-raised)); }
  .dz-cursor:focus { background: transparent; }
  .dz-slot, .dz-slot:hover { background: var(--dz-slot-bg, var(--dz-bg-raised, var(--dzc-bg-raised))); }
}
/* Paper: what scrolls is printed whole, no buttons (preparePrint() has mounted everything). */
@media print {
  .dz-cal { --dz-height: auto; height: auto; }
  .dz-tg, .dz-dg, .dz-tg__body, .dz-dg__body, .dz-tg__allday, .dz-list { overflow: visible; max-height: none; height: auto; flex: none; }
  .dz-ev, .dz-bar, .dz-list__li, .dz-mm__month { break-inside: avoid; }
  .dz-dg__week, .dz-dg--month .dz-dg__week { flex: none; }
  .dz-toolbar__btn, .dz-toolbar__views, .dz-cursor, .dz-ghost { display: none; }
}
/* A scheme forced on the calendar (option "scheme"); without it, the page's. */
.dz-cal[data-dz-scheme='light'] { color-scheme: light; }
.dz-cal[data-dz-scheme='dark'] { color-scheme: dark; }
/* Density (option "density"): the minute, the bars, the type. */
.dz-cal[data-dz-density='compact'] { --dz-minute: 0.8px; --dz-bar-height: 1.125rem; --dz-day-head: 1.5rem; --dz-week-min: 4.5rem; font-size: 0.8125rem; }
.dz-cal[data-dz-density='spacious'] { --dz-minute: 1.6px; --dz-bar-height: 1.625rem; --dz-day-head: 2rem; --dz-week-min: 7rem; font-size: 0.9375rem; }
}
`;

/**
 * The same CSS outside any cascade layer (\`cssLayers: false\`): for pages
 * whose global reset is itself unlayered (Tailwind 3's preflight, Bootstrap's
 * reboot), which would beat every layered rule. Unlayered, the calendar's
 * class selectors outweigh those element and \`*\` resets.
 */
export function unlayered(css: string): string {
  const open = /@layer\s+dzcalendar\.(?:base|theme)\s*\{/.exec(css);
  if (!open) return css;
  const end = css.lastIndexOf('}');
  return (css.slice(0, open.index) + css.slice(open.index + open[0].length, end) + css.slice(end + 1)).replace(/@layer\s+dzcalendar\.base\s*,\s*dzcalendar\.theme\s*;/, '');
}

/**
 * Inserts the stylesheet once per document or shadow root.
 * Layered (the default), it goes last: the page's own rules win by the
 * layers, and the calendar's layers come after any the page declared before
 * (Tailwind 4's \`base\` preflight), not below them.
 * Unlayered, it goes first: a page rule of the same weight, coming later, wins.
 */
export function ensureStyles(host: HTMLElement, id: string, css: string, layers = true): void {
  const root = host.getRootNode();
  const target = root instanceof ShadowRoot ? root : host.ownerDocument.head;
  if (target.querySelector(`style[data-dzcalendar="${id}"]`)) return;
  const style = host.ownerDocument.createElement('style');
  style.dataset['dzcalendar'] = id;
  if (layers) {
    style.textContent = css;
    target.append(style);
  } else {
    style.textContent = unlayered(css);
    style.dataset['dzLayers'] = 'off';
    // After the calendar's other sheets already there (order among them kept), before the page's.
    const ours = target.querySelectorAll('style[data-dz-layers="off"]');
    const last = ours[ours.length - 1];
    if (last) last.after(style);
    else target.prepend(style);
  }
}
