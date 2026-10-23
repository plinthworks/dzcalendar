import { describe, it, expect } from 'vitest';
import { Temporal, createIdGenerator, normalizeEvent, normalizeMany, itemEvent } from '../src/index.js';
import type { EventInput, NormalizeContext, NormalizeResult, ProblemCode, TimedEvent, AllDayEvent } from '../src/index.js';

const ctx = (over: Partial<NormalizeContext> = {}): NormalizeContext => ({
  displayZone: 'Europe/Paris',
  newId: createIdGenerator('t'),
  ...over,
});

const accept = (input: EventInput, c = ctx()) => {
  const r = normalizeEvent(input, c);
  if (!r.ok) throw new Error(`rejected: ${JSON.stringify(r.problems)}`);
  return { event: itemEvent(r.value), codes: r.problems.map((p) => p.code) };
};
const timed = (input: EventInput, c?: NormalizeContext) => {
  const { event, codes } = accept(input, c);
  if (event.allDay) throw new Error('expected a timed event');
  return { event: event as TimedEvent, codes };
};
const allDay = (input: EventInput, c?: NormalizeContext) => {
  const { event, codes } = accept(input, c);
  if (!event.allDay) throw new Error('expected an all-day event');
  return { event: event as AllDayEvent, codes };
};
const rejectedWith = (r: NormalizeResult): ProblemCode[] => {
  expect(r.ok).toBe(false);
  return r.problems.filter((p) => p.severity === 'error').map((p) => p.code);
};

