import { describe, it, expect } from 'vitest';
import { Temporal, actionsFor, createKernel, createIdGenerator, normalizeEvent } from '../src/index.js';
import type { ActionContext, DayGridModel, KernelEvent, TimeGridModel } from '../src/index.js';

const labels = {
  newEventAt: ({ time }: { time: string }) => `New at ${time}`,
  newEventOn: ({ date }: { date: string }) => `New on ${date}`,
  goToDay: 'Go',
  openEvent: 'Open',
  skippedHour: 'skipped',
};
const ctx = (over: Partial<ActionContext> = {}): ActionContext => ({
  displayZone: 'Europe/Paris',
  labels,
  formatDate: (d) => d.toString(),
  formatTime: (i, withOffset) => {
    const z = i.toZonedDateTimeISO('Europe/Paris');
    return withOffset ? `${z.toPlainTime().toString().slice(0, 5)} (${z.offset})` : z.toPlainTime().toString().slice(0, 5);
  },
  onCreateRequest: () => {},
  onGoToDay: () => {},
  onOpen: () => {},
  ...over,
});
const d = (s: string) => Temporal.PlainDate.from(s);

describe('actionsFor', () => {
  it('a repeated 02:30 offers both moments, told apart by offset', () => {
    const items = actionsFor(
      { kind: 'slot', date: d('2026-10-25'), instant: Temporal.Instant.from('2026-10-25T00:30:00Z'), exists: true, ambiguous: true, alternative: Temporal.Instant.from('2026-10-25T01:30:00Z') },
      ctx(),
    );
    expect(items.map((i) => i.label)).toEqual(['New at 02:30 (+02:00)', 'New at 02:30 (+01:00)', 'Go']);
  });

  it('a skipped hour offers where the event will start, and says why', () => {
    const items = actionsFor({ kind: 'slot', date: d('2026-03-29'), instant: Temporal.Instant.from('2026-03-29T01:30:00Z'), exists: false, ambiguous: false, alternative: null }, ctx());
    expect([items[0]!.label, items[0]!.reason]).toEqual(['New at 03:30', 'skipped']);
  });

  it('a day asks for an all-day event on that date — not "midnight", which some days lack', () => {
    const got: unknown[] = [];
    const [first] = actionsFor({ kind: 'day', date: d('2018-11-04') }, ctx({ onCreateRequest: (r) => got.push([r.allDay, r.start.toString()]) }));
    expect(first!.label).toBe('New on 2018-11-04');
    first!.run!();
    expect(got).toEqual([[true, '2018-11-04']]);
  });

  it('a slot asks for a timed event at its exact moment', () => {
    const got: unknown[] = [];
    const [first] = actionsFor(
      { kind: 'slot', date: d('2026-10-21'), instant: Temporal.Instant.from('2026-10-21T08:30:00Z'), exists: true, ambiguous: false, alternative: null },
      ctx({ onCreateRequest: (r) => got.push([r.allDay, r.start.toString()]) }),
    );
    first!.run!();
    expect(got).toEqual([[false, '2026-10-21T08:30:00Z']]);
  });

  it('without callbacks there is nothing to offer', () => {
    const r = normalizeEvent({ id: 'a', start: '2026-10-21' }, { displayZone: 'UTC', newId: createIdGenerator('x') });
    if (!r.ok) throw new Error();
    expect(actionsFor({ kind: 'event', instance: { key: 'a', event: r.value.event, origin: 'single' } }, { displayZone: 'UTC', labels, formatTime: () => '', formatDate: () => '' })).toEqual([]);
  });
});

describe('kernel options, events, batches', () => {
  const now = () => Temporal.Instant.from('2026-10-21T08:00:00Z');

  it('batch: three changes, one state event with three causes', () => {
    const k = createKernel({ timeZone: 'Europe/Paris', locale: 'fr-FR', now });
    const events: KernelEvent[] = [];
    k.subscribe((e) => events.push(e));
    k.batch(() => {
      k.setTimeZone('Asia/Tokyo');
      k.setLocale('en-US');
      k.navigate('next');
    });
    expect(events).toHaveLength(1);
    const e = events[0]!;
    expect(e.type === 'state' && [e.causes, e.direction]).toEqual([['zone', 'locale', 'navigate'], 'next']);
  });

  it('no-ops emit nothing', () => {
    const k = createKernel({ timeZone: 'Europe/Paris', locale: 'fr-FR', now });
    let n = 0;
    k.subscribe(() => n++);
    k.setTimeZone('Europe/Paris');
    k.setLocale('fr-FR');
    k.setView('timeGridWeek');
    expect(n).toBe(0);
  });

  it('setOptions reshapes the model: business hours, lanes', () => {
    const k = createKernel({ timeZone: 'UTC', locale: 'en', now, initialView: 'timeGridDay' });
    expect((k.viewModel().model as TimeGridModel).columns[0]!.offHours).toEqual([]);
    k.setOptions({ businessHours: true });
    expect((k.viewModel().model as TimeGridModel).columns[0]!.offHours.map((o) => [o.top, o.height])).toEqual([[0, 540], [1020, 420]]);
    k.setView('dayGridMonth');
    k.setOptions({ dayGrid: { maxLanes: 2 } });
    expect((k.viewModel().model as DayGridModel).maxLanes).toBe(2);
  });

  it('setEvents with the same content changes nothing; with different content, only that', () => {
    const k = createKernel({ timeZone: 'UTC', locale: 'en', now, events: [{ id: 'a', start: '2026-10-21' }, { id: 'b', start: '2026-10-22' }] });
    let changes = 0;
    k.subscribe((e) => e.type === 'store' && changes++);
    k.setEvents([{ id: 'a', start: '2026-10-21' }, { id: 'b', start: '2026-10-22' }]);
    expect(changes).toBe(0);
    k.setEvents([{ id: 'a', start: '2026-10-21' }]);
    expect(changes).toBe(1);
    expect(k.store.snapshot.getEvent('b')).toBeUndefined();
  });
});
