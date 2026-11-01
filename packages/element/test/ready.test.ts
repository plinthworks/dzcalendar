import { expect, it, vi } from 'vitest';

// A browser without Temporal of its own (Safari): <dz-calendar> drawn once the polyfill has arrived (owner, 18i).
vi.mock('@dzcalendar/core', async (original) => (await import('../../../test/temporal-loading.js')).lazyCore(original as never));
import { loading } from '../../../test/temporal-loading.js';
const { defineDzCalendar } = await import('../src/index.js');
defineDzCalendar();

it('while Temporal loads: nothing drawn; once it is there: the calendar, its dates said', async () => {
  loading.ready = false;
  const el = document.createElement('dz-calendar');
  el.setAttribute('time-zone', 'Europe/Paris');
  const said: string[] = [];
  el.addEventListener('dz-dates-set', (e) => said.push((e as CustomEvent<{ view: string }>).detail.view));
  document.body.append(el);
  expect(el.querySelector('.dz-cal')).toBeNull();
  (el as unknown as { update(c: object): void }).update({ view: 'timeGridWeek' });
  loading.release();
  await (el as unknown as { ready: Promise<void> }).ready;
  expect(el.querySelector('.dz-cal')).not.toBeNull();
  expect((el as unknown as { calendar: { kernel: { getState(): { view: { type: string } } } } }).calendar.kernel.getState().view.type).toBe('timeGridWeek');
  expect(said[0]).toBeDefined();
  el.remove();
});

// Not drawn: `ready` says so as `calendar.ready` does — rejected (it waited for ever before).
it('its polyfill not loaded: ready rejected with the load’s error, said on the console', async () => {
  loading.ready = false;
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  const el = document.createElement('dz-calendar') as HTMLElement & { ready: Promise<void> };
  document.body.append(el);
  const offline = new Error('chunk blocked');
  loading.fail(offline);
  await expect(el.ready).rejects.toBe(offline);
  expect(el.querySelector('.dz-cal')).toBeNull();
  expect(errors.mock.calls[0]?.[0]).toMatch(/temporal-load-failed/);
  errors.mockRestore();
  el.remove();
  loading.ready = true;
});

it('options it cannot take: ready rejected with their RangeError, the problem said', async () => {
  loading.ready = true;
  const el = document.createElement('dz-calendar') as HTMLElement & { ready: Promise<void>; options: object };
  const told: string[] = [];
  el.addEventListener('dz-problem', (e) => told.push(...(e as CustomEvent<{ path: string; detail: string }[]>).detail.map((p) => `${p.path}: ${p.detail}`)));
  el.options = { hiddenDays: [0, 1, 2, 3, 4, 5, 6] };
  document.body.append(el);
  await expect(el.ready).rejects.toBeInstanceOf(RangeError);
  await Promise.resolve();
  expect(told).toContain('property:options: refused');
  el.remove();
});

it('an Angular calendar already in it: left alone, ready rejected', async () => {
  loading.ready = true;
  const el = document.createElement('dz-calendar') as HTMLElement & { ready: Promise<void> };
  const theirs = document.createElement('div');
  theirs.className = 'dz-cal';
  el.append(theirs);
  document.body.append(el);
  await expect(el.ready).rejects.toThrow(/already holds a calendar/);
  expect(el.children.length).toBe(1);
  el.remove();
});

it('a page that never awaits ready: no unhandled rejection', async () => {
  loading.ready = true;
  const unhandled = vi.fn();
  process.on('unhandledRejection', unhandled);
  const el = document.createElement('dz-calendar') as HTMLElement & { options: object };
  el.options = { hiddenDays: [0, 1, 2, 3, 4, 5, 6] };
  document.body.append(el);
  await new Promise((r) => setTimeout(r, 10));
  process.off('unhandledRejection', unhandled);
  expect(unhandled).not.toHaveBeenCalled();
  el.remove();
});
