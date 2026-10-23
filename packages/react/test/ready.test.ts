import { expect, it, vi } from 'vitest';
import { act, createElement as h } from 'react';
import { createRoot } from 'react-dom/client';

// A browser without Temporal of its own (Safari): <DzCalendar> made once the polyfill has arrived (owner, 18i).
vi.mock('@dzcalendar/core', async (original) => (await import('../../../test/temporal-loading.js')).lazyCore(original as never));
import { loading } from '../../../test/temporal-loading.js';
const { DzCalendar } = await import('../src/index.js');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it('while Temporal loads: nothing drawn; once it is there: the calendar', async () => {
  loading.ready = false;
  const el = document.body.appendChild(document.createElement('div'));
  const root = createRoot(el);
  act(() => root.render(h(DzCalendar, { timeZone: 'Europe/Paris', defaultView: 'dayGridMonth' })));
  expect(el.querySelector('.dz-cal')).toBeNull();
  await act(async () => loading.release());
  expect(el.querySelector('.dz-cal')).not.toBeNull();
  act(() => root.unmount());
});
