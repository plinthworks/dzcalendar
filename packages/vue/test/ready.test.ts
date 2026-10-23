import { expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';

// A browser without Temporal of its own (Safari): <DzCalendar> made once the polyfill has arrived (owner, 18i).
vi.mock('@dzcalendar/core', async (original) => (await import('../../../test/temporal-loading.js')).lazyCore(original as never));
import { loading } from '../../../test/temporal-loading.js';
const { DzCalendar } = await import('../src/index.js');

it('while Temporal loads: nothing drawn; once it is there: the calendar; unmounted meanwhile: never', async () => {
  loading.ready = false;
  const el = document.body.appendChild(document.createElement('div'));
  const app = createApp({ render: () => h(DzCalendar, { timeZone: 'Europe/Paris', defaultView: 'dayGridMonth' }) });
  app.mount(el);
  expect(el.querySelector('.dz-cal')).toBeNull();
  loading.release();
  await Promise.resolve();
  await nextTick();
  expect(el.querySelector('.dz-cal')).not.toBeNull();
  app.unmount();

  loading.ready = false;
  const gone = document.body.appendChild(document.createElement('div'));
  const other = createApp({ render: () => h(DzCalendar, { timeZone: 'Europe/Paris' }) });
  other.mount(gone);
  other.unmount();
  loading.release();
  await Promise.resolve();
  expect(gone.querySelector('.dz-cal')).toBeNull();
});
