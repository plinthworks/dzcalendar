import { defineConfig } from 'vitest/config';

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
          include: ['packages/core/test/**/*.test.ts', 'packages/theme/test/**/*.test.ts', 'packages/rrule/test/**/*.test.ts'],
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
