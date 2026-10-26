import { readFileSync } from 'node:fs';
import { Temporal, createEventStore, createIdGenerator, normalizeMany, viewWindow } from '@dzcalendar/core';
import type { EventInput, Series } from '@dzcalendar/core';
import { icalSource, parseICal, serializeICal, windowsZone } from '../src/index.js';
import { fold, parseLine, unfold } from '../src/lines.js';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}.ics`, import.meta.url), 'utf8');
const cal = (...lines: string[]) => ['BEGIN:VCALENDAR', 'VERSION:2.0', ...lines, 'END:VCALENDAR'].join('\r\n');
const codes = (r: { problems: readonly { code: string }[] }) => r.problems.map((p) => p.code);

describe('lines', () => {
  it('unfolds a continuation (space or tab), CRLF or LF', () => {
    expect(unfold('A:1\r\n 2\n\t3\nB:4').map((l) => l.text)).toEqual(['A:123', 'B:4']);
  });
  it('reads quoted parameters with commas and colons', () => {
    const l = parseLine('ORGANIZER;CN="Dupont, Marie";X=a,"b:c":mailto:m@x', 1)!;
    expect(l.params['CN']).toEqual(['Dupont, Marie']);
    expect(l.params['X']).toEqual(['a', 'b:c']);
    expect(l.value).toBe('mailto:m@x');
  });
  it('folds at 75 octets without cutting a character', () => {
    const line = `SUMMARY:${'é'.repeat(50)}🎉${'x'.repeat(40)}`;
    const out = fold(line);
    for (const part of out.split('\r\n').filter((p) => p.length > 0)) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    expect(unfold(out)[0]!.text).toBe(line);
  });
});

describe('parseICal', () => {
  it('reads an IANA TZID as that zone (#7456): Chicago 09:00 stays Chicago 09:00', () => {
    const r = parseICal(fixture('05-series-override-7456'));
    expect(r.events[0]).toMatchObject({ id: 'review@example.com', start: '2026-10-20T09:00:00[America/Chicago]', rrule: 'FREQ=DAILY;COUNT=5' });
    expect(r.events[1]).toMatchObject({
      id: 'review@example.com@20261022T090000',
      seriesId: 'review@example.com',
      recurrenceId: '2026-10-22T09:00:00[America/Chicago]',
      start: '2026-10-22T14:00:00[America/Chicago]',
    });
  });

  it('dates are all-day; no end and no duration is one day, or no time for a moment (RFC 5545 §3.6.1)', () => {
    expect(parseICal(fixture('23-duration-default-date')).events[0]).toMatchObject({ allDay: true, start: '2026-10-31', duration: 'P1D' });
    expect(parseICal(fixture('24-duration-default-time')).events[0]).toMatchObject({ duration: 'PT0S' });
    expect(parseICal(fixture('03-rfc-multiday-allday')).events[0]).toMatchObject({ start: '2007-06-28', end: '2007-07-09', busy: false });
  });

  it('UTC times are UTC, or the calendar zone’s when the file names one (same moment)', () => {
    expect(parseICal(fixture('01-rfc-simple-utc')).events[0]!.start).toBe('1997-07-14T17:00:00[UTC]');
    // 07:00Z on 21 October 2026 is 09:00 in Paris (CEST, +02:00).
    expect(parseICal(fixture('22-utc-with-calendar-zone')).events[0]!.start).toBe('2026-10-21T09:00:00+02:00[Europe/Paris]');
  });

  it('floating times: X-WR-TIMEZONE, then defaultZone, then left floating', () => {
    expect(parseICal(fixture('21-apple-wr-timezone')).events[0]!.start).toBe('2026-10-21T09:00:00[America/Chicago]');
    expect(parseICal(fixture('15-bare-lf-floating'), { defaultZone: 'Asia/Kolkata' }).events[0]!.start).toBe('2026-10-21T09:00:00[Asia/Kolkata]');
    expect(parseICal(fixture('15-bare-lf-floating')).events[0]!.start).toBe('2026-10-21T09:00:00');
  });

  it('Windows names through the CLDR table, a Mozilla path through its IANA tail', () => {
    expect(windowsZone('romance standard time')).toBe('Europe/Paris');
    expect(windowsZone('India Standard Time')).toBe('Asia/Kolkata');
    expect(windowsZone('Lord Howe Standard Time')).toBe('Australia/Lord_Howe');
    const outlook = parseICal(fixture('16-outlook-windows'));
    expect(outlook.events[0]!.start).toBe('2026-10-21T14:00:00[Europe/Paris]');
    expect(outlook.problems).toEqual([]);
    expect(outlook.events[0]!.extendedProps).toEqual({ organizer: { name: 'Dupont, Marie', email: 'marie@example.com' } });
    expect(parseICal(fixture('17-outlook-us-eastern')).events[0]!.start).toBe('2026-11-02T09:00:00[America/New_York]');
    expect(parseICal(fixture('20-mozilla-tzid')).events[0]!.start).toBe('2026-10-21T09:00:00[Europe/Paris]');
  });

  it('a custom VTIMEZONE is matched to the IANA zone with the same changes, and says it guessed', () => {
    const r = parseICal(fixture('18-custom-vtimezone-paris-like'));
    expect(codes(r)).toEqual(['zone-guessed']);
    const zone = /\[(.+)\]/.exec(r.events[0]!.start as string)![1]!;
    // Same offsets as Paris all year round: +01:00 in winter, +02:00 from the last Sunday of March to the last of October.
    for (const at of ['2026-01-15T12:00Z', '2026-03-29T00:59:59Z', '2026-03-29T01:00Z', '2026-10-25T00:59:59Z', '2026-10-25T01:00Z', '2026-07-15T12:00Z']) {
      const i = Temporal.Instant.from(at);
      expect(i.toZonedDateTimeISO(zone).offset).toBe(i.toZonedDateTimeISO('Europe/Paris').offset);
    }
  });

  it('a VTIMEZONE no IANA zone matches falls back to its fixed offset, and says so', () => {
    const r = parseICal(fixture('19-custom-vtimezone-nomatch'));
    expect(codes(r)).toContain('zone-fixed-offset');
    expect(r.events[0]!.start).toBe('2026-10-21T09:00:00+05:17[+05:17]');
  });

  it('…by its own rules: each time gets the offset in force then, summer and winter', () => {
    // +05:17 in winter, +06:17 from the last Sunday of March 02:00 to the last Sunday of October 03:00: no IANA zone does that.
    const r = parseICal(
      cal(
        'BEGIN:VTIMEZONE', 'TZID:Odd', 'BEGIN:STANDARD', 'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'TZOFFSETFROM:+0617', 'TZOFFSETTO:+0517', 'END:STANDARD',
        'BEGIN:DAYLIGHT', 'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'TZOFFSETFROM:+0517', 'TZOFFSETTO:+0617', 'END:DAYLIGHT', 'END:VTIMEZONE',
        'BEGIN:VEVENT', 'UID:a', 'DTSTART;TZID=Odd:20260115T090000', 'END:VEVENT',
        'BEGIN:VEVENT', 'UID:b', 'DTSTART;TZID=Odd:20260701T090000', 'END:VEVENT',
        // 29 March 2026, 02:30 does not exist: read with the offset before the change, as Temporal's 'compatible' would (03:30).
        'BEGIN:VEVENT', 'UID:c', 'DTSTART;TZID=Odd:20260329T023000', 'END:VEVENT',
        // 25 October 2026, 02:30 happens twice: the first pass.
        'BEGIN:VEVENT', 'UID:d', 'DTSTART;TZID=Odd:20261025T023000', 'END:VEVENT',
      ),
    );
    expect(codes(r)).toEqual(['zone-fixed-offset']);
    expect(r.events.map((e) => e.start)).toEqual([
      '2026-01-15T09:00:00+05:17[+05:17]',
      '2026-07-01T09:00:00+06:17[+06:17]',
      '2026-03-29T02:30:00+05:17[+05:17]',
      '2026-10-25T02:30:00+06:17[+06:17]',
    ]);
  });

  it('old events under older rules do not spoil the match: the latest year decides (US 2005 vs 2007+)', () => {
    const r = parseICal(
      cal(
        'BEGIN:VTIMEZONE', 'TZID:(GMT-05:00) Eastern Time (US & Canada)',
        'BEGIN:STANDARD', 'DTSTART:16011104T020000', 'RRULE:FREQ=YEARLY;BYDAY=1SU;BYMONTH=11', 'TZOFFSETFROM:-0400', 'TZOFFSETTO:-0500', 'END:STANDARD',
        'BEGIN:DAYLIGHT', 'DTSTART:16010311T020000', 'RRULE:FREQ=YEARLY;BYDAY=2SU;BYMONTH=3', 'TZOFFSETFROM:-0500', 'TZOFFSETTO:-0400', 'END:DAYLIGHT', 'END:VTIMEZONE',
        'BEGIN:VEVENT', 'UID:old', 'DTSTART;TZID="(GMT-05:00) Eastern Time (US & Canada)":20050701T090000', 'END:VEVENT',
        'BEGIN:VEVENT', 'UID:new', 'DTSTART;TZID="(GMT-05:00) Eastern Time (US & Canada)":20260701T090000', 'END:VEVENT',
      ),
    );
    expect(codes(r)).toEqual(['zone-guessed']);
    expect(r.problems[0]!.detail).toBe('(GMT-05:00) Eastern Time (US & Canada) → America/New_York');
    expect(r.events.map((e) => e.start)).toEqual(['2005-07-01T09:00:00[America/New_York]', '2026-07-01T09:00:00[America/New_York]']);
  });

  it('an unknown TZID without VTIMEZONE is floating, with a warning', () => {
    const r = parseICal(cal('BEGIN:VEVENT', 'UID:u', 'DTSTART;TZID=Nowhere:20261021T090000', 'END:VEVENT'));
    expect(codes(r)).toEqual(['unknown-zone']);
    expect(r.events[0]!.start).toBe('2026-10-21T09:00:00');
  });

  it('text is unescaped; categories split on unescaped commas only', () => {
    const e = parseICal(fixture('14-escaped-text')).events[0]!;
    expect(e.title).toBe('Budget, Q4; final');
    expect(e.extendedProps).toEqual({ location: 'Salle 2, bâtiment B', categories: ['Work', 'Finance, Q4'] });
    expect(parseICal(fixture('13-folded-unicode')).events[0]!.title).toContain('qui doivent être repliés');
  });

  it('EXDATE and RDATE: several lines, comma lists, each in its zone', () => {
    const e = parseICal(fixture('25-rdate-multi')).events[0]!;
    expect(e.exdate).toEqual(['2026-10-12T09:00:00[Europe/Paris]', '2026-10-19T09:00:00[Europe/Paris]']);
    expect(e.rdate).toEqual(['2026-10-08T09:00:00[Europe/Paris]', '2026-10-09T09:00:00[Europe/Paris]', '2026-10-30T09:00:00[Europe/Paris]']);
  });

  it('status, transparency, URL', () => {
    const [a, b] = parseICal(fixture('27-status-cancelled-tentative')).events;
    expect(a).toMatchObject({ status: 'cancelled' });
    expect(b).toMatchObject({ status: 'tentative', url: 'https://example.com/maybe' });
  });

  it('VTODO and VJOURNAL are skipped with one warning per kind; VALARM is ignored', () => {
    const r = parseICal(fixture('29-valarm-and-todo'));
    expect(r.events.map((e) => e.title)).toEqual(['With alarm']);
    expect(codes(r)).toEqual(['ical-unsupported']);
  });

  it('EXRULE and RDATE periods are read as far as they go, and said', () => {
    const r = parseICal(
      cal('BEGIN:VEVENT', 'UID:x', 'DTSTART:20261005T090000Z', 'RRULE:FREQ=DAILY;COUNT=3', 'EXRULE:FREQ=WEEKLY', 'RDATE;VALUE=PERIOD:20261020T090000Z/PT1H', 'END:VEVENT'),
    );
    expect(codes(r)).toEqual(['ical-unsupported', 'ical-unsupported']);
    expect(r.events[0]!.rdate).toEqual(['2026-10-20T09:00:00[UTC]']);
  });

  it('bad lines and bad dates are problems, never exceptions; an event without a start is left out', () => {
    const r = parseICal(
      cal('BEGIN:VEVENT', 'UID:a', 'this line has no colon', 'DTSTART:20261321T090000Z', 'END:VEVENT', 'BEGIN:VEVENT', 'UID:b', 'DTSTART;VALUE=DATE:20261021', 'END:VTODO', 'END:VEVENT', 'BEGIN:VEVENT', 'UID:c'),
    );
    // No colon; month 13; END:VTODO never begun; END:VCALENDAR while c is open; c has no DTSTART.
    expect(r.problems.map((p) => `${p.code} ${p.path}`)).toEqual([
      'ical-syntax line 5',
      'ical-syntax line 11',
      'ical-syntax line 15',
      'ical-syntax VEVENT[0].DTSTART',
      'ical-syntax VEVENT[2].DTSTART',
    ]);
    expect(r.events.map((e) => e.id)).toEqual(['b']);
    expect(() => parseICal('garbage')).not.toThrow();
    expect(parseICal('').events).toEqual([]);
  });

  it('reads the calendar’s name and zone', () => {
    expect(parseICal(fixture('04-google-paris-weekly')).calendar).toEqual({ name: 'Équipe', zone: 'Europe/Paris', prodId: '-//Test//Fixture//EN' });
  });
});

describe('into the store', () => {
  const ctx = { displayZone: 'Europe/Paris', newId: createIdGenerator('t') };

  it('an override joins its series under the series’ key; the occurrence it replaces is not drawn twice', () => {
    const { items, report } = normalizeMany(parseICal(fixture('05-series-override-7456')).events, ctx, 'ics');
    expect(report.problems).toEqual([]);
    const series = items.find((i) => i.kind === 'series')!.series as Series;
    expect([...series.overrides]).toEqual([['2026-10-22T09:00:00-05:00[America/Chicago]', 'review@example.com@20261022T090000']]);
    const store = createEventStore();
    store.replaceSourceChunk('ics', '*', items);
    const shown = store.snapshot
      .queryInstances(viewWindow(Temporal.PlainDate.from('2026-10-19'), Temporal.PlainDate.from('2026-10-26'), 'America/Chicago'))
      .map((i) => `${i.event.start.toString().slice(0, 16)} ${i.event.title}`);
    expect(shown).toEqual([
      '2026-10-20T09:00 Review',
      '2026-10-21T09:00 Review',
      '2026-10-22T14:00 Review (moved)',
      '2026-10-23T09:00 Review',
      '2026-10-24T09:00 Review',
    ]);
  });

  it('EXDATE removes the Monday of 12 October; all-day overrides work the same', () => {
    const store = createEventStore();
    store.replaceSourceChunk('ics', '*', normalizeMany(parseICal(fixture('04-google-paris-weekly')).events, ctx, 'ics').items);
    const days = store.snapshot
      .queryInstances(viewWindow(Temporal.PlainDate.from('2026-10-05'), Temporal.PlainDate.from('2026-10-19'), 'Europe/Paris'))
      .map((i) => i.event.start.toString().slice(0, 10));
    expect(days).toEqual(['2026-10-05', '2026-10-07', '2026-10-14']);

    const weekly = createEventStore();
    weekly.replaceSourceChunk('ics', '*', normalizeMany(parseICal(fixture('30-allday-override')).events, ctx, 'ics').items);
    expect(
      weekly.snapshot
        .queryInstances(viewWindow(Temporal.PlainDate.from('2026-10-01'), Temporal.PlainDate.from('2026-11-01'), 'Europe/Paris'))
        .map((i) => i.event.start.toString()),
    ).toEqual(['2026-10-05', '2026-10-13', '2026-10-19', '2026-10-26']);
  });

  it('Apia 2011: the daily series has no 30 December (that day never happened there)', () => {
    const store = createEventStore();
    store.replaceSourceChunk('ics', '*', normalizeMany(parseICal(fixture('08-apia-2011')).events, ctx, 'ics').items);
    const starts = store.snapshot
      .queryInstances(viewWindow(Temporal.PlainDate.from('2011-12-28'), Temporal.PlainDate.from('2012-01-03'), 'Pacific/Apia'))
      .map((i) => i.event.start.toString());
    // Read in its zone: Thursday 29 at −10:00, then Saturday 31 at +14:00 — nothing on the 30th.
    expect(starts.slice(0, 2)).toEqual(['2011-12-29T10:00:00-10:00[Pacific/Apia]', '2011-12-31T10:00:00+14:00[Pacific/Apia]']);
    expect(starts.some((s) => s.startsWith('2011-12-30'))).toBe(false);
  });

  it('São Paulo 2018: midnight of 4 November did not exist; the event starts at 01:00 and it is said', () => {
    const { items, report } = normalizeMany(parseICal(fixture('09-sao-paulo-2018')).events, ctx, 'ics');
    expect(report.problems.map((p) => p.code)).toContain('wall-time-skipped');
    expect(items[0]!.kind === 'event' && items[0]!.event.start.toString()).toBe('2018-11-04T01:00:00-02:00[America/Sao_Paulo]');
  });

  it('an override whose series is not in the file stays an event, with a warning', () => {
    const r = parseICal(fixture('05-series-override-7456'));
    const { items, report } = normalizeMany([r.events[1]!], ctx, 'ics');
    expect(report.problems.map((p) => p.code)).toContain('orphan-override');
    expect(items[0]!.kind === 'event' && items[0]!.event.ref).toBeUndefined();
  });
});

describe('serializeICal', () => {
  const stamp = '2026-10-17T00:00:00Z';

  it('writes CRLF lines, a VTIMEZONE from Paris’ real changes, TZID times and dates', () => {
    const text = serializeICal(
      [
        { id: 'a', title: 'Réunion, budget', start: '2026-10-21T09:00:00[Europe/Paris]', end: '2026-10-21T10:00:00[Europe/Paris]' },
        { id: 'b', title: 'Off', start: '2026-10-23', end: '2026-10-24', allDay: true },
      ],
      { stamp, name: 'Équipe' },
    );
    expect(text.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(text.split('\r\n').every((l) => !l.includes('\n'))).toBe(true);
    const lines = unfold(text).map((l) => l.text);
    expect(lines).toContain('X-WR-CALNAME:Équipe');
    expect(lines).toContain('DTSTART;TZID=Europe/Paris:20261021T090000');
    expect(lines).toContain('SUMMARY:Réunion\\, budget');
    expect(lines).toContain('DTSTART;VALUE=DATE:20261023');
    expect(lines).toContain('DTSTAMP:20261017T000000Z');
    // 2026: summer time from 29 March 02:00 (+01:00 → +02:00) to 25 October 03:00 (+02:00 → +01:00).
    const vtz = lines.slice(lines.indexOf('TZID:Europe/Paris'), lines.indexOf('END:VTIMEZONE')).join('|');
    expect(vtz).toContain('BEGIN:DAYLIGHT|DTSTART:20260329T020000|TZOFFSETFROM:+0100|TZOFFSETTO:+0200');
    expect(vtz).toContain('BEGIN:STANDARD|DTSTART:20261025T030000|TZOFFSETFROM:+0200|TZOFFSETTO:+0100');
  });

  it('a VTIMEZONE for Lord Howe’s half hour and Kolkata’s fixed +05:30', () => {
    const lines = unfold(
      serializeICal(
        [
          { id: 'l', start: '2026-10-04T09:00:00[Australia/Lord_Howe]' },
          { id: 'k', start: '2026-10-21T09:00:00[Asia/Kolkata]' },
        ],
        { stamp },
      ),
    ).map((l) => l.text);
    const all = lines.join('|');
    // Lord Howe: +10:30 → +11:00 at 02:00 on the first Sunday of October (4 October 2026).
    expect(all).toContain('DTSTART:20261004T020000|TZOFFSETFROM:+1030|TZOFFSETTO:+1100');
    expect(all).toContain('TZID:Asia/Kolkata|BEGIN:STANDARD|DTSTART:20250101T000000|TZOFFSETFROM:+0530|TZOFFSETTO:+0530|END:STANDARD|END:VTIMEZONE');
  });

  it('writes an override under its series’ UID, store objects as well as strings', () => {
    const { items } = normalizeMany(parseICal(fixture('05-series-override-7456')).events, { displayZone: 'UTC', newId: createIdGenerator('t') }, 'ics');
    const override = items.find((i) => i.kind === 'event')!;
    const e = override.kind === 'event' ? override.event : null;
    const input: EventInput = { id: e!.id, start: e!.start, end: e!.end, seriesId: e!.ref!.seriesId, recurrenceId: e!.ref!.key, title: e!.title };
    const lines = unfold(serializeICal([input], { stamp, vtimezone: false })).map((l) => l.text);
    expect(lines).toContain('UID:review@example.com');
    expect(lines).toContain('RECURRENCE-ID;TZID=America/Chicago:20261022T090000');
    expect(lines).toContain('DTSTART;TZID=America/Chicago:20261022T140000');
    expect(lines.some((l) => l.startsWith('BEGIN:VTIMEZONE'))).toBe(false);
  });
});

describe('icalSource', () => {
  const signal = new AbortController().signal;

  it('fetches the URL with the signal, and gives the events and what was wrong', async () => {
    const calls: unknown[] = [];
    const src = icalSource('feed', {
      url: 'https://example.com/a.ics',
      fetchImpl: async (url, init) => {
        calls.push([url, init?.signal === signal]);
        return { ok: true, status: 200, text: async () => fixture('19-custom-vtimezone-nomatch') };
      },
    });
    expect(src.chunk).toEqual({ unit: 'none', prefetch: 0 });
    const r = (await src.fetch({ window: null, signal, sourceId: 'feed' })) as unknown as { events: EventInput[]; problems: { code: string }[] };
    expect(calls).toEqual([['https://example.com/a.ics', true]]);
    expect(r.events.map((e) => e.id)).toEqual(['mars@example.com']);
    expect(r.problems.map((p) => p.code)).toEqual(['zone-fixed-offset']);
  });

  it('an HTTP error rejects; text works without fetch', async () => {
    const bad = icalSource('feed', { url: 'u', fetchImpl: async () => ({ ok: false, status: 404, text: async () => '' }) });
    await expect(bad.fetch({ window: null, signal, sourceId: 'feed' })).rejects.toThrow('HTTP 404');
    const inline = icalSource('mem', { text: () => fixture('07-kolkata') });
    expect(((await inline.fetch({ window: null, signal, sourceId: 'mem' })) as unknown as { events: EventInput[] }).events[0]!.duration).toBe('PT45M');
  });
});

describe('review fixes (Phase 9)', () => {
  it('a VEVENT left open is closed by the next one: no later event is lost', () => {
    const r = parseICal(
      cal(
        'BEGIN:VEVENT', 'UID:one', 'DTSTART:20261021T090000Z',
        'BEGIN:VEVENT', 'UID:two', 'DTSTART:20261022T090000Z', 'END:VEVENT',
        'BEGIN:VEVENT', 'UID:three', 'DTSTART:20261023T090000Z', 'END:VEVENT',
      ),
    );
    expect(r.events.map((e) => e.id)).toEqual(['one', 'two', 'three']);
    expect(codes(r)).toEqual(['ical-syntax']);
    // A VALARM inside an event is not closed by anything: it belongs there.
    const alarm = parseICal(cal('BEGIN:VEVENT', 'UID:a', 'DTSTART:20261021T090000Z', 'BEGIN:VALARM', 'TRIGGER:-PT5M', 'END:VALARM', 'END:VEVENT'));
    expect(codes(alarm)).toEqual([]);
  });

  it('a UTC start that repeats stays UTC even when the calendar names a zone; a single one moves there', () => {
    const r = parseICal(
      cal(
        'X-WR-TIMEZONE:Europe/Paris',
        'BEGIN:VEVENT', 'UID:s', 'DTSTART:20261021T080000Z', 'RRULE:FREQ=DAILY;COUNT=3', 'EXDATE:20261022T080000Z', 'END:VEVENT',
        'BEGIN:VEVENT', 'UID:one', 'DTSTART:20261021T080000Z', 'END:VEVENT',
      ),
    );
    expect(r.events[0]!.start).toBe('2026-10-21T08:00:00[UTC]');
    expect(r.events[0]!.exdate).toEqual(['2026-10-22T08:00:00[UTC]']);
    expect(r.events[1]!.start).toBe('2026-10-21T10:00:00+02:00[Europe/Paris]');
  });

  it('RANGE=THISANDFUTURE is read as one override, with a warning; a second VCALENDAR is read too', () => {
    const text = [
      cal('BEGIN:VEVENT', 'UID:s', 'DTSTART:20261021T080000Z', 'RRULE:FREQ=DAILY;COUNT=3', 'END:VEVENT',
        'BEGIN:VEVENT', 'UID:s', 'RECURRENCE-ID;RANGE=THISANDFUTURE:20261022T080000Z', 'DTSTART:20261022T090000Z', 'END:VEVENT'),
      cal('BEGIN:VEVENT', 'UID:other', 'DTSTART:20261025T080000Z', 'END:VEVENT'),
    ].join('\r\n');
    const r = parseICal(text);
    expect(codes(r)).toContain('ical-unsupported');
    expect(r.events.map((e) => e.id)).toEqual(['s', 's@20261022T080000Z', 'other']);
  });

  it('a webcal:// link is fetched over https', async () => {
    const urls: string[] = [];
    const src = icalSource('w', { url: 'webcal://example.com/team.ics', fetchImpl: async (url) => (urls.push(url), { ok: true, status: 200, text: async () => cal() }) });
    await src.fetch({ window: null, signal: new AbortController().signal, sourceId: 'w' });
    expect(urls).toEqual(['https://example.com/team.ics']);
  });

  it('a long series keeps its zone past the years written: the VTIMEZONE ends with rules', async () => {
    const { components, observances } = await import('../src/parse.js');
    const { offsetIn } = await import('../src/zones.js');
    const text = serializeICal([{ id: 'y', start: '2026-07-01T09:00[America/New_York]', duration: 'PT1H', rrule: 'FREQ=YEARLY;COUNT=10' }], { stamp: '2026-10-17T00:00:00Z' });
    expect(text).toContain('RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU');
    expect(text).toContain('RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU');
    // A reader with nothing but this VTIMEZONE: summer 2034 is still −04:00, winter −05:00.
    const vtz = components(text, [])[0]!.children.find((c) => c.name === 'VTIMEZONE')!;
    const obs = observances(vtz);
    expect(offsetIn(obs, Temporal.PlainDateTime.from('2034-07-01T09:00'))).toBe(-4 * 3600);
    expect(offsetIn(obs, Temporal.PlainDateTime.from('2034-01-15T09:00'))).toBe(-5 * 3600);
    // A zone whose rules changed in between (none after 2016 in Istanbul) writes no rule.
    expect(serializeICal([{ id: 'i', start: '2026-07-01T09:00[Europe/Istanbul]' }], { stamp: '2026-10-17T00:00:00Z' })).not.toContain('RRULE');
  });
});

describe('store → iCal → store', () => {
  const ctx = { displayZone: 'Europe/Paris', newId: createIdGenerator('r') };
  const shown = (events: readonly EventInput[]) => {
    const store = createEventStore();
    store.replaceSourceChunk('ics', '*', normalizeMany(events, ctx, 'ics').items);
    return store;
  };
  for (const [name, from, to] of [
    ['05-series-override-7456', '2026-10-19', '2026-10-26'],
    ['26-allday-series-exdate', '2026-01-01', '2027-01-01'],
    ['31-paris-fall-back-series', '2026-10-01', '2026-11-30'],
    ['16-outlook-windows', '2026-01-01', '2027-01-01'],
  ] as const) {
    it(`${name}: the same instances after export and import`, async () => {
      const { exportInputs } = await import('@dzcalendar/core');
      const first = shown(parseICal(fixture(name)).events);
      const text = serializeICal(exportInputs(first.snapshot), { stamp: '2026-10-17T00:00:00Z' });
      const again = shown(parseICal(text).events);
      const w = viewWindow(Temporal.PlainDate.from(from), Temporal.PlainDate.from(to), 'Europe/Paris');
      const list = (s: ReturnType<typeof createEventStore>) => s.snapshot.queryInstances(w).map((i) => `${i.key} ${i.event.start.toString()} ${i.event.end.toString()} ${i.event.title}`);
      expect(list(first).length).toBeGreaterThan(0);
      expect(list(again)).toEqual(list(first));
    });
  }
});
