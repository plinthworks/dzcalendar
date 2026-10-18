import { defineConfig } from 'vitest/config';
import angular from '@analogjs/vite-plugin-angular';

/**
 * The core runs in `node`, not jsdom: a DOM global reached by accident would
 * pass under jsdom and break the day the core runs in a worker or on a server.
 * jsdom arrives with @dzcalendar/dom, as a separate project.
 */
export default defineConfig({
  test: {
    globals: true,
    projects: [
      {
        test: {
          name: 'core',
          globals: true,
          environment: 'node',
          include: ['packages/core/test/**/*.test.ts', 'packages/theme/test/**/*.test.ts', 'packages/rrule/test/**/*.test.ts', 'packages/ical/test/**/*.test.ts', 'packages/slots/test/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'dom',
          globals: true,
          environment: 'jsdom',
          include: ['packages/dom/test/**/*.test.ts'],
        },
      },
      {
        // Components compiled for the tests, not stubbed: a template that fails to
        // bind still compiles under tsc, and only rendering it catches that.
        plugins: [angular({ tsconfig: 'packages/angular/tsconfig.spec.json' })],
        test: {
          name: 'angular',
          globals: true,
          environment: 'jsdom',
          setupFiles: ['packages/angular/test/setup.ts'],
          include: ['packages/angular/test/**/*.test.ts'],
        },
      },
      {
        // zone.js patches globals (Promise, timers, events): its own project, a process per file.
        plugins: [angular({ tsconfig: 'packages/angular/tsconfig.spec.json' })],
        test: {
          name: 'angular-zone',
          globals: true,
          environment: 'jsdom',
          pool: 'forks',
          isolate: true,
          setupFiles: ['packages/angular/test-zone/setup.ts'],
          include: ['packages/angular/test-zone/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'conformance',
          globals: true,
          environment: 'node',
          include: ['conformance/runner/**/*.test.ts'],
        },
      },
    ],
  },
});
