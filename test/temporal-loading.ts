// A browser without Temporal of its own, for the suites that check the calendar waiting for its polyfill (18i):
// `@dzcalendar/core` says Temporal is not there until `loading.release()`. One state for every file, on globalThis —
// with one worker, a file may be handed the core another file mocked.
type Loading = { ready: boolean; release: () => void };
export const loading: Loading = ((globalThis as { __dzTemporalLoading?: Loading }).__dzTemporalLoading ??= { ready: true, release: () => {} });

export const lazyCore = async (original: () => Promise<typeof import('@dzcalendar/core')>) => ({
  ...(await original()),
  temporalReady: () => loading.ready,
  loadTemporal: () => (loading.ready ? Promise.resolve() : new Promise<void>((r) => (loading.release = () => ((loading.ready = true), r())))),
});
