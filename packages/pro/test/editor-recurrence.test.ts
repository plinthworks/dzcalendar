import { describe, it, expect } from 'vitest';
import { Temporal, parseRRule } from '@dzcalendar/core';
import { nthOf, readRepeat, writeRepeat } from '../src/editor/recurrence.js';
import type { RepeatForm } from '../src/editor/recurrence.js';

const d = (s: string) => Temporal.PlainDate.from(s);
const rules = (...texts: string[]) => texts.map((t) => {
  const r = parseRRule(t);
  if (!r.ok) throw new Error(t);
  return r.rule;
});
const read = (start: string, ...texts: string[]) => readRepeat(texts.length ? rules(...texts) : null, d(start), 'Europe/Paris', texts.join('\n'));
const PARIS = { allDay: false, zone: 'Europe/Paris' };

describe('the n-th weekday', () => {
  it('21 October 2026 is the 3rd Wednesday; the 28th the 4th and the last; 29 October the 5th Thursday (the last)', () => {
    expect([nthOf(d('2026-10-21')), nthOf(d('2026-10-28')), nthOf(d('2026-10-29'))]).toEqual([
      { n: 3, last: false, weekday: 3 },
      { n: 4, last: true, weekday: 3 },
      { n: 5, last: true, weekday: 4 },
    ]);
  });
});

describe('a rule as the editor shows it', () => {
  it('none: a single event (the start’s weekday ready for "weekly")', () => {
    expect(read('2026-10-21')).toEqual({ freq: 'none', interval: 1, weekdays: [3], monthly: 'day', end: { kind: 'never' } });
  });

  it('every other week on Monday and Wednesday, ten times', () => {
    expect(read('2026-10-21', 'FREQ=WEEKLY;INTERVAL=2;BYDAY=WE,MO;COUNT=10')).toEqual({ freq: 'WEEKLY', interval: 2, weekdays: [1, 3], monthly: 'day', end: { kind: 'count', count: 10 } });
  });

  it('monthly: on the day, the 3rd Wednesday, the last Wednesday — and the 4th one when it is also the last', () => {
    expect(read('2026-10-21', 'FREQ=MONTHLY').freq === 'MONTHLY' && (read('2026-10-21', 'FREQ=MONTHLY') as { monthly: string }).monthly).toBe('day');
    expect((read('2026-10-21', 'FREQ=MONTHLY;BYDAY=3WE') as { monthly: string }).monthly).toBe('nth');
    expect((read('2026-10-28', 'FREQ=MONTHLY;BYDAY=-1WE') as { monthly: string }).monthly).toBe('last');
    expect((read('2026-10-28', 'FREQ=MONTHLY;BYDAY=4WE') as { monthly: string }).monthly).toBe('nth');
    // The 2nd Wednesday on a series starting the 21st: not what the form can say.
    expect(read('2026-10-21', 'FREQ=MONTHLY;BYDAY=2WE').freq).toBe('custom');
  });

  it('beyond the form: hours, set positions, two rules — "custom", kept as written', () => {
    expect(read('2026-10-21', 'FREQ=DAILY;BYHOUR=9,17')).toEqual({ freq: 'custom', text: 'FREQ=DAILY;BYHOUR=9,17' });
    expect(read('2026-10-21', 'FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1').freq).toBe('custom');
    expect(read('2026-10-21', 'FREQ=DAILY', 'FREQ=WEEKLY').freq).toBe('custom');
  });

  it('an end on a date: the UNTIL instant read back as that day in the event’s zone', () => {
    // 31 December, last second in Paris (+01:00): 22:59:59 UTC.
    expect(read('2026-10-21', 'FREQ=DAILY;UNTIL=20261231T225959Z')).toMatchObject({ end: { kind: 'until' } });
    const f = read('2026-10-21', 'FREQ=DAILY;UNTIL=20261231T225959Z') as { end: { date: { toString(): string } } };
    expect(String(f.end.date)).toBe('2026-12-31');
  });
});

describe('a form as a rule', () => {
  const form = (x: Partial<Extract<RepeatForm, { interval: number }>>): RepeatForm => ({ freq: 'WEEKLY', interval: 1, weekdays: [3], monthly: 'day', end: { kind: 'never' }, ...x });
  it('weekly, monthly, yearly; "none" is no rule; "custom" gives its rule back', () => {
    const start = d('2026-10-21');
    expect([
      writeRepeat(form({ interval: 2, weekdays: [5, 1, 3] }), start, PARIS),
      writeRepeat(form({ freq: 'MONTHLY', monthly: 'nth' }), start, PARIS),
      writeRepeat(form({ freq: 'MONTHLY', monthly: 'last' }), d('2026-10-28'), PARIS),
      writeRepeat(form({ freq: 'YEARLY', end: { kind: 'count', count: 3 } }), start, PARIS),
      writeRepeat(form({ freq: 'none' }), start, PARIS),
      writeRepeat({ freq: 'custom', text: 'FREQ=DAILY;BYHOUR=9' }, start, PARIS),
    ]).toEqual(['FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR', 'FREQ=MONTHLY;BYDAY=3WE', 'FREQ=MONTHLY;BYDAY=-1WE', 'FREQ=YEARLY;COUNT=3', null, 'FREQ=DAILY;BYHOUR=9']);
  });

  it('until a date: the whole day, inclusive — a date for all-day, the day’s last second in UTC otherwise', () => {
    const end = { kind: 'until' as const, date: d('2026-12-31') };
    expect(writeRepeat(form({ freq: 'DAILY', end }), d('2026-10-21'), PARIS)).toBe('FREQ=DAILY;UNTIL=20261231T225959Z');
    // Summer in Paris (+02:00): 30 June ends at 21:59:59 UTC.
    expect(writeRepeat(form({ freq: 'DAILY', end: { kind: 'until', date: d('2026-06-30') } }), d('2026-06-01'), PARIS)).toBe('FREQ=DAILY;UNTIL=20260630T215959Z');
    expect(writeRepeat(form({ freq: 'DAILY', end }), d('2026-10-21'), { allDay: true, zone: 'Europe/Paris' })).toBe('FREQ=DAILY;UNTIL=20261231');
  });

  it('what is read is written back the same', () => {
    for (const t of ['FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=10', 'FREQ=MONTHLY;BYDAY=3WE', 'FREQ=DAILY;UNTIL=20261231T225959Z', 'FREQ=YEARLY']) {
      expect(writeRepeat(read('2026-10-21', t), d('2026-10-21'), PARIS)).toBe(t);
    }
  });
});
