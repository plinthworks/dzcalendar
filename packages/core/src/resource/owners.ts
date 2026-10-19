import type { EventInstance, QueryOptions, StoreSnapshot, ViewWindow } from '../store/store.js';
import type { Resource } from './types.js';

/**
 * The id of the "Unassigned" column or row (`showUnassigned`): events on no
 * resource, or only on resources the calendar does not know. Not a string an
 * application can give (it starts with a NUL), so it never meets a real id.
 */
export const UNASSIGNED = '\u0000unassigned';

/** The "Unassigned" pseudo-resource; its words are the DOM's (`unassigned`). */
export const UNASSIGNED_RESOURCE: Resource = Object.freeze({
  id: UNASSIGNED,
  title: '',
  parentId: null,
  order: null,
  timeZone: null,
  businessHours: null,
  eventConstraint: null,
  eventOverlap: null,
  classNames: Object.freeze([]),
  extendedProps: Object.freeze({}),
  input: Object.freeze({ id: UNASSIGNED }),
});

const KNOWN = new WeakMap<readonly Resource[], ReadonlySet<string>>();
const knownOf = (all: readonly Resource[]) => {
  let set = KNOWN.get(all);
  if (!set) KNOWN.set(all, (set = new Set(all.map((r) => r.id))));
  return set;
};

/**
 * What one resource's column (or row) shows in a window: its events from the
 * per-resource index; for "Unassigned", every event none of whose resources
 * is in `all`.
 */
export function instancesOf(snap: StoreSnapshot, w: ViewWindow, resource: Resource, all: readonly Resource[], opts: QueryOptions = {}): EventInstance[] {
  if (resource.id !== UNASSIGNED) return snap.queryInstances(w, { ...opts, resourceId: resource.id });
  const known = knownOf(all);
  return snap.queryInstances(w, opts).filter((i) => !i.event.resourceIds.some((r) => known.has(r)));
}
