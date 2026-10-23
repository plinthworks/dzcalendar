import { afterEach, describe, expect, it, vi } from 'vitest';

// A browser without Temporal of its own (Safari, October 2026): the calendar waits for the polyfill (owner, 18i).
// The suites load it first (test/temporal-setup.ts); here the core says it is not there yet, and lets it arrive.
vi.mock('@dzcalendar/core', async (original) => (await import('../../../test/temporal-loading.js')).lazyCore(original as never));
import { loading } from '../../../test/temporal-loading.js';

const { createCalendar } = await import('../src/index.js');
const { Temporal } = await import('@dzcalendar/core');

const later = () => {
  loading.ready = false;
  const host = document.body.appendChild(document.createElement('div'));
  const cal = createCalendar(host, { timeZone: 'Africa/Algiers', locale: 'fr-FR', initialView: 'dayGridMonth', initialDate: Temporal.PlainDate.from('2026-10-21'), events: [{ id: 'a', title: 'Consultation', start: '2026-10-21T09:00[Africa/Algiers]' }] } as never);
  return { host, cal };
};

afterEach(() => {
  loading.ready = true;
});

describe('calendar.ready (Temporal loading)', () => {
  it('where Temporal is there: drawn at once, ready resolved', async () => {
    const host = document.body.appendChild(document.createElement('div'));
    const cal = createCalendar(host, { timeZone: 'Africa/Algiers', initialView: 'dayGridMonth' });
    expect(host.querySelector('.dz-cal')).not.toBeNull();
    await expect(cal.ready).resolves.toBeUndefined();
    cal.destroy();
  });

  it('while it loads: nothing drawn, what is asked waits in line, commands refuse, the kernel says to await', async () => {
    const { host, cal } = later();
    expect(host.querySelector('.dz-cal')).toBeNull();
    expect(() => cal.kernel).toThrow(/await calendar\.ready/);
    cal.update({ view: 'timeGridWeek' });
    cal.navigate('next');
    const r = cal.run({ type: 'event.delete', id: 'a' });
    expect(r.ok ? [] : r.problems.map((p) => p.code)).toEqual(['calendar-not-ready']);
    expect(cal.undo()).toBe(false);
    expect(cal.getOptions().initialView).toBe('timeGridWeek');
    loading.release();
    await cal.ready;
    expect(host.querySelector('.dz-cal')).not.toBeNull();
    const st = cal.kernel.getState();
    expect([st.view.type, st.date.toString()]).toEqual(['timeGridWeek', '2026-10-28']);
    expect([...cal.kernel.store.snapshot.allEvents()].map((e) => e.id)).toEqual(['a']);
    cal.destroy();
  });

  it('destroyed before it is drawn: never drawn; what waited for its destruction told once, what was taken back not', async () => {
    const { host, cal } = later();
    const told: string[] = [];
    cal.onDestroy(() => told.push('editor closed'));
    const off = cal.onDestroy(() => told.push('taken back'));
    off();
    cal.destroy();
    cal.destroy();
    loading.release();
    await cal.ready;
    expect(host.querySelector('.dz-cal')).toBeNull();
    expect(told).toEqual(['editor closed']);
  });

  it('kernel and element are not enumerable while it waits: a spread or a log does not throw', () => {
    const { cal } = later();
    expect(() => ({ ...cal })).not.toThrow();
    expect(Object.keys(cal)).not.toContain('kernel');
    cal.destroy();
  });

  it('what waited for its destruction, once drawn: told by the real destroy', async () => {
    const { cal } = later();
    const told: string[] = [];
    cal.onDestroy(() => told.push('editor closed'));
    loading.release();
    await cal.ready;
    cal.destroy();
    expect(told).toEqual(['editor closed']);
  });

  it('a change refused while it waited: said, ready rejects with it, the changes after it still made', async () => {
    const { cal } = later();
    const said = vi.spyOn(console, 'error').mockImplementation(() => {});
    cal.update({ timeZone: 'Not/AZone' });
    cal.navigate('next');
    loading.release();
    await expect(cal.ready).rejects.toThrow(RangeError);
    expect(cal.kernel.getState().date.toString()).toBe('2026-11-01');
    expect(said).toHaveBeenCalled();
    said.mockRestore();
    cal.destroy();
  });

  it('an option it cannot take: ready rejects with the RangeError', async () => {
    loading.ready = false;
    const host = document.body.appendChild(document.createElement('div'));
    const cal = createCalendar(host, { timeZone: 'Africa/Algiers', initialView: 'noSuchView' });
    loading.release();
    await expect(cal.ready).rejects.toThrow(RangeError);
  });
});
