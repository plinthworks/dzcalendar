import { Temporal, normalizeIntervals, resolveWall } from '@dzcalendar/core';
import type { MsSpan, PlainDate, PlainTime, Problem, Weekday, ZoneId } from '@dzcalendar/core';
import { problem } from './problem.js';
import { expandDates, parseRRule } from '@dzcalendar/rrule';
import type { Availability, Window } from './types.js';

const MIDNIGHT = Temporal.PlainTime.from('00:00');

/** A window read once: its wall times, or null (said in `problems`) when they cannot be read. */
interface ReadWindow {
  readonly from: PlainTime;
  /** null: '24:00', the next midnight. */
  readonly to: PlainTime | null;
}

/** A wall time from a string or a PlainTime; anything else throws (caught by the readers). */
const asTime = (t: unknown): PlainTime => {
  if (t instanceof Temporal.PlainTime) return t;
  if (typeof t === 'string') return Temporal.PlainTime.from(t);
  throw new TypeError();
};

function readWindow(w: Window | null | undefined, path: string, problems: Problem[]): ReadWindow | null {
  try {
    if (!w || w.from === '24:00') throw new RangeError();
    return { from: asTime(w.from), to: w.to === '24:00' ? null : asTime(w.to) };
  } catch {
    problems.push(problem('invalid-availability', 'warning', path, w ? `${String(w.from)}–${String(w.to)}` : String(w)));
    return null;
  }
}

function readDate(d: unknown, path: string, problems: Problem[]): PlainDate | null {
  try {
    if (d instanceof Temporal.PlainDate) return d;
    if (typeof d === 'string') return Temporal.PlainDate.from(d);
    throw new TypeError();
  } catch {
    problems.push(problem('invalid-availability', 'warning', path, String(d)));
    return null;
  }
}

/**
 * Where a window opened on `date` lies, in epoch ms. Wall times are resolved
 * `compatible` (a start in a skipped hour opens when the hour ends): a window
 * across a clock change has its real length.
 */
function spanOf(date: PlainDate, w: ReadWindow, zone: ZoneId): MsSpan | null {
  const s = resolveWall(date, w.from, zone, 'compatible').instant!.epochMilliseconds;
  const crosses = w.to === null || Temporal.PlainTime.compare(w.to, w.from) <= 0;
  const endDate = crosses ? date.add({ days: 1 }) : date;
  const endTime = w.to ?? MIDNIGHT;
  // A closing time the clocks skip closes when they jump (02:30 on a night that goes from 02:00 to
  // 03:00 closes at the jump): a time that does not exist never adds open time.
  const end = resolveWall(endDate, endTime, zone, 'earlier');
  const e = end.exists ? end.instant!.epochMilliseconds : gapStart(endDate, endTime, zone);
  return e > s ? { s, e } : null;
}

/** The moment the clocks jumped over a wall time that does not exist. */
function gapStart(date: PlainDate, time: PlainTime, zone: ZoneId): number {
  const before = resolveWall(date, time, zone, 'earlier').instant!;
  const t = before.toZonedDateTimeISO(zone).getTimeZoneTransition('next');
  return (t ?? before).epochMilliseconds;
}

/**
 * The provider's open time for windows opening on dates `from` (inclusive)
 * to `to` (exclusive) of their zone: sorted, merged epoch-ms spans. An
 * exception replaces every window opening on its date.
 */
export function openSpans(av: Availability, from: PlainDate, to: PlainDate, problems: Problem[]): MsSpan[] {
  const zone = av.timeZone;
  const byDate = new Map<string, ReadWindow[]>();
  const add = (d: PlainDate, w: ReadWindow) => {
    const k = d.toString();
    const list = byDate.get(k);
    if (list) list.push(w);
    else byDate.set(k, [w]);
  };
  const inRange = (d: PlainDate) => Temporal.PlainDate.compare(d, from) >= 0 && Temporal.PlainDate.compare(d, to) < 0;

  const list = <T>(x: readonly T[] | undefined, path: string): readonly T[] => {
    if (x === undefined) return [];
    if (Array.isArray(x)) return x;
    problems.push(problem('invalid-availability', 'warning', path, typeof x));
    return [];
  };
  list(av.weekly, 'availability.weekly').forEach((w, i) => {
    const path = `availability.weekly[${i}]`;
    const read = readWindow(w, path, problems);
    if (!read) return;
    if (!Array.isArray(w!.days) || !w!.days.every((d) => Number.isInteger(d) && d >= 1 && d <= 7)) {
      problems.push(problem('invalid-availability', 'warning', `${path}.days`, JSON.stringify(w!.days)));
      return;
    }
    for (let d = from; Temporal.PlainDate.compare(d, to) < 0; d = d.add({ days: 1 })) if (w!.days.includes(d.dayOfWeek as Weekday)) add(d, read);
  });

  list(av.rules, 'availability.rules').forEach((w, i) => {
    const path = `availability.rules[${i}]`;
    const read = readWindow(w, path, problems);
    if (!w) return;
    const start = readDate(w.start, `${path}.start`, problems);
    const parsed = typeof w.rrule === 'string' ? parseRRule(w.rrule) : { ok: false as const };
    if (!parsed.ok) {
      problems.push(problem('invalid-rrule', 'warning', `${path}.rrule`, String(w.rrule)));
      return;
    }
    if (!read || !start) return;
    const exdates = list(w.exdates, `${path}.exdates`).map((x, j) => readDate(x, `${path}.exdates[${j}]`, problems)).filter((x): x is PlainDate => x !== null);
    const found = expandDates(start, { rules: [parsed.rule], exdates, rdates: [] }, { from, to });
    for (const p of found.problems) problems.push(problem(p.code === 'too-many-occurrences' ? 'too-many-occurrences' : 'invalid-rrule', 'warning', `${path}.rrule`, p.detail));
    for (const d of found.starts) add(d, read);
  });

  list(av.exceptions, 'availability.exceptions').forEach((x, i) => {
    const path = `availability.exceptions[${i}]`;
    const date = readDate(x?.date, `${path}.date`, problems);
    if (!x || !date || !inRange(date)) return;
    const windows = x.closed ? [] : list(x.windows, `${path}.windows`).map((w, j) => readWindow(w, `${path}.windows[${j}]`, problems)).filter((w): w is ReadWindow => w !== null);
    byDate.set(date.toString(), windows);
  });

  const spans: MsSpan[] = [];
  for (const [k, windows] of byDate) {
    const date = Temporal.PlainDate.from(k);
    for (const w of windows) {
      const sp = spanOf(date, w, zone);
      if (sp) spans.push(sp);
    }
  }
  return normalizeIntervals(spans);
}
