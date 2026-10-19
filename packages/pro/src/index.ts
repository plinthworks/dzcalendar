/**
 * @dzcalendar/pro — the timeline. `import '@dzcalendar/pro'` registers the
 * family and its eight views (`timelineDay` … `resourceTimelineYear`) with
 * every calendar created after; options go in `timeline` (scale, lanes) and
 * `viewOptions.timeline` (the resource area's columns).
 * MIT for now (owner's decision); a code boundary, no key.
 */
export * from './model-entry.js';
export { createTimelineView } from './timeline/view.js';
export type { AreaColumn, TimelineViewOptions } from './timeline/view.js';
export { TIMELINE_CSS } from './timeline/styles.js';
