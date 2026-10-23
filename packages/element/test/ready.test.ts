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
