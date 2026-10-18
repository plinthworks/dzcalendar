import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BUILTIN_VIEWS,
  Temporal,
  buildColumnAxis,
  computeViewRange,
  createIdGenerator,
  dayInfo,
  dayInfos,
  layoutColumn,
  navigate,
  normalizeEvent,
  resolveWall,
  segmentTimed,
  itemEvent,
  createEventStore,
  createHistory,
  viewWindow,
} from '../../packages/core/src/index.js';
import { expandZoned, expandDates, parseRRule, serializeRRule } from '../../packages/rrule/src/index.js';
import { parseICal } from '../../packages/ical/src/index.js';
import { findSlots, checkSlot } from '../../packages/slots/src/index.js';
import type { Slot } from '../../packages/slots/src/index.js';
import type { EventInput, WallPolicy } from '../../packages/core/src/index.js';

/**
 * Runs every case in conformance/cases against the TypeScript core. Each
 * suite has an adapter that turns the core's answer into the case's plain
 * JSON shape; the comparison is then exact.
 */
interface Case {
  id: string;
  suite: string;
  description: string;
  refs: string[];
  input: Record<string, unknown>;
  expected: unknown;
}

const ROOT = fileURLToPath(new URL('../cases', import.meta.url));
const str = (x: { toString(): string } | null) => (x === null ? null : x.toString());

/** A slot as an ISO interval, to the minute, offsets shown: `2026-10-25T02:00+02:00/2026-10-25T02:00+01:00`. */
const slotText = (x: Slot) => `${x.start.toString({ smallestUnit: 'minute', timeZoneName: 'never' })}/${x.end.toString({ smallestUnit: 'minute', timeZoneName: 'never' })}`;

