import type { PlainDate } from '../temporal.js';
import type { ChunkPolicy } from './source.js';

/** A piece of a source's time, fetched and cached as one: whole dates, end exclusive. */
export interface Chunk {
  readonly key: string;
  readonly start: PlainDate;
  readonly end: PlainDate;
}

type Unit = Exclude<ChunkPolicy['unit'], 'none'>;

/** The chunk a date falls in. Weeks start on Monday: a chunk is a fetch, not a row on screen. */
export function chunkAt(unit: Unit, d: PlainDate): Chunk {
  switch (unit) {
    case 'week': {
      const start = d.subtract({ days: d.dayOfWeek - 1 });
      return { key: start.toString(), start, end: start.add({ days: 7 }) };
    }
    case 'month': {
      const start = d.with({ day: 1 });
      return { key: start.toString().slice(0, 7), start, end: start.add({ months: 1 }) };
    }
    case 'year': {
      const start = d.with({ month: 1, day: 1 });
      return { key: String(start.year), start, end: start.add({ years: 1 }) };
    }
  }
}

/** The chunks covering `[start, end)`, with `prefetch` more on each side, in order. */
export function chunksCovering(unit: Unit, start: PlainDate, end: PlainDate, prefetch = 0): Chunk[] {
  let first = chunkAt(unit, start);
  for (let i = 0; i < prefetch; i++) first = chunkAt(unit, first.start.subtract({ days: 1 }));
  const out = [first];
  let extra = 0;
  for (let c = first; ; ) {
    c = chunkAt(unit, c.end);
    if (c.start.until(end).sign <= 0 && ++extra > prefetch) break;
    out.push(c);
  }
  return out;
}
