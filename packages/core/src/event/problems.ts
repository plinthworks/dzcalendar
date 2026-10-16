/**
 * Why an input was refused or bent. A code and raw detail only: the sentences
 * belong to the DOM layer's messages, translated, never to the core.
 */
export type ProblemCode =
  | 'invalid-event'
  | 'missing-start'
  | 'invalid-start'
  | 'invalid-end'
  | 'invalid-duration'
  | 'end-before-start'
  | 'invalid-id'
  | 'duplicate-id'
  | 'unknown-zone'
  | 'zone-defaulted'
  | 'offset-only'
  | 'offset-mismatch'
  | 'wall-time-skipped'
  | 'wall-time-ambiguous'
  | 'date-object-rejected'
  | 'foreign-temporal'
  | 'allday-with-time'
  | 'allday-zone-ignored'
  | 'unknown-resource'
  | 'unsupported-recurrence';

export type Severity = 'error' | 'warning';

export interface Problem {
  readonly code: ProblemCode;
  /** An error rejects the event; a warning accompanies an accepted one. */
  readonly severity: Severity;
  /** Where in the input: `events[12].start`. */
  readonly path: string;
  readonly sourceId?: string;
  readonly detail?: string;
}

export const problem = (code: ProblemCode, severity: Severity, path: string, detail?: string): Problem =>
  detail === undefined ? { code, severity, path } : { code, severity, path, detail };
