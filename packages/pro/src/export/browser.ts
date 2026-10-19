import { formatTemporal } from '@dzcalendar/core';
import type { CalendarInstance } from '@dzcalendar/dom';
import type { Op, PaintContext, PaintFormat, PaintStyle } from './paint/ops.js';
import { exportMessagesFor } from './messages.js';
import type { ExportMessages } from './messages.js';

/**
 * The calendar's colours as the browser resolves them: a probe inside the
 * calendar reads each token as an rgb() a canvas takes (`light-dark()`,
 * system colours and the page's --tz-* all resolved).
 */
export function readStyle(cal: CalendarInstance): PaintStyle & { readonly font: string } {
  const doc = cal.element.ownerDocument;
  // Paper is light: the palette read as the light scheme gives it, then the calendar's own put back (synchronously: never painted).
  const scheme = cal.element.getAttribute('data-dz-scheme');
  cal.element.setAttribute('data-dz-scheme', 'light');
  try {
    return readPalette(cal, doc);
  } finally {
    if (scheme === null) cal.element.removeAttribute('data-dz-scheme');
    else cal.element.setAttribute('data-dz-scheme', scheme);
  }
}

function readPalette(cal: CalendarInstance, doc: Document): PaintStyle & { readonly font: string } {
  const probe = doc.createElement('span');
  probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none';
  cal.element.append(probe);
  const read = (value: string) => {
    probe.style.color = '';
    probe.style.color = value;
    return doc.defaultView!.getComputedStyle(probe).color;
  };
  const fg = read('var(--dz-fg, var(--dzc-fg, CanvasText))');
  const style = {
    fg,
    muted: read('var(--dz-fg-muted, var(--dzc-fg-muted, GrayText))'),
    bg: read('var(--dz-bg, var(--dzc-bg, Canvas))'),
    border: read('var(--dz-border, var(--dzc-border, GrayText))'),
    accent: read('var(--dz-event-accent, var(--dz-accent, var(--dzc-accent, Highlight)))'),
    offHours: read('var(--dz-bg-raised, var(--dzc-bg-raised, ButtonFace))'),
  };
  const tones = new Map<string, string>();
  for (const t of ['', ...TONES]) tones.set(t, t ? read(`var(--dz-tone-${t}, ${style.accent})`) : style.accent);
  const font = doc.defaultView!.getComputedStyle(cal.element).fontFamily || 'system-ui, sans-serif';
  probe.remove();
  return {
    ...style,
    font,
    tone: (t) => {
      if (!t) return style.accent;
      let c = tones.get(t);
      if (c === undefined) {
        cal.element.append(probe);
        c = read(`var(--dz-tone-${t}, ${style.accent})`);
        probe.remove();
        tones.set(t, c);
      }
      return c;
    },
  };
}

const TONES = ['blue', 'green', 'red', 'orange', 'purple', 'teal', 'pink', 'gray', 'yellow'];

/** Times and dates in the calendar's locale (its display calendar included) and zone. */
export function readFormat(cal: CalendarInstance): PaintFormat {
  const { locale, timeZone } = cal.kernel.getState();
  const nf = new Intl.NumberFormat(locale);
  const hm = { hour: '2-digit', minute: '2-digit' } as const;
  return {
    time: (i) => i.toZonedDateTimeISO(timeZone).toLocaleString(locale, hm),
    wall: (t) => t.toLocaleString(locale, hm),
    dayHead: (d) => formatTemporal(d, { weekday: 'short', day: 'numeric' }, locale),
    dayHeadNarrow: (d) => formatTemporal(d, { weekday: 'narrow', day: 'numeric' }, locale),
    weekday: (d) => formatTemporal(d, { weekday: 'short' }, locale),
    dayNumber: (d) => formatTemporal(d, { day: 'numeric' }, locale),
    longDay: (d) => formatTemporal(d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }, locale),
    monthHead: (d) => formatTemporal(d, { month: 'long', year: 'numeric' }, locale),
    number: (n) => nf.format(n),
  };
}

