import { Temporal, isValidZone } from '@dzcalendar/core';
import type { EventInput, PlainDateTime, Problem, ProblemCode } from '@dzcalendar/core';
import { parseLine, splitText, unescapeText, unfold } from './lines.js';
import type { ContentLine } from './lines.js';
import { fixedZone, ianaIn, matchObservances, offsetIn, offsetSeconds } from './zones.js';
import type { Observance } from './zones.js';

export interface ParseICalOptions {
  /** Where floating times (no TZID, no `Z`) are read when the file names no zone (`X-WR-TIMEZONE`). */
  readonly defaultZone?: string;
}

export interface ICalCalendar {
  readonly name?: string;
  readonly zone?: string;
  readonly prodId?: string;
}

export interface ParsedICal {
  readonly events: EventInput[];
  readonly problems: Problem[];
  readonly calendar: ICalCalendar;
}

interface Component {
  readonly name: string;
  readonly props: ContentLine[];
  readonly children: Component[];
}

const issue = (code: ProblemCode, severity: 'error' | 'warning', path: string, detail?: string): Problem =>
  detail === undefined ? { code, severity, path } : { code, severity, path, detail };

/** Components that only stand directly in a VCALENDAR: one opening inside another closes it. */
const TOP = new Set(['VEVENT', 'VTODO', 'VJOURNAL', 'VFREEBUSY', 'VTIMEZONE', 'VCALENDAR']);

/** @internal Exported for tests. */
export function components(text: string, problems: Problem[]): Component[] {
  const root: Component = { name: '', props: [], children: [] };
  const stack: Component[] = [root];
  for (const { text: raw, line } of unfold(text)) {
    const cl = parseLine(raw, line);
    if (!cl) {
      problems.push(issue('ical-syntax', 'error', `line ${line}`, raw));
      continue;
    }
    if (cl.name === 'BEGIN') {
      const c: Component = { name: cl.value.trim().toUpperCase(), props: [], children: [] };
      // A missing END: the next event opening closes the open one rather than nesting in it.
      if (TOP.has(c.name)) {
        while (stack.length > 1 && stack[stack.length - 1]!.name !== 'VCALENDAR' && c.name !== 'VCALENDAR') {
          problems.push(issue('ical-syntax', 'error', `line ${line}`, raw));
          stack.pop();
        }
      }
      stack[stack.length - 1]!.children.push(c);
      stack.push(c);
    } else if (cl.name === 'END') {
      const name = cl.value.trim().toUpperCase();
      const at = stack.map((c) => c.name).lastIndexOf(name);
      if (at <= 0) problems.push(issue('ical-syntax', 'error', `line ${line}`, raw));
      else {
        if (at !== stack.length - 1) problems.push(issue('ical-syntax', 'error', `line ${line}`, raw));
        stack.length = at;
      }
    } else stack[stack.length - 1]!.props.push(cl);
  }
  if (stack.length > 1) problems.push(issue('ical-syntax', 'error', 'end', `BEGIN:${stack[stack.length - 1]!.name} never ends`));
  return root.children;
}

const prop = (c: Component, name: string) => c.props.find((p) => p.name === name);
const param = (p: ContentLine, name: string) => p.params[name]?.[0];

type Moment =
  | { readonly kind: 'date'; readonly text: string }
  | { readonly kind: 'zoned' | 'floating'; readonly text: string };

const DATE = /^(\d{4})(\d{2})(\d{2})$/;
const DATE_TIME = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/i;

/**
 * Parses an iCalendar text into event inputs. Never throws on data: what is
 * wrong is in `problems`, and an event whose start cannot be read is left out.
 * Only VEVENTs are read.
 */
