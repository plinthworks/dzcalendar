import { Temporal } from '@dzcalendar/core';
import type { EventInput, Problem, ZoneId } from '@dzcalendar/core';
import { dateOf10, duration, minutesOf, momentOf, said, weekdays } from './dates.js';

const DAY = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
/** The rrule plugin's weekdays: 'mo' or 0 (Monday) … 6 (Sunday). */
const byday = (d: unknown) => (typeof d === 'number' ? DAY[((d % 7) + 7) % 7] : typeof d === 'string' ? d.toUpperCase().replace(/^([+-]?\d*)(\w\w).*$/, '$1$2') : null);

/** An instant or date as RRULE's UNTIL: a date alone, else UTC. */
function until(x: unknown, zone: ZoneId): string | null {
  const m = momentOf(x, zone, 'until', []);
  if (!m) return null;
  // What momentOf gives always parses.
  if (/^\d{4}-\d{2}-\d{2}$/.test(m)) return m.replace(/-/g, '');
  return Temporal.ZonedDateTime.from(m).toInstant().toString().replace(/[-:]/g, '').replace(/\.\d+/, '');
}

/** The rrule plugin's object as an RRULE line, and its start. */
function ruleOfObject(r: Record<string, unknown>, zone: ZoneId): { rule: string; start: unknown } {
  const parts = [`FREQ=${String(r['freq'] ?? 'weekly').toUpperCase()}`];
  if (r['interval']) parts.push(`INTERVAL=${Number(r['interval'])}`);
  const days = ([] as unknown[]).concat(r['byweekday'] ?? []).map(byday).filter(Boolean);
  if (days.length > 0) parts.push(`BYDAY=${days.join(',')}`);
  for (const [k, name] of [['bymonthday', 'BYMONTHDAY'], ['bymonth', 'BYMONTH'], ['bysetpos', 'BYSETPOS'], ['byyearday', 'BYYEARDAY'], ['byweekno', 'BYWEEKNO'], ['byhour', 'BYHOUR'], ['byminute', 'BYMINUTE']] as const) {
    const v = r[k];
    if (v !== undefined && v !== null) parts.push(`${name}=${([] as unknown[]).concat(v).join(',')}`);
  }
  if (r['count']) parts.push(`COUNT=${Number(r['count'])}`);
  const u = r['until'] !== undefined ? until(r['until'], zone) : null;
  if (u) parts.push(`UNTIL=${u}`);
  if (r['wkst'] !== undefined) parts.push(`WKST=${byday(r['wkst'])}`);
  return { rule: parts.join(';'), start: r['dtstart'] };
}

/** The rrule plugin's text ("DTSTART…\nRRULE:…\nEXDATE…"): the rule lines, the start, the excluded dates. */
function ruleOfText(text: string): { rules: string[]; start: string | null; exdate: string[] } {
  const rules: string[] = [];
  const exdate: string[] = [];
  let start: string | null = null;
  for (const line of text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    const [head, value = ''] = line.split(/:(.*)/s);
    const name = head!.split(';')[0]!.toUpperCase();
    const zone = /TZID=([^;:]+)/i.exec(head!)?.[1];
    const stamp = (v: string) => {
      const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(v);
      if (!m) return v;
      const date = `${m[1]}-${m[2]}-${m[3]}`;
      if (!m[4]) return date;
      const wall = `${date}T${m[4]}:${m[5]}:${m[6]}`;
      return m[7] ? `${wall}Z` : zone ? `${wall}[${zone}]` : wall;
    };
    if (name === 'DTSTART') start = stamp(value);
    else if (name === 'RRULE') rules.push(value);
    else if (name === 'EXDATE') exdate.push(...value.split(',').map(stamp));
    else if (!line.includes(':')) rules.push(line);
  }
  return { rules, start, exdate };
}

/** The fields carried over as they are. */
const SAME = ['title', 'url', 'editable', 'startEditable', 'durationEditable', 'resourceEditable'] as const;
/** Ids: a number is the same id as text. */
const IDS = ['id', 'groupId', 'resourceId'] as const;
/** Where a series without `startRecur` starts: the other library's runs from always; a Monday long ago. */
export const LONG_AGO = '2000-01-03';

/** What every event takes when it does not say (the calendar's `eventStartEditable`, `eventClassNames`, `eventDisplay`…). */
export interface EventDefaults {
  readonly startEditable?: boolean;
  readonly durationEditable?: boolean;
  readonly resourceEditable?: boolean;
  readonly classNames?: readonly string[];
  readonly display?: EventInput['display'];
}
const classes = (x: unknown): string[] | null => (typeof x === 'string' ? x.split(/\s+/).filter(Boolean) : Array.isArray(x) ? x.filter((c): c is string => typeof c === 'string') : null);
/** Kept in extendedProps (DzCalendar names tones, not colours), said once each. */
const COLOURS = ['color', 'backgroundColor', 'borderColor', 'textColor'] as const;
const DISPLAY: Record<string, EventInput['display']> = { background: 'background', 'inverse-background': 'inverse-background', none: 'none', auto: 'auto', block: 'auto', 'list-item': 'auto' };

