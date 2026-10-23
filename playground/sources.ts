import './prelude';
import '../packages/theme/dzcalendar.css';
import { Temporal, eventInput, exportInputs, jsonSource, viewWindow } from '@dzcalendar/core';
import { icalSource, serializeICal } from '@dzcalendar/ical';
import type { EventInput, FetchLike } from '@dzcalendar/core';
import { createCalendar } from '@dzcalendar/dom';
import { createGsapMotion } from '@dzcalendar/motion-gsap';

const ZONE = 'Europe/Paris';
const $ = <T extends HTMLElement>(s: string) => document.querySelector<T>(s)!;
const log = $<HTMLPreElement>('#log');
const status = $<HTMLElement>('#status');
const write = (line: string) => {
  log.textContent += `${Temporal.Now.plainTimeISO().toString({ smallestUnit: 'second' })}  ${line}\n`;
  log.scrollTop = log.scrollHeight;
};
const wait = (signal?: { aborted: boolean }) =>
  new Promise<void>((resolve, reject) =>
    setTimeout(() => (signal?.aborted ? reject(new DOMException('aborted', 'AbortError')) : resolve()), Number($<HTMLSelectElement>('#latency').value)),
  );

// ── The "server": a team's week, every week of 2026 and 2027 ──────────────
const db = new Map<string, EventInput>();
for (let day = Temporal.PlainDate.from('2026-01-05'); day.year < 2028; day = day.add({ weeks: 1 })) {
  const at = (d: number, time: string) => `${day.add({ days: d })}T${time}[${ZONE}]`;
  for (const e of [
    { id: `planning-${day}`, title: 'Planning équipe', start: at(0, '10:00'), end: at(0, '11:00'), tone: 'blue' },
    { id: `client-${day}`, title: 'Point client', start: at(2, '14:00'), end: at(2, '15:00'), tone: 'green' },
    { id: `demo-${day}`, title: 'Démo', start: at(3, '16:00'), end: at(3, '17:00'), tone: 'amber' },
  ]) db.set(e.id, e);
}

const startMs = (e: EventInput) => Temporal.ZonedDateTime.from(String(e.start)).epochMilliseconds;
const fakeFetch: FetchLike = async (url, init) => {
  const q = new URL(url, location.href).searchParams;
  const from = Temporal.Instant.from(q.get('start')!);
  const to = Temporal.Instant.from(q.get('end')!);
  write(`GET ${from.toZonedDateTimeISO(ZONE).toPlainDate()} → ${to.toZonedDateTimeISO(ZONE).toPlainDate()}`);
  const signal = init.signal as AbortSignal;
  signal.addEventListener('abort', () => write(`  annulée (${from.toZonedDateTimeISO(ZONE).toPlainDate()})`));
  await wait(signal);
  if ($<HTMLInputElement>('#down').checked) return { ok: false, status: 503, json: async () => null };
  const found = [...db.values()].filter((e) => startMs(e) < to.epochMilliseconds && startMs(e) >= from.epochMilliseconds - 86_400_000);
  return { ok: true, status: 200, json: async () => found };
};

const team = jsonSource('team', {
  url: '/api/events',
  fetchImpl: fakeFetch,
  chunk: { unit: 'month', prefetch: 1 },
  retry: { attempts: 1, backoffMs: 500 },
  staleAfter: Temporal.Duration.from({ minutes: 5 }),
  async save({ edits, cause }) {
    write(`SAVE (${cause}) ${edits.map((e) => `${e.kind} ${e.id}`).join(', ')}`);
    await wait();
    for (const e of edits) {
      if (e.kind === 'event' && e.after && !e.after.allDay && e.after.start.withTimeZone(ZONE).dayOfWeek === 5) {
        write('  refusé : vendredi');
        throw new Error('no Fridays');
      }
    }
    for (const e of edits) {
      if (e.kind !== 'event') continue;
      if (e.after) db.set(e.id, eventInput(e.after));
      else db.delete(e.id);
    }
    write('  enregistré');
  },
});

const cal = createCalendar($('#cal'), {
  timeZone: ZONE,
  locale: 'fr-FR',
  initialDate: Temporal.PlainDate.from('2026-10-21'),
  initialView: 'dayGridMonth',
  sources: [team],
  editable: true,
  motion: createGsapMotion(),
  onSource: (n) => {
    if (n.type === 'loading') status.textContent = n.loading ? 'Chargement…' : '';
    if (n.type === 'error') status.textContent = `Échec du chargement : ${(n.error as Error).message}`;
    if (n.type === 'problems') write(`problèmes : ${n.report.problems.map((p) => p.code).join(', ')}`);
  },
});
(window as unknown as { __dz: () => typeof cal }).__dz = () => cal;
// For the browser checks: what a stretch of dates shows, read through the public query.
(window as unknown as { __shown: (a: string, b: string) => string[] }).__shown = (a, b) =>
  cal.kernel.store.snapshot
    .queryInstances(viewWindow(Temporal.PlainDate.from(a), Temporal.PlainDate.from(b), ZONE))
    .map((i) => `${i.event.sourceId}|${i.event.title} ${(i.event.allDay ? i.event.start.toString() : i.event.start.withTimeZone(ZONE).toPlainDateTime().toString()).slice(5, 16)}`);

$('#refetch').addEventListener('click', () => cal.refetch());

// ── iCal: a file read as a source of its own; everything shown written out ──
$<HTMLInputElement>('#ics').addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const text = await file.text();
  write(`IMPORT ${file.name}`);
  cal.kernel.sources.add(icalSource('file', { text, defaultZone: ZONE, defaults: { tone: 'violet' } }));
});
$('#export').addEventListener('click', () => {
  const ics = serializeICal(exportInputs(cal.kernel.store.snapshot), { name: 'DzCalendar' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  a.download = 'dzcalendar.ics';
  a.click();
  URL.revokeObjectURL(a.href);
  write(`EXPORT ${ics.length} octets`);
});
