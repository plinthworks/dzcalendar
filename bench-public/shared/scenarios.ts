/**
 * The same data and the same questions for every library. Each page exposes
 * `window.bench: Bench`; scripts/bench-public.mjs drives it in Chrome.
 * The events are generated from a seed: the same 10 000 for everyone.
 */
export interface BenchEvent {
  readonly id: string;
  readonly title: string;
  /** Wall times in `zone` (`2026-10-21T09:00`) or a date (`2026-10-21`) for all-day. */
  readonly start: string;
  readonly end: string;
  readonly allDay?: boolean;
}

export interface Mount {
  readonly view: 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay' | 'listWeek';
  readonly date: string;
  readonly zone: string;
  readonly events: readonly BenchEvent[];
}

export interface Bench {
  readonly name: string;
  /** Draws, resolves after the first frame shown. */
  mount(m: Mount): Promise<void>;
  /** One event's title and start changed through the library's API; resolves after the next frame. */
  update(id: string, title: string, start: string, end: string): Promise<void>;
  next(): Promise<void>;
  destroy(): void;
}

/** After the browser has painted what was drawn. */
export const frame = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

/** A small seeded generator (mulberry32): the same numbers in every page. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pad = (n: number) => String(n).padStart(2, '0');

/** `n` events over 2026: 90 % timed (07:00–19:00, 30–120 min), 10 % all-day (1–3 days). */
export function events(n = 10000): BenchEvent[] {
  const r = rng(20261021);
  const out: BenchEvent[] = [];
  for (let i = 0; i < n; i++) {
    const day = new Date(Date.UTC(2026, 0, 1 + Math.floor(r() * 365)));
    const ymd = `${day.getUTCFullYear()}-${pad(day.getUTCMonth() + 1)}-${pad(day.getUTCDate())}`;
    if (r() < 0.1) {
      const end = new Date(day.getTime() + (1 + Math.floor(r() * 3)) * 86400000);
      out.push({ id: `e${i}`, title: `Event ${i}`, start: ymd, end: `${end.getUTCFullYear()}-${pad(end.getUTCMonth() + 1)}-${pad(end.getUTCDate())}`, allDay: true });
    } else {
      const startMin = 7 * 60 + Math.floor(r() * 24) * 30;
      const endMin = startMin + 30 * (1 + Math.floor(r() * 4));
      const t = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
      out.push({ id: `e${i}`, title: `Event ${i}`, start: `${ymd}T${t(startMin)}`, end: `${ymd}T${t(endMin)}` });
    }
  }
  return out;
}

/**
 * Days whose length is not 24 hours, from the zones' published rules. Each
 * has the event to measure and two references the same day, one hour and two
 * hours: their difference is an hour's height, whatever margin a library takes
 * off each piece; the expected result is the event's real length in hours.
 */
export const DST_CASES = [
  // Paris falls back on 25 October 2026 at 03:00 (+02:00 → +01:00): 00:00 → 06:00 lasts 7 hours.
  { name: 'Paris, 25 Oct 2026 (25 h)', zone: 'Europe/Paris', view: 'timeGridDay', date: '2026-10-25', event: ['2026-10-25T00:00', '2026-10-25T06:00'], ref: ['2026-10-25T12:00', '2026-10-25T13:00'], ref2: ['2026-10-25T14:00', '2026-10-25T16:00'], hours: 7 },
  // Chicago springs forward on 8 March 2026 at 02:00 (−06:00 → −05:00): 00:00 → 06:00 lasts 5 hours.
  { name: 'Chicago, 8 Mar 2026 (23 h)', zone: 'America/Chicago', view: 'timeGridDay', date: '2026-03-08', event: ['2026-03-08T00:00', '2026-03-08T06:00'], ref: ['2026-03-08T12:00', '2026-03-08T13:00'], ref2: ['2026-03-08T14:00', '2026-03-08T16:00'], hours: 5 },
  // Lord Howe springs forward half an hour on 4 October 2026 at 02:00 (+10:30 → +11:00): 00:00 → 04:00 lasts 3.5 hours.
  { name: 'Lord Howe, 4 Oct 2026 (23 h 30)', zone: 'Australia/Lord_Howe', view: 'timeGridDay', date: '2026-10-04', event: ['2026-10-04T00:00', '2026-10-04T04:00'], ref: ['2026-10-04T12:00', '2026-10-04T13:00'], ref2: ['2026-10-04T14:00', '2026-10-04T16:00'], hours: 3.5 },
  // Apia skipped 30 December 2011 (−10:00 → +14:00 at midnight): 29 Dec 22:00 → 31 Dec 02:00 lasts 4 hours.
  { name: 'Apia, 29–31 Dec 2011 (a day that never was)', zone: 'Pacific/Apia', view: 'timeGridWeek', date: '2011-12-29', event: ['2011-12-29T22:00', '2011-12-31T02:00'], ref: ['2011-12-29T12:00', '2011-12-29T13:00'], ref2: ['2011-12-29T14:00', '2011-12-29T16:00'], hours: 4 },
] as const;

/** An event's drawn pieces (found by the class every library lets an event carry): their total height, how many. */
export function drawnHeight(id: string): { height: number; pieces: number } {
  const els = [...document.querySelectorAll<HTMLElement>(`.bench-${id}`)].filter((el) => !el.parentElement?.closest(`.bench-${id}`));
  return { height: els.reduce((h, el) => h + el.getBoundingClientRect().height, 0), pieces: els.length };
}

/** How many of the generated events a person sees: some ink, not hidden, inside the calendar's box (an event kept in the DOM for "+N" is not seen). */
export function shownEvents(): number {
  const box = document.getElementById('cal')!.getBoundingClientRect();
  const ids = new Set<string>();
  for (const el of document.querySelectorAll<HTMLElement>('#cal [class*="bench-e"]')) {
    const r = el.getBoundingClientRect();
    const id = [...el.classList].find((c) => /^bench-e\d+$/.test(c));
    const seen = r.width > 0 && r.height > 0 && r.bottom > box.top && r.top < box.bottom && el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
    if (id && seen) ids.add(id);
  }
  return ids.size;
}
