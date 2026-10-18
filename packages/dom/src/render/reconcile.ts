/**
 * Keyed reconciliation without a virtual DOM. Each item has a key and two
 * signatures: `pos` (where it is drawn — written as CSS variables) and
 * `content` (what it shows). A neighbour moving changes only `pos`: the node's
 * content, and any content hook, is left alone (FullCalendar #5594).
 *
 * A KeyedList owns its container: nothing else may insert children there
 * (use a `display: contents` host when a container has other children).
 */
export interface Keyed {
  readonly key: string;
  /** Where it is drawn. */
  readonly sig: string;
  /** What it shows. Absent: content follows `sig`. */
  readonly content?: string;
}

export interface Changed {
  readonly pos: boolean;
  readonly content: boolean;
  readonly created: boolean;
}

interface Entry {
  el: HTMLElement;
  sig: string;
  content: string | undefined;
}

export class KeyedList<T extends Keyed> {
  private readonly nodes = new Map<string, Entry>();

  constructor(
    private readonly container: HTMLElement,
    private readonly create: (item: T) => HTMLElement,
    private readonly update: (el: HTMLElement, item: T, changed: Changed) => void,
    private readonly removed?: (el: HTMLElement) => void,
    /** After a node left the container: a pool may take it back (`render/pool.ts`). */
    private readonly released?: (el: HTMLElement) => void,
  ) {}

  /** Brings the container to `items`, in order. Returns the nodes created, for an entrance animation. */
  sync(items: readonly T[]): HTMLElement[] {
    const seen = new Set<string>();
    for (const item of items) seen.add(item.key);
    // What goes, goes first: a window that drops its first rows must not make
    // every row after them move (a moved node loses the focus, and costs a layout).
    for (const [key, entry] of this.nodes) {
      if (seen.has(key)) continue;
      this.removed?.(entry.el);
      entry.el.remove();
      this.nodes.delete(key);
      this.released?.(entry.el);
    }
    const created: HTMLElement[] = [];
    let cursor: ChildNode | null = this.container.firstChild;
    for (const item of items) {
      let entry = this.nodes.get(item.key);
      if (!entry) {
        const el = this.create(item);
        el.dataset['key'] = item.key;
        this.update(el, item, { pos: true, content: true, created: true });
        entry = { el, sig: item.sig, content: item.content };
        this.nodes.set(item.key, entry);
        created.push(el);
      } else {
        const pos = entry.sig !== item.sig;
        const content = item.content === undefined ? pos : entry.content !== item.content;
        if (pos || content) {
          this.update(entry.el, item, { pos, content, created: false });
          entry.sig = item.sig;
          entry.content = item.content;
        }
      }
      // Only move a node that is out of place: moving costs a layout and may lose focus.
      if (entry.el !== cursor) this.container.insertBefore(entry.el, cursor);
      else cursor = cursor.nextSibling;
    }
    return created;
  }

  get(key: string): HTMLElement | undefined {
    return this.nodes.get(key)?.el;
  }

  clear(): void {
    for (const { el } of this.nodes.values()) {
      this.removed?.(el);
      el.remove();
      this.released?.(el);
    }
    this.nodes.clear();
  }
}

/** A small element factory: tag, class, optional text. */
export function h(doc: Document, tag: string, className: string, text?: string): HTMLElement {
  const el = doc.createElement(tag);
  el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

/** A host that takes part in its parent's grid as if its children were the parent's. */
export function contentsHost(doc: Document, className: string): HTMLElement {
  const el = h(doc, 'div', className);
  el.style.display = 'contents';
  return el;
}
