import { Temporal } from '@dzcalendar/core';
import type { EventInput } from '@dzcalendar/core';
import { createCalendar } from '@dzcalendar/dom';
import '@dzcalendar/dom/list';

const now = () => Temporal.Instant.from('2026-10-21T08:00:00Z');
const events: EventInput[] = [
  { id: 'a', title: 'Consultation', start: '2026-10-21T09:00[Europe/Paris]', duration: { minutes: 45 }, tone: 'green' },
  { id: 'b', title: 'Réunion', start: '2026-10-22T11:00[Europe/Paris]', duration: { hours: 1 } },
  ...Array.from({ length: 14 }, (_, i) => ({ id: `l${i}`, title: `Rendez-vous ${i + 1}`, start: `2026-10-${String(19 + (i % 7)).padStart(2, '0')}T${String(8 + (i % 9)).padStart(2, '0')}:00[Europe/Paris]`, duration: { minutes: 30 } })),
];
const base = { timeZone: 'Europe/Paris', locale: 'fr-FR', initialView: 'timeGridWeek', initialDate: Temporal.PlainDate.from('2026-10-21'), now, events, scrollTime: { hours: 8 } } as const;
const el = (id: string) => document.querySelector<HTMLElement>(id)!;
const styled = createCalendar(el('#styled'), base);
const bare = createCalendar(el('#bare'), { ...base, look: 'none' });
const month = createCalendar(el('#month'), { ...base, look: 'none', initialView: 'dayGridMonth' });
const list = createCalendar(el('#list'), { ...base, look: 'none', initialView: 'listWeek' });
(window as unknown as Record<string, unknown>).__un = { styled, bare, month, list };
(window as unknown as { ready: boolean }).ready = true;
