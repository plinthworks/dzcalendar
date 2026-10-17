import type { AbortSignalLike, EventInput, EventSourceSpec, SaveRequest } from '@dzcalendar/core';
import { parseICal } from './parse.js';

/** What `fetch` must do here; the core has no DOM types, so it is named. */
export type FetchLike = (
  url: string,
  init?: { readonly signal?: AbortSignalLike; readonly headers?: Record<string, string> },
) => Promise<{ readonly ok: boolean; readonly status: number; text(): Promise<string> }>;

export interface ICalSourceOptions {
  /** Fetched with `fetchImpl` (default: the global `fetch`). */
  readonly url?: string;
  /** The text itself, or a function giving it, instead of a URL. */
  readonly text?: string | (() => string | Promise<string>);
  readonly fetchImpl?: FetchLike;
  readonly headers?: Record<string, string>;
  readonly defaults?: Partial<EventInput>;
  /** Where floating times are read when the file names no zone. */
  readonly defaultZone?: string;
  readonly save?: (req: SaveRequest) => Promise<unknown> | unknown;
}

/**
 * An iCalendar feed as an event source: fetched whole (iCal has no ranges),
 * read by `parseICal`; what reading it found wrong comes with the events.
 */
export function icalSource(id: string, o: ICalSourceOptions): EventSourceSpec {
  return {
    id,
    chunk: { unit: 'none', prefetch: 0 },
    ...(o.defaults && { defaults: o.defaults }),
    ...(o.save && { save: o.save }),
    async fetch(req) {
      let text: string;
      if (o.text !== undefined) text = typeof o.text === 'function' ? await o.text() : o.text;
      else {
        const f = o.fetchImpl ?? (globalThis as unknown as { fetch?: FetchLike }).fetch;
        if (!f || o.url === undefined) throw new Error('icalSource needs a url and fetch, or text');
        // A `webcal://` subscription link is the same feed over HTTPS.
        const res = await f(o.url.replace(/^webcals?:\/\//i, 'https://'), { signal: req.signal, ...(o.headers && { headers: o.headers }) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        text = await res.text();
      }
      const { events, problems } = parseICal(text, o.defaultZone !== undefined ? { defaultZone: o.defaultZone } : {});
      return { events, problems };
    },
  };
}
