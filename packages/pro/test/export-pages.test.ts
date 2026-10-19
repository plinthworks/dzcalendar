import { describe, it, expect } from 'vitest';
import { Temporal, createKernel, registerModelFamily } from '@dzcalendar/core';
import { buildListModel } from '@dzcalendar/core/views';
import type { EventInput } from '@dzcalendar/core';
import '../src/model-entry.js';
import { paintSheets, periodsFor, sheetSize } from '../src/export/pages.js';
import type { Op, PaintContext } from '../src/export/paint/ops.js';
import { EXPORT_EN } from '../src/export/messages.js';

// Pages drawn as operations, in node: the geometry checked by hand.
const now = () => Temporal.Instant.from('2026-10-21T08:00:00Z');
const d = (s: string) => Temporal.PlainDate.from(s);
const ctx = (rtl = false): PaintContext => ({
  rtl,
  style: { fg: 'fg', muted: 'muted', bg: 'bg', border: 'border', accent: 'accent', offHours: 'off', tone: (t) => t ?? 'accent' },
  fmt: {
    time: (i) => i.toZonedDateTimeISO('Europe/Paris').toPlainTime().toString({ smallestUnit: 'minute' }),
    wall: (t) => t.toString({ smallestUnit: 'minute' }),
    dayHead: (x) => x.toString(),
    dayHeadNarrow: (x) => `n${x.day}`,
    weekday: (x) => String(x.dayOfWeek),
    dayNumber: (x) => String(x.day),
    longDay: (x) => x.toString(),
    monthHead: (x) => x.toPlainYearMonth().toString(),
    number: (n) => String(n),
  },
  words: { ...EXPORT_EN, allDayRow: 'all-day' },
});
const kernel = (events: EventInput[], view = 'timeGridWeek', resources?: { id: string; title: string }[]) =>
  createKernel({ timeZone: 'Europe/Paris', locale: 'en-GB', now, events, initialView: view, initialDate: d('2026-10-21'), ...(resources && { resources }) });
const texts = (ops: readonly Op[]) => ops.flatMap((o) => (o.k === 'text' ? [o.text] : []));
// A4 landscape at 96 dpi: 841.89 × 595.28 pt → 1122.52 × 793.71 px; margins 36, title 34, foot 22.
const A4L = { w: (841.89 / 72) * 96, h: (595.28 / 72) * 96 };
const BOX = { x: 36, y: 70, w: A4L.w - 72, h: A4L.h - 72 - 34 - 22 };

describe('periods', () => {
  it('three weeks from 19 October: three sheets; a month view a month; bad input a problem', () => {
    const k = kernel([]);
    expect(periodsFor(k, { from: d('2026-10-19'), to: d('2026-11-09') }).periods.map((p) => [p.view, String(p.date)])).toEqual([
      ['timeGridWeek', '2026-10-19'],
      ['timeGridWeek', '2026-10-26'],
      ['timeGridWeek', '2026-11-02'],
    ]);
    expect(periodsFor(k, { view: 'dayGridMonth', from: d('2026-10-01'), to: d('2026-12-01') }).periods.map((p) => p.title)).toEqual(['October 2026', 'November 2026']);
    expect(periodsFor(k, { view: 'nope' }).problems.map((p) => [p.code, p.path])).toEqual([['invalid-export', 'view']]);
    expect(periodsFor(k, { from: d('2026-10-19'), to: d('2026-10-01') }).problems.map((p) => p.path)).toEqual(['to']);
    expect(sheetSize('a4', 'landscape').width).toBeCloseTo(A4L.w, 2);
  });
});

describe('a time grid on a sheet', () => {
  it('25 October 2026 in Paris: the repeated hour (02:00–03:00, wall axis) striped at 120–180 of 1440 minutes; the title and "1 / 1"', () => {
    const k = kernel([{ id: 'a', title: 'Garde', start: '2026-10-25T09:00[Europe/Paris]', end: '2026-10-25T10:00[Europe/Paris]' }], 'timeGridDay');
    const { periods } = periodsFor(k, { from: d('2026-10-25') });
    const { pens } = paintSheets(k, periods, { paper: 'a4', ctx: ctx() });
    expect(pens.length).toBe(1);
    const ops = pens[0]!.ops;
    // The body starts below one date head (22) and the all-day row (one empty lane: 16 + 6).
    const top = BOX.y + 22 + 22;
    const k1440 = (BOX.y + BOX.h - top) / 1440;
    const hatch = ops.find((o) => o.k === 'hatch')!;
    expect([hatch.y, hatch.h].map((v) => Math.round(v * 100) / 100)).toEqual([top + 120 * k1440, 60 * k1440].map((v) => Math.round(v * 100) / 100));
    // The event at 09:00 (after the change, +01:00): 540 axis minutes down.
    const ev = ops.find((o) => o.k === 'rect' && o.fill === 'accent' && o.alpha === 0.18)!;
    expect(ev.k === 'rect' && Math.round(ev.y - top - 0.5)).toBe(Math.round(540 * k1440));
    expect(texts(ops)).toEqual(expect.arrayContaining(['Sunday, 25 October 2026', '09:00', 'Garde', '1 / 1']));
  });

  it('right to left: the first day’s column is on the right', () => {
    const k = kernel([]);
    const { periods } = periodsFor(k, {});
    const ltr = paintSheets(k, periods, { paper: 'a4', ctx: ctx() }).pens[0]!.ops;
    const rtl = paintSheets(k, periods, { paper: 'a4', ctx: ctx(true) }).pens[0]!.ops;
    const head = (ops: readonly Op[]) => ops.find((o): o is Extract<Op, { k: 'text' }> => o.k === 'text' && o.text === '2026-10-19')!;
    const [l, r] = [head(ltr), head(rtl)];
    // Mirrored: its right edge as far from the sheet's right as the left one's from the left.
    expect(Math.round(r.x + r.w)).toBe(Math.round(A4L.w - l.x));
  });
});

