import type { EventInstance } from '@dzcalendar/core';
import { h } from '../render/reconcile.js';
import type { Box } from './surface.js';

export interface GhostLook {
  readonly kind: 'event' | 'select';
  /** The event's node: its accent colour is copied (not its place, nor its state). */
  readonly node?: HTMLElement | null;
  readonly instance?: EventInstance | null;
  readonly title?: string;
  /** A selection a finger made: two handles to pull its ends. */
  readonly handles?: boolean;
}

/**
 * Brings the preview nodes to one per box, placed by CSS variables — for a
 * pointer drag, a keyboard grab and a selection alike. `ghosts` is updated
 * in place.
 */
export function syncGhosts(layer: HTMLElement, ghosts: HTMLElement[], boxes: readonly Box[], look: GhostLook, state: { readonly invalid: boolean; readonly time: string }): void {
  const doc = layer.ownerDocument;
  while (ghosts.length < boxes.length) {
    const el = h(doc, 'div', look.kind === 'select' ? 'dz-ghost dz-ghost--select' : 'dz-ghost');
    if (look.kind === 'event') {
      const accent = look.node?.style.getPropertyValue('--dz-event-accent');
      if (accent) el.style.setProperty('--dz-event-accent', accent);
      for (const c of look.instance?.event.classNames ?? []) el.classList.add(c);
      el.append(h(doc, 'span', 'dz-ghost__title', look.title ?? ''));
    }
    layer.append(el);
    ghosts.push(el);
  }
  while (ghosts.length > boxes.length) ghosts.pop()!.remove();
  boxes.forEach((b, i) => {
    const el = ghosts[i]!;
    el.style.setProperty('--gx', `${b.x}px`);
    el.style.setProperty('--gy', `${b.y}px`);
    el.style.setProperty('--gw', `${b.w}px`);
    el.style.setProperty('--gh', `${b.h}px`);
    el.classList.toggle('dz-event--invalid', state.invalid);
    for (const old of el.querySelectorAll(':scope > .dz-ghost__handle')) old.remove();
    if (look.handles) {
      if (i === 0) el.append(h(doc, 'span', 'dz-ghost__handle dz-ghost__handle--start'));
      if (i === boxes.length - 1) el.append(h(doc, 'span', 'dz-ghost__handle dz-ghost__handle--end'));
    }
  });
  ghosts[0]?.setAttribute('data-time', state.time);
}

export function clearGhosts(ghosts: HTMLElement[]): void {
  for (const el of ghosts) el.remove();
  ghosts.length = 0;
}
