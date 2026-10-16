import { Temporal } from './temporal.js';
import type { ByDay, Frequency, RRule, RRuleProblem, Weekday } from './types.js';

const FREQS: readonly Frequency[] = ['YEARLY', 'MONTHLY', 'WEEKLY', 'DAILY', 'HOURLY', 'MINUTELY', 'SECONDLY'];
const DAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;

export type ParseRRule = { readonly ok: true; readonly rule: RRule } | { readonly ok: false; readonly problem: RRuleProblem };

const bad = (detail: string): ParseRRule => ({ ok: false, problem: { code: 'invalid-rrule', detail } });

function ints(v: string, lo: number, hi: number, nonZero: boolean): number[] | null {
  const out: number[] = [];
  for (const part of v.split(',')) {
    if (!/^[+-]?\d+$/.test(part)) return null;
    const n = Number(part);
    if (Math.abs(n) < lo || Math.abs(n) > hi || (nonZero && n === 0) || (!nonZero && n < 0)) return null;
    out.push(n);
  }
  return out;
}

/** RFC 5545 UNTIL: `20261231` (a date) or `20261231T235959Z` (an instant). Local forms are read as UTC. */
function parseUntil(v: string): Temporal.Instant | Temporal.PlainDate | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(v);
  if (!m) return null;
  try {
    const [, y, mo, d, h, mi, s] = m;
    if (h === undefined) return Temporal.PlainDate.from({ year: +y!, month: +mo!, day: +d! }, { overflow: 'reject' });
    return Temporal.PlainDateTime.from({ year: +y!, month: +mo!, day: +d!, hour: +h, minute: +mi!, second: +s! }, { overflow: 'reject' })
      .toZonedDateTime('UTC')
      .toInstant();
  } catch {
    return null;
  }
}

/**
 * Reads `FREQ=WEEKLY;BYDAY=MO,WE;COUNT=10` (with or without `RRULE:`).
 * Never throws: an unreadable rule is a problem naming the part at fault.
 */
