import { describe, it, expect } from 'vitest';
import { Temporal, dayInfo, dayInfos, transitionsBetween, resolveWall } from '../src/index.js';

/**
 * Expectations written by hand from the published rules, not copied from the
 * implementation's output. Each zone is here for a reason: both directions,
 * a half-hour change, a midnight that does not exist, a day that does not exist.
 */
const d = (s: string) => Temporal.PlainDate.from(s);
const t = (s: string) => Temporal.PlainTime.from(s);
const iso = (i: { toString(): string } | null) => (i === null ? null : i.toString());
/** Every Temporal value as its string, so equality means something. */
const serial = (x: unknown): unknown => JSON.parse(JSON.stringify(x, (_k, v) => (v && typeof v === 'object' && typeof v.toJSON === 'function' ? v.toString() : v)));

describe('dayInfo', () => {
  it('Paris, spring forward (29 March 2026): 23 h, 02:00 → 03:00', () => {
    const day = dayInfo(d('2026-03-29'), 'Europe/Paris');
    expect(day.lengthMinutes).toBe(1380);
    expect(day.kind).toBe('short');
    expect(iso(day.start)).toBe('2026-03-28T23:00:00Z');
    expect(day.transitions).toHaveLength(1);
    const [tr] = day.transitions;
    expect(iso(tr!.at)).toBe('2026-03-29T01:00:00Z');
    expect(tr!.kind).toBe('gap');
    expect(tr!.deltaMinutes).toBe(60);
    expect([tr!.offsetBefore, tr!.offsetAfter]).toEqual(['+01:00', '+02:00']);
    expect(tr!.wallBefore.toString()).toBe('2026-03-29T02:00:00');
    expect(tr!.wallAfter.toString()).toBe('2026-03-29T03:00:00');
  });

  it('Paris, fall back (25 October 2026): 25 h, 03:00 → 02:00', () => {
    const day = dayInfo(d('2026-10-25'), 'Europe/Paris');
    expect(day.lengthMinutes).toBe(1500);
    expect(day.kind).toBe('long');
    const [tr] = day.transitions;
    expect(iso(tr!.at)).toBe('2026-10-25T01:00:00Z');
    expect(tr!.kind).toBe('repeat');
    expect(tr!.deltaMinutes).toBe(-60);
    expect(tr!.wallBefore.toString()).toBe('2026-10-25T03:00:00');
    expect(tr!.wallAfter.toString()).toBe('2026-10-25T02:00:00');
  });

  it('Chicago, both Sundays of 2026', () => {
    const spring = dayInfo(d('2026-03-08'), 'America/Chicago');
    expect(spring.kind).toBe('short');
    expect(iso(spring.transitions[0]!.at)).toBe('2026-03-08T08:00:00Z');
    const fall = dayInfo(d('2026-11-01'), 'America/Chicago');
    expect(fall.kind).toBe('long');
    expect(iso(fall.transitions[0]!.at)).toBe('2026-11-01T07:00:00Z');
  });

  it('Lord Howe moves by half an hour: 23 h 30 and 24 h 30, both irregular', () => {
    const spring = dayInfo(d('2026-10-04'), 'Australia/Lord_Howe');
    expect(spring.lengthMinutes).toBe(1410);
    expect(spring.kind).toBe('irregular');
    expect(spring.transitions[0]!.deltaMinutes).toBe(30);
    expect(spring.transitions[0]!.wallBefore.toPlainTime().toString()).toBe('02:00:00');
    expect(spring.transitions[0]!.wallAfter.toPlainTime().toString()).toBe('02:30:00');

    const autumn = dayInfo(d('2026-04-05'), 'Australia/Lord_Howe');
    expect(autumn.lengthMinutes).toBe(1470);
    expect(autumn.transitions[0]!.kind).toBe('repeat');
    expect(autumn.transitions[0]!.wallAfter.toPlainTime().toString()).toBe('01:30:00');
  });

  it('São Paulo, 4 November 2018: midnight never happened, the day starts at 01:00', () => {
    const day = dayInfo(d('2018-11-04'), 'America/Sao_Paulo');
    expect(day.start.toZonedDateTimeISO('America/Sao_Paulo').toPlainTime().toString()).toBe('01:00:00');
    expect(day.lengthMinutes).toBe(1380);
    // The transition sits exactly on the day's start, and belongs to it.
    expect(day.transitions).toHaveLength(1);
    expect(day.transitions[0]!.wallBefore.toPlainTime().toString()).toBe('00:00:00');
  });

  it('Havana, 12 March 2023: same, a day that begins at 01:00', () => {
    const day = dayInfo(d('2023-03-12'), 'America/Havana');
    expect(iso(day.start)).toBe('2023-03-12T05:00:00Z');
    expect(day.kind).toBe('short');
    expect(day.transitions).toHaveLength(1);
  });

  it('Apia, 30 December 2011: a day that does not exist, and the 31st carries the jump', () => {
    const missing = dayInfo(d('2011-12-30'), 'Pacific/Apia');
    expect(missing.lengthMinutes).toBe(0);
    expect(missing.kind).toBe('skipped');
    expect(missing.transitions).toHaveLength(0);

    const after = dayInfo(d('2011-12-31'), 'Pacific/Apia');
    expect(after.kind).toBe('normal');
    expect(after.transitions).toHaveLength(1);
    expect(after.transitions[0]!.deltaMinutes).toBe(1440);
    expect([after.transitions[0]!.offsetBefore, after.transitions[0]!.offsetAfter]).toEqual(['-10:00', '+14:00']);
    expect(after.transitions[0]!.wallBefore.toString()).toBe('2011-12-30T00:00:00');

    const before = dayInfo(d('2011-12-29'), 'Pacific/Apia');
    expect(before.kind).toBe('normal');
    expect(before.transitions).toHaveLength(0);

    // Owned exactly once across the three days.
    expect(dayInfos(d('2011-12-29'), 3, 'Pacific/Apia').map((x) => x.transitions.length)).toEqual([0, 0, 1]);
  });

  it('Paris, 1911: mean time (+00:09:21) to +00:00 — an offset with seconds', () => {
    const day = dayInfo(d('1911-03-10'), 'Europe/Paris');
    expect(day.transitions).toHaveLength(1);
    const [tr] = day.transitions;
    expect([tr!.offsetBefore, tr!.offsetAfter]).toEqual(['+00:09:21', '+00:00']);
    expect(tr!.deltaMinutes).toBeCloseTo(-9.35, 10);
    expect(tr!.kind).toBe('repeat');
    expect(day.lengthMinutes).toBeCloseTo(1440 + 9.35, 10);
    expect(day.kind).toBe('irregular');
  });

  it('a fixed-offset zone has no transitions', () => {
    expect(dayInfo(d('2026-03-29'), '+02:00').transitions).toHaveLength(0);
  });

  it('a zone without daylight saving has only normal days', () => {
    expect(dayInfo(d('2026-03-29'), 'Asia/Kolkata').kind).toBe('normal');
    expect(dayInfo(d('2026-10-25'), 'UTC').transitions).toHaveLength(0);
  });

  it('Dublin, whose rules call winter the exception, still moves +00:00 → +01:00', () => {
    const day = dayInfo(d('2026-03-29'), 'Europe/Dublin');
    expect(day.kind).toBe('short');
    expect([day.transitions[0]!.offsetBefore, day.transitions[0]!.offsetAfter]).toEqual(['+00:00', '+01:00']);
  });
});

