/**
 * Identifiers the calendar makes up itself.
 *
 * An event handed in without an id still needs one — the store keys on it,
 * the DOM reconciles on it, undo refers to it. The generator is a value rather
 * than a module-level counter so a test can inject a deterministic one, and
 * two calendars on a page never share a sequence.
 */
export type IdGenerator = () => string;

export function createIdGenerator(prefix = 'dz'): IdGenerator {
  let next = 0;
  return () => `${prefix}-${++next}`;
}