export function parseICal(text: string, opts: ParseICalOptions = {}): ParsedICal {
  const problems: Problem[] = [];
  const events: EventInput[] = [];
  const cals = components(String(text), problems);
  // Several VCALENDARs in one text (concatenated feeds) are read as one; the first names it.
  const all = cals.filter((c) => c.name === 'VCALENDAR');
  const cal: Component =
    all.length === 0 ? { name: 'VCALENDAR', props: [], children: cals } : all.length === 1 ? all[0]! : { name: 'VCALENDAR', props: all.flatMap((c) => c.props), children: all.flatMap((c) => c.children) };
  const wrZone = prop(cal, 'X-WR-TIMEZONE')?.value.trim();
  const calZone = wrZone && isValidZone(wrZone) ? wrZone : wrZone ? ianaIn(wrZone) : undefined;
  const floatingZone = calZone ?? opts.defaultZone;
  const name = prop(cal, 'X-WR-CALNAME');
  const prodId = prop(cal, 'PRODID');
  const calendar: ICalCalendar = {
    ...(name && { name: unescapeText(name.value) }),
    ...(calZone && { zone: calZone }),
    ...(prodId && { prodId: prodId.value }),
  };

  const vevents = cal.children.filter((c) => c.name === 'VEVENT');
  for (const kind of ['VTODO', 'VJOURNAL']) {
    if (cal.children.some((c) => c.name === kind)) problems.push(issue('ical-unsupported', 'warning', kind, 'skipped'));
  }
  const vtimezones = new Map(
    cal.children.filter((c) => c.name === 'VTIMEZONE').map((c) => [prop(c, 'TZID')?.value.trim() ?? '', c] as const),
  );
  // The years the file's events start in: what a VTIMEZONE is compared over.
  const years = [
    ...new Set(
      vevents
        .map((v) => /^(\d{4})/.exec(prop(v, 'DTSTART')?.value ?? '')?.[1])
        .filter((y): y is string => y !== undefined)
        .map(Number),
    ),
  ]
    .sort((a, b) => a - b);

  const unsupported = new Set<string>();
  const once = (what: string, path: string) => {
    if (unsupported.has(what)) return;
    unsupported.add(what);
    problems.push(issue('ical-unsupported', 'warning', path, what));
  };

  /** An IANA zone, a VTIMEZONE's own rules (no IANA zone keeps them), or null (unknown). */
  type Zone = string | readonly Observance[];
  const zones = new Map<string, Zone | null>();
  function zoneFor(tzid: string, path: string): Zone | null {
    const known = zones.get(tzid);
    if (known !== undefined) return known;
    let zone: Zone | null = ianaIn(tzid) ?? null;
    const vtz = zone ? undefined : vtimezones.get(tzid);
    if (vtz) {
      const obs = observances(vtz);
      // Old events can fall under rules the VTIMEZONE no longer states (US 2005 vs its 2007+ rules):
      // all the years first, then the latest alone.
      const latest = years.length > 0 ? [years[years.length - 1]!] : [2026];
      const found = matchObservances(obs, years.length > 0 ? years.slice(-12) : latest) ?? (years.length > 1 ? matchObservances(obs, latest) : null);
      if (found) problems.push(issue('zone-guessed', 'warning', path, `${tzid} → ${(zone = found)}`));
      else if (obs.length > 0) {
        // Each wall time gets the offset the VTIMEZONE's rules give it, as a fixed-offset moment:
        // right for every start, though a series repeats at that one offset.
        zone = obs;
        problems.push(issue('zone-fixed-offset', 'warning', path, tzid));
      }
    }
    if (!zone) problems.push(issue('unknown-zone', 'warning', path, tzid));
    zones.set(tzid, zone);
    return zone;
  }
  /** UTC times stay UTC's on a recurring event: RFC 5545 repeats them in UTC. */
  let keepUtc = false;

  /** One value of a date or date-time property, written as core reads it. */
  function moment(value: string, p: ContentLine, path: string): Moment | null {
    const v = value.trim();
    const d = DATE.exec(v);
    const t = d ? null : DATE_TIME.exec(v);
    try {
      if (d) return { kind: 'date', text: Temporal.PlainDate.from({ year: +d[1]!, month: +d[2]!, day: +d[3]! }, { overflow: 'reject' }).toString() };
      if (!t) throw new RangeError(v);
      const wall = wallOf(v)!.toString();
      if (t[7]) {
        const at = Temporal.Instant.from(`${wall}Z`);
        // A file that names its zone means its UTC times to be read there;
        // otherwise they are UTC's, as RFC 5545 repeats them.
        return { kind: 'zoned', text: floatingZone && !keepUtc ? at.toZonedDateTimeISO(floatingZone).toString() : `${wall}[UTC]` };
      }
      const tzid = param(p, 'TZID');
      const zone = tzid !== undefined ? zoneFor(tzid, path) : floatingZone ?? null;
      if (zone !== null && typeof zone !== 'string') {
        const off = fixedZone(offsetIn(zone, Temporal.PlainDateTime.from(wall)));
        return { kind: 'zoned', text: `${wall}${off}[${off}]` };
      }
      // A fixed-offset zone (`+05:30`) is written with its offset, as the own-rules reading is.
      return zone ? { kind: 'zoned', text: /^[+-]\d/.test(zone) ? `${wall}${zone}[${zone}]` : `${wall}[${zone}]` } : { kind: 'floating', text: wall };
    } catch {
      problems.push(issue('ical-syntax', 'error', path, v));
      return null;
    }
  }

  const list = (c: Component, name: string, path: string): string[] => {
    const out: string[] = [];
    c.props
      .filter((p) => p.name === name)
      .forEach((p, k) => {
        const period = param(p, 'VALUE')?.toUpperCase() === 'PERIOD';
        if (period) once('RDATE;VALUE=PERIOD', `${path}.${name}`);
        for (const raw of p.value.split(',')) {
          const m = moment(period ? raw.split('/')[0]! : raw, p, `${path}.${name}[${k}]`);
          if (m) out.push(m.text);
        }
      });
    return out;
  };

  vevents.forEach((v, i) => {
    const path = `VEVENT[${i}]`;
    const dtstart = prop(v, 'DTSTART');
    keepUtc = v.props.some((p) => p.name === 'RRULE' || p.name === 'RDATE');
    const start = dtstart ? moment(dtstart.value, dtstart, `${path}.DTSTART`) : null;
    if (!start) {
      if (!dtstart) problems.push(issue('ical-syntax', 'error', `${path}.DTSTART`, 'missing'));
      return;
    }
    const uid = prop(v, 'UID')?.value.trim();
    const e: EventInput = { start: start.text };
    const rid = prop(v, 'RECURRENCE-ID');
    const recurrence = rid ? moment(rid.value, rid, `${path}.RECURRENCE-ID`) : null;
    if (rid && param(rid, 'RANGE')?.toUpperCase() === 'THISANDFUTURE') once('RECURRENCE-ID;RANGE=THISANDFUTURE', `${path}.RECURRENCE-ID`);
    if (uid && recurrence) {
      e.id = `${uid}@${rid!.value.trim()}`;
      e.seriesId = uid;
      e.recurrenceId = recurrence.text;
    } else if (uid) e.id = uid;
    if (start.kind === 'date') e.allDay = true;

    const dtend = prop(v, 'DTEND');
    const end = dtend ? moment(dtend.value, dtend, `${path}.DTEND`) : null;
    const duration = prop(v, 'DURATION')?.value.trim();
    if (end) e.end = end.text;
    else if (duration) e.duration = duration;
    // RFC 5545 §3.6.1: no end and no duration is one day for a date, an instant for a time.
    else e.duration = start.kind === 'date' ? 'P1D' : 'PT0S';

    const summary = prop(v, 'SUMMARY');
    if (summary) e.title = unescapeText(summary.value);
    const rrules = v.props.filter((p) => p.name === 'RRULE').map((p) => p.value.trim());
    if (rrules.length > 0) e.rrule = rrules.length === 1 ? rrules[0]! : rrules;
    if (prop(v, 'EXRULE')) once('EXRULE', `${path}.EXRULE`);
    const exdate = list(v, 'EXDATE', path);
    if (exdate.length > 0) e.exdate = exdate;
    const rdate = list(v, 'RDATE', path);
    if (rdate.length > 0) e.rdate = rdate;

    const status = prop(v, 'STATUS')?.value.trim().toLowerCase();
    if (status === 'confirmed' || status === 'tentative' || status === 'cancelled') e.status = status;
    if (prop(v, 'TRANSP')?.value.trim().toUpperCase() === 'TRANSPARENT') e.busy = false;
    const url = prop(v, 'URL');
    if (url) e.url = url.value.trim();

    const props: Record<string, unknown> = {};
    const description = prop(v, 'DESCRIPTION');
    if (description) props['description'] = unescapeText(description.value);
    const location = prop(v, 'LOCATION');
    if (location) props['location'] = unescapeText(location.value);
    const categories = v.props.filter((p) => p.name === 'CATEGORIES').flatMap((p) => splitText(p.value));
    if (categories.length > 0) props['categories'] = categories;
    const organizer = prop(v, 'ORGANIZER');
    if (organizer) {
      const cn = param(organizer, 'CN');
      const email = organizer.value.replace(/^mailto:/i, '').trim();
      props['organizer'] = { ...(cn && { name: cn }), ...(email && { email }) };
    }
    if (Object.keys(props).length > 0) e.extendedProps = props;
    events.push(e);
  });
  return { events, problems, calendar };
}

