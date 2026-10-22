import type { CalendarHooks, EventContentCtx } from '../host.js';
import type { ElementHooks, HeaderItemCtx } from './hooks.js';

/**
 * The elements with a content a framework's template can draw (React's
 * `render…` props, Vue's slots, Angular's directives); the holders of events
 * (dayLane, slotLane, morePopover, view, resourceLane, resourceGroupLane)
 * take `hooks` only. docs/behaviors/render-hooks.md.
 */
export const TEMPLATE_ELEMENTS = [
  'event',
  'dayHeader',
  'dayCell',
  'slotLabel',
  'allDayLabel',
  'moreLink',
  'nowIndicator',
  'weekNumber',
  'noEvents',
  'listDayHeader',
  'monthHeader',
  'resource',
  'resourceGroupHeader',
  'resourceAreaHeader',
] as const;
export type TemplateElement = (typeof TEMPLATE_ELEMENTS)[number];

/** The span a template is drawn in: the classes events and day heads had before, the others' own. */
export const templateClass = (key: string): string =>
  key === 'event' ? 'dz-ev__content' : key === 'dayHeader' ? 'dz-dayhead__content' : key.startsWith('header:') ? 'dz-tpl dz-tpl--header-item' : `dz-tpl dz-tpl--${key}`;

/** What a framework says about its templates and the application's hooks, read when called (its latest props). */
export interface TemplateSource {
  /** Whether a template draws this element now. */
  has(element: TemplateElement): boolean;
  /** The application's own `hooks` (classes, mounts; a content where no template is given). */
  app(): CalendarHooks | undefined;
  /** The names of the application's places in the header. */
  items(): readonly string[];
  /** A background event the template draws nothing for stays a plain tint: asked before a portal is made. */
  blankBackground?(ctx: EventContentCtx): boolean;
}

type AnyHooks = ElementHooks<unknown>;

const appOf = (s: TemplateSource, el: string) => (s.app() as Record<string, AnyHooks | undefined> | undefined)?.[el];
const elementsOf = (s: TemplateSource) => new Set<string>([...TEMPLATE_ELEMENTS, ...Object.keys(s.app() ?? {})]);

/** One element's part of the shape: whether a template draws it, which members the application's hooks have, a class given as words. */
function partOf(s: TemplateSource, el: string): string | null {
  const app = appOf(s, el);
  const tpl = (TEMPLATE_ELEMENTS as readonly string[]).includes(el) && s.has(el as TemplateElement);
  const members = app ? Object.keys(app).filter((k) => (app as Record<string, unknown>)[k] !== undefined).sort() : [];
  if (!tpl && members.length === 0) return null;
  const words = app && app.class !== undefined && typeof app.class !== 'function' ? JSON.stringify(app.class) : '';
  return `${tpl ? 't' : ''}:${members.join(',')}:${words}`;
}

/**
 * The shape of what a framework gives (which elements have a template, which
 * members the application's hooks have, a class given as words): the hooks
 * are made again only when it changes, so a component re-rendering with new
 * closures redraws nothing — the functions read its latest props.
 */
export function templateShape(s: TemplateSource): string {
  const parts: string[] = [];
  for (const el of elementsOf(s)) {
    const part = partOf(s, el);
    if (part !== null) parts.push(`${el}:${part}`);
  }
  parts.push(`items:${[...s.items()].sort().join(',')}`);
  return parts.join(';');
}

/** What a framework's hooks were last made of: each element's part and its hooks, the header's names and record. */
interface Made {
  readonly elements: Map<string, { part: string; hooks: AnyHooks }>;
  items: { names: string; record: Record<string, ElementHooks<HeaderItemCtx>> };
}
const MADE = new WeakMap<TemplateSource, Made>();

/**
 * The calendar's `hooks` and `headerItems` for a framework: a template's
 * content is the span `portal` gives (the framework renders into it), let go
 * with `release`; the application's own members wrapped to read its latest
 * props. Keys: the element, or `header:<name>` for a header place. An
 * element whose part did not change keeps its hooks object (nothing of it
 * remounts); the header record stays the same while its names do. The
 * `el` a content is given is the element the hooks are for: the portal is
 * kept by it, and let go with it (a day's cell whose number is drawn anew).
 */
export function templateHooks(
  s: TemplateSource,
  portal: (key: string, el: HTMLElement, ctx: unknown) => HTMLElement,
  release: (key: string, el: HTMLElement) => void,
): { hooks: CalendarHooks; headerItems: Record<string, ElementHooks<HeaderItemCtx>> } {
  let made = MADE.get(s);
  if (!made) MADE.set(s, (made = { elements: new Map(), items: { names: '', record: {} } }));
  const hooks: Record<string, AnyHooks> = {};
  for (const el of elementsOf(s)) {
    const part = partOf(s, el);
    if (part === null) {
      made.elements.delete(el);
      continue;
    }
    const was = made.elements.get(el);
    if (was && was.part === part) {
      hooks[el] = was.hooks;
      continue;
    }
    const tpl = part.startsWith('t');
    const app = appOf(s, el);
    const h: AnyHooks = {};
    if (app?.class !== undefined) {
      h.class = (c: unknown) => {
        const k = appOf(s, el)?.class;
        return typeof k === 'function' ? k(c) : k;
      };
    }
    if (tpl) {
      h.content = (c: unknown, node: HTMLElement) =>
        el === 'event' && (c as EventContentCtx).background && s.blankBackground?.(c as EventContentCtx) ? null : portal(el, node, c);
    } else if (app?.content) h.content = (c: unknown, node: HTMLElement) => appOf(s, el)?.content?.(c, node);
    if (app?.didMount) h.didMount = (arg) => appOf(s, el)?.didMount?.(arg);
    if (tpl || app?.willUnmount) {
      h.willUnmount = (arg) => {
        if (tpl) release(el, arg.el);
        appOf(s, el)?.willUnmount?.(arg);
      };
    }
    made.elements.set(el, { part, hooks: h });
    hooks[el] = h;
  }
  for (const el of [...made.elements.keys()]) if (!(el in hooks)) made.elements.delete(el);
  // The same record while the names stay: a template toggled elsewhere does not remount a place (an open menu keeps its state).
  const names = [...s.items()].sort().join(',');
  if (names !== made.items.names) {
    const record: Record<string, ElementHooks<HeaderItemCtx>> = {};
    for (const name of s.items()) {
      record[name] = made.items.record[name] ?? {
        content: (c, node) => portal(`header:${name}`, node, c),
        willUnmount: ({ el }) => release(`header:${name}`, el),
      };
    }
    made.items = { names, record };
  }
  return { hooks: hooks as CalendarHooks, headerItems: made.items.record };
}
