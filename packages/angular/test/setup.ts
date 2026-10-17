import '@angular/compiler';
import { afterEach } from 'vitest';
import { getTestBed } from '@angular/core/testing';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';

/**
 * The Angular test environment, set up once per context — however many times
 * this file is evaluated in it.
 *
 * `initTestEnvironment` refuses a second call: "Cannot set base providers
 * because it has already been called". With one worker per test file that
 * never happens, so this passed on a developer's machine and failed on a
 * runner with one core, where vitest reuses a worker and evaluates this module
 * again in a context that still remembers the last one — fifty-five files out
 * of sixty, all failing before they collected a single test.
 *
 * Resetting instead of guarding was worse: it tears the platform down under
 * the files already loaded beside this one.
 */
const marker = Symbol.for('dzcalendar.testEnvironment');
const context = globalThis as unknown as Record<symbol, boolean>;

if (!context[marker]) {
  context[marker] = true;
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
}

/**
 * And a clean module between tests.
 *
 * With a worker per file, a file that never reset one simply took its state to
 * the grave. Sharing a worker, it hands it to the next file instead — which
 * then cannot configure its own: "the test module has already been
 * instantiated". Angular's other runners install this for you; vitest does
 * not.
 */
afterEach(() => {
  getTestBed().resetTestingModule();
});