export function isRtl(cal: CalendarInstance): boolean {
  return cal.element.ownerDocument.defaultView!.getComputedStyle(cal.element).direction === 'rtl';
}

export function paintContext(cal: CalendarInstance, words: ExportMessages = exportMessagesFor(cal.kernel.getState().locale)): PaintContext & { readonly font: string } {
  const style = readStyle(cal);
  return { style, font: style.font, fmt: readFormat(cal), words: { ...words, allDayRow: words.allDay }, rtl: isRtl(cal) };
}

/** Draws a sheet's operations on a canvas, `scale` device pixels per CSS pixel. */
export function drawSheet(canvas: HTMLCanvasElement, ops: readonly Op[], o: { readonly width: number; readonly height: number; readonly scale: number; readonly font: string; readonly rtl: boolean }): void {
  canvas.width = Math.round(o.width * o.scale);
  canvas.height = Math.round(o.height * o.scale);
  const g = canvas.getContext('2d')!;
  g.setTransform(o.scale, 0, 0, o.scale, 0, 0);
  g.textBaseline = 'top';
  g.direction = o.rtl ? 'rtl' : 'ltr';
  for (const op of ops) {
    g.globalAlpha = 'alpha' in op && op.alpha !== undefined ? op.alpha : 1;
    switch (op.k) {
      case 'rect':
        g.beginPath();
        if (op.r && g.roundRect) g.roundRect(op.x, op.y, op.w, op.h, op.r);
        else g.rect(op.x, op.y, op.w, op.h);
        if (op.fill) ((g.fillStyle = op.fill), g.fill());
        if (op.stroke) ((g.strokeStyle = op.stroke), (g.lineWidth = 0.75), g.stroke());
        break;
      case 'line':
        g.beginPath();
        g.moveTo(op.x1, op.y1);
        g.lineTo(op.x2, op.y2);
        g.strokeStyle = op.color;
        g.lineWidth = op.width;
        g.stroke();
        break;
      case 'hatch': {
        g.save();
        g.beginPath();
        g.rect(op.x, op.y, op.w, op.h);
        g.clip();
        g.globalAlpha = 0.35;
        g.strokeStyle = op.color;
        g.lineWidth = 0.75;
        g.beginPath();
        for (let d = -op.h; d < op.w; d += 6) (g.moveTo(op.x + d, op.y + op.h), g.lineTo(op.x + d + op.h, op.y));
        g.stroke();
        g.restore();
        break;
      }
      case 'text': {
        g.font = `${op.bold ? '600 ' : ''}${op.size}px ${o.font}`;
        // Each text in its own direction (its first letter's): a Latin title on an Arabic page ends with its "…", not starts.
        // A text without letters ("+27", "2 / 5") reads left to right on any page.
        g.direction = RTL_FIRST.test(op.text) ? 'rtl' : 'ltr';
        g.fillStyle = op.color;
        const text = fit(g, op.text, op.w);
        // `start` is the right edge on a right-to-left page.
        const left = op.align === 'center' ? false : (op.align === 'start') !== o.rtl;
        g.textAlign = op.align === 'center' ? 'center' : left ? 'left' : 'right';
        g.fillText(text, op.align === 'center' ? op.x + op.w / 2 : left ? op.x : op.x + op.w, op.y);
        break;
      }
    }
  }
  g.globalAlpha = 1;
}

const RTL_FIRST = /^[^\p{L}]*[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/u;
const LETTER = /\p{L}/u;

/** The text cut with "…" to fit `w` (by halves: a few measures, not one per letter). */
function fit(g: CanvasRenderingContext2D, text: string, w: number): string {
  if (g.measureText(text).width <= w) return text;
  const chars = [...text];
  let lo = 0;
  let hi = chars.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (g.measureText(chars.slice(0, mid).join('') + '…').width <= w) lo = mid;
    else hi = mid - 1;
  }
  return lo === 0 ? '' : chars.slice(0, lo).join('').trimEnd() + '…';
}

export function canvasBlob(canvas: HTMLCanvasElement, type: 'image/png' | 'image/jpeg', quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('the canvas gave no image'))), type, quality));
}
