import { Temporal } from '../temporal.js';
import type { Duration } from '../temporal.js';

export const DEFAULT_TIMED_DURATION: Duration = Temporal.Duration.from({ hours: 1 });
export const DEFAULT_ALL_DAY_DURATION: Duration = Temporal.Duration.from({ days: 1 });
