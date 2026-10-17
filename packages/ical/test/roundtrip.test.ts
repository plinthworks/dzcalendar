import { readdirSync, readFileSync } from 'node:fs';
import { Temporal, createIdGenerator, normalizeMany, serializeRRule } from '@dzcalendar/core';
import type { EventInput, Normalized } from '@dzcalendar/core';
import { parseICal, serializeICal } from '../src/index.js';

const DIR = new URL('./fixtures/', import.meta.url);
const fixtures = readdirSync(DIR).filter((f) => f.endsWith('.ics')).sort();
const read = (f: string) => readFileSync(new URL(f, DIR), 'utf8');

/** What the store would hold, as plain strings: Temporal objects compared by `toString`. */
function held(events: readonly EventInput[]) {
  const { items, report } = normalizeMany(events, { displayZone: 'UTC', newId: createIdGenerator('t') }, 'ics');
  const plain = (n: Normalized) => {
    const e = n.kind === 'event' ? n.event : n.series.base;
    return {
      kind: n.kind,
      id: e.id,
      title: e.title,
      allDay: e.allDay,
      start: e.start.toString(),
      end: e.end.toString(),
      status: e.status,
      busy: e.busy,
      url: e.url,
      props: JSON.stringify(e.props),
      ref: e.ref && `${e.ref.seriesId} ${e.ref.key}`,
      ...(n.kind === 'series' && {
        rules: n.series.set.rules.map(serializeRRule),
        exdates: n.series.set.exdates.map(String),
        rdates: n.series.set.rdates.map(String),
        overrides: [...n.series.overrides].map(([k, v]) => `${k}=${v}`),
      }),
    };
  };
  return { items: items.map(plain), codes: report.problems.map((p) => p.code) };
}

/** Drops an offset only where the wall time has exactly that one offset in its zone. */
const implied = (es: readonly EventInput[]) =>
  JSON.parse(
    JSON.stringify(es).replace(/(\d{4}-\d{2}-\d{2}T[\d:]+)([+-]\d{2}:\d{2})\[([^\]]+)\]/g, (all, wall: string, off: string, zone: string) => {
      try {
        return Temporal.ZonedDateTime.from(`${wall}[${zone}]`, { disambiguation: 'reject' }).offset === off ? `${wall}[${zone}]` : all;
      } catch {
        return all;
      }
    }),
  );

describe('parse → serialize → parse', () => {
  it('has at least thirty fixtures', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(30);
  });

  for (const f of fixtures) {
    it(`${f}: the same events come back`, () => {
      const first = parseICal(read(f));
      const text = serializeICal(first.events, { stamp: '2026-10-17T00:00:00Z' });
      const again = parseICal(text);
      // What the store would hold is identical…
      expect(held(again.events)).toEqual(held(first.events));
      // …and so are the inputs, offsets included — but an offset the wall time
      // implies (no repeated hour there) may come back unwritten: a UTC time
      // read in the calendar's zone returns as that zone's wall time.
      expect(implied(again.events)).toEqual(implied(first.events));
      // A file we wrote reads without a single problem.
      expect(again.problems).toEqual([]);
    });
  }
});
