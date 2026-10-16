import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Temporal, createIdGenerator, dayInfo, normalizeEvent, resolveWall } from '../../packages/core/src/index.js';
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
  normalize: ({ event, context }) => {
    const r = normalizeEvent(event as EventInput, { ...context, newId: createIdGenerator('k') });
    if (!r.ok) return { ok: false, errors: r.problems.filter((p) => p.severity === 'error').map((p) => p.code) };
    const e = r.value.event;
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
