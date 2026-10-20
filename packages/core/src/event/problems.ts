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
  | 'unknown-event'
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
  | 'invalid-rrule'
  | 'invalid-exdate'
  | 'invalid-rdate'
  | 'too-many-occurrences'
  | 'unknown-occurrence'
  | 'invalid-edit'
  | 'invalid-recurrence-id'
  | 'orphan-override'
  | 'ical-syntax'
  | 'ical-unsupported'
  | 'zone-guessed'
  | 'zone-fixed-offset'
  | 'invalid-resource'
  | 'resource-cycle'
  | 'invalid-availability'
  | 'invalid-slot-query'
  /** A print or an export asked for what cannot be put on paper or in a file (an unknown view, a range ending before it starts). */
  | 'invalid-export'
  /** An option given by an attribute or a property that cannot be read (the Web Component). */
  | 'invalid-option'
  /** An option of another calendar library with no equivalent here (the FullCalendar translator): said, left out. */
  | 'compat-unsupported';

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
