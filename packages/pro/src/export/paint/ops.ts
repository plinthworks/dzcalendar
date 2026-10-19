import type { Instant, PlainDate, PlainTime } from '@dzcalendar/core';
import type { ExportMessages } from '../messages.js';

/**
 * What a page is drawn with: a list of plain operations (pure, testable in
 * node), drawn on a canvas by `drawSheet` (`browser.ts`). Coordinates in CSS pixels on the
 * page; already mirrored for a right-to-left page.
 */
export type Op =
  | { readonly k: 'rect'; readonly x: number; readonly y: number; readonly w: number; readonly h: number; readonly fill?: string; readonly stroke?: string; readonly alpha?: number; readonly r?: number }
  | { readonly k: 'line'; readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number; readonly color: string; readonly width: number; readonly alpha?: number }
  /** One line of text in `[x, x + w]` (cut with "…" when longer), its top at `y`; `align` is logical (start is right on a right-to-left page). */
  | { readonly k: 'text'; readonly x: number; readonly y: number; readonly w: number; readonly text: string; readonly color: string; readonly size: number; readonly bold?: boolean; readonly align: 'start' | 'center' | 'end' }
  /** Diagonal stripes: a repeated or skipped hour, a day the zone skipped. */
  | { readonly k: 'hatch'; readonly x: number; readonly y: number; readonly w: number; readonly h: number; readonly color: string };

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Colours, read from the calendar's palette in the browser (`--dzc-*`, `--dz-tone-*`). */
export interface PaintStyle {
  readonly fg: string;
  readonly muted: string;
  readonly bg: string;
  readonly border: string;
  readonly accent: string;
  readonly offHours: string;
  /** An event's colour: its tone's, else the accent. */
  tone(tone: string | undefined): string;
}

/** The words a page writes, in the calendar's locale and zone. */
export interface PaintFormat {
  time(i: Instant): string;
  wall(t: PlainTime): string;
  /** A column's head: "Mon 19". */
  dayHead(d: PlainDate): string;
  /** A narrow column's head: "M 19". */
  dayHeadNarrow(d: PlainDate): string;
  weekday(d: PlainDate): string;
  dayNumber(d: PlainDate): string;
  /** A list's day: "Monday 19 October 2026". */
  longDay(d: PlainDate): string;
  /** A timeline's month head (day unit). */
  monthHead(d: PlainDate): string;
  number(n: number): string;
}

export interface PaintContext {
  readonly style: PaintStyle;
  readonly fmt: PaintFormat;
  readonly words: ExportMessages & { readonly allDayRow: string };
  readonly rtl: boolean;
}

/** Draws on one page, mirroring every x on a right-to-left page (the painters think left to right). */
export class Pen {
  readonly ops: Op[] = [];
  constructor(
    readonly width: number,
    readonly rtl: boolean,
  ) {}
  private x(x: number, w: number): number {
    return this.rtl ? this.width - x - w : x;
  }
  rect(x: number, y: number, w: number, h: number, o: { fill?: string; stroke?: string; alpha?: number; r?: number }): void {
    if (w <= 0 || h <= 0) return;
    this.ops.push({ k: 'rect', x: this.x(x, w), y, w, h, ...o });
  }
  line(x1: number, y1: number, x2: number, y2: number, color: string, width = 1, alpha?: number): void {
    const [a, b] = this.rtl ? [this.width - x1, this.width - x2] : [x1, x2];
    this.ops.push({ k: 'line', x1: a, y1, x2: b, y2, color, width, ...(alpha !== undefined && { alpha }) });
  }
  text(x: number, y: number, w: number, text: string, o: { color: string; size: number; bold?: boolean; align?: 'start' | 'center' | 'end' }): void {
    if (w <= 4 || !text) return;
    this.ops.push({ k: 'text', x: this.x(x, w), y, w, text, color: o.color, size: o.size, align: o.align ?? 'start', ...(o.bold && { bold: true }) });
  }
  hatch(x: number, y: number, w: number, h: number, color: string): void {
    if (w <= 0 || h <= 0) return;
    this.ops.push({ k: 'hatch', x: this.x(x, w), y, w, h, color });
  }
}

/** A page to draw on: its pen and the box left for the view (the title and the foot are the caller's). */
export interface PageSlot {
  readonly pen: Pen;
  readonly box: Box;
}

/** An event box: a tint, a stripe on its start side, its text. */
export function eventBox(pen: Pen, b: Box, ctx: PaintContext, color: string, lines: readonly string[], o: { readonly faded?: boolean } = {}): void {
  pen.rect(b.x, b.y, b.w, b.h, { fill: color, alpha: o.faded ? 0.08 : 0.18, r: 2 });
  pen.rect(b.x, b.y, Math.min(3, b.w), b.h, { fill: color, alpha: o.faded ? 0.4 : 1 });
  const pad = 5;
  let y = b.y + 2;
  // A box too short for its lines still says its last one (the title), smaller.
  if (lines.length > 0 && b.h >= 7 && y + Math.min(9.5, lines.length > 1 ? 8.5 : 9.5) > b.y + b.h + 1) {
    pen.text(b.x + pad, b.y + 0.5, b.w - pad - 2, lines[lines.length - 1]!, { color: ctx.style.fg, size: Math.max(6, Math.min(8, b.h - 1.5)), bold: true });
    return;
  }
  lines.forEach((t, i) => {
    const size = i === 0 && lines.length > 1 ? 8.5 : 9.5;
    if (y + size > b.y + b.h + 1) return;
    pen.text(b.x + pad, y, b.w - pad - 2, t, { color: ctx.style.fg, size, bold: i === lines.length - 1 && lines.length > 1 });
    y += size + 2.5;
  });
}
