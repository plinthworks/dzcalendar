/**
 * The layout the calendar needs to be usable at all: grids, positions, the
 * reset that turns a <button> into a toolbar control. Taste lives in
 * @dzcalendar/theme.
 *
 * Every colour is `var(--dz-specific, var(--tz-palette, plain))`: the
 * calendar's own variable if set, else tzslot's palette — one palette dresses
 * both libraries in the same app — else something legible with no theme.
 *
 * Positions are axis minutes times `--dz-minute` (the height of one minute),
 * never measured pixels: the core computes, CSS draws, nothing is read back.
 * Sizes are read with fallbacks and never declared on `.dz-cal`, so a value
 * set on any ancestor (the host, the page) reaches the calendar.
 *
 * Injected first in the head (or shadow root) so any class rule of the page
 * wins on equal specificity, as in tzslot. `injectStyles: false` and include
 * `DZ_CSS` yourself under a Content-Security-Policy without inline styles.
 */
export const DZ_CSS = `
.dz-cal {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: var(--dz-height, 40rem);
  color: var(--dz-fg, var(--tz-fg, CanvasText));
  background: var(--dz-bg, var(--tz-bg, Canvas));
  font-family: var(--dz-font, var(--tz-font, inherit));
  color-scheme: var(--tz-color-scheme, light dark);
}
.dz-toolbar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.25rem;
}
.dz-toolbar__title { margin: 0 0 0 0.5rem; font-size: 1.125rem; font-weight: 600; flex: 1; }
.dz-toolbar__btn {
  border: 1px solid var(--dz-border, var(--tz-border, GrayText));
  border-radius: var(--dz-radius, var(--tz-radius, 0.375rem));
  background: transparent;
  color: inherit;
  font: inherit;
  padding: 0.25rem 0.625rem;
  cursor: pointer;
}
.dz-toolbar__btn:focus-visible { outline: 2px solid var(--dz-accent, var(--tz-accent, Highlight)); outline-offset: 2px; }

.dz-tg { display: flex; flex-direction: column; flex: 1; min-height: 0; border: 1px solid var(--dz-border, var(--tz-border, GrayText)); border-radius: var(--dz-radius, var(--tz-radius, 0.375rem)); overflow: hidden; }
.dz-tg__row {
  display: grid;
  grid-template-columns: var(--dz-gutter-width, 3.75rem) repeat(var(--dz-cols, 7), minmax(0, 1fr));
}
/* The body may show a scrollbar; the rows above reserve the same gutter so columns line up. */
.dz-tg__head, .dz-tg__allday, .dz-tg__body { scrollbar-gutter: stable; }
.dz-tg__head, .dz-tg__allday { overflow-y: hidden; }
.dz-tg__head { border-bottom: 1px solid var(--dz-border, var(--tz-border, GrayText)); }
.dz-tg__dayhead { padding: 0.375rem 0.25rem; text-align: center; font-size: 0.8125rem; min-width: 0; }
.dz-tg__dayhead-weekday { display: block; color: var(--dz-fg-muted, var(--tz-fg-muted, GrayText)); font-size: 0.6875rem; text-transform: uppercase; letter-spacing: 0.04em; }
.dz-tg__dayhead-date { display: inline-block; min-width: 1.75rem; padding: 0.125rem 0.25rem; border-radius: 999px; font-size: 1rem; font-weight: 600; }
.dz-tg__dayhead--today .dz-tg__dayhead-date { background: var(--dz-accent, var(--tz-accent, Highlight)); color: var(--dz-accent-fg, var(--tz-accent-fg, HighlightText)); }
.dz-tg__dayhead-note { display: block; font-size: 0.625rem; color: var(--dz-warning, var(--tz-warning, GrayText)); }

.dz-tg__allday { border-bottom: 1px solid var(--dz-border, var(--tz-border, GrayText)); min-height: calc(var(--dz-bar-height, 1.375rem) + 0.5rem); }
.dz-tg__allday-label { font-size: 0.6875rem; color: var(--dz-fg-muted, var(--tz-fg-muted, GrayText)); padding: 0.375rem 0.25rem; text-align: end; }
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
  border-radius: var(--dz-radius, var(--tz-radius, 0.375rem));
  font-size: 0.75rem;
  line-height: var(--dz-bar-height, 1.375rem);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  background: var(--dz-event-bg, color-mix(in srgb, var(--dz-event-accent, var(--dz-accent, var(--tz-accent, Highlight))) 18%, var(--dz-bg, var(--tz-bg, Canvas))));
  color: var(--dz-event-fg, var(--dz-fg, var(--tz-fg, CanvasText)));
  border-inline-start: 3px solid var(--dz-event-accent, var(--dz-accent, var(--tz-accent, Highlight)));
}
.dz-bar--cont-start { border-start-start-radius: 0; border-end-start-radius: 0; margin-inline-start: 0; }
.dz-bar--cont-end { border-start-end-radius: 0; border-end-end-radius: 0; margin-inline-end: 0; }
.dz-bar--bg { grid-row: 1 / -1; opacity: 0.35; border: 0; z-index: 0; }

.dz-tg__body { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
.dz-tg__grid { position: relative; align-items: start; }
.dz-tg__gutter { position: relative; height: calc(var(--dz-len) * var(--dz-minute, 0.8px)); }
.dz-tick {
  position: absolute;
  inset-inline-end: 0.375rem;
  top: calc(var(--t) * var(--dz-minute, 0.8px));
  transform: translateY(-50%);
  font-size: 0.6875rem;
  color: var(--dz-fg-muted, var(--tz-fg-muted, GrayText));
  font-variant-numeric: tabular-nums;
}
.dz-tick:first-child { transform: none; }
.dz-tg__col {
  position: relative;
  height: calc(var(--dz-len) * var(--dz-minute, 0.8px));
  border-inline-start: 1px solid var(--dz-border, var(--tz-border, GrayText));
  background-image: repeating-linear-gradient(
    to bottom,
    var(--dz-line, color-mix(in srgb, var(--dz-border, var(--tz-border, GrayText)) 70%, transparent)) 0 1px,
    transparent 1px calc(60 * var(--dz-minute, 0.8px))
  );
  background-position-y: calc(var(--dz-line-offset, 0) * var(--dz-minute, 0.8px));
  min-width: 0;
}
.dz-tg__col--today { background-color: var(--dz-today-bg, color-mix(in srgb, var(--dz-accent, var(--tz-accent, Highlight)) 5%, transparent)); }
.dz-tg__col--folded {
  height: auto;
  align-self: stretch;
  background: repeating-linear-gradient(135deg, transparent 0 6px, color-mix(in srgb, var(--dz-border, var(--tz-border, GrayText)) 60%, transparent) 6px 7px);
  writing-mode: vertical-rl;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  color: var(--dz-fg-muted, var(--tz-fg-muted, GrayText));
}

.dz-band {
  position: absolute;
  box-sizing: border-box;
  inset-inline: 0;
  top: calc(var(--t) * var(--dz-minute, 0.8px));
  height: calc(var(--h) * var(--dz-minute, 0.8px));
  font-size: 0.625rem;
  padding: 0.125rem 0.25rem;
  overflow: hidden;
  pointer-events: none;
  z-index: 0;
}
.dz-band--gap {
  background: repeating-linear-gradient(135deg, transparent 0 5px, var(--dz-gap-stripe, color-mix(in srgb, var(--dz-fg-muted, var(--tz-fg-muted, GrayText)) 35%, transparent)) 5px 6px);
  color: var(--dz-fg-muted, var(--tz-fg-muted, GrayText));
}
.dz-band--repeat {
  background: var(--dz-repeat-bg, color-mix(in srgb, var(--dz-warning, var(--tz-warning, #b45309)) 14%, transparent));
  border-block: 1px dashed var(--dz-warning, var(--tz-warning, #b45309));
  color: var(--dz-warning, var(--tz-warning, #b45309));
}

.dz-ev {
  position: absolute;
  top: calc(var(--t) * var(--dz-minute, 0.8px));
  height: calc(var(--h) * var(--dz-minute, 0.8px));
  inset-inline-start: calc(var(--l) * 100%);
  width: calc(var(--w) * 100% - 3px);
  box-sizing: border-box;
  padding: 0.125rem 0.375rem;
  border-radius: var(--dz-radius, var(--tz-radius, 0.375rem));
  overflow: hidden;
  font-size: 0.75rem;
  line-height: 1.25;
  background: var(--dz-event-bg, color-mix(in srgb, var(--dz-event-accent, var(--dz-accent, var(--tz-accent, Highlight))) 18%, var(--dz-bg, var(--tz-bg, Canvas))));
  color: var(--dz-event-fg, var(--dz-fg, var(--tz-fg, CanvasText)));
  border-inline-start: 3px solid var(--dz-event-accent, var(--dz-accent, var(--tz-accent, Highlight)));
  z-index: 1;
  cursor: default;
}
.dz-ev:focus-visible { outline: 2px solid var(--dz-accent, var(--tz-accent, Highlight)); outline-offset: 1px; z-index: 3; }
.dz-ev--cont-start { border-start-start-radius: 0; border-start-end-radius: 0; }
.dz-ev--cont-end { border-end-start-radius: 0; border-end-end-radius: 0; }
.dz-ev--bg { z-index: 0; opacity: 0.35; border: 0; }
.dz-ev__time { display: block; font-size: 0.6875rem; opacity: 0.85; font-variant-numeric: tabular-nums; white-space: nowrap; }
.dz-ev__title { display: block; font-weight: 600; overflow: hidden; text-overflow: ellipsis; }
.dz-ev__offset, .dz-ev__real {
  display: inline-block;
  margin-inline-start: 0.25rem;
  padding: 0 0.25rem;
  border-radius: 0.25rem;
  font-size: 0.625rem;
  background: var(--dz-badge-bg, color-mix(in srgb, var(--dz-warning, var(--tz-warning, #b45309)) 20%, transparent));
  color: var(--dz-warning, var(--tz-warning, #b45309));
}
.dz-now {
  position: absolute;
  inset-inline: 0;
  top: calc(var(--t) * var(--dz-minute, 0.8px));
  border-top: 2px solid var(--dz-now, var(--tz-danger, #b91c1c));
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
  background: var(--dz-now, var(--tz-danger, #b91c1c));
}
/* ── toolbar: view switcher ─────────────────────────────────────────────── */
.dz-toolbar__views { display: inline-flex; }
.dz-toolbar__view { border-radius: 0; margin-inline-start: -1px; }
.dz-toolbar__view:first-child { border-start-start-radius: var(--dz-radius, var(--tz-radius, 0.375rem)); border-end-start-radius: var(--dz-radius, var(--tz-radius, 0.375rem)); }
.dz-toolbar__view:last-child { border-start-end-radius: var(--dz-radius, var(--tz-radius, 0.375rem)); border-end-end-radius: var(--dz-radius, var(--tz-radius, 0.375rem)); }
.dz-toolbar__view[aria-pressed='true'] { background: var(--dz-accent, var(--tz-accent, Highlight)); color: var(--dz-accent-fg, var(--tz-accent-fg, HighlightText)); border-color: var(--dz-accent, var(--tz-accent, Highlight)); }

/* ── time grid: hours outside business hours ────────────────────────────── */
.dz-off {
  position: absolute;
  inset-inline: 0;
  top: calc(var(--t) * var(--dz-minute, 0.8px));
  height: calc(var(--h) * var(--dz-minute, 0.8px));
  background: var(--dz-off-bg, color-mix(in srgb, var(--dz-fg-muted, var(--tz-fg-muted, GrayText)) 9%, transparent));
  pointer-events: none;
  z-index: 0;
}

/* ── day grid ───────────────────────────────────────────────────────────── */
.dz-dg { display: flex; flex-direction: column; flex: 1; min-height: 0; border: 1px solid var(--dz-border, var(--tz-border, GrayText)); border-radius: var(--dz-radius, var(--tz-radius, 0.375rem)); overflow: hidden; }
.dz-dg__head { display: grid; grid-template-columns: repeat(var(--dz-cols, 7), minmax(0, 1fr)); border-bottom: 1px solid var(--dz-border, var(--tz-border, GrayText)); }
.dz-dg__weekday { padding: 0.375rem 0.25rem; text-align: center; font-size: 0.6875rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--dz-fg-muted, var(--tz-fg-muted, GrayText)); }
.dz-dg__body { display: flex; flex-direction: column; flex: 1; min-height: 0; overflow-y: auto; }
.dz-dg--month .dz-dg__week { flex: 1 1 0; min-height: var(--dz-week-min, 5.5rem); }
.dz-dg__week {
  display: grid;
  position: relative;
  grid-template-columns: repeat(var(--dz-cols, 7), minmax(0, 1fr));
  grid-template-rows: var(--dz-day-head, 1.75rem) repeat(var(--lanes, 0), var(--dz-bar-height, 1.375rem)) 1fr;
  row-gap: 2px;
  border-bottom: 1px solid var(--dz-border, var(--tz-border, GrayText));
}
.dz-dg__week:last-child { border-bottom: 0; }
.dz-dg__cell {
  grid-row: 1 / -1;
  grid-column: calc(var(--col) + 1);
  border-inline-start: 1px solid var(--dz-border, var(--tz-border, GrayText));
  padding: 0.125rem 0.25rem;
  min-width: 0;
  z-index: 0;
}
.dz-dg__cell:first-child { border-inline-start: 0; }
.dz-dg__cell--outside { background: var(--dz-outside-bg, color-mix(in srgb, var(--dz-fg-muted, var(--tz-fg-muted, GrayText)) 6%, transparent)); }
.dz-dg__cell--outside .dz-dg__num { opacity: 0.45; }
.dz-dg__cell--closed { background-image: repeating-linear-gradient(135deg, transparent 0 7px, color-mix(in srgb, var(--dz-border, var(--tz-border, GrayText)) 45%, transparent) 7px 8px); }
.dz-dg__cell--today { background-color: var(--dz-today-bg, color-mix(in srgb, var(--dz-accent, var(--tz-accent, Highlight)) 7%, transparent)); }
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
.dz-dg__cell--today .dz-dg__num { background: var(--dz-accent, var(--tz-accent, Highlight)); color: var(--dz-accent-fg, var(--tz-accent-fg, HighlightText)); font-weight: 600; }
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
  background: var(--dz-event-accent, var(--dz-accent, var(--tz-accent, Highlight)));
}
.dz-bar__time { font-variant-numeric: tabular-nums; opacity: 0.85; }
.dz-more {
  grid-row: calc(var(--lane) + 2);
  grid-column: calc(var(--col) + 1);
  z-index: 1;
  margin: 0 2px;
  padding: 0 0.375rem;
  border: 0;
  border-radius: var(--dz-radius, var(--tz-radius, 0.375rem));
  background: transparent;
  color: var(--dz-fg-muted, var(--tz-fg-muted, GrayText));
  font: inherit;
  font-size: 0.75rem;
  font-weight: 600;
  text-align: start;
  cursor: pointer;
  white-space: nowrap;
}
.dz-more:hover, .dz-more:focus-visible { background: var(--dz-bg-raised, var(--tz-bg-raised, ButtonFace)); outline-offset: 1px; }

/* ── popover and context menu: inside .dz-cal, so they carry its theme ──── */
.dz-pop, .dz-menu {
  position: fixed;
  inset: auto;
  margin: 0;
  z-index: 50;
  min-width: 12rem;
  max-width: min(22rem, 90vw);
  padding: 0.375rem;
  border: 1px solid var(--dz-border, var(--tz-border, GrayText));
  border-radius: calc(var(--dz-radius, var(--tz-radius, 0.375rem)) * 1.5);
  background: var(--dz-bg, var(--tz-bg, Canvas));
  color: var(--dz-fg, var(--tz-fg, CanvasText));
  box-shadow: 0 10px 30px -12px rgb(0 0 0 / 0.35);
}
.dz-pop[hidden], .dz-menu[hidden] { display: none; }
.dz-pop__head { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 0.125rem 0.25rem 0.375rem; }
.dz-pop__title { margin: 0; font-size: 0.875rem; font-weight: 600; }
.dz-pop__close { border: 0; background: transparent; color: inherit; font: inherit; font-size: 1.125rem; line-height: 1; cursor: pointer; padding: 0.125rem 0.375rem; border-radius: var(--dz-radius, var(--tz-radius, 0.375rem)); }
.dz-pop__list { display: grid; gap: 2px; max-height: 18rem; overflow-y: auto; }
.dz-bar--in-popover { margin: 0; }
/* The UA gives [popover] overflow:auto: a sub-menu would make it scroll sideways under itself. */
.dz-menu { display: grid; gap: 1px; overflow: visible; }
.dz-menu__item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  border: 0;
  border-radius: var(--dz-radius, var(--tz-radius, 0.375rem));
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 0.875rem;
  text-align: start;
  padding: 0.375rem 0.625rem;
  cursor: pointer;
}
.dz-menu__item:hover, .dz-menu__item:focus-visible { background: var(--dz-bg-raised, var(--tz-bg-raised, ButtonFace)); outline: 2px solid transparent; }
.dz-menu__item[aria-disabled='true'] { opacity: 0.55; cursor: not-allowed; }
.dz-menu__reason { font-size: 0.75rem; color: var(--dz-fg-muted, var(--tz-fg-muted, GrayText)); }
.dz-menu__item[aria-haspopup] { position: relative; padding-inline-end: 1.75rem; }
.dz-menu__chevron { position: absolute; inset-inline-end: 0.5rem; top: 50%; transform: translateY(-50%); color: var(--dz-fg-muted, var(--tz-fg-muted, GrayText)); }
.dz-menu__item[aria-expanded='true'] { background: var(--dz-bg-raised, var(--tz-bg-raised, ButtonFace)); }
/* A sub-menu sits beside its entry, inside the menu's box (the fixed menu is its containing block). */
.dz-menu__sub { position: absolute; inset-inline-start: calc(100% - 0.25rem); }
.dz-menu[data-sub-side='start'] .dz-menu__sub { inset-inline-start: auto; inset-inline-end: calc(100% - 0.25rem); }
.dz-menu__shortcut { margin-inline-start: auto; font-size: 0.75rem; color: var(--dz-fg-muted, var(--tz-fg-muted, GrayText)); }

/* Long press opens the context menu: no iOS callout or text selection in the way. */
.dz-tg__body, .dz-dg__body { -webkit-touch-callout: none; user-select: none; }
.dz-probe { position: absolute; visibility: hidden; pointer-events: none; inset-inline-start: -9999px; height: var(--dz-bar-height, 1.375rem); width: 1px; }
.dz-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
@media (forced-colors: active) {
  .dz-menu__item:focus-visible, .dz-more:focus-visible, .dz-pop__close:focus-visible, .dz-dg__num:focus-visible { outline: 2px solid Highlight; }
  .dz-ev, .dz-bar { border: 1px solid CanvasText; }
  .dz-band--gap, .dz-band--repeat { border: 1px dashed CanvasText; }
}
`;

/** Inserts the stylesheet once per document or shadow root, first, so the page's own rules win. */
export function ensureStyles(host: HTMLElement, id: string, css: string): void {
  const root = host.getRootNode();
  const target = root instanceof ShadowRoot ? root : host.ownerDocument.head;
  if (target.querySelector(`style[data-dzcalendar="${id}"]`)) return;
  const style = host.ownerDocument.createElement('style');
  style.dataset['dzcalendar'] = id;
  style.textContent = css;
  target.prepend(style);
}
