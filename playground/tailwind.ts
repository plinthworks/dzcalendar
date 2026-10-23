import './prelude';
import { Temporal } from '@dzcalendar/core';
import type { EventInput } from '@dzcalendar/core';
import { createCalendar } from '@dzcalendar/dom';
import type { CalendarHooks } from '@dzcalendar/dom';

const now = () => Temporal.Instant.from('2026-10-21T08:00:00Z');
const events: EventInput[] = [
  { id: 'a', title: 'Consultation', start: '2026-10-20T09:00[Europe/Paris]', duration: { minutes: 45 }, tone: 'green' },
  { id: 'b', title: 'Réunion', start: '2026-10-21T11:00[Europe/Paris]', duration: { hours: 1 } },
  { id: 'c', title: 'Garde', start: '2026-10-22', allDay: true, tone: 'amber' },
];
const base = { timeZone: 'Europe/Paris', locale: 'fr-FR', initialView: 'timeGridWeek', initialDate: Temporal.PlainDate.from('2026-10-21'), now, events, editable: true, scrollTime: { hours: 8 } } as const;

// Styled: the calendar's look, and Tailwind utilities on its parts (they win: the calendar's CSS is in a layer under them).
const styledHooks: CalendarHooks = {
  event: { class: 'rounded-none shadow-md' },
  dayLane: { class: 'data-[past]:bg-slate-50' },
};
const styled = createCalendar(document.querySelector<HTMLElement>('#styled')!, {
  ...base,
  hooks: styledHooks,
  headerToolbar: { start: 'prev,next today', center: 'title', end: 'note' },
  headerItems: { note: { content: () => Object.assign(document.createElement('span'), { className: 'note rounded-dz bg-dz-accent px-2 py-1 text-xs text-dz-accent-fg', textContent: 'accent du thème' }) } },
});

// Unstyled: the structure only; every colour and border is Tailwind's.
const bare = createCalendar(document.querySelector<HTMLElement>('#bare')!, {
  ...base,
  look: 'none',
  hooks: {
    event: { class: (c) => `rounded-md border-l-4 px-1 text-xs ${c.instance.event.tone === 'green' ? 'border-emerald-600 bg-emerald-50 text-emerald-900' : 'border-sky-600 bg-sky-50 text-sky-900'}` },
    dayLane: { class: 'border-l border-slate-200 data-[today]:bg-amber-50/60' },
    dayHeader: { class: 'py-2 text-xs font-medium uppercase tracking-wide text-slate-500 data-[today]:text-sky-700' },
    slotLabel: { class: 'text-[11px] text-slate-400' },
    allDayLabel: { class: 'text-xs text-slate-500' },
  },
  headerToolbar: { start: 'prev,next today', center: 'title', end: 'timeGridWeek,dayGridMonth' },
});
document.querySelector('#bare .dz-toolbar')?.classList.add('gap-2', 'p-2');
(window as unknown as Record<string, unknown>).__tw = { styled, bare };
(window as unknown as { ready: boolean }).ready = true;
