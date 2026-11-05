import './prelude';
import '../packages/theme/dzcalendar.css';
import { Temporal } from '@dzcalendar/core';
import type { Instant } from '@dzcalendar/core';
import type { EventInput, ResourceInput } from '@dzcalendar/core';
import { liveSource } from '@dzcalendar/core/live';
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
// Two other kinds on the same rows: an alert (a marker: a moment, a line and its flag), and a maintenance window behind the runs.
const alert = (id: string, process: string, when: Instant, detail: string): EventInput => ({
  id,
  title: 'Alerte',
  start: at(when),
  resourceId: process,
  display: 'marker',
  tone: 'amber',
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
type Props = { kind: 'run'; status: Status; detail: string; ended?: string } | { kind: 'alert'; detail: string } | { kind: 'maintenance'; detail: string };

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
// Still running: one with its expected length (dashed past now), one with none (it ends where now is).
history.push(
  { ...run('backup-now', 'backup', t0.subtract({ minutes: 35, seconds: 12 }), 70, 'running', 'En cours'), ongoing: true },
  (({ duration: _, ...r }) => ({ ...r, ongoing: true }))(run('reports-now', 'reports', t0.subtract({ minutes: 50, seconds: 41 }), 1, 'running', 'En cours')),
);
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
const paused = document.querySelector<HTMLElement>('#paused')!;
// What a process's head says, read from its runs: the last one finished, how many failed in 24 hours, one running.
interface Summary {
  readonly last: Status | null;
  readonly failures: number;
  readonly running: boolean;
}
// `?follow=slot` (the browser checks): the present's slot at the left edge; else the present 5 minutes in, gliding.
const FOLLOW = new URLSearchParams(location.search).get('follow') === 'slot' ? true : { before: { minutes: 5 } };
const stepOf = () => document.querySelector<HTMLSelectElement>('#step')!.value || undefined;
// `?span=` (the browser checks): another time shown at first, empty for the whole period.
const spanAsked = new URLSearchParams(location.search).get('span');
if (spanAsked !== null) document.querySelector<HTMLSelectElement>('#span')!.value = spanAsked;
const spanOf = () => document.querySelector<HTMLSelectElement>('#span')!.value || undefined;
// A slot that suits the time shown: its head says a time that fits (24 h in quarters of an hour would be 96 heads).
const slotOf = (span: string | undefined) => (span === 'P1D' ? 60 : span === 'PT12H' ? 30 : 15);
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
  // The present 5 minutes from the left edge, the axis gliding each minute; a ruler: a mark each minute, the time every 5.
  timeline: { slot: slotOf(spanOf()), span: spanOf(), step: stepOf(), follow: FOLLOW, ticks: { every: 1, label: 5 }, maxLanes: 2 },
  // The now line, and the axis following it, as often as chosen (`nowRefresh`; a minute by default).
  nowRefresh: document.querySelector<HTMLSelectElement>('#refresh')!.value,
  // A screen left open: what ended more than two days ago is forgotten.
  forget: { olderThan: { days: 2 } },
  hooks: {
    // A process's row head: its name, how its last run went, its failures of the last 24 hours, whether one runs now.
    resource: {
      content: ({ resource }) => {
        const x = resource.extendedProps as Partial<Summary>;
        const box = el('div', 'proc');
        box.append(el('b', 'proc__name', resource.title));
        const line = el('div', 'proc__line');
        if (x.last) line.append(el('span', `proc__dot proc__dot--${x.last}`, SAID[x.last]));
        if (x.running) line.append(el('span', 'proc__run', '▶ en cours'));
        if (x.failures) line.append(el('span', 'proc__fail', `${x.failures} échec${x.failures > 1 ? 's' : ''} / 24 h`));
        box.append(line);
        return box;
      },
    },
    event: {
      // The card, by kind: what happened, how it went, and when — to the second.
      content: ({ instance }) => {
        const x = instance.event.props as Props;
        const ev = instance.event;
        const start = ev.allDay ? '' : ev.start.toInstant().toString();
        if (x.kind === 'maintenance') return el('span', 'maint', `🛠 ${instance.event.title} · ${x.detail}`);
        // An alert is a marker: its flag says what and when, to the second.
        if (x.kind === 'alert') return Object.assign(el('span', 'flag', `⚠ ${x.detail} · ${stamp(start).slice(-8)}`), { title: `${x.detail} — ${stamp(start)}` });
        const card = el('div', `card card--${x.status}`);
        const head = el('div', 'card__head');
        head.append(el('b', 'card__title', instance.event.title), el('span', 'card__pill', SAID[x.status]));
        card.append(head);
        card.append(el('span', 'card__detail', x.detail), el('time', 'card__when', x.ended ? `${stamp(start)} → ${stamp(x.ended).slice(-8)}` : stamp(start)));
        return card;
      },
    },
  },
  // Following paused (the person went into the past or the future): said beside the controls, until "Today".
  onFollowChange: (following) => {
    paused.hidden = following;
  },
  onEventClick: (i) => (log.textContent = `${i.event.title} : ${String((i.event.props as { detail?: string } | undefined)?.detail ?? '')}`),
});

