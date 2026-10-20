/**
 * Whether two option values say the same: arrays and plain objects by their
 * contents, Temporal values by what they print, functions and anything else by
 * identity (a JS Date by its milliseconds). A literal written again at each render (`resources={[…]}`) is then
 * no change — sending it would redraw, and a component that reads the calendar
 * while rendering it would render again, without end.
 */
export function same(a: unknown, b: unknown, seen: WeakMap<object, object> = new WeakMap()): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  // A value that holds itself (a cycle in `extendedProps`): a pair met again is taken as equal there, so the walk ends.
  if (seen.get(a) === b) return true;
  seen.set(a, b);
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((x, i) => same(x, b[i], seen));
  const pa = Object.getPrototypeOf(a);
  if (pa !== Object.getPrototypeOf(b)) return false;
  if (pa === Object.prototype || pa === null) {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => Object.hasOwn(b, k) && same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], seen));
  }
  // A JS Date by its milliseconds; a Temporal value (its tag says so) by what it prints; any other object by identity.
  if (a instanceof Date) return b instanceof Date && a.getTime() === b.getTime();
  const tag = Object.prototype.toString.call(a);
  return tag.startsWith('[object Temporal.') && tag === Object.prototype.toString.call(b) && String(a) === String(b);
}