/** One event of the other library as DzCalendar's input (null when it cannot be read: said). */
export function toEvent(raw: unknown, zone: ZoneId, path: string, problems: Problem[], defaults: EventDefaults = {}): EventInput | null {
  if (!raw || typeof raw !== 'object') {
    problems.push(said('invalid-event', path, typeof raw, 'error'));
    return null;
  }
  const fc = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of SAME) if (fc[k] !== undefined) out[k] = fc[k];
  for (const k of IDS) if (typeof fc[k] === 'string' || typeof fc[k] === 'number') out[k] = String(fc[k]);
  if (Array.isArray(fc['resourceIds'])) out['resourceIds'] = (fc['resourceIds'] as unknown[]).map(String);
  const cls = classes(fc['classNames']) ?? classes(fc['className']);
  if (cls ?? defaults.classNames) out['classNames'] = [...(defaults.classNames ?? []), ...(cls ?? [])];
  for (const k of ['startEditable', 'durationEditable', 'resourceEditable'] as const) if (out[k] === undefined && defaults[k] !== undefined) out[k] = defaults[k];
  const extended: Record<string, unknown> = { ...((fc['extendedProps'] as Record<string, unknown> | undefined) ?? {}) };
  for (const c of COLOURS) {
    if (fc[c] === undefined) continue;
    extended[c] = fc[c];
    problems.push(said('compat-unsupported', `${path}.${c}`, 'tone'));
  }
  if (typeof fc['display'] === 'string') out['display'] = DISPLAY[fc['display']] ?? 'auto';
  else if (defaults.display) out['display'] = defaults.display;
  for (const k of ['overlap', 'constraint']) if (fc[k] !== undefined) problems.push(said('compat-unsupported', `${path}.${k}`, 'rules'));
  if (fc['allDay'] !== undefined) out['allDay'] = Boolean(fc['allDay']);

  // Simple recurrence: on these weekdays, between these times, from a date to a date.
  const dow = weekdays(fc['daysOfWeek']);
  if (dow && dow.length > 0) {
    const days = [...new Set(dow)].sort().map((d) => DAY[d - 1]);
    const from = momentOf(fc['startRecur'], zone, `${path}.startRecur`, problems)?.slice(0, 10) ?? LONG_AGO;
    const t0 = minutesOf(fc['startTime']);
    const t1 = minutesOf(fc['endTime']);
    const parts = [`FREQ=WEEKLY`, `BYDAY=${days.join(',')}`];
    const end = fc['endRecur'] !== undefined ? momentOf(fc['endRecur'], zone, `${path}.endRecur`, problems) : null;
    // endRecur is exclusive: a date series ends the day before; a timed one the second before its midnight, in the calendar's zone.
    if (end) parts.push(`UNTIL=${t0 === null ? dateOf10(end).subtract({ days: 1 }).toString().replace(/-/g, '') : dateOf10(end).toZonedDateTime({ timeZone: zone }).toInstant().subtract({ seconds: 1 }).toString().replace(/[-:]/g, '').replace(/\.\d+/, '')}`);
    if (t0 === null) {
      out['start'] = from;
      out['allDay'] = true;
    } else {
      out['start'] = `${from}T${String(Math.floor(t0 / 60)).padStart(2, '0')}:${String(Math.round(t0 % 60)).padStart(2, '0')}[${zone}]`;
      if (t1 !== null && t1 > t0) out['duration'] = duration(t1 - t0);
    }
    out['rrule'] = parts.join(';');
  } else if (fc['rrule'] !== undefined) {
    // The rrule plugin: text or an object, a duration, excluded dates.
    if (typeof fc['rrule'] === 'string') {
      const r = ruleOfText(fc['rrule'].includes('\n') || /^DTSTART|^RRULE:/i.test(fc['rrule']) ? fc['rrule'] : `RRULE:${fc['rrule']}`);
      out['rrule'] = r.rules.length === 1 ? r.rules[0] : r.rules;
      const s = momentOf(r.start ?? fc['start'], zone, `${path}.rrule`, problems);
      if (s) out['start'] = s;
      if (r.exdate.length > 0) out['exdate'] = r.exdate.map((x) => momentOf(x, zone, `${path}.exdate`, problems)).filter(Boolean);
    } else if (fc['rrule'] && typeof fc['rrule'] === 'object') {
      const r = ruleOfObject(fc['rrule'] as Record<string, unknown>, zone);
      out['rrule'] = r.rule;
      const s = momentOf(r.start ?? fc['start'], zone, `${path}.rrule.dtstart`, problems);
      if (s) out['start'] = s;
    }
    const d = fc['duration'] !== undefined ? minutesOf(fc['duration']) : null;
    if (d !== null) out['duration'] = duration(d);
    // The rule text's EXDATE and the exdate field, together.
    if (Array.isArray(fc['exdate'])) out['exdate'] = [...((out['exdate'] as string[] | undefined) ?? []), ...(fc['exdate'] as unknown[]).map((x) => momentOf(x, zone, `${path}.exdate`, problems)).filter(Boolean)];
  } else {
    const start = momentOf(fc['start'] ?? fc['date'], zone, `${path}.start`, problems);
    if (start) out['start'] = start;
    const end = momentOf(fc['end'], zone, `${path}.end`, problems);
    if (end) out['end'] = end;
  }
  if (Object.keys(extended).length > 0) out['extendedProps'] = extended;
  return out as EventInput;
}

/** A list of events (problems say which could not be read). */
export function toEvents(list: unknown, zone: ZoneId, path: string, problems: Problem[], defaults: EventDefaults = {}): EventInput[] {
  if (!Array.isArray(list)) {
    if (list !== undefined && list !== null) problems.push(said('invalid-event', path, 'not-a-list', 'error'));
    return [];
  }
  const found: Problem[] = [];
  const out = list.flatMap((e, i) => toEvent(e, zone, `${path}[${i}]`, found, defaults) ?? []);
  // A colour on a thousand events is said once per field, not a thousand times.
  const seen = new Set<string>();
  for (const p of found) {
    const colour = p.detail === 'tone' ? /\.(\w+)$/.exec(p.path)?.[1] : undefined;
    if (!colour) problems.push(p);
    else if (!seen.has(colour)) (seen.add(colour), problems.push({ ...p, path: `${path}[*].${colour}` }));
  }
  return out;
}