describe('timed events: what each way of writing a start means', () => {
  it('a zoned string keeps its zone, which need not be the display zone', () => {
    const { event, codes } = timed({ start: '2026-03-29T09:00[America/Chicago]' });
    expect(event.start.timeZoneId).toBe('America/Chicago');
    expect(event.start.toPlainTime().toString()).toBe('09:00:00');
    expect(codes).toEqual([]);
  });

  it('a ZonedDateTime is taken as is', () => {
    const start = Temporal.ZonedDateTime.from('2026-06-01T09:00+09:00[Asia/Tokyo]');
    expect(timed({ start }).event.start.equals(start)).toBe(true);
  });

  it('start and end may sit in different zones — a flight', () => {
    const { event } = timed({ start: '2026-06-01T10:00[Europe/Paris]', end: '2026-06-02T05:00[Asia/Tokyo]' });
    expect(event.start.timeZoneId).toBe('Europe/Paris');
    expect(event.end.timeZoneId).toBe('Asia/Tokyo');
    expect(event.start.until(event.end).total('hours')).toBe(12);
  });

  it('an offset in the string chooses between the two readings of a repeated hour', () => {
    const first = timed({ start: '2026-10-25T02:30+02:00[Europe/Paris]' }).event;
    const second = timed({ start: '2026-10-25T02:30+01:00[Europe/Paris]' }).event;
    expect(first.start.offset).toBe('+02:00');
    expect(second.start.offset).toBe('+01:00');
    expect(second.start.epochMilliseconds - first.start.epochMilliseconds).toBe(3_600_000);
  });

  it('offset-mismatch: an offset the zone never had is overruled by the zone', () => {
    const { event, codes } = timed({ start: '2026-07-01T09:00+05:00[Europe/Paris]' });
    expect(event.start.offset).toBe('+02:00');
    expect(event.start.toPlainTime().toString()).toBe('09:00:00');
    expect(codes).toEqual(['offset-mismatch']);
  });

  it('wall-time-skipped: 02:30 on a spring-forward Sunday becomes 03:30, and says so', () => {
    const { event, codes } = timed({ start: '2026-03-29T02:30[Europe/Paris]' });
    expect(event.start.toPlainTime().toString()).toBe('03:30:00');
    expect(codes).toEqual(['wall-time-skipped']);
  });

  it('wall-time-ambiguous: a repeated 02:30 without an offset takes the first reading', () => {
    const { event, codes } = timed({ start: '2026-10-25T02:30[Europe/Paris]' });
    expect(event.start.offset).toBe('+02:00');
    expect(codes).toEqual(['wall-time-ambiguous']);
  });

  it('a wall time with timeZone is read in that zone, silently', () => {
    const { event, codes } = timed({ start: '2026-05-01T09:00', timeZone: 'America/Chicago' });
    expect(event.start.timeZoneId).toBe('America/Chicago');
    expect(codes).toEqual([]);
  });

  it('a wall time falls back to defaultEventZone before the display zone', () => {
    const { event, codes } = timed({ start: '2026-05-01T09:00' }, ctx({ defaultEventZone: 'Asia/Tokyo' }));
    expect(event.start.timeZoneId).toBe('Asia/Tokyo');
    expect(codes).toEqual([]);
  });

  it('zone-defaulted: a wall time with no zone anywhere is read in the display zone, with a warning', () => {
    const { event, codes } = timed({ start: '2026-05-01T09:00' });
    expect(event.start.timeZoneId).toBe('Europe/Paris');
    expect(codes).toEqual(['zone-defaulted']);
  });

  it('a skipped wall time in timeZone is placed too, not only zoned strings', () => {
    const { event, codes } = timed({ start: '2026-03-08T02:15', timeZone: 'America/Chicago' });
    expect(event.start.toPlainTime().toString()).toBe('03:15:00');
    expect(codes).toEqual(['wall-time-skipped']);
  });

  it('offset-only: an instant string with no zone lands in the display zone, with a warning', () => {
    const { event, codes } = timed({ start: '2026-05-01T07:00:00Z' });
    expect(event.start.timeZoneId).toBe('Europe/Paris');
    expect(event.start.toPlainTime().toString()).toBe('09:00:00');
    expect(codes).toEqual(['offset-only']);
  });

  it('an Instant with timeZone is placed there, silently', () => {
    const { event, codes } = timed({ start: Temporal.Instant.from('2026-05-01T07:00:00Z'), timeZone: 'Asia/Kolkata' });
    expect(event.start.toPlainTime().toString()).toBe('12:30:00');
    expect(codes).toEqual([]);
  });

  it('offset-only also flags a bare-offset zone annotation: it has no daylight saving to follow', () => {
    const { codes } = timed({ start: '2026-05-01T09:00+03:00[+03:00]' });
    expect(codes).toContain('offset-only');
  });

  it('a date with allDay: false is midnight in the event zone', () => {
    const { event } = timed({ start: '2026-05-01', allDay: false, timeZone: 'Asia/Tokyo' });
    expect(event.start.toString()).toBe('2026-05-01T00:00:00+09:00[Asia/Tokyo]');
  });

  it('a calendar annotation alone is not a zone, and the model is kept in ISO', () => {
    const { event, codes } = timed({ start: '2026-05-01T09:00[u-ca=gregory]', timeZone: 'UTC' });
    expect(event.start.timeZoneId).toBe('UTC');
    expect(event.start.calendarId).toBe('iso8601');
    expect(codes).toEqual([]);
    expect(allDay({ start: '2026-05-01[u-ca=gregory]' }).event.start.calendarId).toBe('iso8601');
  });

  it("a calendar name with a 't' in it does not make a date into a time", () => {
    const { event } = allDay({ start: '2026-05-01[u-ca=iso8601]' });
    expect(event.start.toString()).toBe('2026-05-01');
  });

  it('a space between date and time is a time, as Temporal reads it', () => {
    expect(timed({ start: '2026-03-29 09:00', timeZone: 'UTC' }).event.start.toString()).toBe('2026-03-29T09:00:00+00:00[UTC]');
    expect(timed({ start: '2026-03-29 09:00Z', timeZone: 'UTC' }).event.start.toString()).toBe('2026-03-29T09:00:00+00:00[UTC]');
    const second = timed({ start: '2026-10-25 02:30+01:00[Europe/Paris]' });
    expect(second.event.start.offset).toBe('+01:00');
    expect(second.codes).toEqual([]);
  });

  it('a guessed zone is marked on the event; a named one is not', () => {
    expect(timed({ start: '2026-05-01T09:00' }).event.zoneGuessed).toBe(true);
    expect(timed({ start: '2026-05-01T07:00Z' }).event.zoneGuessed).toBe(true);
    expect(timed({ start: '2026-05-01T09:00', timeZone: 'UTC' }).event.zoneGuessed).toBe(false);
    expect(timed({ start: '2026-05-01T09:00[UTC]' }).event.zoneGuessed).toBe(false);
  });
});

