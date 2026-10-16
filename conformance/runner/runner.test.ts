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
} from '../../packages/core/src/index.js';
import { expandZoned, expandDates, parseRRule } from '../../packages/rrule/src/index.js';
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

const adapters: Record<string, (input: any) => unknown> = {
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
