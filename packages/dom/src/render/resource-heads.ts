import { decorate, undecorate } from './hooks.js';
import { UNASSIGNED } from '@dzcalendar/core';
import type { Resource, ResourceGroupHead, ResourceHead } from '@dzcalendar/core';
import type { ViewCtx } from '../host.js';
import { KeyedList, h } from './reconcile.js';

interface HeadItem {
  readonly key: string;
  readonly sig: string;
  readonly content: string;
  readonly head: ResourceHead;
  readonly row: number;
}

interface GroupItem {
  readonly key: string;
  readonly sig: string;
  readonly group: ResourceGroupHead;
  /** First column and span, in cells (a group spans its resources' days). */
  readonly from: number;
  readonly count: number;
}

/**
 * The heads of a resource view: a row of groups (when grouped), then a row of
 * resources, each over its columns. Seen, not read — each column says whose
 * it is in its own label — so they are hidden from screen readers. Placed in
 * the header's grid by `grid-row` / `grid-column`; `offset` is the first
 * grid column of the cells (2 after a time grid's gutter).
 */
/** What a resource is called on screen: its title, else its id; "Unassigned" in the locale's words. */
export const resourceName = (ctx: ViewCtx, r: Resource): string => (r.id === UNASSIGNED ? ctx.messages.unassigned : r.title || r.id);

/**
 * A resource view without resources: a sentence in place of the columns
 * (`noResources`), in `host`; gone as soon as there are some.
 */
export function noResourcesNote(ctx: ViewCtx, host: HTMLElement) {
  const note = h(ctx.doc, 'p', 'dz-empty');
  return (show: boolean): void => {
    if (!show) return note.remove();
    note.textContent = ctx.messages.noResources;
    if (!note.isConnected) host.append(note);
  };
}

export function drawResourceHeads(ctx: ViewCtx, groupsHost: HTMLElement, resourcesHost: HTMLElement, block: string, offset: number) {
  const { doc } = ctx;
  const place = (el: HTMLElement, row: number, from: number, count: number) => {
    el.style.gridRow = String(row);
    el.style.gridColumn = `${from + offset} / span ${count}`;
  };
  const groups = new KeyedList<GroupItem>(
    groupsHost,
    () => {
      const el = h(doc, 'div', `${block}__group`);
      el.setAttribute('aria-hidden', 'true');
      return el;
    },
    (el, it) => {
      el.textContent = it.group.value;
      place(el, 1, it.from, it.count);
      decorate(ctx, ctx.hooks.resourceGroupHeader, el, { view: ctx.kernel.getState().view.type, field: String(ctx.kernel.getOptions().resourceGroupField ?? ''), value: it.group.value }, undefined, true);
    },
    (el) => undecorate(el),
  );
  const heads = new KeyedList<HeadItem>(
    resourcesHost,
    () => {
      const el = h(doc, 'div', `${block}__resource`);
      el.setAttribute('aria-hidden', 'true');
      return el;
    },
    (el, it, changed) => {
      place(el, it.row, it.head.from, it.head.count);
      if (!changed.content) return;
      const r = it.head.resource;
      el.dataset['resource'] = r.id;
      el.className = [`${block}__resource`, ...r.classNames].join(' ');
      // The application's head (content, classes, mounts), else the title; read once the application fills it.
      decorate(ctx, ctx.hooks.resource, el, { resource: r, view: ctx.kernel.getState().view.type }, () => el.replaceChildren(h(doc, 'span', `${block}__resource-title`, resourceName(ctx, r))), true);
    },
    (el) => undecorate(el),
  );
  return {
    sync(resources: readonly ResourceHead[], grouped: readonly ResourceGroupHead[], epoch: number): void {
      const row = grouped.length > 0 ? 2 : 1;
      // A group spans its resources' cells: each resource's head says how many it has.
      const per = resources[0]?.count ?? 1;
      groups.sync(grouped.map((group) => ({ key: `${group.value}|${group.from}`, sig: `${group.from}|${group.count}|${per}|${epoch}`, group, from: group.from * per, count: group.count * per })));
      heads.sync(
        resources.map((head) => ({
          key: head.resource.id,
          sig: `${head.from}|${head.count}|${row}`,
          content: `${idOf(head.resource)}|${epoch}`,
          head,
          row,
        })),
      );
    },
    clear(): void {
      groups.clear();
      heads.clear();
    },
  };
}

const ids = new WeakMap<object, number>();
let next = 0;
/** A resource object's identity: a new one (setResources) redraws its head. */
const idOf = (o: object) => {
  let id = ids.get(o);
  if (id === undefined) ids.set(o, (id = ++next));
  return id;
};
