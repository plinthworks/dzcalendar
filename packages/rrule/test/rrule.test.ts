import { describe, it, expect } from 'vitest';
import { Temporal } from '@tzslot/core';
import { expandDates, expandZoned, iterateZoned, lastStart, parseRRule, serializeRRule } from '../src/index.js';

const rule = (text: string) => {
  const r = parseRRule(text);
  if (!r.ok) throw new Error(r.problem.detail);
  return r.rule;
};

describe('parse and serialize', () => {
  it('round-trips a rule in a fixed order', () => {
    for (const text of [
      'FREQ=WEEKLY;INTERVAL=2;COUNT=8;BYDAY=TU,TH;WKST=SU',
      'FREQ=MONTHLY;BYDAY=-1FR',
      'FREQ=YEARLY;UNTIL=20280131T140000Z;BYMONTH=1;BYDAY=MO',
      'FREQ=DAILY;UNTIL=20261231',
      'FREQ=MONTHLY;BYMONTHDAY=1,-1;BYHOUR=9;BYMINUTE=0,30;BYSETPOS=1',
    ]) {
      expect(serializeRRule(rule(text))).toBe(text);
    }
  });

  it('never throws: every malformed part is named', () => {
    for (const [text, part] of [
      ['FREQ=DAILY;COUNT=0', 'COUNT'],
      ['FREQ=DAILY;BYHOUR=24', 'BYHOUR'],
      ['FREQ=DAILY;FREQ=WEEKLY', 'twice'],
      ['FREQ=DAILY;UNTIL=2026-12-31', 'UNTIL'],
      ['nonsense', 'NAME=VALUE'],
      ['', 'empty'],
    ] as const) {
      const r = parseRRule(text);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.problem.detail).toContain(part);
    }
  });
});

describe('expansion edges', () => {
  it('a rule that can never happen ends, fast, with nothing', () => {
    const start = Temporal.ZonedDateTime.from('2026-01-01T09:00+00:00[UTC]');
    const t0 = performance.now();
    const got = [...iterateZoned(start, rule('FREQ=MONTHLY;BYMONTH=2;BYMONTHDAY=31'))];
    expect(got).toEqual([]);
    expect(performance.now() - t0).toBeLessThan(2000);
  });

  it('a window far after the start still finds what is in it', () => {
    const start = Temporal.ZonedDateTime.from('2000-01-03T09:00+01:00[Europe/Paris]');
    const w = { from: Temporal.Instant.from('2026-10-19T00:00:00Z'), to: Temporal.Instant.from('2026-10-26T00:00:00Z') };
    const got = expandZoned(start, { rules: [rule('FREQ=WEEKLY;BYDAY=MO,WE')], exdates: [], rdates: [] }, w);
    expect(got.starts.map((z) => z.toString())).toEqual(['2026-10-19T09:00:00+02:00[Europe/Paris]', '2026-10-21T09:00:00+02:00[Europe/Paris]']);
  });

  it('two rules merge, in order, without duplicates', () => {
    const start = Temporal.ZonedDateTime.from('2026-10-19T09:00+02:00[Europe/Paris]');
    const w = { from: start.toInstant(), to: start.add({ days: 7 }).toInstant() };
    const got = expandZoned(start, { rules: [rule('FREQ=WEEKLY;BYDAY=MO,WE'), rule('FREQ=WEEKLY;BYDAY=WE,FR')], exdates: [], rdates: [] }, w);
    expect(got.starts.map((z) => z.toPlainDate().toString())).toEqual(['2026-10-19', '2026-10-21', '2026-10-23']);
  });

  it('the limit says so', () => {
    const start = Temporal.ZonedDateTime.from('2026-10-19T09:00+00:00[UTC]');
    const got = expandZoned(start, { rules: [rule('FREQ=SECONDLY')], exdates: [], rdates: [] }, { from: start.toInstant(), to: start.add({ days: 1 }).toInstant() }, 100);
    expect([got.starts.length, got.problems.map((p) => p.code)]).toEqual([100, ['too-many-occurrences']]);
  });
});

describe('lastStart', () => {
  const start = Temporal.ZonedDateTime.from('2026-10-19T09:00+02:00[Europe/Paris]');
  it('COUNT walks to the last one; UNTIL bounds it; endless is null', () => {
    expect(String(lastStart(start, { rules: [rule('FREQ=DAILY;COUNT=3')], exdates: [], rdates: [] }))).toBe('2026-10-21T09:00:00+02:00[Europe/Paris]');
    const u = lastStart(start, { rules: [rule('FREQ=DAILY;UNTIL=20261231T000000Z')], exdates: [], rdates: [] });
    expect(String(u)).toBe('2026-12-31T01:00:00+01:00[Europe/Paris]');
    expect(lastStart(start, { rules: [rule('FREQ=DAILY')], exdates: [], rdates: [] })).toBeNull();
  });
});