/** @internal Exported for tests. */
export function observances(vtz: Component): Observance[] {
  const out: Observance[] = [];
  for (const c of vtz.children) {
    if (c.name !== 'STANDARD' && c.name !== 'DAYLIGHT') continue;
    const from = offsetSeconds(prop(c, 'TZOFFSETFROM')?.value ?? '');
    const to = offsetSeconds(prop(c, 'TZOFFSETTO')?.value ?? '');
    const start = wallOf(prop(c, 'DTSTART')?.value ?? '');
    if (from === null || to === null || !start) continue;
    const rrule = prop(c, 'RRULE')?.value.trim();
    const rdates = c.props
      .filter((p) => p.name === 'RDATE')
      .flatMap((p) => p.value.split(','))
      .map(wallOf)
      .filter((x): x is PlainDateTime => x !== null);
    out.push({ start, from, to, rdates, standard: c.name === 'STANDARD', ...(rrule && { rrule }) });
  }
  return out;
}

/** A DATE-TIME's wall time, a leap second read as :59; null when malformed. */
function wallOf(v: string): PlainDateTime | null {
  const t = DATE_TIME.exec(v.trim());
  try {
    return t && Temporal.PlainDateTime.from({ year: +t[1]!, month: +t[2]!, day: +t[3]!, hour: +t[4]!, minute: +t[5]!, second: Math.min(59, +t[6]!) }, { overflow: 'reject' });
  } catch {
    return null;
  }
}
