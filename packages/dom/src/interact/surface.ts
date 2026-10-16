import type { EventInstance, Hit, PlainDate, ZonedDateTime } from '@dzcalendar/core';

/** A rectangle in the ghost layer's coordinates (CSS pixels from its top-left). */
export interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * What a view gives the interaction host: where gestures start, how a point
 * becomes a Hit, and where a proposed event would be drawn. The host never
 * reads layout during a gesture: `measure` reads once (when the gesture
 * starts, or after the view scrolled to another period), then everything is
 * arithmetic on that, plus the scroll offset the host follows by events.
 */
export interface InteractionSurface<G = unknown> {
  /** Where pointers go down. */
  readonly root: HTMLElement;
  /** The element that scrolls during a drag (autoscroll), if any. */
  readonly scroller: HTMLElement | null;
  /** Reads the geometry the gesture works on. `origin` is the ghost layer's top-left in the viewport. */
  measure(origin: { readonly x: number; readonly y: number }): G;
  /** The calendar point at a viewport point; `scrollY` is how far the scroller moved since `measure`. */
  hitAt(geo: G, x: number, y: number, scrollY: number): Hit | null;
  /** Where an event spanning `[start, end)` shows, in ghost-layer boxes. */
  boxesFor(geo: G, span: { readonly start: ZonedDateTime | PlainDate; readonly end: ZonedDateTime | PlainDate; readonly allDay: boolean }, scrollY: number): Box[];
  /** Whether a press on this element is on the calendar's time (columns, cells, the all-day row) — not a header, the gutter or a scrollbar. */
  accepts(target: Element): boolean;
  /** Which occurrence an event node shows. */
  instanceOf(node: HTMLElement): EventInstance | null;
  /** The day or moment an empty spot stands for (a click with no drag). */
  readonly family: 'timeGrid' | 'dayGrid';
}
