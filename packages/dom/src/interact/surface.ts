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
  /** The calendar point at a viewport point; `scrollY` (and `scrollX`) how far the scroller moved since `measure`. */
  hitAt(geo: G, x: number, y: number, scrollY: number, scrollX?: number): Hit | null;
  /** Where an event spanning `[start, end)` shows, in ghost-layer boxes. */
  boxesFor(
    geo: G,
    span: {
      readonly start: ZonedDateTime | PlainDate;
      readonly end: ZonedDateTime | PlainDate;
      readonly allDay: boolean;
      /** In a resource view, only these resources' columns (a proposal's); `resourceId`: a selection's. */
      readonly resourceIds?: readonly string[];
      readonly resourceId?: string;
    },
    scrollY: number,
    scrollX?: number,
  ): Box[];
  /** Whether a press on this element is on the calendar's time (columns, cells, the all-day row) — not a header, the gutter or a scrollbar. */
  accepts(target: Element): boolean;
  /** Which occurrence an event node shows. */
  instanceOf(node: HTMLElement): EventInstance | null;
  /** The day or moment an empty spot stands for (a click with no drag). */
  readonly family: 'timeGrid' | 'dayGrid' | 'timeline';
  /** The keyboard's side of the view (Phase 8): its cursor, its lines, its events by day. */
  readonly keys?: KeyboardSurface;
  /** What sticks inside the scroller (a timeline's resource area, its heads), in px: autoscroll starts past it. */
  insets?(): { readonly start: number; readonly top: number };
  /** The node that takes the focus for an event node a pointer pressed (a month gives its cell's item). */
  focusTarget?(node: HTMLElement): HTMLElement;
}

/**
 * What a view gives the keyboard. The cursor is a Hit, like a pointer's: the
 * view only says where it may stand and draws it; moving it, selecting from
 * it and holding an event are the same code for every view.
 */
export interface KeyboardSurface {
  /** Where the cursor stands when the grid first takes the focus: today if shown (else the first day), at the hour scrolled to. */
  home(): Hit | null;
  /**
   * The hit kept inside what is drawn (a slot clamped to its column's hours);
   * 'prev' / 'next' when its day is not shown — the caller changes period;
   * null on a day that has no time (skipped by its zone).
   */
  fit(hit: Hit): Hit | 'prev' | 'next' | null;
  /** Draws the cursor at `hit` and focuses it. */
  showCursor(hit: Hit, label: string): void;
  /** Whether an element is the cursor (a month cell, the time grid's cursor), placed or not yet. */
  isCursor(el: Element): boolean;
  /** The hit the cursor element stands for; null when it has no place yet (or `el` is not the cursor). */
  cursorAt(el: Element): Hit | null;
  /** The first or last place of the cursor's line: the week row of a month, the hours of a day. */
  lineEdge(hit: Hit, edge: 'start' | 'end'): Hit;
  /** The events the keyboard walks through from the cursor's day (Enter on a month cell). */
  itemsAt(hit: Hit): HTMLElement[];
  /** The events next to a focused one, in reading order (its day). */
  itemsAround(node: HTMLElement): HTMLElement[];
  /** The node to focus for an event, on `date` (and in `resourceId`'s column) when given (after a keyboard move, a delete…). */
  nodeFor(eventId: string, date?: PlainDate, resourceId?: string): HTMLElement | null;
  /** The hit the cursor goes back to from a focused event (Escape). */
  cursorFor(node: HTMLElement): Hit | null;
  /** A time grid with an all-day row above its hours: up from the first slot goes there, down from it comes back (`firstSlot`). */
  readonly allDayRow: boolean;
  /** The top slot in view on a day (from the all-day row down into the hours). */
  firstSlot?(date: PlainDate, resourceId?: string): Hit | null;
  /**
   * A resource view (Alt+Left/Right): the same day and time in the next or
   * previous resource's column. Null: no resource that way. Undefined: not a
   * resource view.
   */
  stepAcross?(hit: Hit, delta: number): Hit | null | undefined;
  /** Scrolls so that `hit` is in view (a held event's edge going below the fold). */
  reveal(hit: Hit): void;
  /** Which hits an event's edges are, when the family does not say it (a timeline in days: 'day'). Default: by the family. */
  hitGrid?(): 'time' | 'day';
}