describe('timed events: the end', () => {
  it('defaults to one hour after the start', () => {
    const { event } = timed({ start: '2026-05-01T09:00[Europe/Paris]' });
    expect(event.end.toPlainTime().toString()).toBe('10:00:00');
  });

  it('the default is a context setting', () => {
    const { event } = timed({ start: '2026-05-01T09:00[Europe/Paris]' }, ctx({ defaultTimedDuration: Temporal.Duration.from({ minutes: 30 }) }));
    expect(event.end.toPlainTime().toString()).toBe('09:30:00');
  });

  it('duration in hours is elapsed time: 01:30 + 2 h on a fall-back night ends at 02:30 the second time', () => {
    const { event } = timed({ start: '2026-10-25T01:30[Europe/Paris]', duration: { hours: 2 } });
    expect(event.end.toPlainTime().toString()).toBe('02:30:00');
    expect(event.end.offset).toBe('+01:00');
  });

  it('duration in days is wall days: 09:00 + 1 day across spring forward is 09:00 the next day', () => {
    const { event } = timed({ start: '2026-03-28T09:00[Europe/Paris]', duration: 'P1D' });
    expect(event.end.toString()).toBe('2026-03-29T09:00:00+02:00[Europe/Paris]');
    expect(event.start.until(event.end).total('hours')).toBe(23);
  });

  it("an end without a zone is read in the start's zone, not the display zone", () => {
    const { event, codes } = timed({ start: '2026-05-01T09:00[Asia/Tokyo]', end: '2026-05-01T11:00' });
    expect(event.end.timeZoneId).toBe('Asia/Tokyo');
    expect(codes).toEqual([]);
  });

  it('a zero-length event is a milestone, and valid', () => {
    const { event } = timed({ start: '2026-05-01T09:00[UTC]', end: '2026-05-01T09:00[UTC]' });
    expect(event.start.equals(event.end)).toBe(true);
  });

  it('end-before-start, compared as instants across zones', () => {
    // 10:00 in Paris is 08:00Z; 09:00 in London is also 08:00Z — equal, accepted.
    expect(normalizeEvent({ start: '2026-05-01T10:00[Europe/Paris]', end: '2026-05-01T09:00[Europe/London]' }, ctx()).ok).toBe(true);
    const r = normalizeEvent({ start: '2026-05-01T10:00[Europe/Paris]', end: '2026-05-01T08:59[Europe/London]' }, ctx());
    expect(rejectedWith(r)).toEqual(['end-before-start']);
  });

  it('invalid-duration: unreadable or negative', () => {
    expect(rejectedWith(normalizeEvent({ start: '2026-05-01T09:00[UTC]', duration: 'soon' }, ctx()))).toEqual(['invalid-duration']);
    expect(rejectedWith(normalizeEvent({ start: '2026-05-01T09:00[UTC]', duration: '-PT1H' }, ctx()))).toEqual(['invalid-duration']);
  });

  it('invalid-end', () => {
    expect(rejectedWith(normalizeEvent({ start: '2026-05-01T09:00[UTC]', end: 'tomorrow' }, ctx()))).toEqual(['invalid-end']);
  });
});

