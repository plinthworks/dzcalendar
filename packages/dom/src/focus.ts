/**
 * Focus and event targets that hold inside a shadow root (the Web Component's
 * `shadow` mode): seen from the document, both are retargeted to the host.
 */

/** What has the focus in `node`'s own root (its shadow root, or the document). */
export function activeIn(node: Node): Element | null {
  const root = node.getRootNode() as Document | ShadowRoot;
  return 'activeElement' in root ? root.activeElement : (node.ownerDocument?.activeElement ?? null);
}

/** The node an event really happened on (inside a shadow root too), not the host it is retargeted to. */
export function targetOf(e: Event): EventTarget | null {
  return (typeof e.composedPath === 'function' ? e.composedPath()[0] : undefined) ?? e.target;
}
