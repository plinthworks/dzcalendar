import '../packages/theme/dzcalendar.css';
import { Temporal } from '@dzcalendar/core';
import type { AvailableSlot, EventInput } from '@dzcalendar/core';
import { createCalendar } from '@dzcalendar/dom';
import { checkSlot, findSlots } from '@dzcalendar/slots';
import type { Busy, SlotQuery } from '@dzcalendar/slots';

const PROVIDER = 'Asia/Riyadh';
const now = Temporal.Instant.from('2026-10-21T06:00:00Z'); // 09:00 in Riyadh, the demo's "now"
const bookings: EventInput[] = [
  { id: 'b1', title: 'Consultation', start: '2026-10-21T10:00[Asia/Riyadh]', end: '2026-10-21T10:30[Asia/Riyadh]' },
  { id: 'b2', title: 'Consultation', start: '2026-10-22T08:00[Asia/Riyadh]', end: '2026-10-22T08:30[Asia/Riyadh]' },
];
const query = (): SlotQuery => ({
  availability: {
    timeZone: PROVIDER,
    weekly: [
      { days: [7, 1, 2, 3, 4], from: '08:00', to: '12:00' },
      { days: [7, 1, 2, 3, 4], from: '13:00', to: '16:00' },
    ],
    exceptions: [{ date: '2026-10-25', closed: true }],
  },
  from: now,
  to: now.add({ hours: 24 * 14 }),
  duration: 30,
  bufferAfter: 10,
  now,
  minNotice: 120,
  maxPerDay: 8,
  busy: bookings.map((b): Busy => ({ start: b.start as string, end: b.end as string })),
});

const log = document.querySelector<HTMLElement>('#log')!;
const cal = createCalendar(document.querySelector<HTMLElement>('#cal')!, {
  timeZone: 'Europe/Paris',
  locale: 'fr-FR',
  initialView: 'timeGridWeek',
  initialDate: Temporal.PlainDate.from('2026-10-21'),
  now: () => now,
  events: bookings,
  availableSlots: findSlots(query()).slots,
  timeGrid: { slotMin: { hours: 4 }, slotMax: { hours: 17 } },
  onSlotClick: (slot: AvailableSlot) => {
    // What a server does before saving: the same engine, the same rules.
    const verdict = checkSlot(query(), slot.start);
    if (!verdict.ok) {
      log.textContent = `Refusé : ${verdict.reason}`;
      return;
    }
    const start = verdict.slot.start;
    bookings.push({ id: `b${bookings.length + 1}`, title: 'Réservé', start: start.toString(), end: verdict.slot.end.toString() });
    cal.update({ events: [...bookings], availableSlots: findSlots(query()).slots });
    log.textContent = `Réservé : ${start.toLocaleString('fr-FR', { weekday: 'long', hour: '2-digit', minute: '2-digit' })} à Riyad`;
  },
});
document.querySelector<HTMLSelectElement>('#zone')!.addEventListener('change', (e) => cal.update({ timeZone: (e.target as HTMLSelectElement).value }));
(window as unknown as { __cal: typeof cal }).__cal = cal;
