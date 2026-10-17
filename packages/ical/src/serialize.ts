import { Temporal } from '@dzcalendar/core';
import type { EventInput, Instant, PlainDate, PlainDateTime, ZonedDateTime } from '@dzcalendar/core';
import { escapeText, fold, paramValue } from './lines.js';
import { formatOffset } from './zones.js';

export interface SerializeICalOptions {
  readonly prodId?: string;
  /** `X-WR-CALNAME`. */
  readonly name?: string;
  /** `DTSTAMP` of every event. Default: now. */
  readonly stamp?: Instant | string;
  /** A VTIMEZONE for each zone used (RFC 5545 asks for one; Outlook needs it). Default true. */
  readonly vtimezone?: boolean;
}

type Value =
  | { readonly kind: 'date'; readonly v: PlainDate }
  | { readonly kind: 'zoned'; readonly v: PlainDateTime; readonly zone: string }
  | { readonly kind: 'instant'; readonly v: Instant }
  | { readonly kind: 'floating'; readonly v: PlainDateTime };

/** What a start, end or date in an input is, whether a Temporal object or a string. */
function valueOf(x: unknown): Value | null {
  if (x instanceof Temporal.ZonedDateTime) return x.timeZoneId === 'UTC' ? { kind: 'instant', v: x.toInstant() } : { kind: 'zoned', v: x.toPlainDateTime(), zone: x.timeZoneId };
  if (x instanceof Temporal.PlainDate) return { kind: 'date', v: x };
  if (x instanceof Temporal.Instant) return { kind: 'instant', v: x };
  if (x instanceof Temporal.PlainDateTime) return { kind: 'floating', v: x };
  if (x === null || x === undefined) return null;
  const s = String(x).trim();
  try {
    if (s.includes('[')) {
      // The wall time as written, even one a clock change skips: the reader decides, as we did.
      const z = Temporal.ZonedDateTime.from(s);
      const wall = /[+-]\d{2}:?\d{2}(:?\d{2})?\[|Z\[/i.test(s) ? z.toPlainDateTime() : Temporal.PlainDateTime.from(s.slice(0, s.indexOf('[')));
      return z.timeZoneId === 'UTC' ? { kind: 'instant', v: z.toInstant() } : { kind: 'zoned', v: wall, zone: z.timeZoneId };
    }
    if (/(Z|[+-]\d{2}(:?\d{2})?)$/i.test(s) && s.includes('T')) return { kind: 'instant', v: Temporal.Instant.from(s) };
    if (s.includes('T')) return { kind: 'floating', v: Temporal.PlainDateTime.from(s) };
    return { kind: 'date', v: Temporal.PlainDate.from(s) };
  } catch {
    return null;
  }
}

const compact = (s: string) => s.replace(/[-:]/g, '').replace(/\.\d+/, '');
const wallText = (p: PlainDateTime) => compact(p.toString({ smallestUnit: 'second' }));
const utcText = (i: Instant) => `${wallText(i.toZonedDateTimeISO('UTC').toPlainDateTime())}Z`;

/** `NAME;params:value` for a date or date-time value. */
function dateLine(name: string, x: Value): string {
  switch (x.kind) {
    case 'date':
      return `${name};VALUE=DATE:${compact(x.v.toString())}`;
    case 'zoned':
      return `${name};TZID=${paramValue(x.zone)}:${wallText(x.v)}`;
    case 'instant':
      return `${name}:${utcText(x.v)}`;
    case 'floating':
      return `${name}:${wallText(x.v)}`;
  }
}

/**
 * Writes inputs as an iCalendar text (CRLF, lines folded at 75 octets).
 * Series keep their rules, EXDATEs and RDATEs; an override (`seriesId` +
 * `recurrenceId`) is written under its series' UID with a RECURRENCE-ID.
 */
export function serializeICal(inputs: readonly EventInput[], opts: SerializeICalOptions = {}): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:${opts.prodId ?? '-//DzCalendar//EN'}`, 'CALSCALE:GREGORIAN'];
  if (opts.name !== undefined) lines.push(`X-WR-CALNAME:${escapeText(opts.name)}`);
  const stamp = utcText(opts.stamp === undefined ? Temporal.Now.instant() : Temporal.Instant.from(String(opts.stamp)));
  const zones = new Map<string, { from: number; to: number }>();
  const body: string[] = [];

  for (const e of inputs) {
    const start = valueOf(e.start);
    if (!start) continue;
    const end = valueOf(e.end);
    const out = ['BEGIN:VEVENT'];
    const uid = e.seriesId !== undefined && e.recurrenceId !== undefined ? e.seriesId : e.id;
    if (uid !== undefined) out.push(`UID:${uid}`);
    out.push(`DTSTAMP:${stamp}`);
    // An all-day input given with times is written as dates.
    const asDate = (x: Value): Value => (e.allDay && x.kind !== 'date' ? { kind: 'date', v: x.kind === 'instant' ? x.v.toZonedDateTimeISO('UTC').toPlainDate() : x.v.toPlainDate() } : x);
    const used: Value[] = [];
    const write = (name: string, x: Value | null) => {
      if (!x) return;
      const y = asDate(x);
      used.push(y);
      out.push(dateLine(name, y));
    };
    write('DTSTART', start);
    if (end) write('DTEND', end);
    else if (e.duration !== undefined) out.push(`DURATION:${Temporal.Duration.from(e.duration).toString()}`);
    if (e.recurrenceId !== undefined) write('RECURRENCE-ID', valueOf(e.recurrenceId));
    for (const r of e.rrule === undefined ? [] : typeof e.rrule === 'string' ? [e.rrule] : e.rrule) out.push(`RRULE:${r.replace(/^RRULE:/i, '')}`);
    for (const x of e.exdate ?? []) write('EXDATE', valueOf(x));
    for (const x of e.rdate ?? []) write('RDATE', valueOf(x));
    if (e.title !== undefined) out.push(`SUMMARY:${escapeText(e.title)}`);
    if (e.status !== undefined) out.push(`STATUS:${e.status.toUpperCase()}`);
    if (e.busy === false) out.push('TRANSP:TRANSPARENT');
    if (e.url !== undefined) out.push(`URL:${e.url}`);
    const p = (e.extendedProps ?? {}) as Record<string, unknown>;
    if (typeof p['description'] === 'string') out.push(`DESCRIPTION:${escapeText(p['description'])}`);
    if (typeof p['location'] === 'string') out.push(`LOCATION:${escapeText(p['location'])}`);
    if (Array.isArray(p['categories']) && p['categories'].length > 0) out.push(`CATEGORIES:${p['categories'].map((c) => escapeText(String(c))).join(',')}`);
    const org = p['organizer'] as { name?: string; email?: string } | undefined;
    if (org && (org.name || org.email)) out.push(`ORGANIZER${org.name ? `;CN=${paramValue(org.name)}` : ''}:mailto:${org.email ?? ''}`);
    out.push('END:VEVENT');
    body.push(...out);

    for (const x of used) {
      if (x.kind !== 'zoned') continue;
      const span = zones.get(x.zone) ?? { from: x.v.year, to: x.v.year };
      // An open series goes on: its zone's rules are written a few years ahead.
      const ahead = e.rrule !== undefined && !/UNTIL|COUNT/i.test(String(e.rrule)) ? 5 : 1;
      zones.set(x.zone, { from: Math.min(span.from, x.v.year - 1), to: Math.max(span.to, x.v.year + ahead) });
    }
  }

  if (opts.vtimezone !== false) for (const [zone, span] of zones) lines.push(...vtimezone(zone, span.from, span.to));
  lines.push(...body, 'END:VCALENDAR');
  return lines.map(fold).join('');
}

const DAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

interface Change {
  /** The wall time just before the change, as VTIMEZONE's DTSTART writes it. */
  readonly wall: PlainDateTime;
  readonly from: number;
  readonly to: number;
}

const sec = (x: ZonedDateTime) => Math.round(x.offsetNanoseconds / 1e9);

/** The zone's changes of offset in `[fromYear, toYear]`. */
function changesIn(zone: string, fromYear: number, toYear: number): Change[] {
  const out: Change[] = [];
  const end = Temporal.PlainDate.from({ year: toYear + 1, month: 1, day: 1 }).toZonedDateTime(zone);
  let z: ZonedDateTime | null = Temporal.PlainDate.from({ year: fromYear, month: 1, day: 1 }).toZonedDateTime(zone);
  for (let n = 0; n < 400; n++) {
    z = z.getTimeZoneTransition('next');
    if (!z || Temporal.ZonedDateTime.compare(z, end) >= 0) break;
    const from = sec(z.subtract({ nanoseconds: 1 }));
    out.push({ wall: z.toInstant().toZonedDateTimeISO('UTC').toPlainDateTime().add({ seconds: from }), from, to: sec(z) });
  }
  return out;
}

/** `FREQ=YEARLY;BYMONTH=3;BYDAY=2SU` (or `-1SU` for the last) for the weekday a change fell on. */
function ruleOf(w: PlainDateTime): string {
  const n = w.day + 7 > w.daysInMonth ? -1 : Math.ceil(w.day / 7);
  return `FREQ=YEARLY;BYMONTH=${w.month};BYDAY=${n}${DAYS[w.dayOfWeek - 1]}`;
}

/**
 * A VTIMEZONE from the zone's real transitions over the years given: one
 * block per change, and when the last year changes twice by weekday rules
 * that the zone keeps for the next two years too, those two as RRULEs — so a
 * reader that only has this VTIMEZONE stays right after the years written.
 */
function vtimezone(zone: string, fromYear: number, toYear: number): string[] {
  const out = ['BEGIN:VTIMEZONE', `TZID:${zone}`];
  const block = (c: Change, rrule?: string) => {
    const kind = c.to > c.from ? 'DAYLIGHT' : 'STANDARD';
    out.push(`BEGIN:${kind}`, `DTSTART:${wallText(c.wall)}`, ...(rrule ? [`RRULE:${rrule}`] : []), `TZOFFSETFROM:${formatOffset(c.from)}`, `TZOFFSETTO:${formatOffset(c.to)}`, `END:${kind}`);
  };
  const first = Temporal.PlainDate.from({ year: fromYear, month: 1, day: 1 }).toZonedDateTime(zone);
  block({ wall: first.toPlainDateTime(), from: sec(first), to: sec(first) });
  const all = changesIn(zone, fromYear, toYear);
  const last = all.filter((c) => c.wall.year === toYear);
  // A year's changes by rule, time and offsets: equal for the next two years means the rules hold.
  const sig = (cs: readonly Change[]) => cs.map((c) => `${ruleOf(c.wall)} ${c.wall.toPlainTime()} ${c.from} ${c.to}`).join();
  const ruled = last.length === 2 && [1, 2].every((k) => sig(changesIn(zone, toYear + k, toYear + k)) === sig(last));
  for (const c of ruled ? all.slice(0, -2) : all) block(c);
  if (ruled) for (const c of last) block(c, ruleOf(c.wall));
  out.push('END:VTIMEZONE');
  return out;
}
