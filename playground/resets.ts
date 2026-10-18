/**
 * The calendar beside a framework's global reset, as a real page has it:
 * `?reset=tailwind3|tailwind4|bootstrap|none&layers=1|0&page=…`. The reset is
 * in the page before the calendar is created; `layers=0` is `cssLayers: false`
 * with the unlayered theme. Checked by scripts/browser.mjs.
 */
import layered from '../packages/theme/dzcalendar.css?inline';
import flat from '../packages/theme/unlayered.css?inline';
import preflight from '../scripts/fixtures/resets/tailwind3-preflight.css?inline';
import reboot from '../scripts/fixtures/resets/bootstrap-reboot.css?inline';
import { Temporal } from '@dzcalendar/core';
import { createCalendar } from '@dzcalendar/dom';
import '@dzcalendar/dom/list';
import { DEMO_EVENTS } from './demo-events';

const q = new URLSearchParams(location.search);
const layers = q.get('layers') !== '0';
const sheet = (css: string) => {
  const st = document.createElement('style');
  st.textContent = css;
  document.head.append(st);
};
const reset = q.get('reset') ?? 'none';
// Tailwind 4 declares its layers first, then puts preflight in `base`; our tailwind.css recipe adds `dzcalendar` between.
if (reset === 'tailwind4') sheet(`@layer theme, base, dzcalendar, components, utilities;\n@layer base {\n${preflight}\n}`);
if (reset === 'tailwind3') sheet(preflight);
if (reset === 'bootstrap') sheet(reboot);
sheet(layers ? layered : flat);
// A rule of the page, after everything: it must win (same weight as ours when unlayered).
if (q.get('page')) sheet(q.get('page')!);

createCalendar(document.querySelector<HTMLElement>('#cal')!, {
  timeZone: 'Europe/Paris',
  locale: 'en-GB',
  initialView: q.get('view') ?? 'timeGridWeek',
  initialDate: Temporal.PlainDate.from('2026-10-21'),
  events: DEMO_EVENTS,
  now: () => Temporal.Instant.from('2026-10-21T08:00:00Z'),
  theme: q.get('theme') ?? 'standard',
  scheme: 'light',
  cssLayers: layers,
});
