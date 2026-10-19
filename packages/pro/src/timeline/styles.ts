/**
 * The timeline's layout. Positions are written as `--x` / `--w` (nominal
 * slots) and turned into lengths here with `--dz-tl-slot`, so the scale is
 * the stylesheet's to change; the view measures what it became.
 * `TIMELINE_CSS`: include it yourself under `injectStyles: false`.
 */
export const TIMELINE_CSS = `
.dz-tl {
  --dz-tl-slot: 2.75rem;
  /* A lane holds an event at least 24 px tall (WCAG 2.5.8, target size). */
  --dz-tl-lane: 1.625rem;
  --dz-tl-line: var(--dz-line, color-mix(in srgb, var(--dz-border, var(--dzc-border)) 70%, transparent));
  display: flex; flex-direction: column; flex: 1; min-height: 0;
  height: var(--dz-height, 40rem);
  border: 1px solid var(--dz-border, var(--dzc-border)); border-radius: var(--dz-radius, var(--dzc-radius)); overflow: hidden;
}
.dz-tl--days { --dz-tl-slot: 2.25rem; }
.dz-tl__scroller { flex: 1; min-height: 0; overflow: auto; position: relative; overscroll-behavior: contain; }
.dz-tl__sheet { position: relative; width: calc(var(--dz-tl-area, 0px) + var(--dz-tl-len, 0) * var(--dz-tl-slot)); }
.dz-tl__head { position: sticky; top: 0; z-index: 4; display: flex; background: var(--dz-bg, var(--dzc-bg)); border-bottom: 1px solid var(--dz-border, var(--dzc-border)); }
.dz-tl__corner {
  position: sticky; inset-inline-start: 0; z-index: 5; flex: none; width: var(--dz-tl-area, 0px);
  display: grid; grid-template-columns: var(--dz-tl-area-cols, 0px); align-items: end;
  background: var(--dz-bg, var(--dzc-bg)); border-inline-end: 1px solid var(--dz-border, var(--dzc-border)); box-sizing: border-box;
}
.dz-tl:not(.dz-tl--resources) .dz-tl__corner { border-inline-end: 0; }
.dz-tl__colhead { position: relative; padding: 0.375rem 0.5rem; font-size: 0.75rem; font-weight: 600; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dz-tl__resizer { position: absolute; inset-block: 0; inset-inline-end: -3px; width: 7px; cursor: col-resize; z-index: 1; touch-action: none; }
.dz-tl__resizer:hover, .dz-tl__resizer:focus-visible { background: color-mix(in srgb, var(--dz-accent, var(--dzc-accent)) 35%, transparent); outline: none; }
.dz-tl__timehead { position: relative; flex: none; width: calc(var(--dz-tl-len, 0) * var(--dz-tl-slot)); height: 3.25rem; }
.dz-tl__group, .dz-tl__slot { position: absolute; inset-inline-start: calc(var(--x) * var(--dz-tl-slot)); width: calc(var(--w) * var(--dz-tl-slot)); box-sizing: border-box; overflow: hidden; white-space: nowrap; border-inline-start: 1px solid var(--dz-border, var(--dzc-border)); }
.dz-tl__group { overflow: clip; top: 0; height: 1.625rem; padding: 0.3125rem 0.375rem; font-size: 0.75rem; font-weight: 600; border-bottom: 1px solid var(--dz-border, var(--dzc-border)); }
.dz-tl__slot { top: 1.625rem; bottom: 0; padding: 0.375rem 0.25rem 0; font-size: 0.6875rem; color: var(--dz-fg-muted, var(--dzc-fg-muted)); border-inline-start-color: var(--dz-tl-line); }
.dz-tl__body { position: relative; min-height: 1px; }
.dz-tl__lines { position: absolute; top: 0; bottom: 0; inset-inline-start: var(--dz-tl-area, 0px); width: calc(var(--dz-tl-len, 0) * var(--dz-tl-slot)); pointer-events: none; }
.dz-tl__line { position: absolute; top: 0; bottom: 0; inset-inline-start: calc(var(--x) * var(--dz-tl-slot)); border-inline-start: 1px solid var(--dz-tl-line); }
.dz-tl__line--major { border-inline-start-color: var(--dz-border, var(--dzc-border)); }
.dz-tl__row {
  position: absolute; inset-inline-start: 0; top: calc(var(--y, 0) * 1px); width: 100%; display: flex; box-sizing: border-box;
  height: var(--dz-tl-row, calc(var(--dz-tl-lanes, 3) * var(--dz-tl-lane) + 8px));
  border-bottom: 1px solid var(--dz-border, var(--dzc-border));
}
.dz-tl__row--group { height: var(--dz-tl-grouprow, calc(var(--dz-tl-lane) + 8px)); background: var(--dz-bg-raised, var(--dzc-bg-raised)); }
.dz-tl:not(.dz-tl--resources) .dz-tl__row { height: 100%; min-height: calc(var(--dz-tl-lanes, 3) * var(--dz-tl-lane) + 8px); border-bottom: 0; }
.dz-tl__area {
  position: sticky; inset-inline-start: 0; z-index: 3; flex: none; width: var(--dz-tl-area, 0px);
  display: grid; grid-template-columns: var(--dz-tl-area-cols, 0px); box-sizing: border-box;
  background: var(--dz-bg, var(--dzc-bg)); border-inline-end: 1px solid var(--dz-border, var(--dzc-border));
}
.dz-tl:not(.dz-tl--resources) .dz-tl__area { border-inline-end: 0; }
.dz-tl__row--group .dz-tl__area { background: var(--dz-bg-raised, var(--dzc-bg-raised)); }
.dz-tl__cell { display: flex; align-items: center; gap: 0.25rem; padding: 0 0.5rem; font-size: 0.8125rem; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.dz-tl__cell[role='rowheader'] { padding-inline-start: calc(0.5rem + var(--depth, 0) * 1rem); }
.dz-tl__cell:focus-visible { outline: 2px solid var(--dz-accent, var(--dzc-accent)); outline-offset: -2px; }
.dz-tl__cell--group { grid-column: 1 / -1; font-weight: 600; font-size: 0.75rem; }
.dz-tl__title { overflow: hidden; text-overflow: ellipsis; }
.dz-tl__row--unassigned .dz-tl__title { font-style: italic; color: var(--dz-fg-muted, var(--dzc-fg-muted)); }
.dz-tl__expander { flex: none; width: 1rem; padding: 0; border: 0; background: none; color: inherit; font: inherit; cursor: pointer; }
.dz-tl__lane { position: relative; flex: none; width: calc(var(--dz-tl-len, 0) * var(--dz-tl-slot)); }
.dz-tl__off { position: absolute; inset-block: 0; inset-inline-start: calc(var(--x) * var(--dz-tl-slot)); width: calc(var(--w) * var(--dz-tl-slot)); background: var(--dz-off-bg, color-mix(in srgb, var(--dz-fg-muted, var(--dzc-fg-muted)) 9%, transparent)); pointer-events: none; }
.dz-tl__ev, .dz-more--tl {
  position: absolute; box-sizing: border-box;
  top: calc(4px + var(--lane, 0) * var(--dz-tl-lane)); height: calc(var(--dz-tl-lane) - 2px);
  inset-inline-start: calc(var(--x) * var(--dz-tl-slot)); width: max(calc(var(--w) * var(--dz-tl-slot) - 1px), 6px);
}
.dz-tl__ev {
  display: flex; gap: 0.375rem; align-items: center; z-index: 1;
  padding: 0 0.375rem; border-radius: var(--dz-radius, var(--dzc-radius));
  font-size: 0.75rem; white-space: nowrap; overflow: hidden;
  background: var(--dz-event-bg, color-mix(in srgb, var(--dz-event-accent, var(--dz-accent, var(--dzc-accent))) 18%, var(--dz-bg, var(--dzc-bg))));
  color: var(--dz-event-fg, var(--dz-fg, var(--dzc-fg)));
  border-inline-start: 3px solid var(--dz-event-accent, var(--dz-accent, var(--dzc-accent)));
}
.dz-tl__ev-title { font-weight: 600; flex: 0 1 auto; min-width: 1.5em; overflow: hidden; text-overflow: ellipsis; }
/* The time gives way first: a short event keeps its title. */
.dz-tl__ev-time { color: var(--dz-fg-muted, var(--dzc-fg-muted)); flex: 0 100 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
/* A day's (a month's) name stays in view while its long head scrolls by. */
.dz-tl__group-text { position: sticky; inset-inline-start: calc(var(--dz-tl-area, 0px) + 0.375rem); }
.dz-tl__ev--cont-start { border-start-start-radius: 0; border-end-start-radius: 0; }
.dz-tl__ev--cont-end { border-start-end-radius: 0; border-end-end-radius: 0; }
.dz-tl__ev--bg { top: 0; height: 100%; opacity: 0.35; border: 0; z-index: 0; border-radius: 0; }
.dz-tl__ev:focus-visible { outline: 2px solid var(--dz-accent, var(--dzc-accent)); outline-offset: 1px; }
.dz-more--tl { z-index: 2; margin: 0; padding: 0 0.375rem; text-align: start; }
.dz-tl__now { position: absolute; top: 0; bottom: 0; inset-inline-start: calc(var(--dz-tl-area, 0px) + var(--x) * var(--dz-tl-slot)); border-inline-start: 2px solid var(--dz-now, var(--dzc-danger)); z-index: 2; pointer-events: none; }
.dz-tl__lane > .dz-cursor { grid-row: auto; inset-inline: auto; inset-block: 2px; inset-inline-start: calc(var(--x, 0) * var(--dz-tl-slot)); width: calc(var(--w, 0) * var(--dz-tl-slot)); }
.dz-tl__timehead > .dz-cursor { grid-row: auto; inset-inline: auto; inset-block: 0; inset-inline-start: 0; width: 1px; }
.dz-tl__sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.dz-tl__probe { position: absolute; visibility: hidden; pointer-events: none; inset-inline-start: -9999px; width: 1px; height: var(--dz-tl-lane); }
.dz-editable .dz-tl__ev:not(.dz-tl__ev--bg) { cursor: grab; }
.dz-editable .dz-tl__ev[data-resize-end]::after { content: ''; position: absolute; inset-block: 0; inset-inline-end: 0; width: 6px; cursor: ew-resize; }
.dz-tl__ev, .dz-tl__lane { touch-action: pan-x pan-y; }
@media (forced-colors: active) { .dz-tl__ev { border: 1px solid CanvasText; } .dz-tl__now { border-inline-start-color: CanvasText; } }
@media print { .dz-tl { height: auto; } .dz-tl__scroller { overflow: visible; } }
`;
