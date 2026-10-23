import './prelude';
import '../packages/theme/dzcalendar.css';
import { Temporal } from '@dzcalendar/core';
import { createCalendar } from '@dzcalendar/dom';
import type { CalendarInstance } from '@dzcalendar/dom';
import '@dzcalendar/dom/locales/ar';
import { DEMO_EVENTS } from './demo-events';

const grid = document.querySelector<HTMLElement>('#grid')!;
const cals: CalendarInstance[] = [];
const families = ['standard', 'slate', 'night', 'pastel', 'frost', 'solar', 'contrast'];
const make = (caption: string, options: Record<string, unknown>) => {
  const fig = document.createElement('figure');
  const cap = document.createElement('figcaption');
  cap.textContent = caption;
  const host = document.createElement('div');
  fig.append(cap, host);
  grid.append(fig);
  cals.push(
    createCalendar(host, {
      timeZone: 'Europe/Paris',
      locale: 'fr-FR',
      initialView: 'dayGridMonth',
      initialDate: Temporal.PlainDate.from('2026-10-21'),
      events: DEMO_EVENTS,
      now: () => Temporal.Instant.from('2026-10-21T08:00:00Z'),
      headerViews: [],
      ...options,
    }),
  );
};
for (const theme of families) for (const scheme of ['light', 'dark'] as const) make(`${theme} · ${scheme === 'light' ? 'clair' : 'sombre'}`, { theme, scheme });
make('العربية · hégirien, grégorien à côté', { locale: 'ar-SA', theme: 'slate', scheme: 'light', displayCalendar: 'islamic-umalqura', secondaryCalendar: 'gregory' });
make('Français · double date', { theme: 'frost', scheme: 'light', secondaryCalendar: 'islamic-umalqura' });

document.querySelector<HTMLSelectElement>('#view')!.addEventListener('change', (e) => cals.forEach((c) => c.update({ view: (e.target as HTMLSelectElement).value })));
document.querySelector<HTMLSelectElement>('#density')!.addEventListener('change', (e) =>
  cals.forEach((c) => c.update({ density: (e.target as HTMLSelectElement).value as 'compact' | 'comfortable' | 'spacious' })),
);
(window as unknown as { __cals: CalendarInstance[] }).__cals = cals;