describe('bad input and short events', () => {
  it('a view named like an object member, null options: problems, nothing thrown', () => {
    const k = kernel([]);
    expect([periodsFor(k, { view: 'toString' }).problems.map((p) => p.path), periodsFor(k, null as never).problems.map((p) => p.path), periodsFor(k, { from: '2026-10-01' as never }).problems.map((p) => p.detail)]).toEqual([['view'], ['options'], ['not-plain-date']]);
  });

  it('a 15-minute stand-up in a week still says its title', () => {
    const k = kernel([{ id: 's', title: 'Standup', start: '2026-10-21T09:00[Europe/Paris]', end: '2026-10-21T09:15[Europe/Paris]' }]);
    const { pens } = paintSheets(k, periodsFor(k, {}).periods, { paper: 'a4', ctx: ctx() });
    // One line, its time and title, smaller: the box is 10 px.
    expect(texts(pens[0]!.ops)).toContain('09:00 Standup');
  });
});

describe('a month, a list, a timeline', () => {
  it('a month: thirty events on one day — the lanes the sheet holds, then "+N"', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ id: `e${i}`, title: `E${i}`, start: '2026-10-21', allDay: true }));
    const k = kernel(many, 'dayGridMonth');
    const { pens } = paintSheets(k, periodsFor(k, {}).periods, { paper: 'a4', ctx: ctx() });
    const more = texts(pens[0]!.ops).filter((t) => t.startsWith('+'));
    const drawn = texts(pens[0]!.ops).filter((t) => /^E\d+$/.test(t)).length;
    expect([more.length, drawn + Number(more[0]!.slice(1))]).toEqual([1, 30]);
    // Inside its cell: the row of 21 October (the 4th of six weeks) ends at its next line.
    const plus = pens[0]!.ops.find((o): o is Extract<Op, { k: 'text' }> => o.k === 'text' && o.text.startsWith('+'))!;
    const rowTop = BOX.y + 22 + 3 * ((BOX.h - 22) / 6);
    expect(plus.y > rowTop && plus.y + 9 < rowTop + (BOX.h - 22) / 6).toBe(true);
  });

  it('a list over several sheets, portrait: a day cut by the page bottom has its head again', () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ id: `e${i}`, title: `E${i}`, start: `2026-10-${String(19 + (i % 3)).padStart(2, '0')}T${String(8 + (i % 10)).padStart(2, '0')}:00[Europe/Paris]` }));
    const k = kernel(many);
    // Not registered: a problem, nothing drawn, nothing thrown.
    expect(paintSheets(k, periodsFor(k, { view: 'listWeek' }).periods, { paper: 'a4', ctx: ctx() }).problems.map((p) => p.code)).toEqual(['invalid-export']);
    // What `@dzcalendar/dom/list` registers.
    registerModelFamily('list', { build: (range, snap, { displayZone }) => buildListModel(range, snap, { displayZone }) });
    const { pens } = paintSheets(k, periodsFor(k, { view: 'listWeek' }).periods, { paper: 'a4', ctx: ctx() });
    expect(pens.length).toBeGreaterThan(1);
    // Every sheet after the first starts with a day's head.
    for (const pen of pens.slice(1)) expect(texts(pen.ops)[1]).toMatch(/^2026-10-(19|20|21)$/);
    expect(texts(pens.at(-1)!.ops).at(-1)).toBe(`${pens.length} / ${pens.length}`);
  });

  it('a timeline day of 25 October in Paris: 25 hours wide; 00:00–06:00 is 7/25 of it (420 of 1500 minutes)', () => {
    const k = kernel([{ id: 'n', title: 'Nuit', start: '2026-10-25T00:00[Europe/Paris]', end: '2026-10-25T06:00[Europe/Paris]' }], 'timelineDay');
    if (!k.getViewSpec('timelineDay')) throw new Error('the timeline family is registered by model-entry');
    const { pens } = paintSheets(k, periodsFor(k, { from: d('2026-10-25') }).periods, { paper: 'a4', ctx: ctx() });
    const bar = pens[0]!.ops.find((o) => o.k === 'rect' && o.alpha === 0.18)!;
    const body = BOX.w - 150;
    expect(bar.k === 'rect' && Math.round(bar.w * 10) / 10).toBe(Math.round(((420 / 1500) * body - 1) * 10) / 10);
  });
});
