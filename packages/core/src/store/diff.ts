import type { CalEvent } from '../event/types.js';

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

const isPlain = (x: unknown): x is Record<string, unknown> => {
  if (typeof x !== 'object' || x === null) return false;
  const proto = Object.getPrototypeOf(x);
  return proto === Object.prototype || proto === null;
};

/**
 * Structural equality for what JSON can carry — plain objects, arrays,
 * primitives — and identity for anything else (a class instance, a
 * function). A server sends a fresh `{ room: { floor: 2 } }` on every fetch;
 * comparing by identity would call every refetch a change.
 */
export function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => sameValue(x, b[i]));
  if (isPlain(a) && isPlain(b)) {
    const ka = Object.keys(a);
    if (ka.length !== Object.keys(b).length) return false;
    return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && sameValue(a[k], b[k]));
  }
  return false;
}

/**
 * True when two events would draw the same. `revision` is ignored — it is the
 * answer to this question, not part of it.
 *
 * Moments are compared with Temporal's `equals` (instant, zone, calendar):
 * the same instant in another zone is a different event to a reader. `props` is
 * compared structurally (`sameValue`). Every field of `CalEvent` must appear
 * here; `diff.test.ts` fails when one is added and forgotten.
 */
export function eventEquals(a: CalEvent, b: CalEvent): boolean {
  if (a === b) return true;
  // `equals` compares instant, zone and calendar (or the date): no strings built.
  if (a.allDay && b.allDay) {
    if (!a.start.equals(b.start) || !a.end.equals(b.end)) return false;
  } else if (!a.allDay && !b.allDay) {
    if (!a.start.equals(b.start) || !a.end.equals(b.end) || a.zoneGuessed !== b.zoneGuessed) return false;
  } else {
    return false;
  }
  return (
    a.id === b.id &&
    a.title === b.title &&
    a.groupId === b.groupId &&
    a.display === b.display &&
    a.status === b.status &&
    a.busy === b.busy &&
    a.perms.start === b.perms.start &&
    a.perms.duration === b.perms.duration &&
    a.perms.resource === b.perms.resource &&
    a.tone === b.tone &&
    a.url === b.url &&
    a.sourceId === b.sourceId &&
    sameList(a.resourceIds, b.resourceIds) &&
    sameList(a.classNames, b.classNames) &&
    sameValue(a.props, b.props)
  );
}

/**
 * The store's rule for `revision`: an event equal to the one it replaces keeps
 * the old object (same identity, nothing re-renders); a different one takes
 * `revision`, which the store passes as the version of the snapshot being
 * written. Strictly increasing over the store's life, so one (id, revision)
 * never names two contents — not after an undo, not after a delete and a
 * re-delivery.
 */
export function stamp(prev: CalEvent | undefined, next: CalEvent, revision: number): CalEvent {
  if (prev && eventEquals(prev, next)) return prev;
  return next.revision === revision ? next : (Object.freeze({ ...next, revision }) as CalEvent);
}
