import type { EventInput } from '../event/types.js';
import { Temporal } from '../temporal.js';
import type { EventSourceSpec } from './source.js';

/**
 * What a live feed says (owner, 2026-11-05): an event made, an event changed (its fields laid over the ones it
 * had, `extendedProps` too; `ongoing: false` without an end: it ends now), an event gone, or the whole list anew
 * (a reconnection that sends everything).
 */
export type LiveMessage =
  | { readonly create: EventInput }
  | { readonly update: string; readonly patch: Partial<EventInput> }
  | { readonly remove: string }
  | { readonly reset: readonly EventInput[] };

export interface LiveSourceOptions {
  /**
   * Opens the feed — a WebSocket, an MQTT client, anything — and hands each message to `emit` (one, or several at
   * once: one redraw). Answers how to close it: called when the source is removed or replaced, or the calendar
   * destroyed. Called again if the calendar is given this source anew.
   */
  connect(emit: (message: LiveMessage | readonly LiveMessage[]) => void): () => void;
  /** Inherited by every event of the source, under its own fields. */
  readonly defaults?: Partial<EventInput>;
}

/**
 * A source that is told, not asked: `connect` opens the feed, each message changes the source's events, and the
 * calendar draws what changed. An event without an `id` cannot be changed later: it is given one (`<source>-<n>`).
 * A person's edit to one lasts until the feed changes it.
 */
export function liveSource(id: string, o: LiveSourceOptions): EventSourceSpec {
  const events = new Map<string, EventInput>();
  let made = 0;
  let changed: (() => void) | null = null;
  const take = (m: LiveMessage) => {
    if ('create' in m) {
      const key = m.create.id ?? `${id}-${++made}`;
      events.set(key, { ...m.create, id: key });
    } else if ('update' in m) {
      const was = events.get(m.update);
      if (!was) return;
      const props = m.patch.extendedProps && was.extendedProps ? { extendedProps: { ...was.extendedProps, ...m.patch.extendedProps } } : {};
      const next: EventInput = { ...was, ...m.patch, ...props, id: m.update };
      // Finished without an end said: it ends when the feed says so — now (as `event.update` does).
      if (was.ongoing && m.patch.ongoing === false && m.patch.end === undefined && m.patch.duration === undefined) {
        delete next.duration;
        next.end = Temporal.Now.instant().toString();
      }
      events.set(m.update, next);
    } else if ('remove' in m) events.delete(m.remove);
    else if ('reset' in m) {
      events.clear();
      for (const e of m.reset) take({ create: e });
    }
  };
  return {
    id,
    chunk: { unit: 'none', prefetch: 0 },
    ...(o.defaults && { defaults: o.defaults }),
    fetch: () => [...events.values()],
    live(onChange) {
      changed = onChange;
      const stop = o.connect((message) => {
        const list = Array.isArray(message) ? (message as readonly LiveMessage[]) : [message as LiveMessage];
        for (const m of list) if (m && typeof m === 'object') take(m);
        changed?.();
      });
      return () => {
        changed = null;
        stop();
      };
    },
  };
}

/** The part of a browser's `EventSource` used here (the core names no DOM type). */
interface EventSourceLike {
  readonly readyState: number;
  addEventListener(type: string, listener: (e: { readonly data?: unknown; readonly lastEventId?: string }) => void): void;
  close(): void;
}
type EventSourceClass = new (url: string, init?: { withCredentials?: boolean }) => EventSourceLike;
/** The platform's timers, named here (no DOM, no Node types in the core). */
const timers = globalThis as unknown as { setTimeout(f: () => void, ms: number): unknown; clearTimeout(t: unknown): void };

export interface SseSourceOptions {
  /** A message's data (JSON read, else the text) turned into what it says; null: nothing. */
  map(data: unknown, event: { readonly type: string; readonly lastEventId: string }): LiveMessage | readonly LiveMessage[] | null;
  /** The named events listened to besides `message` (`event: run` in the stream). */
  readonly events?: readonly string[];
  readonly withCredentials?: boolean;
  /**
   * Milliseconds before opening the stream again when the server closed it for good (an error status). The
   * browser itself reconnects a dropped stream, sending `Last-Event-ID`; reopened here, the last id goes as
   * `?lastEventId=`. Default 5000.
   */
  readonly reopenAfterMs?: number;
  readonly defaults?: Partial<EventInput>;
}

/**
 * Server-Sent Events: `new EventSource(url)`, each message given to `map`. Without an `EventSource` (a server
 * render), it opens nothing.
 */
export function sseSource(id: string, url: string, o: SseSourceOptions): EventSourceSpec {
  return liveSource(id, {
    ...(o.defaults && { defaults: o.defaults }),
    connect(emit) {
      const ES = (globalThis as { EventSource?: EventSourceClass }).EventSource;
      if (!ES) return () => undefined;
      let es: EventSourceLike | null = null;
      let last = '';
      let timer: unknown;
      let closed = false;
      const on = (type: string) => (e: { readonly data?: unknown; readonly lastEventId?: string }) => {
        if (e.lastEventId) last = e.lastEventId;
        let data: unknown = e.data;
        if (typeof data === 'string') {
          try {
            data = JSON.parse(data);
          } catch {
            // Not JSON: the text, as it came.
          }
        }
        const m = o.map(data, { type, lastEventId: e.lastEventId ?? '' });
        if (m) emit(m);
      };
      const open = () => {
        const at = last ? `${url}${url.includes('?') ? '&' : '?'}lastEventId=${encodeURIComponent(last)}` : url;
        es = new ES(at, { withCredentials: o.withCredentials === true });
        es.addEventListener('message', on('message'));
        for (const name of o.events ?? []) es.addEventListener(name, on(name));
        es.addEventListener('error', () => {
          // CLOSED (2): the browser gave up (an error status); CONNECTING: it is already trying again.
          if (closed || !es || es.readyState !== 2) return;
          es.close();
          timer = timers.setTimeout(open, o.reopenAfterMs ?? 5000);
        });
      };
      open();
      return () => {
        closed = true;
        timers.clearTimeout(timer);
        es?.close();
      };
    },
  });
}
