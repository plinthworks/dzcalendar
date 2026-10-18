import type { ResourceId } from '../event/types.js';
import { fieldOf } from './tree.js';
import type { Resource, ResourceNode, ResourceTree } from './types.js';

export type ResourceRow =
  | {
      readonly kind: 'resource';
      readonly resource: Resource;
      readonly depth: number;
      /** Null: no children; else whether they are shown. */
      readonly expanded: boolean | null;
      readonly rowKey: string;
    }
  | {
      readonly kind: 'group';
      /** The field's value, as text ('' when the resource has none). */
      readonly value: string;
      /** Resources in it, whatever is collapsed. */
      readonly count: number;
      readonly expanded: boolean;
      readonly rowKey: string;
    };

export interface RowState {
  /** Resources whose children are shown; 'all' (the default) shows every one. */
  readonly expanded?: ReadonlySet<ResourceId> | 'all';
  /** Groups the roots by this field; each root's subtree stays in its root's group. */
  readonly groupBy?: string;
  /** Groups shut (by value). */
  readonly collapsedGroups?: ReadonlySet<string>;
}

/** A field's value as a group's name. */
export const groupValue = (r: Resource, field: string): string => {
  const v = fieldOf(r, field);
  return v === undefined || v === null ? '' : String(v);
};

/**
 * The rows a list of resources shows, in O(n): depth first, collapsed
 * subtrees left out, groups (by `groupBy`, in the order their first resource
 * comes) as rows above their resources. `filter` drops a resource and its
 * subtree.
 */
export function flattenRows(tree: ResourceTree, state: RowState = {}, filter?: (r: Resource) => boolean): ResourceRow[] {
  const open = (id: ResourceId) => state.expanded === undefined || state.expanded === 'all' || state.expanded.has(id);
  const walk = (node: ResourceNode, out: ResourceRow[]) => {
    if (filter && !filter(node.resource)) return;
    const has = node.children.length > 0;
    const expanded = has ? open(node.resource.id) : null;
    out.push({ kind: 'resource', resource: node.resource, depth: node.depth, expanded, rowKey: `r:${node.resource.id}` });
    if (expanded) for (const c of node.children) walk(c, out);
  };
  const field = state.groupBy;
  if (!field) {
    const out: ResourceRow[] = [];
    for (const r of tree.roots) walk(r, out);
    return out;
  }
  const groups = new Map<string, ResourceNode[]>();
  for (const r of tree.roots) {
    if (filter && !filter(r.resource)) continue;
    const v = groupValue(r.resource, field);
    (groups.get(v) ?? groups.set(v, []).get(v)!).push(r);
  }
  const out: ResourceRow[] = [];
  for (const [value, roots] of groups) {
    const inside: ResourceRow[] = [];
    for (const r of roots) walk(r, inside);
    const count = roots.reduce((n, r) => n + size(r, filter), 0);
    const expanded = !state.collapsedGroups?.has(value);
    out.push({ kind: 'group', value, count, expanded, rowKey: `g:${value}` });
    if (expanded) out.push(...inside);
  }
  return out;
}

function size(node: ResourceNode, filter?: (r: Resource) => boolean): number {
  if (filter && !filter(node.resource)) return 0;
  return 1 + node.children.reduce((n, c) => n + size(c, filter), 0);
}

/** The columns of a resource view: every resource in order, and the groups above them (`groupBy`). */
export interface ColumnResources {
  readonly resources: readonly Resource[];
  /** Consecutive resources sharing the field's value: `from` is the first's index. Empty without `groupBy`. */
  readonly groups: readonly { readonly value: string; readonly from: number; readonly count: number }[];
}

export function columnResources(tree: ResourceTree, groupBy?: string): ColumnResources {
  const rows = flattenRows(tree, groupBy ? { groupBy } : {});
  const resources: Resource[] = [];
  const groups: { value: string; from: number; count: number }[] = [];
  for (const row of rows) {
    if (row.kind === 'group') groups.push({ value: row.value, from: resources.length, count: row.count });
    else resources.push(row.resource);
  }
  return { resources, groups };
}
