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

/** What an application may put inside an event (through `eventContent`): its own control, with its own keys and its own context menu. */
const APP_CONTROL = 'input, textarea, select, button, a[href], [contenteditable=""], [contenteditable="true"]';
/** An event's node, in every view (the list's rows too). */
const EVENT_LIKE = '.dz-ev, .dz-bar, .dz-tl__ev, .dz-list__ev';

/** `t` is in a control an application put inside an event: the calendar leaves its keys and its context menu alone. */
export function inAppControl(t: Element): boolean {
  const control = t.closest(APP_CONTROL);
  const event = control?.parentElement?.closest(EVENT_LIKE);
  return event !== null && event !== undefined;
}
