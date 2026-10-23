import { registerModelFamily } from '@dzcalendar/core';
import { buildMultiMonthModel, updateMultiMonthModel } from '@dzcalendar/core/views';
import type { MultiMonthModel } from '@dzcalendar/core/views';
import { createDayGridView, ensureStyles, registerView } from '@dzcalendar/dom/toolkit';

/**
 * Months laid side by side, `--dz-mm-cols` at most (`multiMonthMaxColumns`;
 * 1 is a stack), each never narrower than `--dz-mm-min`. Each month is the
 * month view itself: its own grid, scrolled within the calendar. Selectors
 * outrank the month's (this sheet may come first in the document).
 */
export const MULTIMONTH_CSS = `
@layer dzcalendar.base, dzcalendar.theme;
@layer dzcalendar.base {
.dz-dg.dz-mm { border: 0; border-radius: 0; overflow: visible; }
.dz-mm > .dz-dg__body { display: grid; align-content: start; gap: 1rem; grid-template-columns: repeat(auto-fill, minmax(max(var(--dz-mm-min, 15rem), calc((100% - (var(--dz-mm-cols, 3) - 1) * 1rem) / var(--dz-mm-cols, 3))), 1fr)); }
.dz-mm__month { display: flex; flex-direction: column; min-width: 0; }
.dz-mm__title { margin: 0 0 0.375rem; font-size: 0.9375rem; font-weight: 600; }
.dz-mm__go { border: 0; padding: 0.125rem 0.25rem; background: transparent; color: inherit; font: inherit; cursor: pointer; border-radius: var(--dz-radius, var(--dzc-radius)); }
.dz-mm__go:focus-visible { outline: 2px solid var(--dz-accent, var(--dzc-accent)); }
.dz-mm__grid { display: flex; flex-direction: column; border: 1px solid var(--dz-border, var(--dzc-border)); border-radius: var(--dz-radius, var(--dzc-radius)); overflow: hidden; }
.dz-dg.dz-mm .dz-dg__week { flex: none; min-height: var(--dz-mm-week-min, 5.5rem); }
.dz-mm .dz-dg__cell--outside .dz-dg__num { visibility: hidden; }
}
`;

registerModelFamily<MultiMonthModel>('multiMonth', {
  // Reads only its range: a change elsewhere keeps the model.
  rangeOnly: true,
  build: (range, snap, { displayZone, options }) =>
    buildMultiMonthModel(range, snap, {
      ...options.dayGrid,
      displayZone,
      ...(options.businessHours !== undefined && { businessHours: options.businessHours }),
    }),
  update: updateMultiMonthModel,
});

registerView('multiMonth', (ctx) => {
  if (ctx.injectStyles) ensureStyles(ctx.popoverElement, 'multimonth', MULTIMONTH_CSS, ctx.cssLayers);
  return createDayGridView(ctx, { months: true });
});
