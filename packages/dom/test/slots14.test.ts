import { describe, it, expect, afterEach } from 'vitest';
import { Temporal } from '@dzcalendar/core';
import type { AvailableSlot } from '@dzcalendar/core';
import { findSlots } from '@dzcalendar/slots';
import { createCalendar } from '../src/index.js';
import type { CalendarInstance } from '../src/index.js';

// The availability view: free slots drawn in the time grid, a click (or Enter) hands the slot to the application.
const now = () => Temporal.Instant.from('2026-10-21T08:00:00Z');
let cal: CalendarInstance | null = null;
afterEach(() => {
  cal?.destroy();
  cal = null;
  document.body.innerHTML = '';
});
const mount = (over: Record<string, unknown> = {}) => {
  const host = document.createElement('div');
  document.body.append(host);
  cal = createCalendar(host, { timeZone: 'Europe/Paris', locale: 'fr-FR', now, initialView: 'timeGridWeek', initialDate: Temporal.PlainDate.from('2026-10-21'), ...over });
  return host;
};
// A provider in Riyadh (+03:00), Wednesday 2026-10-21 08:00–10:00, 30-minute slots: seen from Paris (+02:00), 07:00–09:00.
const riyadh = () =>
  findSlots({
    availability: { timeZone: 'Asia/Riyadh', weekly: [{ days: [3], from: '08:00', to: '10:00' }] },
    from: '2026-10-19T00:00+03:00[Asia/Riyadh]',
    to: '2026-10-26T00:00+03:00[Asia/Riyadh]',
    duration: 30,
  }).slots;

describe('availableSlots in the week', () => {
  it('each slot is a button in its day’s column, at its time in the calendar’s zone, named for screen readers', () => {
    const host = mount({ availableSlots: riyadh() });
    const col = host.querySelector('.dz-tg__col[data-date="2026-10-21"]')!;
    const buttons = [...col.querySelectorAll<HTMLButtonElement>('.dz-slot')];
    expect(buttons.map((b) => b.textContent)).toEqual(['07:00', '07:30', '08:00', '08:30']);
    expect(buttons[0]!.getAttribute('aria-label')).toBe('Créneau libre, 07:00–07:30');
    // At its minute: 07:00 is 420 minutes into the day; 30 minutes long.
    expect([buttons[0]!.style.getPropertyValue('--t'), buttons[0]!.style.getPropertyValue('--h')]).toEqual(['420', '30']);
    // Out of the tab order: the grid keeps its one tab stop.
    expect(buttons.every((b) => b.tabIndex === -1)).toBe(true);
    expect(host.querySelectorAll('.dz-tg__col[data-date="2026-10-22"] .dz-slot')).toHaveLength(0);
  });

  it('a click hands the slot to the application, as it was given, and is not a date click', () => {
    const slots = riyadh();
    const got: AvailableSlot[] = [];
    const dates: unknown[] = [];
    const host = mount({ availableSlots: slots, onSlotClick: (s: AvailableSlot) => got.push(s), onDateClick: (d: unknown) => dates.push(d) });
    host.querySelectorAll<HTMLButtonElement>('.dz-tg__col[data-date="2026-10-21"] .dz-slot')[1]!.click();
    expect(got).toEqual([slots[1]]);
    expect(got[0]).toBe(slots[1]);
    expect(String(got[0]!.start)).toBe('2026-10-21T08:30:00+03:00[Asia/Riyadh]');
    expect(dates).toHaveLength(0);
  });

  it('update({ availableSlots }) redraws them; null removes them', () => {
    const host = mount({ availableSlots: riyadh() });
    cal!.update({ availableSlots: riyadh().slice(0, 1) });
    expect(host.querySelectorAll('.dz-slot')).toHaveLength(1);
    cal!.update({ availableSlots: null });
    expect(host.querySelectorAll('.dz-slot')).toHaveLength(0);
  });

  it('the keyboard’s cursor says the slot it stands in, and Enter books it instead of a date click', async () => {
    // A slot over the whole day: wherever the cursor starts, it is in it.
    const all: AvailableSlot[] = [{ start: Temporal.ZonedDateTime.from('2026-10-21T00:00[Europe/Paris]'), end: Temporal.ZonedDateTime.from('2026-10-22T00:00[Europe/Paris]') }];
    const got: AvailableSlot[] = [];
    const dates: unknown[] = [];
    const host = mount({ availableSlots: all, onSlotClick: (s: AvailableSlot) => got.push(s), onDateClick: (d: unknown) => dates.push(d) });
    const cursor = host.querySelector<HTMLElement>('.dz-cursor')!;
    cursor.focus();
    const key = (k: string) => (document.activeElement ?? cursor).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    key('ArrowDown');
    // The cursor, moved, is named for where it stands.
    expect((document.activeElement as HTMLElement).getAttribute('aria-label')).toContain('Créneau libre, 00:00–00:00');
    key('Enter');
    expect(got).toEqual(all);
    expect(dates).toHaveLength(0);
  });
});

