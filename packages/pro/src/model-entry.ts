/**
 * `@dzcalendar/pro/model`: the timeline without a screen — its axis, its
 * model, the family and views registered with the kernel. No DOM: a server,
 * a worker or a native port can use it.
 */
export { buildTimelineAxis, defaultSlot, validSlot } from './timeline/axis.js';
export type { TimelineAxis, TimelineAxisOptions, TimelineGroup, TimelineSlot } from './timeline/axis.js';
export { buildTimelineModel, updateTimelineModel, timelineNow } from './timeline/model.js';
export type { TimelineBar, TimelineModel, TimelineMore, TimelineOptions, TimelineRow } from './timeline/model.js';
export { TIMELINE_VIEWS } from './timeline/family.js';
