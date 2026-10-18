/**
 * Nodes taken back when they leave and handed out again, instead of made and
 * dropped: scrolling a windowed view, or turning weeks, reuses the event nodes
 * it has. A node comes back bare — no attribute but its class, no inline
 * style, no child — so nothing of the event it showed leaks into the next.
 * The hooks' contract holds: a node leaves through its list's `removed`
 * (`willUnmount`) before it is released, and is drawn as created
 * (`didMount`) when it is taken again.
 */
export class NodePool {
  private readonly free: HTMLElement[] = [];
  private base: string | null | undefined;

  constructor(
    private readonly make: () => HTMLElement,
    /** Nodes kept at most; beyond, released nodes are let go. */
    private readonly limit = 400,
  ) {}

  take(): HTMLElement {
    return this.free.pop() ?? this.make();
  }

  release(el: HTMLElement): void {
    if (this.free.length >= this.limit) return;
    for (const a of [...el.attributes]) if (a.name !== 'class') el.removeAttribute(a.name);
    // The class list as made: state classes (selected, focus, continuations, tones) go.
    if (this.base === undefined) this.base = this.make().getAttribute('class');
    if (el.getAttribute('class') !== this.base) el.setAttribute('class', this.base ?? '');
    el.replaceChildren();
    this.free.push(el);
  }

  get size(): number {
    return this.free.length;
  }
}