// The live feed: in a real application `sseSource('runs', '/api/runs/stream', { map })` (@dzcalendar/core/live);
// here `liveSource` with a timer standing for the server. A process runs one thing at a time: the feed says a run is
// going (`ongoing`: drawn up to now, growing; its expected length dashed), then how it ended, to the second — the
// run ends then (`ongoing: false`). Now and then, an alert (a marker).
const feed = liveSource('feed', {
  connect(emit) {
    // As a server would see it, in real time: a run lasts minutes (here 4 to 12, to see some end), the next one starts a
    // little after; an alert now and then, not two on one process within a quarter of an hour.
    const finishAt = new Map<string, number>();
    const nextStart = new Map<string, number>();
    const lastAlert = new Map<string, number>();
    let n = 0;
    const minutes = (a: number, b: number) => 60_000 * (a + Math.random() * (b - a));
    const timer = setInterval(() => {
      const t = now().round({ smallestUnit: 'second', roundingMode: 'floor' });
      const ms = t.epochMilliseconds;
      for (const p of processes) {
        const pid = p.id as string;
        const mine = [...cal.kernel.store.snapshot.allEvents()].filter((e) => e.resourceIds[0] === pid && (e.props as Partial<Props>).kind === 'run');
        const cur = mine.find((e) => !e.allDay && e.ongoing);
        if (cur && !cur.allDay) {
          // One the page started with: it ends around its expected end.
          if (!finishAt.has(cur.id)) finishAt.set(cur.id, Math.max(ms + minutes(1, 4), (cur.expectedEnd?.epochMilliseconds ?? ms) + minutes(0, 3)));
          if (ms < finishAt.get(cur.id)!) continue;
          finishAt.delete(cur.id);
          nextStart.set(pid, ms + minutes(1, 4));
          const failed = Math.random() < 0.25;
          const props = { kind: 'run', status: failed ? 'failed' : 'ok', detail: failed ? 'Délai dépassé' : `${Math.round(Math.random() * 900)} éléments traités`, ended: t.toString() };
          const patch = { ongoing: false, end: t.toString(), tone: TONE[failed ? 'failed' : 'ok'], extendedProps: props };
          // The feed's own run through the feed; one the page was given, by a command (the feed does not own it).
          if (cur.sourceId === 'feed') emit({ update: cur.id, patch });
          else cal.run({ type: 'event.update', id: cur.id, patch });
          continue;
        }
        if (ms < (nextStart.get(pid) ?? 0)) continue;
        const id = `live-${++n}`;
        const expected = 4 + Math.round(Math.random() * 8);
        finishAt.set(id, ms + minutes(expected * 0.8, expected * 1.2));
        emit({ create: { ...run(id, pid, t, expected, 'running', 'En cours'), ongoing: true } });
      }
      // About one alert every three minutes, on a process that had none for a quarter of an hour.
      if (Math.random() < 5 / 180) {
        const p = processes[Math.floor(Math.random() * processes.length)]!;
        const pid = p.id as string;
        if (ms - (lastAlert.get(pid) ?? 0) > 15 * 60_000) {
          lastAlert.set(pid, ms);
          emit({ create: alert(`alert-${++n}`, pid, t, 'Mémoire à 90 %') });
        }
      }
    }, 5000);
    return () => clearInterval(timer);
  },
});
if (!fixed) cal.update({ sources: [feed] });

// The recipe: the store tells what changed; each process's summary is read again, and the resources given anew
// only when one differs — the heads redraw, nothing else.
let said = '';
function summarize(): void {
  const t = now().epochMilliseconds;
  const by = new Map<string, { last: Status | null; lastEnd: number; failures: number; running: boolean }>(processes.map((p) => [p.id as string, { last: null, lastEnd: -Infinity, failures: 0, running: false }]));
  for (const e of cal.kernel.store.snapshot.allEvents()) {
    const x = e.props as Partial<Props>;
    const s = by.get(e.resourceIds[0] ?? '');
    if (!s || x.kind !== 'run' || e.allDay) continue;
    if (e.ongoing) s.running = true;
    else {
      const end = e.end.epochMilliseconds;
      if (end > s.lastEnd) [s.last, s.lastEnd] = [x.status ?? null, end];
      if (x.status === 'failed' && t - end < 86_400_000) s.failures++;
    }
  }
  const resources = processes.map((p) => {
    const { last, failures, running } = by.get(p.id as string)!;
    return { ...p, extendedProps: { last, failures, running } satisfies Summary };
  });
  const text = JSON.stringify(resources);
  if (text === said) return;
  said = text;
  cal.update({ resources });
}
let queued = false;
cal.kernel.subscribe((e) => {
  if (e.type !== 'store' || queued) return;
  queued = true;
  queueMicrotask(() => ((queued = false), summarize()));
});
summarize();

// Light, dark, or the system's: the calendar's `scheme`; the page around it follows (its own colours by data-scheme).
const schemeOf = () => document.querySelector<HTMLSelectElement>('#scheme')!.value as 'auto' | 'light' | 'dark';
const paintPage = () => (document.documentElement.dataset['scheme'] = schemeOf());
document.querySelector<HTMLSelectElement>('#refresh')!.addEventListener('change', (e) => cal.update({ nowRefresh: (e.target as HTMLSelectElement).value }));
document.querySelector<HTMLSelectElement>('#scheme')!.addEventListener('change', () => (cal.update({ scheme: schemeOf() }), paintPage()));
paintPage();
document.querySelector<HTMLSelectElement>('#span')!.addEventListener('change', () => cal.update({ timeline: { span: spanOf(), slot: slotOf(spanOf()) } }));
document.querySelector<HTMLSelectElement>('#step')!.addEventListener('change', () => cal.update({ timeline: { step: stepOf() } }));
document.querySelector<HTMLInputElement>('#follow')!.addEventListener('change', (e) => cal.update({ timeline: { follow: (e.target as HTMLInputElement).checked ? FOLLOW : false } }));
document.querySelector<HTMLButtonElement>('#back45')!.addEventListener('click', () => cal.shift({ minutes: -45 }));
(window as unknown as { __cal: typeof cal }).__cal = cal;