describe('all-day events', () => {
  it('a date string is an all-day event with no zone, ending the next day (exclusive)', () => {
    const { event, codes } = allDay({ start: '2026-05-01' });
    expect(event.start.toString()).toBe('2026-05-01');
    expect(event.end.toString()).toBe('2026-05-02');
    expect(codes).toEqual([]);
  });

  it('two dates: the end is exclusive', () => {
    const { event } = allDay({ start: '2026-05-01', end: '2026-05-04' });
    expect(event.start.until(event.end).days).toBe(3);
  });

  it('a duration in days', () => {
    expect(allDay({ start: '2026-05-01', duration: { days: 3 } }).event.end.toString()).toBe('2026-05-04');
  });

  it('hours on an all-day event still give at least one day', () => {
    expect(allDay({ start: '2026-05-01', duration: 'PT5H' }).event.end.toString()).toBe('2026-05-02');
  });

  it('allday-with-time: a timed start forced to allDay keeps its wall date', () => {
    const { event, codes } = allDay({ start: '2026-05-01T23:30[America/Chicago]', allDay: true });
    expect(event.start.toString()).toBe('2026-05-01');
    expect(codes).toEqual(['allday-with-time']);
  });

  it('an instant forced to allDay takes its date in the event zone', () => {
    const { event, codes } = allDay({ start: '2026-05-01T23:30:00Z', allDay: true }, ctx({ defaultEventZone: 'Asia/Tokyo' }));
    expect(event.start.toString()).toBe('2026-05-02');
    expect(codes).toEqual(['allday-with-time']);
  });

  it('an instant forced to allDay with no zone anywhere: the date is a guess, and says so', () => {
    const { event, codes } = allDay({ start: '2026-05-01T23:30:00Z', allDay: true });
    expect(event.start.toString()).toBe('2026-05-02'); // 01:30 in Paris
    expect(codes).toEqual(['allday-with-time', 'offset-only']);
    expect(rejectedWith(normalizeEvent({ start: '2026-05-01T23:30:00Z', allDay: true }, ctx({ strictZones: true })))).toEqual(['offset-only']);
  });

  it('a timeZone serves an all-day event read from an instant, so it is not "ignored"', () => {
    const { event, codes } = allDay({ start: '2026-05-01T23:30:00Z', allDay: true, timeZone: 'America/Chicago' });
    expect(event.start.toString()).toBe('2026-05-01');
    expect(codes).toEqual(['allday-with-time']);
  });

  it('allday-zone-ignored: an all-day event floats; a zone on it means nothing', () => {
    const { codes } = allDay({ start: '2026-05-01', timeZone: 'Asia/Tokyo' });
    expect(codes).toEqual(['allday-zone-ignored']);
  });

  it('end-before-start: an exclusive end on the start day is empty', () => {
    expect(rejectedWith(normalizeEvent({ start: '2026-05-01', end: '2026-05-01' }, ctx()))).toEqual(['end-before-start']);
  });
});

