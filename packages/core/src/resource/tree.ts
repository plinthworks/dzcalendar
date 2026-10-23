import { problem } from '../event/problems.js';
import type { Problem } from '../event/problems.js';
import type { ResourceId } from '../event/types.js';
import { assertBusinessHours } from '../rules/business-hours.js';
import type { ConstraintSpec } from '../rules/validate.js';
import { isValidZone } from '../zone.js';
import type { Resource, ResourceInput, ResourceNode, ResourceOrder, ResourceTree } from './types.js';

const EMPTY: readonly string[] = Object.freeze([]);
const NO_PROPS: Readonly<Record<string, unknown>> = Object.freeze({});

/** A field of a resource: its own (`title`, `order`), else what the application gave, else its `extendedProps`. */
export function fieldOf(r: Resource, name: string): unknown {
  if (name !== 'input' && Object.hasOwn(r, name)) return (r as unknown as Record<string, unknown>)[name];
  if (Object.hasOwn(r.input, name)) return r.input[name];
  return Object.hasOwn(r.extendedProps, name) ? r.extendedProps[name] : undefined;
}

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

function isConstraint(x: unknown): x is ConstraintSpec {
  if (x === 'businessHours') return true;
  if (!isRecord(x)) return false;
  if (typeof x['groupId'] === 'string') return true;
  return Array.isArray(x['spans']) && x['spans'].every((s) => isRecord(s) && Number.isFinite(s['s']) && Number.isFinite(s['e']));
}

const isStr = (x: unknown): x is string => typeof x === 'string';
const isStrings = (x: unknown) => Array.isArray(x) && x.every(isStr);
/** What each optional field must be; one that is not is dropped with a warning (its path says which). */
const FIELDS: readonly (readonly [keyof Resource & string, (x: unknown) => boolean, unknown])[] = [
  ['title', isStr, ''],
  ['parentId', isStr, null],
  ['order', Number.isFinite, null],
  ['timeZone', (x) => isStr(x) && isValidZone(x), null],
  ['businessHours', (x) => {
    try {
      assertBusinessHours(x as never);
      return true;
    } catch {
      return false;
    }
  }, null],
  ['eventConstraint', isConstraint, null],
  ['eventOverlap', (x) => typeof x === 'boolean', null],
  ['classNames', isStrings, EMPTY],
  ['extendedProps', isRecord, NO_PROPS],
];

/** One input checked: what cannot be read is dropped with a warning, an entry without an id is refused. */
function readResource(x: unknown, path: string, problems: Problem[]): Resource | null {
  if (!isRecord(x)) {
    problems.push(problem('invalid-resource', 'error', path));
    return null;
  }
  const id = x['id'];
  if (!isStr(id) || id === '') {
    problems.push(problem('invalid-resource', 'error', `${path}.id`));
    return null;
  }
  const out: Record<string, unknown> = { id, input: x };
  for (const [field, ok, fallback] of FIELDS) {
    const v = x[field];
    // null is "none" for a parent; elsewhere a value that cannot be read.
    if (v === undefined || (field === 'parentId' && v === null)) out[field] = fallback;
    else if (ok(v)) out[field] = field === 'classNames' ? Object.freeze([...(v as string[])]) : v;
    else {
      problems.push(problem(field === 'timeZone' ? 'unknown-zone' : 'invalid-resource', 'warning', `${path}.${field}`, isStr(v) ? v : undefined));
      out[field] = fallback;
    }
  }
  return Object.freeze(out) as unknown as Resource;
}

