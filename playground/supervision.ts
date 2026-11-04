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
  extendedProps: { kind: 'run', status, detail },
});
// Two other kinds on the same rows: an alert (a short red mark) and a maintenance window (behind the runs, the row's whole height).
const alert = (id: string, process: string, at: Instant, detail: string): EventInput => ({
  id,
  title: 'Alerte',
  start: at.toZonedDateTimeISO(ZONE).toString(),
  duration: { minutes: 10 },
  resourceId: process,
  tone: 'amber',
  classNames: ['kind-alert'],
  extendedProps: { kind: 'alert', detail },
});
const maintenance = (id: string, process: string, from: Instant, hours: number): EventInput => ({
  id,
  title: 'Maintenance',
  start: from.toZonedDateTimeISO(ZONE).toString(),
  duration: { hours },
  resourceId: process,
  display: 'background',
  tone: 'violet',
  extendedProps: { kind: 'maintenance', detail: 'fenêtre prévue' },
});
type Props = { kind: 'run'; status: Status; detail: string } | { kind: 'alert' | 'maintenance'; detail: string };

// What already ran: the last ten hours, every process.
const t0 = now().round({ smallestUnit: 'minute', roundingMode: 'floor' });
const history: EventInput[] = [];
processes.forEach((p, i) => {
  for (let h = 10; h >= 1; h -= 2 + i) {
    const failed = (h + i) % 5 === 0;
    history.push(run(`${p.id}-${h}`, p.id as string, t0.subtract({ hours: h, minutes: 10 * i }), 20 + 10 * i, failed ? 'failed' : 'ok', failed ? 'code 2, 3 lignes rejetées' : `${120 * (i + 1)} éléments`));
  }
});
history.push(
  maintenance('maint-backup', 'backup', t0.subtract({ hours: 3 }), 2),
  maintenance('maint-billing', 'billing', t0.add({ hours: 1 }), 3),
  alert('alert-import', 'import', t0.subtract({ hours: 2, minutes: 20 }), 'disque à 95 %'),
  alert('alert-reports', 'reports', t0.subtract({ minutes: 50 }), 'file d’attente lente'),
);

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
      // The card, by kind: a run says how it went, an alert what it is about, a maintenance window its name.
      content: ({ instance }) => {
        const x = instance.event.props as Props;
        const el = document.createElement('div');
        el.className = 'run';
        // An alert is a moment, too narrow for words: its sign, and the detail on hover (and on click).
        if (x.kind === 'alert') return Object.assign(el, { textContent: '⚠', title: `${instance.event.title} : ${x.detail}` });
        const head = instance.event.title;
        const line = x.kind === 'run' ? `${SAID[x.status]} — ${x.detail}` : x.detail;
        el.append(Object.assign(document.createElement('b'), { textContent: head }), Object.assign(document.createElement('small'), { textContent: line }));
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
  // Now and then an alert instead of a run: another kind on the same row, from the same feed.
  if (n % 5 === 0) return void cal.run({ type: 'event.create', event: alert(id, p.id as string, start, 'mémoire à 90 %') });
  cal.run({ type: 'event.create', event: run(id, p.id as string, start, 20, 'running', 'démarré') });
  setTimeout(() => {
    const failed = Math.random() < 0.25;
    cal.run({ type: 'event.update', id, patch: { tone: TONE[failed ? 'failed' : 'ok'], extendedProps: { kind: 'run', status: failed ? 'failed' : 'ok', detail: failed ? 'délai dépassé' : `${Math.round(Math.random() * 900)} éléments` } } });
  }, 4000);
}
if (!fixed) setInterval(feed, 6000);

document.querySelector<HTMLSelectElement>('#step')!.addEventListener('change', () => cal.update({ timeline: { step: stepOf() } }));
document.querySelector<HTMLInputElement>('#follow')!.addEventListener('change', (e) => cal.update({ timeline: { follow: (e.target as HTMLInputElement).checked } }));
document.querySelector<HTMLButtonElement>('#back45')!.addEventListener('click', () => cal.shift({ minutes: -45 }));
(window as unknown as { __cal: typeof cal }).__cal = cal;