describe('rejections', () => {
  it('missing-start', () => {
    expect(rejectedWith(normalizeEvent({ title: 'x' }, ctx()))).toEqual(['missing-start']);
  });

  it('invalid-start: garbage, a number, a partial date', () => {
    for (const start of ['not a date', 42, '2026-05'] as unknown[]) {
      expect(rejectedWith(normalizeEvent({ start } as EventInput, ctx()))).toEqual(['invalid-start']);
    }
  });

  it('date-object-rejected, with the conversion to write instead', () => {
    const legacy = new (globalThis as unknown as { ['Date']: new (ms: number) => object })['Date'](0);
    const r = normalizeEvent({ start: legacy } as unknown as EventInput, ctx());
    expect(rejectedWith(r)).toEqual(['date-object-rejected']);
    expect(r.problems[0]!.detail).toContain('Temporal.Instant.fromEpochMilliseconds');
  });

  it('unknown-zone in a string and in timeZone', () => {
    expect(rejectedWith(normalizeEvent({ start: '2026-05-01T09:00[Mars/Olympus]' }, ctx()))).toEqual(['unknown-zone']);
    expect(rejectedWith(normalizeEvent({ start: '2026-05-01T09:00', timeZone: 'Mars/Olympus' }, ctx()))).toEqual(['unknown-zone']);
  });

  it('strictZones turns a guessed zone into an error', () => {
    expect(rejectedWith(normalizeEvent({ start: '2026-05-01T09:00' }, ctx({ strictZones: true })))).toEqual(['zone-defaulted']);
    expect(rejectedWith(normalizeEvent({ start: '2026-05-01T07:00Z' }, ctx({ strictZones: true })))).toEqual(['offset-only']);
  });

  it('invalid-id: empty string', () => {
    expect(rejectedWith(normalizeEvent({ id: '', start: '2026-05-01' }, ctx()))).toEqual(['invalid-id']);
  });

  it('invalid-event: not an object, or a field of the wrong shape', () => {
    for (const input of [null, 42, 'x', []] as unknown[]) {
      expect(rejectedWith(normalizeEvent(input as EventInput, ctx()))).toEqual(['invalid-event']);
    }
    expect(rejectedWith(normalizeEvent({ start: '2026-05-01', resourceIds: 'abc' } as unknown as EventInput, ctx()))).toEqual(['invalid-event']);
  });

  it('JSON nulls mean absent', () => {
    const input = { id: null, start: '2026-05-01', end: null, duration: null, timeZone: null, rrule: null, exdate: null, title: null, url: null, tone: null, groupId: null };
    const { event, codes } = accept(input as unknown as EventInput);
    expect(event.end.toString()).toBe('2026-05-02');
    expect(event.title).toBe('');
    expect('url' in event || 'tone' in event || 'groupId' in event).toBe(false);
    expect(codes).toEqual([]);
  });

  it('a duration that runs off the end of time is a problem, not an exception', () => {
    expect(rejectedWith(normalizeEvent({ start: '2026-01-01T00:00[UTC]', duration: 'P100000000Y' }, ctx()))).toEqual(['invalid-duration']);
    expect(rejectedWith(normalizeEvent({ start: '2026-01-01', duration: 'P100000000Y' }, ctx()))).toEqual(['invalid-duration']);
    expect(rejectedWith(normalizeEvent({ start: '+275760-09-13T00:00:00Z', timeZone: 'UTC' }, ctx()))).toEqual(['invalid-duration']);
  });

  it('a bad context throws once, because it is the programmer’s, not the data’s', () => {
    expect(() => normalizeEvent({ start: '2026-05-01' }, ctx({ displayZone: 'Mars/Olympus' }))).toThrow(RangeError);
    expect(() => normalizeMany([], ctx({ defaultEventZone: 'Nowhere' }))).toThrow(RangeError);
  });

  it('invalid-rrule, invalid-exdate, invalid-rdate: a series that cannot be read is refused whole', () => {
    expect(rejectedWith(normalizeEvent({ start: '2026-05-01', rrule: 'FREQ=FORTNIGHTLY' }, ctx()))).toEqual(['invalid-rrule']);
    expect(rejectedWith(normalizeEvent({ start: '2026-05-01', rrule: 'FREQ=HOURLY' }, ctx()))).toEqual(['invalid-rrule']);
    expect(rejectedWith(normalizeEvent({ start: '2026-05-01', rrule: 'FREQ=DAILY', exdate: ['someday'] }, ctx()))).toEqual(['invalid-exdate']);
    expect(rejectedWith(normalizeEvent({ start: '2026-05-01', rrule: 'FREQ=DAILY', rdate: ['never'] }, ctx()))).toEqual(['invalid-rdate']);
  });
});

describe('foreign Temporal objects', () => {
  it('foreign-temporal: an object from another polyfill copy is re-read from its string', () => {
    const foreign = {
      [Symbol.toStringTag]: 'Temporal.ZonedDateTime',
      toString: () => '2026-05-01T09:00:00+02:00[Europe/Paris]',
    };
    const { event, codes } = timed({ start: foreign as unknown as EventInput['start'] });
    expect(event.start.toString()).toBe('2026-05-01T09:00:00+02:00[Europe/Paris]');
    expect(codes).toEqual(['foreign-temporal']);
  });
});

