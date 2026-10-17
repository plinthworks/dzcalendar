import type { EventInput } from '../event/types.js';
import type { ChunkPolicy, EventSourceSpec, SourceFetch, SourceResult } from './source.js';

/** The part of `fetch` a source uses; the core names it itself (no DOM lib). */
export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string; signal: unknown },
) => Promise<{ readonly ok: boolean; readonly status: number; json(): Promise<unknown> }>;

type Common = Pick<EventSourceSpec, 'staleAfter' | 'retry' | 'defaults' | 'save'>;

export interface JsonSourceOptions extends Common {
  readonly url: string;
  /** Names of the query parameters; `null` leaves one out. Defaults: start, end, timeZone. */
  readonly startParam?: string | null;
  readonly endParam?: string | null;
  readonly zoneParam?: string | null;
  /** Sent with every request. */
  readonly params?: Readonly<Record<string, string>>;
  readonly method?: 'GET' | 'POST';
  readonly headers?: Readonly<Record<string, string>>;
  /** From the server's JSON to events. Default: the JSON is the list. */
  readonly map?: (raw: unknown) => SourceResult;
  /** Default: one month a request, nothing ahead. */
  readonly chunk?: ChunkPolicy;
  readonly fetchImpl?: FetchLike;
}

const MONTH: ChunkPolicy = { unit: 'month', prefetch: 0 };

const query = (params: Record<string, string>) =>
  Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

/**
 * Events from a URL answering JSON. Each request names its stretch as
 * instants (`start=2026-09-30T10:00:00Z&end=…`, wide enough for every zone)
 * and the calendar's zone; a chunked request is one stretch of whole chunks.
 */
export function jsonSource(id: string, o: JsonSourceOptions): EventSourceSpec {
  const fetch: SourceFetch = async ({ window: w, signal }) => {
    const params: Record<string, string> = { ...o.params };
    if (w) {
      if (o.startParam !== null) params[o.startParam ?? 'start'] = w.start.toString();
      if (o.endParam !== null) params[o.endParam ?? 'end'] = w.end.toString();
      if (o.zoneParam !== null) params[o.zoneParam ?? 'timeZone'] = w.displayZone;
    }
    const f = o.fetchImpl ?? (globalThis as unknown as { fetch: FetchLike }).fetch;
    const q = query(params);
    const post = o.method === 'POST';
    const res = await f(post || q === '' ? o.url : `${o.url}${o.url.includes('?') ? '&' : '?'}${q}`, {
      method: o.method ?? 'GET',
      headers: { accept: 'application/json', ...(post && { 'content-type': 'application/x-www-form-urlencoded' }), ...o.headers },
      ...(post && { body: q }),
      signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();
    return o.map ? o.map(raw) : (raw as readonly EventInput[]);
  };
  return withCommon({ id, fetch, chunk: o.chunk ?? MONTH }, o);
}

/** Events from a function of the stretch asked; synchronous or not. */
export function fnSource(id: string, fn: SourceFetch, o: Common & { readonly chunk?: ChunkPolicy } = {}): EventSourceSpec {
  return withCommon({ id, fetch: fn, chunk: o.chunk ?? MONTH }, o);
}

function withCommon(spec: EventSourceSpec, o: Common): EventSourceSpec {
  return {
    ...spec,
    ...(o.staleAfter && { staleAfter: o.staleAfter }),
    ...(o.retry && { retry: o.retry }),
    ...(o.defaults && { defaults: o.defaults }),
    ...(o.save && { save: o.save }),
  };
}
