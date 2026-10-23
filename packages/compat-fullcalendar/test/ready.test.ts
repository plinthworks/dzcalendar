import { expect, it, vi } from 'vitest';

// A browser without Temporal of its own (Safari): the translation made once its polyfill has arrived, never a throw (18i).
vi.mock('@dzcalendar/core', async (original) => (await import('../../../test/temporal-loading.js')).lazyCore(original as never));
import { loading } from '../../../test/temporal-loading.js';
const { createFromFullCalendar, applyFullCalendar } = await import('../src/index.js');

it('createFromFullCalendar while Temporal loads: no throw; once there, the calendar as translated, its problems in the list', async () => {
  loading.ready = false;
  const host = document.body.appendChild(document.createElement('div'));
  const made = createFromFullCalendar(host, { initialView: 'dayGridMonth', initialDate: '2026-10-21', timeZone: 'Africa/Algiers', events: [{ id: 'a', title: 'Consultation', start: '2026-10-21T09:00:00' }], height: '100%' });
  expect(host.querySelector('.dz-cal')).toBeNull();
  loading.release();
  await made.calendar.ready;
  const st = made.calendar.kernel.getState();
  expect([st.view.type, st.date.toString(), [...made.calendar.kernel.store.snapshot.allEvents()].map((e) => e.id)]).toEqual(['dayGridMonth', '2026-10-21', ['a']]);
  expect(made.problems.map((p) => p.code)).toContain('compat-unsupported');
  made.detach();
  made.calendar.destroy();
});

it('applyFullCalendar on a calendar still waiting: laid on once it is drawn', async () => {
  loading.ready = false;
  const { createCalendar } = await import('@dzcalendar/dom');
  const host = document.body.appendChild(document.createElement('div'));
  const cal = createCalendar(host, { timeZone: 'Africa/Algiers' });
  const done = applyFullCalendar(cal, { initialView: 'dayGridMonth', events: [{ id: 'b', start: '2026-10-22T10:00:00' }] });
  expect(done.problems).toEqual([]);
  loading.release();
  await cal.ready;
  await Promise.resolve();
  expect(cal.kernel.getState().view.type).toBe('dayGridMonth');
  expect([...cal.kernel.store.snapshot.allEvents()].map((e) => e.id)).toEqual(['b']);
  done.detach();
  cal.destroy();
});