const adapters: Record<string, (input: any) => unknown> = {
  slots: ({ check, ...query }) => {
    if (check !== undefined) {
      const r = checkSlot(query, check);
      return r.ok ? { ok: true, slot: slotText(r.slot) } : { ok: false, reason: r.reason };
    }
    const r = findSlots(query);
    return { slots: r.slots.map(slotText), problems: r.problems.map((x) => x.code) };
  },
  'zone-dayinfo': ({ date, zone }) => {
    const d = dayInfo(Temporal.PlainDate.from(date), zone);
    return {
      start: str(d.start),
      end: str(d.end),
      lengthMinutes: d.lengthMinutes,
      kind: d.kind,
      transitions: d.transitions.map((t) => ({
        at: str(t.at),
        offsetBefore: t.offsetBefore,
        offsetAfter: t.offsetAfter,
        deltaMinutes: t.deltaMinutes,
        wallBefore: str(t.wallBefore),
        wallAfter: str(t.wallAfter),
        kind: t.kind,
      })),
    };
  },
  'zone-resolve': ({ date, time, zone, policy }) => {
    const r = resolveWall(Temporal.PlainDate.from(date), Temporal.PlainTime.from(time), zone, policy as WallPolicy);
    return { instant: str(r.instant), other: str(r.other), exists: r.exists, ambiguous: r.ambiguous, offsetMatched: r.offsetMatched };
  },
  'time-axis': ({ date, zone, mode }) => {
    const axis = buildColumnAxis(Temporal.PlainDate.from(date), zone, { mode });
    return { length: axis.length, bands: axis.bands.map((b) => [b.kind, b.from, b.to]) };
  },
  segment: ({ event, zone, firstDate, days, cutAtRepeat }) => {
    const r = normalizeEvent({ id: 'e', ...event }, { displayZone: zone, newId: createIdGenerator('k') });
    if (!r.ok) throw new Error(JSON.stringify(r.problems));
    const segs = segmentTimed({ key: 'e', event: itemEvent(r.value), origin: 'single' }, dayInfos(Temporal.PlainDate.from(firstDate), days, zone), { cutAtRepeat });
    return segs.map((s) => [s.dayIndex, s.part, str(s.from), str(s.to)]);
  },
  'layout-column': ({ items, minVisual }) =>
    layoutColumn(items, { minVisual }).map((p) => [p.key, p.lane, p.lanes, p.left, p.width]),
  navigation: ({ anchor, view, firstDay, dir, today, overrides }) => {
    const spec = { ...BUILTIN_VIEWS[view]!, ...(overrides ?? {}) };
    const ctx = { firstDay, today: Temporal.PlainDate.from(today ?? '2026-01-01') };
    const to = typeof dir === 'object' ? { to: Temporal.PlainDate.from(dir.to) } : dir;
    const next = navigate(Temporal.PlainDate.from(anchor), spec, to, ctx);
    const range = computeViewRange(next, spec, ctx);
    return { anchor: str(next), start: str(range.start), end: str(range.end), dates: range.dates.length };
  },
  // `withProblems`: the case also asserts what the expansion reported (the limit's `too-many-occurrences`).
  'rrule-expand': ({ dtstart, rrule, window, limit, exdates, rdates, withProblems }) => {
    const parsed = parseRRule(rrule);
    if (!parsed.ok) return { problem: parsed.problem.code };
    if (/^\d{4}-\d{2}-\d{2}$/.test(dtstart)) {
      const start = Temporal.PlainDate.from(dtstart);
      const w = window ? { from: Temporal.PlainDate.from(window.from), to: Temporal.PlainDate.from(window.to) } : { from: start, to: start.add({ years: 200 }) };
      const set = { rules: [parsed.rule], exdates: (exdates ?? []).map((x: string) => Temporal.PlainDate.from(x)), rdates: (rdates ?? []).map((x: string) => Temporal.PlainDate.from(x)) };
      const r = expandDates(start, set, w, limit);
      return withProblems ? { starts: r.starts.map(String), problems: r.problems.map((p) => p.code) } : r.starts.map(String);
    }
    const start = Temporal.ZonedDateTime.from(dtstart);
    const w = window
      ? { from: Temporal.Instant.from(window.from), to: Temporal.Instant.from(window.to) }
      : { from: start.toInstant(), to: start.toInstant().add({ hours: 24 * 365 * 400 }) };
    const set = {
      rules: [parsed.rule],
      exdates: (exdates ?? []).map((x: string) => (/T/.test(x) ? Temporal.Instant.from(x) : Temporal.PlainDate.from(x))),
      rdates: (rdates ?? []).map((x: string) => Temporal.ZonedDateTime.from(x)),
    };
    const r = expandZoned(start, set, w, limit);
    const starts = r.starts.map((z) => z.toInstant().toString());
    return withProblems ? { starts, problems: r.problems.map((p) => p.code) } : starts;
  },
  // Commands against a series, then what a window shows and what the series became.
  'series-edit': ({ zone, event, ops, window }) => {
    const store = createEventStore();
    const h = createHistory(store, { normalize: { displayZone: zone, newId: createIdGenerator('n') } });
    const created = h.run({ type: 'event.create', event });
    if (!created.ok) return { error: created.problems.map((p) => p.code) };
    for (const op of ops) {
      if (op.type === 'undo') h.undo();
      else if (op.type === 'redo') h.redo();
      else {
        const r = h.run(op);
        if (!r.ok) return { error: r.problems.map((p) => p.code) };
      }
    }
    const shown = store.snapshot
      .queryInstances(viewWindow(Temporal.PlainDate.from(window.from), Temporal.PlainDate.from(window.to), zone))
      .map((i) => `${i.origin}|${i.event.title}|${i.event.start}|${i.event.end}`);
    const at = (s: { base: { start: { toString(): string } } }) => s.base.start;
    const series = [...store.snapshot.allSeries()]
      .sort((a, b) => {
        const x = at(a);
        const y = at(b);
        return x instanceof Temporal.PlainDate ? Temporal.PlainDate.compare(x, y as never) : Temporal.ZonedDateTime.compare(x as never, y as never);
      })
      .map((s) => s.set.rules.map(serializeRRule).join(',') + (s.set.exdates.length > 0 ? `|EXDATE=${s.set.exdates.join(',')}` : ''));
    return { shown, series };
  },
  // An iCalendar text (its lines, joined with CRLF) read into event inputs: plain strings, compared exactly.
  'ical-parse': ({ lines, defaultZone }) => {
    const r = parseICal((lines as string[]).join('\r\n'), defaultZone ? { defaultZone } : {});
    return { events: r.events, problems: r.problems.map((p) => p.code) };
  },
  normalize: ({ event, context }) => {
    const r = normalizeEvent(event as EventInput, { ...context, newId: createIdGenerator('k') });
    if (!r.ok) return { ok: false, errors: r.problems.filter((p) => p.severity === 'error').map((p) => p.code) };
    const e = itemEvent(r.value);
    return {
      ok: true,
      allDay: e.allDay,
      start: e.start.toString(),
      end: e.end.toString(),
      warnings: r.problems.map((p) => p.code),
      ...(e.allDay ? {} : { zoneGuessed: e.zoneGuessed }),
    };
  },
};

const suites = readdirSync(ROOT);

describe('conformance', () => {
  it('every suite on disk has an adapter', () => {
    expect(suites.filter((s) => !(s in adapters))).toEqual([]);
  });

  for (const suite of suites) {
    describe(suite, () => {
      for (const file of readdirSync(join(ROOT, suite)).filter((f) => f.endsWith('.json'))) {
        const c = JSON.parse(readFileSync(join(ROOT, suite, file), 'utf8')) as Case;
        it(`${c.id}: ${c.description}`, () => {
          expect(c.suite).toBe(suite);
          expect(file).toBe(`${c.id}.json`);
          expect(adapters[suite]!(c.input)).toEqual(c.expected);
        });
      }
    });
  }
});
