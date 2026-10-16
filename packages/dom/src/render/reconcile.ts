/**
 * Keyed reconciliation without a virtual DOM. Each item has a key and a
 * signature; a node whose signature did not change is not touched at all —
 * no attribute written, no content hook run. That is how changing one event
 * leaves the hundred others alone.
 */
export interface Keyed {
  readonly key: string;
  /** Anything that changes when the node must be redrawn: revision, position, label. */
  readonly sig: string;
}

interface Entry {
  el: HTMLElement;
  sig: string;
}

export class KeyedList<T extends Keyed> {
  private readonly nodes = new Map<string, Entry>();

  constructor(
    private readonly container: HTMLElement,
    private readonly create: (item: T) => HTMLElement,
    private readonly update: (el: HTMLElement, item: T) => void,
  ) {}

  /** Brings the container to `items`, in order. Returns the nodes created, for an entrance animation. */
  sync(items: readonly T[]): HTMLElement[] {
    const seen = new Set<string>();
    const created: HTMLElement[] = [];
    let cursor: ChildNode | null = this.container.firstChild;
    for (const item of items) {
      seen.add(item.key);
      let entry = this.nodes.get(item.key);
      if (!entry) {
        const el = this.create(item);
        el.dataset['key'] = item.key;
        this.update(el, item);
        entry = { el, sig: item.sig };
        this.nodes.set(item.key, entry);
        created.push(el);
      } else if (entry.sig !== item.sig) {
        this.update(entry.el, item);
        entry.sig = item.sig;
      }
      // Only move a node that is out of place: moving costs a layout.
      if (entry.el !== cursor) this.container.insertBefore(entry.el, cursor);
      else cursor = cursor.nextSibling;
    }
    for (const [key, entry] of this.nodes) {
      if (seen.has(key)) continue;
      entry.el.remove();
      this.nodes.delete(key);
    }
    return created;
  }

  get(key: string): HTMLElement | undefined {
    return this.nodes.get(key)?.el;
  }

  clear(): void {
    for (const { el } of this.nodes.values()) el.remove();
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