/** Compares two values of a field: numbers as numbers, the rest as text in a stable, locale-free order; absent last. */
function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === undefined || a === null) return 1;
  if (b === undefined || b === null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const x = String(a);
  const y = String(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

function comparator(order: ResourceOrder | undefined): ((a: Resource, b: Resource) => number) | null {
  if (order === undefined) return null;
  if (typeof order === 'function') return order;
  const fields = (typeof order === 'string' ? order.split(',') : order).map((f) => f.trim()).filter((f) => f !== '');
  return (a, b) => {
    for (const f of fields) {
      const desc = f.startsWith('-');
      const name = desc ? f.slice(1) : f;
      const x = fieldOf(a, name);
      const y = fieldOf(b, name);
      // Absent last whichever the direction: only what both have is turned round.
      const absent = (v: unknown) => v === undefined || v === null;
      if (absent(x) || absent(y)) {
        if (absent(x) !== absent(y)) return absent(x) ? 1 : -1;
        continue;
      }
      const c = compareValues(x, y);
      if (c !== 0) return desc ? -c : c;
    }
    return 0;
  };
}

/**
 * The resources as a tree, checked. Siblings go by `order` (lowest first,
 * then those without), then by `orderBy`, then as given. Never throws: an
 * entry without an id is refused (`invalid-resource`), a second one with the
 * same id too (`duplicate-id`); an unknown parent makes a root
 * (`unknown-resource`), and so does the resource that closes a cycle
 * (`resource-cycle`); a field that cannot be read is dropped with a warning.
 */
export function buildResourceTree(inputs: unknown, o: { readonly orderBy?: ResourceOrder } = {}): { tree: ResourceTree; problems: Problem[] } {
  const problems: Problem[] = [];
  const list = Array.isArray(inputs) ? inputs : inputs === undefined || inputs === null ? [] : (problems.push(problem('invalid-resource', 'error', 'resources')), []);
  const read: Resource[] = [];
  /** Each kept resource's place in the input: what problems point at. */
  const at: number[] = [];
  const index = new Map<ResourceId, number>();
  list.forEach((x, i) => {
    const r = readResource(x, `resources[${i}]`, problems);
    if (!r) return;
    if (index.has(r.id)) {
      problems.push(problem('duplicate-id', 'error', `resources[${i}].id`, r.id));
      return;
    }
    index.set(r.id, read.length);
    read.push(r);
    at.push(i);
  });

  // Parents: unknown ones and cycles are cut, the resource becomes a root.
  const parentOf = new Map<ResourceId, ResourceId | null>();
  read.forEach((r, i) => {
    let p = r.parentId;
    if (p !== null && !index.has(p)) {
      problems.push(problem('unknown-resource', 'warning', `resources[${at[i]}].parentId`, p));
      p = null;
    }
    parentOf.set(r.id, p);
  });
  read.forEach((r, i) => {
    const seen = new Set<ResourceId>([r.id]);
    for (let p = parentOf.get(r.id) ?? null; p !== null; p = parentOf.get(p) ?? null) {
      if (seen.has(p)) {
        // Back to itself: the first of a cycle (in input order) becomes a root. A cycle
        // further up is not this one's to break: its own first member will be.
        if (p === r.id) {
          problems.push(problem('resource-cycle', 'warning', `resources[${at[i]}].parentId`, r.parentId ?? ''));
          parentOf.set(r.id, null);
        }
        break;
      }
      seen.add(p);
    }
  });
  const fixed = read.map((r) => (parentOf.get(r.id) === r.parentId ? r : Object.freeze({ ...r, parentId: null })));

  const cmp = comparator(o.orderBy);
  const pos = new Map(fixed.map((r, i) => [r.id, i]));
  // An application's comparison that throws: input order, said once (bad input never throws).
  let failed = false;
  const safe = (a: Resource, b: Resource) => {
    if (failed) return 0;
    try {
      return cmp!(a, b);
    } catch {
      failed = true;
      problems.push(problem('invalid-resource', 'warning', 'resourceOrder'));
      return 0;
    }
  };
  const sortWith = (xs: Resource[], by: typeof safe | null) =>
    xs.sort((a, b) => {
      if (a.order !== b.order) return a.order === null ? 1 : b.order === null ? -1 : a.order - b.order;
      const c = by ? by(a, b) : 0;
      return c !== 0 && Number.isFinite(c) ? c : pos.get(a.id)! - pos.get(b.id)!;
    });
  const kids = new Map<ResourceId | null, Resource[]>();
  for (const r of fixed) (kids.get(r.parentId) ?? kids.set(r.parentId, []).get(r.parentId)!).push(r);
  // Every group of siblings sorted first; once a comparison has thrown, the whole tree in input order (by `order`
  // first) — not half of it sorted by the comparison and half not.
  for (const xs of kids.values()) sortWith(xs, cmp ? safe : null);
  if (failed) for (const xs of kids.values()) sortWith(xs, null);
  const sortSiblings = (xs: Resource[]) => xs;

  const byId = new Map<ResourceId, ResourceNode>();
  const order: Resource[] = [];
  const make = (r: Resource, parent: ResourceNode | null): ResourceNode => {
    const node = { resource: r, depth: parent ? parent.depth + 1 : 0, path: Object.freeze([...(parent?.path ?? []), r.id]), parent, children: [] as ResourceNode[] };
    byId.set(r.id, node);
    order.push(r);
    for (const c of sortSiblings(kids.get(r.id) ?? [])) node.children.push(make(c, node));
    Object.freeze(node.children);
    return Object.freeze(node);
  };
  const roots = sortSiblings(kids.get(null) ?? []).map((r) => make(r, null));
  return { tree: Object.freeze({ roots: Object.freeze(roots), byId, order: Object.freeze(order) }), problems };
}

/** No resources. */
export const EMPTY_TREE: ResourceTree = buildResourceTree([]).tree;
