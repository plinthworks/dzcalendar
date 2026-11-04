import './prelude';
import '../packages/theme/dzcalendar.css';
import { Temporal } from '@dzcalendar/core';
import type { Instant } from '@dzcalendar/core';
import type { EventInput, ResourceInput } from '@dzcalendar/core';
import { createCalendar } from '@dzcalendar/dom';
import { createGsapMotion } from '@dzcalendar/motion-gsap';
import '@dzcalendar/pro';

// `?now=2026-10-21T09:30:00Z`: a fixed present and no live feed (the browser checks); otherwise the real clock.
const fixed = new URLSearchParams(location.search).get('now');
const now = () => (fixed ? Temporal.Instant.from(fixed) : Temporal.Now.instant());
const ZONE = 'Europe/Paris';

const processes: ResourceInput[] = [
  { id: 'import', title: 'Import des commandes' },
  { id: 'billing', title: 'Facturation' },
  { id: 'backup', title: 'Sauvegarde' },
  { id: 'reports', title: 'Rapports' },
];

type Status = 'running' | 'ok' | 'failed';
const TONE: Record<Status, string> = { running: 'blue', ok: 'green', failed: 'red' };
const SAID: Record<Status, string> = { running: 'en cours', ok: 'réussi', failed: 'échec' };
const run = (id: string, process: string, start: Instant, minutes: number, status: Status, detail: string): EventInput => ({
  id,
  title: processes.find((p) => p.id === process)!.title as string,
  start: start.toZonedDateTimeISO(ZONE).toString(),
  duration: { minutes },
  resourceId: process,
  tone: TONE[status],
  extendedProps: { status, detail },
});

// What already ran: the last ten hours, every process.
const t0 = now().round({ smallestUnit: 'minute', roundingMode: 'floor' });
const history: EventInput[] = [];
processes.forEach((p, i) => {
  for (let h = 10; h >= 1; h -= 2 + i) {
    const failed = (h + i) % 5 === 0;
    history.push(run(`${p.id}-${h}`, p.id as string, t0.subtract({ hours: h, minutes: 10 * i }), 20 + 10 * i, failed ? 'failed' : 'ok', failed ? 'code 2, 3 lignes rejetées' : `${120 * (i + 1)} éléments`));
  }
});

const log = document.querySelector<HTMLElement>('#log')!;
const stepOf = () => document.querySelector<HTMLSelectElement>('#step')!.value || undefined;
const cal = createCalendar(document.querySelector<HTMLElement>('#cal')!, {
  motion: createGsapMotion(),
  timeZone: ZONE,
  locale: 'fr-FR',
  now,
  views: { supervision: { family: 'timeline', resources: true, duration: { days: 3 } } },
  initialView: 'supervision',
  initialDate: t0.toZonedDateTimeISO(ZONE).toPlainDate(),
  headerViews: [],
  resources: processes,
  events: history,
  timeline: { slot: 15, step: stepOf(), follow: true },
  hooks: {
    event: {
      // The card: what happened, said in full on the event.
      content: ({ instance }) => {
        const x = instance.event.props as { status: Status; detail: string } | undefined;
        const el = document.createElement('div');
        el.className = 'run';
        el.append(Object.assign(document.createElement('b'), { textContent: instance.event.title }), Object.assign(document.createElement('small'), { textContent: x ? `${SAID[x.status]} — ${x.detail}` : '' }));
        return el;
      },
    },
  },
  onEventClick: (i) => (log.textContent = `${i.event.title} : ${String((i.event.props as { detail?: string } | undefined)?.detail ?? '')}`),
});

// The live feed (an EventSource in a real application): a run starts, then ends — succeeded or failed.
let n = 0;
function feed(): void {
  const p = processes[n % processes.length]!;
  const id = `live-${n++}`;
  const start = now().round({ smallestUnit: 'second', roundingMode: 'floor' });
  cal.run({ type: 'event.create', event: run(id, p.id as string, start, 20, 'running', 'démarré') });
  setTimeout(() => {
    const failed = Math.random() < 0.25;
    cal.run({ type: 'event.update', id, patch: { tone: TONE[failed ? 'failed' : 'ok'], extendedProps: { status: failed ? 'failed' : 'ok', detail: failed ? 'délai dépassé' : `${Math.round(Math.random() * 900)} éléments` } } });
  }, 4000);
}
if (!fixed) setInterval(feed, 6000);

document.querySelector<HTMLSelectElement>('#step')!.addEventListener('change', () => cal.update({ timeline: { step: stepOf() } }));
document.querySelector<HTMLInputElement>('#follow')!.addEventListener('change', (e) => cal.update({ timeline: { follow: (e.target as HTMLInputElement).checked } }));
document.querySelector<HTMLButtonElement>('#back45')!.addEventListener('click', () => cal.shift({ minutes: -45 }));
(window as unknown as { __cal: typeof cal }).__cal = cal;