describe('dayInfos', () => {
  it('chains days end to start, and agrees with dayInfo', () => {
    const days = dayInfos(d('2026-10-24'), 3, 'Europe/Paris');
    expect(days.map((x) => x.lengthMinutes)).toEqual([1440, 1500, 1440]);
    expect(days[0]!.end.equals(days[1]!.start)).toBe(true);
    expect(days[1]!.end.equals(days[2]!.start)).toBe(true);
    // Temporal objects keep their state in internal slots, so toEqual sees
    // nothing to compare: two different instants are "equal" to it. Strings only.
    expect(serial(days[1]!)).toEqual(serial(dayInfo(d('2026-10-25'), 'Europe/Paris')));
  });

  it('agrees with dayInfo day by day over a year, in zones with and without changes', () => {
    for (const zone of ['Europe/Paris', 'Australia/Lord_Howe', 'Asia/Kolkata']) {
      const year = dayInfos(d('2026-01-01'), 365, zone);
      for (const day of year) expect(serial(day)).toEqual(serial(dayInfo(day.date, zone)));
      expect(year.flatMap((x) => x.transitions).length).toBe(zone === 'Asia/Kolkata' ? 0 : 2);
    }
  });

  it('count 0 or less gives no days', () => {
    expect(dayInfos(d('2026-01-01'), 0, 'UTC')).toEqual([]);
    expect(dayInfos(d('2026-01-01'), -3, 'UTC')).toEqual([]);
  });
});