export function parseRRule(text: string): ParseRRule {
  const body = text.trim().replace(/^RRULE:/i, '');
  if (body === '') return bad('empty rule');
  const fields = new Map<string, string>();
  for (const part of body.split(';')) {
    if (part === '') continue;
    const eq = part.indexOf('=');
    if (eq <= 0) return bad(`not NAME=VALUE: ${part}`);
    const name = part.slice(0, eq).toUpperCase();
    if (fields.has(name)) return bad(`${name} given twice`);
    fields.set(name, part.slice(eq + 1).toUpperCase());
  }
  const freq = fields.get('FREQ') as Frequency | undefined;
  if (!freq || !FREQS.includes(freq)) return bad(`FREQ must be one of ${FREQS.join(', ')}`);
  const rule: { -readonly [K in keyof RRule]?: RRule[K] } = { freq, interval: 1, wkst: 1 };

  for (const [name, v] of fields) {
    switch (name) {
      case 'FREQ':
        break;
      case 'INTERVAL': {
        const n = Number(v);
        if (!Number.isInteger(n) || n < 1) return bad(`INTERVAL must be a positive integer: ${v}`);
        rule.interval = n;
        break;
      }
      case 'COUNT': {
        const n = Number(v);
        if (!Number.isInteger(n) || n < 1) return bad(`COUNT must be a positive integer: ${v}`);
        rule.count = n;
        break;
      }
      case 'UNTIL': {
        const u = parseUntil(v);
        if (!u) return bad(`UNTIL is not a date or UTC date-time: ${v}`);
        rule.until = u;
        break;
      }
      case 'WKST': {
        const i = DAYS.indexOf(v as (typeof DAYS)[number]);
        if (i < 0) return bad(`WKST is not a weekday: ${v}`);
        rule.wkst = (i + 1) as Weekday;
        break;
      }
      case 'BYDAY': {
        const days: ByDay[] = [];
        for (const d of v.split(',')) {
          const m = /^([+-]?\d{1,2})?(MO|TU|WE|TH|FR|SA|SU)$/.exec(d);
          if (!m) return bad(`BYDAY entry: ${d}`);
          const weekday = (DAYS.indexOf(m[2] as (typeof DAYS)[number]) + 1) as Weekday;
          if (m[1] !== undefined) {
            const n = Number(m[1]);
            if (n === 0 || Math.abs(n) > 53) return bad(`BYDAY ordinal: ${d}`);
            days.push({ weekday, n });
          } else {
            days.push({ weekday });
          }
        }
        rule.byDay = days;
        break;
      }
      case 'BYSECOND':
      case 'BYMINUTE':
      case 'BYHOUR': {
        const max = name === 'BYHOUR' ? 23 : name === 'BYMINUTE' ? 59 : 60;
        const list = ints(v, 0, max, false);
        if (!list) return bad(`${name}: ${v}`);
        if (name === 'BYSECOND') rule.bySecond = list;
        else if (name === 'BYMINUTE') rule.byMinute = list;
        else rule.byHour = list;
        break;
      }
      case 'BYMONTHDAY':
      case 'BYYEARDAY':
      case 'BYWEEKNO':
      case 'BYSETPOS': {
        const max = name === 'BYMONTHDAY' ? 31 : name === 'BYYEARDAY' ? 366 : name === 'BYWEEKNO' ? 53 : 366;
        const list = ints(v, 1, max, true);
        if (!list) return bad(`${name}: ${v}`);
        if (name === 'BYMONTHDAY') rule.byMonthDay = list;
        else if (name === 'BYYEARDAY') rule.byYearDay = list;
        else if (name === 'BYWEEKNO') rule.byWeekNo = list;
        else rule.bySetPos = list;
        break;
      }
      case 'BYMONTH': {
        const list = ints(v, 1, 12, true);
        if (!list || list.some((n) => n < 0)) return bad(`BYMONTH: ${v}`);
        rule.byMonth = list;
        break;
      }
      default:
        // RSCALE, SKIP and other extensions are not read (ARCHITECTURE K.7): say so.
        return bad(`unsupported part: ${name}`);
    }
  }
  if (rule.count !== undefined && rule.until !== undefined) return bad('COUNT and UNTIL together');
  if (rule.byWeekNo && freq !== 'YEARLY') return bad('BYWEEKNO only with FREQ=YEARLY');
  if (rule.byYearDay && (freq === 'DAILY' || freq === 'WEEKLY' || freq === 'MONTHLY')) return bad(`BYYEARDAY not with FREQ=${freq}`);
  if (rule.byMonthDay && freq === 'WEEKLY') return bad('BYMONTHDAY not with FREQ=WEEKLY');
  if (rule.byDay?.some((d) => d.n !== undefined) && freq !== 'MONTHLY' && freq !== 'YEARLY') return bad(`BYDAY ordinals only with MONTHLY or YEARLY`);
  if (rule.byDay?.some((d) => d.n !== undefined) && freq === 'YEARLY' && rule.byWeekNo) return bad('BYDAY ordinals not with BYWEEKNO');
  return { ok: true, rule: rule as RRule };
}

/** The rule back as text, parts in a fixed order, so equal rules print equal. */
export function serializeRRule(r: RRule): string {
  const out = [`FREQ=${r.freq}`];
  if (r.interval !== 1) out.push(`INTERVAL=${r.interval}`);
  if (r.count !== undefined) out.push(`COUNT=${r.count}`);
  if (r.until !== undefined) {
    out.push(
      r.until instanceof Temporal.PlainDate
        ? `UNTIL=${r.until.toString().replaceAll('-', '')}`
        : `UNTIL=${r.until.toString({ smallestUnit: 'second' }).replaceAll('-', '').replaceAll(':', '')}`,
    );
  }
  const list = (name: string, xs: readonly number[] | undefined) => xs && out.push(`${name}=${xs.join(',')}`);
  list('BYMONTH', r.byMonth);
  list('BYWEEKNO', r.byWeekNo);
  list('BYYEARDAY', r.byYearDay);
  list('BYMONTHDAY', r.byMonthDay);
  if (r.byDay) out.push(`BYDAY=${r.byDay.map((d) => `${d.n ?? ''}${DAYS[d.weekday - 1]}`).join(',')}`);
  list('BYHOUR', r.byHour);
  list('BYMINUTE', r.byMinute);
  list('BYSECOND', r.bySecond);
  list('BYSETPOS', r.bySetPos);
  if (r.wkst !== 1) out.push(`WKST=${DAYS[r.wkst - 1]}`);
  return out.join(';');
}
