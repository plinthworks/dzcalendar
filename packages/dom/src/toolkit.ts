/**
 * `@dzcalendar/dom/toolkit`: what a view family is built with — the list and
 * multi-month entries, the Pro, an application's own (`registerView`). A
 * plugin API: kept apart from the main entry, versioned with it.
 */
export { registerView, scrollEased } from './host.js';
export type { ViewController, ViewCtx, ViewFactory, EventContentCtx } from './host.js';
export type { InteractionSurface, KeyboardSurface, Box } from './interact/surface.js';
export type { DzMessages } from './messages.js';
export { ensureStyles } from './styles.js';
export { KeyedList, h, contentsHost } from './render/reconcile.js';
export type { Keyed, Changed } from './render/reconcile.js';
export { attachMenuTriggers } from './menu.js';
export type { ResolveTarget } from './menu.js';
export { timeLabels, startReadingOf, applyEventLook, fillEvent, unmountEvent, timedContent, formatMinutes } from './render/event.js';
export type { TimeLabels } from './render/event.js';
export { createDayGridView } from './views/daygrid.js';
export { RowWindow, onScrollFrame } from './render/window.js';
export { NodePool } from './render/pool.js';
export { altDate } from './render/alt.js';
export { resourceName, noResourcesNote } from './render/resource-heads.js';
export { decorate, holder, undecorate, undecorateAll } from './render/hooks.js';
export { weekWords, written } from './render/formats.js';
export { anyTarget, heldOn, holdOn, targetAt } from './interact/drop.js';
export type { Carried, DropTarget, PageHold } from './interact/drop.js';
export { TEMPLATE_ELEMENTS, templateClass, templateHooks, templateShape } from './render/templates.js';
export type { TemplateElement, TemplateSource } from './render/templates.js';
export { handles } from './interact/handles.js';
export type { ResourceContentCtx, ResourceHooks } from './host.js';
export { activeIn, targetOf } from './focus.js';