describe('the rest of the event', () => {
  it('fills defaults, freezes, starts at revision 0', () => {
    const { event } = accept({ start: '2026-05-01' });
    expect(event).toMatchObject({ id: 't-1', title: '', display: 'auto', status: 'confirmed', busy: true, revision: 0 });
    expect(event.perms).toEqual({ start: true, duration: true, resource: true });
    expect(Object.isFrozen(event)).toBe(true);
  });

  it('a cancelled event is not busy unless told so', () => {
    expect(accept({ start: '2026-05-01', status: 'cancelled' }).event.busy).toBe(false);
  });

  it('editable sets every permission; the specific ones win', () => {
    // An explicit `true` of its own: `own` (it wins over a calendar that is not editable, owner 18k).
    expect(accept({ start: '2026-05-01', editable: false, durationEditable: true }).event.perms).toEqual({ start: false, duration: true, resource: false, own: { start: false, duration: true } });
    // Nothing said: every permission by default, not `own` (the calendar decides).
    expect(accept({ start: '2026-05-01' }).event.perms).toEqual({ start: true, duration: true, resource: true });
    // `editable: true` but neither the start nor the length: nothing of its own (it would give nothing).
    expect(accept({ start: '2026-05-01', editable: true, startEditable: false, durationEditable: false }).event.perms).toEqual({ start: false, duration: false, resource: true });
    // `editable: true` alone: both of its own.
    expect(accept({ start: '2026-05-01', editable: true }).event.perms.own).toEqual({ start: true, duration: true });
  });

  it('resourceId and resourceIds merge without duplicates; unknown-resource warns', () => {
    const { event, codes } = accept({ start: '2026-05-01', resourceId: 'a', resourceIds: ['a', 'z'] }, ctx({ knownResources: new Set(['a']) }));
    expect(event.resourceIds).toEqual(['a', 'z']);
    expect(codes).toEqual(['unknown-resource']);
  });

  it('extendedProps is copied, not shared', () => {
    const props = { room: 12 };
    const { event } = accept({ start: '2026-05-01', extendedProps: props });
    props.room = 13;
    expect(event.props).toEqual({ room: 12 });
  });
});

describe('normalizeMany', () => {
  it('judges each input alone, reports paths, keeps the first of two equal ids', () => {
    const { items, report } = normalizeMany(
      [
        null as unknown as EventInput,
        { id: 'a', start: '2026-05-01' },
        { start: 'nonsense' },
        { id: 'a', start: '2026-05-02' },
        { id: 'b', start: '2026-05-01T09:00' },
      ],
      ctx(),
      'api',
    );
    expect(items.map((x) => itemEvent(x).id)).toEqual(['a', 'b']);
    expect(itemEvent(items[0]!).sourceId).toBe('api');
    expect(report).toMatchObject({ accepted: 2, rejected: 3 });
    expect(report.problems.map((p) => [p.code, p.path])).toEqual([
      ['invalid-event', 'events[0]'],
      ['invalid-start', 'events[2].start'],
      ['duplicate-id', 'events[3].id'],
      ['zone-defaulted', 'events[4].start'],
    ]);
    expect(report.problems.every((p) => p.sourceId === 'api')).toBe(true);
  });

  it('every problem code is asserted somewhere in the core tests', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    const types = readFileSync(new URL('../src/event/problems.ts', import.meta.url), 'utf8');
    const block = /export type ProblemCode =([\s\S]*?);/.exec(types)![1]!;
    const codes = [...block.matchAll(/'([a-z-]+)'/g)].map((m) => m[1]!);
    const dir = new URL('.', import.meta.url);
    const ical = new URL('../../ical/test/', import.meta.url);
    const slots = new URL('../../slots/test/', import.meta.url);
    const pro = new URL('../../pro/test/', import.meta.url);
    const element = new URL('../../element/test/', import.meta.url);
    const compat = new URL('../../compat-fullcalendar/test/', import.meta.url);
    const dom = new URL('../../dom/test/', import.meta.url);
    const read = (d: URL) => readdirSync(d).filter((f) => f.endsWith('.test.ts')).map((f) => readFileSync(new URL(f, d), 'utf8'));
    // iCal's, slots' and the exports' codes are asserted by those packages' own tests.
    const self = [...read(dir), ...read(ical), ...read(slots), ...read(pro), ...read(element), ...read(compat), ...read(dom)].join('\n');
    expect(codes.length).toBeGreaterThan(15);
    // Asserted, not merely mentioned: the code must sit inside an expected array
    // or a toContain, so a comment or a stray string cannot satisfy this.
    const asserted = (c: string) =>
      new RegExp(`(toEqual\\(\\[[^\\]]*'${c}'|toContain\\('${c}'\\)|\\['${c}', 'events)`).test(self);
    expect(codes.filter((c) => !asserted(c))).toEqual([]);
  });
});
