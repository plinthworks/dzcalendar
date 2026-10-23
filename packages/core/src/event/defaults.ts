// Plain durations, not Temporal.Duration: a module must not read Temporal as it is imported — it may still be
// loading (18i, `loadTemporal()`). `.add()` takes either.
export const DEFAULT_TIMED_DURATION: Readonly<{ hours: number }> = Object.freeze({ hours: 1 });
export const DEFAULT_ALL_DAY_DURATION: Readonly<{ days: number }> = Object.freeze({ days: 1 });
