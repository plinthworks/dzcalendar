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

function readWindow(w: Window, path: string, problems: Problem[]): ReadWindow | null {
  try {
    if (w.from === '24:00') throw new RangeError();
    const from = typeof w.from === 'string' ? Temporal.PlainTime.from(w.from) : w.from;
    const to = w.to === '24:00' ? null : typeof w.to === 'string' ? Temporal.PlainTime.from(w.to) : w.to;
    return { from, to };
  } catch {
    problems.push(problem('invalid-availability', 'warning', path, `${String(w.from)}–${String(w.to)}`));
    return null;
  }
}

function readDate(d: PlainDate | string, path: string, problems: Problem[]): PlainDate | null {
  try {
    return typeof d === 'string' ? Temporal.PlainDate.from(d) : d;
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
  const e = resolveWall(crosses ? date.add({ days: 1 }) : date, w.to ?? MIDNIGHT, zone, 'compatible').instant!.epochMilliseconds;
  return e > s ? { s, e } : null;
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

  (av.weekly ?? []).forEach((w, i) => {
    const path = `availability.weekly[${i}]`;
    const read = readWindow(w, path, problems);
    if (!read) return;
    if (!Array.isArray(w.days) || !w.days.every((d) => Number.isInteger(d) && d >= 1 && d <= 7)) {
      problems.push(problem('invalid-availability', 'warning', `${path}.days`, JSON.stringify(w.days)));
      return;
    }
    for (let d = from; Temporal.PlainDate.compare(d, to) < 0; d = d.add({ days: 1 })) if (w.days.includes(d.dayOfWeek as Weekday)) add(d, read);
  });

  (av.rules ?? []).forEach((w, i) => {
    const path = `availability.rules[${i}]`;
    const read = readWindow(w, path, problems);
    const start = readDate(w.start, `${path}.start`, problems);
    const parsed = parseRRule(w.rrule);
    if (!parsed.ok) {
      problems.push(problem('invalid-rrule', 'warning', `${path}.rrule`, w.rrule));
      return;
    }
    if (!read || !start) return;
    const exdates = (w.exdates ?? []).map((x, j) => readDate(x, `${path}.exdates[${j}]`, problems)).filter((x): x is PlainDate => x !== null);
    const found = expandDates(start, { rules: [parsed.rule], exdates, rdates: [] }, { from, to });
    for (const p of found.problems) problems.push(problem(p.code === 'too-many-occurrences' ? 'too-many-occurrences' : 'invalid-rrule', 'warning', `${path}.rrule`, p.detail));
    for (const d of found.starts) add(d, read);
  });

  (av.exceptions ?? []).forEach((x, i) => {
    const path = `availability.exceptions[${i}]`;
    const date = readDate(x.date, `${path}.date`, problems);
    if (!date || !inRange(date)) return;
    const windows = x.closed ? [] : (x.windows ?? []).map((w, j) => readWindow(w, `${path}.windows[${j}]`, problems)).filter((w): w is ReadWindow => w !== null);
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
