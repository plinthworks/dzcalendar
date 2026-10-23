import { Temporal, viewWindow } from '@dzcalendar/core';
import type { EventInstance, PlainDate, PlainDateTime, ResourceTree, StoreSnapshot, ZoneId } from '@dzcalendar/core';

/** One occurrence, as a spreadsheet row (owner's decision: both zones, the real duration). */
export interface OccurrenceRow {
  readonly key: string;
  readonly title: string;
  readonly allDay: boolean;
  /** In the event's own zones (the start's, the end's), or its dates (an all-day one: the end exclusive). */
  readonly start: PlainDateTime | PlainDate;
  readonly end: PlainDateTime | PlainDate;
  /** The event's zone (its start's); null for an all-day event. */
  readonly zone: ZoneId | null;
  /** Its end's zone: a flight Paris → Tokyo ends in Tokyo (owner's decision); null for an all-day event. */
  readonly endZone: ZoneId | null;
  /** In the display zone (a timed event; the same dates for an all-day one). */
  readonly shownStart: PlainDateTime | PlainDate;
  readonly shownEnd: PlainDateTime | PlainDate;
  /** Real elapsed minutes (a night across a clock change says its true length); null for an all-day event. */
  readonly minutes: number | null;
  readonly resources: readonly string[];
  readonly status: string;
}

export interface RowsOptions {
  /** `[start, end)`, dates in the display zone. */
  readonly start: PlainDate;
  readonly end: PlainDate;
  readonly displayZone: ZoneId;
  /** Resource titles instead of ids, when given. */
  readonly resources?: ResourceTree;
  /** Background events too. Default false. */
  readonly includeBackground?: boolean;
}

/** Every occurrence over the range, in order (start, then title), each once. */
export function occurrenceRows(snap: StoreSnapshot, o: RowsOptions): OccurrenceRow[] {
  const all = snap.queryInstances(viewWindow(o.start, o.end, o.displayZone), { includeBackground: o.includeBackground ?? false });
  const seen = new Set<string>();
  const list: EventInstance[] = [];
  for (const i of all) if (!seen.has(i.key)) (seen.add(i.key), list.push(i));
  const ms = (i: EventInstance) => (i.event.allDay ? i.event.start.toZonedDateTime({ timeZone: o.displayZone }).epochMilliseconds : i.event.start.epochMilliseconds);
  list.sort((a, b) => ms(a) - ms(b) || (a.event.title < b.event.title ? -1 : a.event.title > b.event.title ? 1 : 0));
  const titleOf = (id: string) => o.resources?.byId.get(id)?.resource.title ?? id;
  return list.map(({ key, event: ev }) => {
    const common = { key, title: ev.title, resources: ev.resourceIds.map(titleOf), status: ev.status };
    if (ev.allDay) return { ...common, allDay: true, start: ev.start, end: ev.end, zone: null, endZone: null, shownStart: ev.start, shownEnd: ev.end, minutes: null };
    return {
      ...common,
      allDay: false,
      start: ev.start.toPlainDateTime(),
      end: ev.end.toPlainDateTime(),
      zone: ev.start.timeZoneId,
      endZone: ev.end.timeZoneId,
      shownStart: ev.start.withTimeZone(o.displayZone).toPlainDateTime(),
      shownEnd: ev.end.withTimeZone(o.displayZone).toPlainDateTime(),
      minutes: (ev.end.epochMilliseconds - ev.start.epochMilliseconds) / 60000,
    };
  });
}

// Made on first use, not at import: Temporal may still be loading (18i, `loadTemporal()`).
let _epoch: ReturnType<typeof Temporal.PlainDate.from> | undefined;
const EPOCH = () => (_epoch ??= Temporal.PlainDate.from('1899-12-31'));
// Made on first use, not at import: Temporal may still be loading (18i, `loadTemporal()`).
let _leap_bug: ReturnType<typeof Temporal.PlainDate.from> | undefined;
const LEAP_BUG = () => (_leap_bug ??= Temporal.PlainDate.from('1900-03-01'));

/**
 * A wall time as an Excel serial date (the time as a fraction): what Excel
 * sorts and formats. 1 January 1900 is 1; from 1 March 1900, one more —
 * Excel counts a 29 February 1900 that never was (kept from Lotus 1-2-3).
 * Null before 1900: Excel has no such date.
 */
export function excelSerial(t: PlainDateTime | PlainDate): number | null {
  const date = 'hour' in t ? t.toPlainDate() : t;
  const days = EPOCH().until(date, { largestUnit: 'days' }).days + (Temporal.PlainDate.compare(date, LEAP_BUG()) >= 0 ? 1 : 0);
  if (days < 1) return null;
  if (!('hour' in t)) return days;
  return days + (t.hour * 3600 + t.minute * 60 + t.second) / 86400;
}
