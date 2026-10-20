/**
 * @dzcalendar/pro-react — the Pro for React: `useEventEditor(cal)` opens the
 * event editor on "Open" and "New event here" (fetched on its first
 * opening); `useDzExport(cal)` prints and exports (fetched on first use).
 * The timeline views: `import '@dzcalendar/pro'` once in the application.
 */
import { useEffect, useMemo, useRef } from 'react';
import type { CreateRequest, EventInstance } from '@dzcalendar/core';
import type { CalendarController } from '@dzcalendar/react';
import { useCalendarState } from '@dzcalendar/react';
import type { EditorOptions, EditorOutcome } from '@dzcalendar/pro/editor';
import { exportsFor } from './exports.js';
import type { DzExports } from './exports.js';

export type { EditorOptions, EditorOutcome } from '@dzcalendar/pro/editor';
export type { ExportKind, ExportResult, ImageOptions, RangeOptions } from '@dzcalendar/pro/export';
export type { PrintJob, PrintOptions } from '@dzcalendar/pro/print';
export type { DzExports } from './exports.js';

/** The editor and tzslot's widget are fetched on the first opening, not with the application. */
const editor = () => import('@dzcalendar/pro/editor').then((m) => m.openEventEditor);

/**
 * "Open" on an event and "New event here" from the context menu open the
 * Pro's editor (a modal dialog, the usual recurrences) on the calendar of
 * `controller`. It takes over `onEventOpen` and `onCreateRequest` (the
 * calendar's own props for them no longer fire). `onClosed` says how it
 * closed: saved, deleted, or cancelled (also when its chunk fails to load).
 */
export function useEventEditor(controller: CalendarController, o: { readonly options?: EditorOptions; readonly onClosed?: (outcome: EditorOutcome) => void } = {}): void {
  const { instance } = useCalendarState(controller);
  const latest = useRef(o);
  latest.current = o;
  useEffect(() => {
    const closed = (p: Promise<EditorOutcome>) =>
      p.then(
        (x) => latest.current.onClosed?.(x),
        (err: unknown) => {
          latest.current.onClosed?.('cancelled');
          void Promise.reject(err);
        },
      );
    const open = (target: Parameters<Awaited<ReturnType<typeof editor>>>[1]) => {
      const cal = controller.getSnapshot().instance;
      if (cal) void closed(editor().then((openIt) => openIt(cal, target, latest.current.options ?? {})));
    };
    // Through the controller: the calendar offers these first, whatever its props do, until given back.
    return controller.takeOver({ onEventOpen: (i: EventInstance) => open({ instance: i }), onCreateRequest: (r: CreateRequest) => open({ create: r }) });
  }, [controller, instance]);
}

/** Printing and the exports of the calendar of `controller` (`download('pdf', 'agenda.pdf')`…). */
export function useDzExport(controller: CalendarController): DzExports {
  return useMemo(() => exportsFor(() => controller.getSnapshot().instance), [controller]);
}
