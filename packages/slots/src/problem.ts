import type { Problem, ProblemCode, Severity } from '@dzcalendar/core';

export const problem = (code: ProblemCode, severity: Severity, path: string, detail?: string): Problem =>
  detail === undefined ? { code, severity, path } : { code, severity, path, detail };
