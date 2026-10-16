import { describe, it, expect } from 'vitest';
import { Temporal, businessIntervals } from '../src/index.js';

const d = (s: string) => Temporal.PlainDate.from(s);
const iso = (ms: number) => Temporal.Instant.fromEpochMilliseconds(ms).toString();
const hours = (s: { s: number; e: number }) => (s.e - s.s) / 3_600_000;

describe('businessIntervals', () => {
  it('true is Monday–Friday 09:00–17:00 in the display zone', () => {
    const spans = businessIntervals(d('2026-10-19'), d('2026-10-26'), true, 'Europe/Paris');
    expect(spans).toHaveLength(5);
    expect(iso(spans[0]!.s)).toBe('2026-10-19T07:00:00Z');
    expect(spans.every((x) => hours(x) === 8)).toBe(true);
  });

  it('a Paris shop seen from Chicago: Paris hours, in Chicago’s week', () => {
    const spans = businessIntervals(d('2026-10-19'), d('2026-10-20'), { daysOfWeek: [1], start: '09:00', end: '18:00', timeZone: 'Europe/Paris' }, 'America/Chicago');
    expect(spans.map((x) => [iso(x.s), iso(x.e)])).toEqual([['2026-10-19T07:00:00Z', '2026-10-19T16:00:00Z']]);
  });

  it('a night shift across the 25-hour night is nine real hours', () => {
    const spans = businessIntervals(d('2026-10-24'), d('2026-10-26'), { daysOfWeek: [6], start: '22:00', end: '06:00' }, 'Europe/Paris');
    expect(spans.map(hours)).toEqual([9]);
  });

  it('24:00 is the next midnight; a 23-hour Sunday open all day is 23 hours', () => {
    const spans = businessIntervals(d('2026-03-29'), d('2026-03-30'), { daysOfWeek: [7], start: '00:00', end: '24:00' }, 'Europe/Paris');
    expect(spans.map(hours)).toEqual([23]);
  });

  it('overlapping rules merge; false is nothing', () => {
    const rules = [
      { daysOfWeek: [1] as const, start: '09:00', end: '12:00' },
      { daysOfWeek: [1] as const, start: '11:00', end: '14:00' },
    ];
    expect(businessIntervals(d('2026-10-19'), d('2026-10-20'), rules, 'UTC').map(hours)).toEqual([5]);
    expect(businessIntervals(d('2026-10-19'), d('2026-10-26'), false, 'UTC')).toEqual([]);
  });
});