describe('skipping ahead to a window changes nothing', () => {
  const cases: [string, string][] = [
    ['2024-03-01T09:30+01:00[Europe/Paris]', 'FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=200'],
    ['2024-03-01T09:30+01:00[Europe/Paris]', 'FREQ=DAILY;UNTIL=20260320T083000Z'],
    ['2024-01-31T02:30+01:00[Europe/Paris]', 'FREQ=MONTHLY;BYMONTHDAY=-1'],
    ['2024-11-03T01:30-04:00[America/New_York]', 'FREQ=YEARLY;BYMONTH=3,11;BYDAY=1SU'],
    ['2024-01-01T00:00+00:00[UTC]', 'FREQ=HOURLY;INTERVAL=7'],
    ['2024-01-01T00:00+00:00[UTC]', 'FREQ=MINUTELY;INTERVAL=45;COUNT=40000'],
  ];
  for (const [dtstart, text] of cases) {
    it(text, () => {
      const start = Temporal.ZonedDateTime.from(dtstart);
      const from = Temporal.Instant.from('2026-03-16T00:00:00Z');
      const to = Temporal.Instant.from('2026-04-06T00:00:00Z');
      const naive: string[] = [];
      for (const z of iterateZoned(start, rule(text))) {
        if (Temporal.Instant.compare(z.toInstant(), to) >= 0) break;
        if (Temporal.Instant.compare(z.toInstant(), from) >= 0) naive.push(z.toString());
      }
      const got = expandZoned(start, { rules: [rule(text)], exdates: [], rdates: [] }, { from, to }, 10_000).starts.map(String);
      expect(got).toEqual(naive);
    });
  }

  it('all-day, with COUNT', () => {
    const start = Temporal.PlainDate.from('2024-01-31');
    const set = { rules: [rule('FREQ=MONTHLY;BYMONTHDAY=-1;COUNT=30')], exdates: [], rdates: [] };
    const got = expandDates(start, set, { from: Temporal.PlainDate.from('2026-01-01'), to: Temporal.PlainDate.from('2027-01-01') }).starts.map(String);
    expect(got).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31', '2026-06-30']);
  });
});

describe('limit', () => {
  it('exactly the limit is not too many; one more is', () => {
    const start = Temporal.ZonedDateTime.from('2026-10-19T09:00+00:00[UTC]');
    const w = { from: start.toInstant(), to: start.add({ days: 10 }).toInstant() };
    const set = (n: number) => ({ rules: [rule(`FREQ=DAILY;COUNT=${n}`)], exdates: [], rdates: [] });
    expect(expandZoned(start, set(5), w, 5).problems).toEqual([]);
    expect(expandZoned(start, set(6), w, 5).problems.map((p) => p.code)).toEqual(['too-many-occurrences']);
  });
});

describe('fixed after the code review', () => {
  const utc = Temporal.ZonedDateTime.from('2026-01-01T09:00+00:00[UTC]');
  const all = (text: string, start = utc) => [...iterateZoned(start, rule(text))].map((z) => z.toInstant().toString());

  // Expectations from python-dateutil 2.9 (UTC, so wall and elapsed agree).
  it('sub-daily rules with BY parts reach their COUNT (no step budget cut)', () => {
    const a = all('FREQ=SECONDLY;BYHOUR=9;BYMINUTE=0;BYSECOND=0;COUNT=40');
    expect([a.length, a.at(-1)]).toEqual([40, '2026-02-09T09:00:00Z']);
    const b = all('FREQ=MINUTELY;BYHOUR=9;BYMINUTE=0;COUNT=2000');
    expect([b.length, b.at(-1)]).toEqual([2000, '2031-06-23T09:00:00Z']);
  });

  it('an endless SECONDLY rule fills a month window', () => {
    const r = expandZoned(utc, { rules: [rule('FREQ=SECONDLY;BYHOUR=9;BYMINUTE=0;BYSECOND=0')], exdates: [], rdates: [] }, { from: Temporal.Instant.from('2026-03-01T00:00:00Z'), to: Temporal.Instant.from('2026-04-01T00:00:00Z') });
    expect([r.starts.length, r.problems]).toEqual([31, []]);
  });

  it('skipping hours keeps both passes of a repeated hour (elapsed time)', () => {
    const start = Temporal.ZonedDateTime.from('2026-10-25T01:00+02:00[Europe/Paris]');
    expect(all('FREQ=MINUTELY;INTERVAL=15;BYHOUR=2;BYMINUTE=0,30;COUNT=4', start)).toEqual([
      '2026-10-25T00:00:00Z',
      '2026-10-25T00:30:00Z',
      '2026-10-25T01:00:00Z',
      '2026-10-25T01:30:00Z',
    ]);
  });

  it('several rules: the limit keeps the earliest of the union', () => {
    const start = Temporal.ZonedDateTime.from('2026-10-01T09:00+00:00[UTC]');
    const r = expandZoned(start, { rules: [rule('FREQ=DAILY'), rule('FREQ=DAILY;BYHOUR=10')], exdates: [], rdates: [] }, { from: start.toInstant(), to: start.add({ days: 10 }).toInstant() }, 5);
    expect(r.starts.map((z) => z.toInstant().toString())).toEqual([
      '2026-10-01T09:00:00Z',
      '2026-10-01T10:00:00Z',
      '2026-10-02T09:00:00Z',
      '2026-10-02T10:00:00Z',
      '2026-10-03T09:00:00Z',
    ]);
  });
});