describe('review fixes (Phase 14)', () => {
  const zdt = (s: string) => Temporal.ZonedDateTime.from(`${s}[Europe/Paris]`);
  type Tagged = AvailableSlot & { readonly provider: string };

  it('new slots at the same times: a click hands back the new one (its data, not the old)', () => {
    const got: string[] = [];
    const a: Tagged = { start: zdt('2026-10-21T09:00'), end: zdt('2026-10-21T09:30'), provider: 'A' };
    const b: Tagged = { start: zdt('2026-10-21T09:00'), end: zdt('2026-10-21T09:30'), provider: 'B' };
    const host = mount({ availableSlots: [a], onSlotClick: (s: Tagged) => got.push(s.provider) });
    cal!.update({ availableSlots: [b] });
    host.querySelector<HTMLButtonElement>('.dz-slot')!.click();
    expect(got).toEqual(['B']);
  });

  it('overlapping slots (a step shorter than the duration): each keeps a part of its own to click', () => {
    const slots = ['09:00', '09:30', '10:00'].map((t) => ({ start: zdt(`2026-10-21T${t}`), end: zdt(`2026-10-21T${t}`).add({ hours: 1 }) }));
    const host = mount({ availableSlots: slots });
    const h = [...host.querySelectorAll<HTMLElement>('.dz-slot')].map((b) => b.style.getPropertyValue('--h'));
    expect(h).toEqual(['30', '30', '60']);
  });

  it('a slot from before slotMin shows its visible part; two slots at one start with different ends are both drawn', () => {
    const host = mount({
      timeGrid: { slotMin: { hours: 9 } },
      availableSlots: [
        { start: zdt('2026-10-21T08:30'), end: zdt('2026-10-21T09:30') },
        { start: zdt('2026-10-21T10:00'), end: zdt('2026-10-21T10:30') },
        { start: zdt('2026-10-21T10:00'), end: zdt('2026-10-21T11:00') },
      ],
    });
    const b = [...host.querySelectorAll<HTMLElement>('.dz-tg__col[data-date="2026-10-21"] .dz-slot')];
    expect(b.map((x) => [x.style.getPropertyValue('--t'), x.style.getPropertyValue('--h')])).toEqual([['0', '30'], ['60', '30'], ['60', '60']]);
  });

  it('slots that are not Temporal values (ISO strings) are skipped, not thrown on', () => {
    expect(() => mount({ availableSlots: [{ start: '2026-10-21T09:00Z', end: '2026-10-21T09:30Z' }] })).not.toThrow();
    expect(document.querySelectorAll('.dz-slot')).toHaveLength(0);
  });

  it('without onSlotClick the slots only show free time: marked disabled', () => {
    const host = mount({ availableSlots: riyadh() });
    expect(host.querySelector('.dz-slot')!.hasAttribute('aria-disabled')).toBe(true);
    cal!.update({ onSlotClick: () => undefined, availableSlots: riyadh() });
    expect(host.querySelector('.dz-slot')!.hasAttribute('aria-disabled')).toBe(false);
  });
});
