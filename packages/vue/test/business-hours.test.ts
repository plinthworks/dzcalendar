import { expect, it } from 'vitest';
import { createApp, h } from 'vue';
import { DzCalendar } from '../src/index.js';

// 18j review: a bare `business-hours` attribute is true (Monday to Friday, 9:00–17:00), not an empty string that throws.
it('<DzCalendar business-hours>: the default hours, drawn', () => {
  const el = document.body.appendChild(document.createElement('div'));
  const errors: unknown[] = [];
  const app = createApp({ render: () => h(DzCalendar, { timeZone: 'Europe/Paris', businessHours: '' } as never) });
  app.config.errorHandler = (e) => void errors.push(e);
  app.mount(el);
  expect(errors).toEqual([]);
  expect(el.querySelector('.dz-cal')).not.toBeNull();
  app.unmount();
});
