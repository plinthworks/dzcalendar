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
const SAID: Record<Status, string> = { running: 'En cours', ok: 'Réussi', failed: 'Échec' };
const at = (i: Instant) => i.toZonedDateTimeISO(ZONE).toString();
const titleOf = (process: string) => processes.find((p) => p.id === process)!.title as string;
// A run: its planned span on the row; when it ended, said on the card (to the second).
const run = (id: string, process: string, start: Instant, minutes: number, status: Status, detail: string, ended?: Instant): EventInput => ({
  id,
  title: titleOf(process),
  start: at(start),
  duration: { minutes },
  resourceId: process,
  tone: TONE[status],
  extendedProps: { kind: 'run', status, detail, ended: ended?.toString() },
});
// Two other kinds on the same rows: an alert, and a maintenance window behind the runs (the row's whole height, its name at its start).
const alert = (id: string, process: string, when: Instant, detail: string): EventInput => ({
  id,
  title: 'Alerte',
  start: at(when),
  duration: { minutes: 75 },
  resourceId: process,
  tone: 'amber',
  classNames: ['kind-alert'],
  extendedProps: { kind: 'alert', detail },
});
const maintenance = (id: string, process: string, from: Instant, hours: number): EventInput => ({
  id,
  title: 'Maintenance',
  start: at(from),
  duration: { hours },
  resourceId: process,
  display: 'background',
  tone: 'violet',
  extendedProps: { kind: 'maintenance', detail: 'fenêtre prévue' },
});
type Props = { kind: 'run'; status: Status; detail: string; ended?: string } | { kind: 'alert' | 'maintenance'; detail: string };

// What already ran: one run every six hours or so per process, an hour and a half or more each — few cards, wide enough to read.
const t0 = now().round({ smallestUnit: 'second', roundingMode: 'floor' });
const history: EventInput[] = [];
processes.forEach((p, i) => {
  for (let h = 18 + i; h >= 4; h -= 6) {
    const failed = (h + i) % 3 === 0;
    const start = t0.subtract({ hours: h, minutes: 7 * i, seconds: 13 * i + h });
    const minutes = 100 + 15 * i;
    history.push(run(`${p.id}-${h}`, p.id as string, start, minutes, failed ? 'failed' : 'ok', failed ? 'code 2 · 3 lignes rejetées' : `${120 * (i + 1)} éléments traités`, start.add({ minutes: minutes - 4, seconds: 27 })));
  }
});
history.push(
  maintenance('maint-backup', 'backup', t0.subtract({ hours: 3 }), 2),
  maintenance('maint-billing', 'billing', t0.add({ hours: 1 }), 3),
  alert('alert-import', 'import', t0.subtract({ hours: 2, minutes: 20, seconds: 41 }), 'Disque à 95 %'),
  alert('alert-reports', 'reports', t0.subtract({ hours: 1, minutes: 50, seconds: 8 }), 'File d’attente lente'),
);

// To the second: “04/11 14:32:07”.
const stamp = (i: string) =>
  Temporal.Instant.from(String(i)).toZonedDateTimeISO(ZONE).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const el = (tag: string, cls: string, text = '') => Object.assign(document.createElement(tag), { className: cls, textContent: text });

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
  timeline: { slot: 15, step: stepOf(), follow: true, maxLanes: 2 },
  hooks: {
    event: {
      // The card, by kind: what happened, how it went, and when — to the second.
      content: ({ instance }) => {
        const x = instance.event.props as Props;
        const ev = instance.event;
        const start = ev.allDay ? '' : ev.start.toInstant().toString();
        if (x.kind === 'maintenance') return el('span', 'maint', `🛠 ${instance.event.title} · ${x.detail}`);
        const card = el('div', `card card--${x.kind === 'run' ? x.status : 'alert'}`);
        const head = el('div', 'card__head');
        head.append(el('b', 'card__title', x.kind === 'alert' ? `⚠ ${x.detail}` : instance.event.title));
        if (x.kind === 'run') head.append(el('span', 'card__pill', SAID[x.status]));
        card.append(head);
        card.append(el('span', 'card__detail', x.kind === 'run' ? x.detail : 'Alerte reçue'));
        card.append(el('time', 'card__when', x.kind === 'run' && x.ended ? `${stamp(start)} → ${stamp(x.ended).slice(-8)}` : stamp(start)));
        return card;
      },
    },
  },
  onEventClick: (i) => (log.textContent = `${i.event.title} : ${String((i.event.props as { detail?: string } | undefined)?.detail ?? '')}`),
});

// The live feed (an EventSource in a real application). A process runs one thing at a time: a run starts (“En cours”),
// a later message says how it ended, to the second; the next one starts once its span is over. Now and then, an alert.
const live = new Map<string, { id: string; until: number; done: boolean }>();
let n = 0;
function feed(): void {
  const t = now().round({ smallestUnit: 'second', roundingMode: 'floor' });
  const p = processes[n++ % processes.length]!;
  const pid = p.id as string;
  const cur = live.get(pid);
  if (n % 7 === 0) return void cal.run({ type: 'event.create', event: alert(`alert-${n}`, pid, t, 'Mémoire à 90 %') });
  if (cur && !cur.done) {
    cur.done = true;
    const failed = Math.random() < 0.25;
    const detail = failed ? 'Délai dépassé' : `${Math.round(Math.random() * 900)} éléments traités`;
    return void cal.run({ type: 'event.update', id: cur.id, patch: { tone: TONE[failed ? 'failed' : 'ok'], extendedProps: { kind: 'run', status: failed ? 'failed' : 'ok', detail, ended: t.toString() } } });
  }
  if (cur && t.epochMilliseconds < cur.until) return;
  const id = `live-${n}`;
  live.set(pid, { id, until: t.add({ minutes: 90 }).epochMilliseconds, done: false });
  cal.run({ type: 'event.create', event: run(id, pid, t, 90, 'running', 'Démarré') });
}
if (!fixed) setInterval(feed, 5000);

document.querySelector<HTMLSelectElement>('#step')!.addEventListener('change', () => cal.update({ timeline: { step: stepOf() } }));
document.querySelector<HTMLInputElement>('#follow')!.addEventListener('change', (e) => cal.update({ timeline: { follow: (e.target as HTMLInputElement).checked } }));
document.querySelector<HTMLButtonElement>('#back45')!.addEventListener('click', () => cal.shift({ minutes: -45 }));
(window as unknown as { __cal: typeof cal }).__cal = cal;
