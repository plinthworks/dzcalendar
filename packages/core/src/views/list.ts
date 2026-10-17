import { viewWindow } from '../store/store.js';
import type { EventInstance, StoreSnapshot } from '../store/store.js';
import { Temporal } from '../temporal.js';
import type { PlainDate, ZonedDateTime, ZoneId } from '../temporal.js';
import { dayInfos } from '../zone.js';
import type { ViewRange } from './spec.js';

export interface ListEntry {
  /** `${instance.key}|${date}`: an event over three days is three entries. */
  readonly key: string;
  readonly instance: EventInstance;
  /** An all-day event, or a timed one covering the whole of this day in the display zone. */
  readonly allDay: boolean;
  readonly startsHere: boolean;
  readonly endsHere: boolean;
  /** The part of a timed event on this day, in the display zone. */
  readonly start?: ZonedDateTime;
  readonly end?: ZonedDateTime;
}

export interface ListDay {
  readonly date: PlainDate;
  /** The day's real length in the display zone: 1500 on a fall-back Sunday, 1410 at Lord Howe. */
  readonly lengthMinutes: number;
  readonly entries: readonly ListEntry[];
}

export interface ListModel {
  readonly version: number;
  readonly range: ViewRange;
  readonly days: readonly ListDay[];
}

export interface ListOptions {
  readonly displayZone: ZoneId;
  /** Every shown date, events or not (a custom view's days). Default: only days with events. */
  readonly includeEmpty?: boolean;
}

const isBg = (i: EventInstance) => i.event.display === 'background' || i.event.display === 'inverse-background';

/**
 * The events of a period, day by day in the display zone, in reading order:
 * all-day first, then by start, longer first, title. A day that does not
 * exist in the zone (Apia, 30 December 2011) has no entry and no heading.
 */
export function buildListModel(range: ViewRange, snap: StoreSnapshot, opts: ListOptions): ListModel {
  const zone = opts.displayZone;
  const shown = new Set(range.dates.map(String));
  const count = range.start.until(range.end, { largestUnit: 'days' }).days;
  const infos = dayInfos(range.start, count, zone).filter((d) => d.lengthMinutes > 0 && shown.has(String(d.date)));
  const buckets = infos.map(() => [] as ListEntry[]);
  const index = new Map(infos.map((d, i) => [String(d.date), i]));
  const starts = infos.map((d) => d.start.epochMilliseconds);

  for (const instance of snap.queryInstances(viewWindow(range.start, range.end, zone))) {
    if (isBg(instance)) continue;
    const ev = instance.event;
    if (ev.allDay) {
      const last = ev.end.subtract({ days: 1 });
      for (let d = Temporal.PlainDate.compare(ev.start, range.start) > 0 ? ev.start : range.start; Temporal.PlainDate.compare(d, ev.end) < 0 && Temporal.PlainDate.compare(d, range.end) < 0; d = d.add({ days: 1 })) {
        const i = index.get(String(d));
        if (i === undefined) continue;
        buckets[i]!.push({ key: `${instance.key}|${d}`, instance, allDay: true, startsHere: d.equals(ev.start), endsHere: d.equals(last) });
      }
      continue;
    }
    const s = ev.start.epochMilliseconds;
    const e = ev.end.epochMilliseconds;
    // The last day starting at or before the event's start, then on while days begin before its end.
    let lo = 0;
    let hi = infos.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (starts[mid]! <= s) lo = mid + 1;
      else hi = mid;
    }
    for (let i = Math.max(0, lo - 1); i < infos.length; i++) {
      const day = infos[i]!;
      const ds = day.start.epochMilliseconds;
      const de = day.end.epochMilliseconds;
      if (ds >= e && !(s === e && ds === s)) break;
      // A zero-length event shows on its day; an end at midnight does not touch the next one.
      const meets = s === e ? s >= ds && s < de : s < de && e > ds;
      if (!meets) continue;
      const startsHere = s >= ds;
      const endsHere = e <= de;
      buckets[i]!.push({
        key: `${instance.key}|${day.date}`,
        instance,
        allDay: s <= ds && e >= de,
        startsHere,
        endsHere,
        start: startsHere ? ev.start.withTimeZone(zone) : day.start.toZonedDateTimeISO(zone),
        end: endsHere ? ev.end.withTimeZone(zone) : day.end.toZonedDateTimeISO(zone),
      });
    }
  }

  const length = (x: ListEntry) => {
    const ev = x.instance.event;
    return ev.allDay ? ev.start.until(ev.end).days * 86_400_000 : ev.end.epochMilliseconds - ev.start.epochMilliseconds;
  };
  const order = (a: ListEntry, b: ListEntry) =>
    Number(b.allDay) - Number(a.allDay) ||
    (a.start?.epochMilliseconds ?? 0) - (b.start?.epochMilliseconds ?? 0) ||
    length(b) - length(a) ||
    (a.instance.event.title < b.instance.event.title ? -1 : a.instance.event.title > b.instance.event.title ? 1 : 0) ||
    (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

  const days: ListDay[] = [];
  infos.forEach((d, i) => {
    const entries = buckets[i]!;
    if (entries.length === 0 && !opts.includeEmpty) return;
    days.push({ date: d.date, lengthMinutes: d.lengthMinutes, entries: entries.sort(order) });
  });
  return { version: snap.version, range, days };
}