describe('transitionsBetween', () => {
  it('finds both changes of 2026 in Paris, in order', () => {
    const from = Temporal.Instant.from('2026-01-01T00:00:00Z');
    const to = Temporal.Instant.from('2027-01-01T00:00:00Z');
    const found = transitionsBetween(from, to, 'Europe/Paris');
    expect(found.map((x) => x.kind)).toEqual(['gap', 'repeat']);
  });

  it('is half-open: a transition exactly at `to` is not included', () => {
    const at = Temporal.Instant.from('2026-03-29T01:00:00Z');
    expect(transitionsBetween(at.subtract({ hours: 1 }), at, 'Europe/Paris')).toHaveLength(0);
    expect(transitionsBetween(at, at.add({ hours: 1 }), 'Europe/Paris')).toHaveLength(1);
  });
});

describe('resolveWall', () => {
  const autumn = d('2026-10-25');
  const spring = d('2026-03-29');

  it('the repeated 02:30: earlier is +02:00, later is +01:00', () => {
    const earlier = resolveWall(autumn, t('02:30'), 'Europe/Paris', 'earlier');
    expect(earlier.ambiguous).toBe(true);
    expect(iso(earlier.instant)).toBe('2026-10-25T00:30:00Z');
    expect(iso(earlier.other)).toBe('2026-10-25T01:30:00Z');
    expect(iso(resolveWall(autumn, t('02:30'), 'Europe/Paris', 'later').instant)).toBe('2026-10-25T01:30:00Z');
    expect(iso(resolveWall(autumn, t('02:30'), 'Europe/Paris', 'compatible').instant)).toBe('2026-10-25T00:30:00Z');
  });

  it('preferOffset picks the reading by its offset', () => {
    const r = resolveWall(autumn, t('02:30'), 'Europe/Paris', { preferOffset: '+01:00' });
    expect(iso(r.instant)).toBe('2026-10-25T01:30:00Z');
    expect(iso(r.other)).toBe('2026-10-25T00:30:00Z');
  });

  it('the skipped 02:30: compatible pushes forward, earlier pushes back, reject refuses', () => {
    const fwd = resolveWall(spring, t('02:30'), 'Europe/Paris', 'compatible');
    expect(fwd.exists).toBe(false);
    expect(iso(fwd.instant)).toBe('2026-03-29T01:30:00Z'); // 03:30 +02:00
    expect(iso(resolveWall(spring, t('02:30'), 'Europe/Paris', 'earlier').instant)).toBe('2026-03-29T00:30:00Z'); // 01:30 +01:00
    expect(resolveWall(spring, t('02:30'), 'Europe/Paris', 'reject').instant).toBeNull();
    expect(resolveWall(autumn, t('02:30'), 'Europe/Paris', 'reject').instant).toBeNull();
  });

  it('preferOffset compares offsets, not their spelling, and says when none matched', () => {
    for (const spelling of ['+01:00', '+0100', '+01']) {
      const r = resolveWall(autumn, t('02:30'), 'Europe/Paris', { preferOffset: spelling });
      expect(iso(r.instant)).toBe('2026-10-25T01:30:00Z');
      expect(r.offsetMatched).toBe(true);
    }
    const none = resolveWall(autumn, t('02:30'), 'Europe/Paris', { preferOffset: '+05:00' });
    expect(iso(none.instant)).toBe('2026-10-25T00:30:00Z');
    expect(none.offsetMatched).toBe(false);
    expect(resolveWall(autumn, t('02:30'), 'Europe/Paris', 'earlier').offsetMatched).toBeNull();
  });

  it('Lord Howe: half an hour skipped, half an hour repeated', () => {
    const gap = resolveWall(d('2026-10-04'), t('02:15'), 'Australia/Lord_Howe', 'compatible');
    expect(gap.exists).toBe(false);
    expect(gap.instant!.toZonedDateTimeISO('Australia/Lord_Howe').toPlainTime().toString()).toBe('02:45:00');
    const rep = resolveWall(d('2026-04-05'), t('01:45'), 'Australia/Lord_Howe', 'later');
    expect(rep.ambiguous).toBe(true);
    expect(rep.instant!.epochMilliseconds - rep.other!.epochMilliseconds).toBe(30 * 60_000);
  });

  it('an ordinary time has one reading whatever the policy', () => {
    const r = resolveWall(spring, t('10:00'), 'Europe/Paris', 'reject');
    expect(iso(r.instant)).toBe('2026-03-29T08:00:00Z');
    expect(r.other).toBeNull();
  });
});
