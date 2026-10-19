import { UNASSIGNED_RESOURCE, flattenRows, registerModelFamily, registerViewSpec } from '@dzcalendar/core';
import type { ResourceRow, ViewSpec } from '@dzcalendar/core';
import { buildTimelineModel, updateTimelineModel } from './model.js';
import type { TimelineModel } from './model.js';

const base = { fixedWeekCount: true, hiddenDays: [], showNonCurrentDates: true, family: 'timeline' } as const;
const SPANS = [
  ['Day', { days: 1 }, 'day'],
  ['Week', { weeks: 1 }, 'week'],
  ['Month', { months: 1 }, 'month'],
  ['Year', { years: 1 }, 'year'],
] as const;

/** The eight timeline views: day, week, month, year — without resources (`timelineDay`…) and with (`resourceTimelineDay`…). */
export const TIMELINE_VIEWS: Readonly<Record<string, ViewSpec>> = Object.freeze(
  Object.fromEntries(
    SPANS.flatMap(([name, duration, alignment]) => [
      [`timeline${name}`, { ...base, type: `timeline${name}`, duration, alignment }],
      [`resourceTimeline${name}`, { ...base, type: `resourceTimeline${name}`, duration, alignment, resources: true }],
    ]),
  ),
);
for (const spec of Object.values(TIMELINE_VIEWS)) registerViewSpec(spec);

const UNASSIGNED_ROW: ResourceRow = { kind: 'resource', resource: UNASSIGNED_RESOURCE, depth: 0, expanded: null, rowKey: 'r:\u0000unassigned' };

registerModelFamily<TimelineModel>('timeline', {
  build: (range, snap, { displayZone, view, options, resources }) => {
    const t = options.timeline ?? {};
    const rows = view.resources
      ? [
          ...(options.showUnassigned ? [UNASSIGNED_ROW] : []),
          ...flattenRows(resources, {
            collapsed: new Set(options.collapsedResources ?? []),
            ...(options.resourceGroupField && { groupBy: options.resourceGroupField }),
            collapsedGroups: new Set(options.collapsedGroups ?? []),
          }),
        ]
      : undefined;
    return buildTimelineModel(range, snap, {
      displayZone,
      ...(rows && { rows, resources: resources.order }),
      ...(t.slot !== undefined && { slot: t.slot }),
      ...(t.maxLanes !== undefined && { maxLanes: t.maxLanes }),
      ...(t.fillLanes !== undefined && { fillLanes: t.fillLanes }),
      ...(options.businessHours !== undefined && { businessHours: options.businessHours }),
    });
  },
  update: updateTimelineModel,
});
