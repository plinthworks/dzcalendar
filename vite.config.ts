import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';
import { fileURLToPath } from 'node:url';

/** Compiled by Angular; everything else by Vite. */
const ANGULAR = /[\\/]packages[\\/]angular[\\/]src[\\/]|[\\/]playground[\\/]angular\.ts/;

/** The playground: http://localhost:4600 (tzslot's runs on 4500). */
export default defineConfig({
  root: 'playground',
  // Only the Angular page and package are compiled by Angular (playground/tsconfig.angular.json).
  // Everything else is left to Vite's own TypeScript transform.
  plugins: [
    angular({
      tsconfig: fileURLToPath(new URL('./playground/tsconfig.angular.json', import.meta.url)),
      transformFilter: (_code: string, id: string) => ANGULAR.test(id),
    }),
    // The Angular plugin turns Vite's own TypeScript transform off for every file: back on for the rest.
    { name: 'dz-esbuild-back', enforce: 'post', config: () => ({ esbuild: { include: /\.ts$/, exclude: ANGULAR } }) },
  ],
  server: { port: 4600, strictPort: true },
  resolve: {
    alias: {
      // Subpaths first: '@dzcalendar/dom' would otherwise swallow '@dzcalendar/dom/list'.
      '@dzcalendar/dom/list': fileURLToPath(new URL('./packages/dom/src/list.ts', import.meta.url)),
      '@dzcalendar/dom/multimonth': fileURLToPath(new URL('./packages/dom/src/multimonth.ts', import.meta.url)),
      '@dzcalendar/dom/locales/ar': fileURLToPath(new URL('./packages/dom/src/locales/ar.ts', import.meta.url)),
      '@dzcalendar/dom/locales/es': fileURLToPath(new URL('./packages/dom/src/locales/es.ts', import.meta.url)),
      '@dzcalendar/dom/locales/de': fileURLToPath(new URL('./packages/dom/src/locales/de.ts', import.meta.url)),
      '@dzcalendar/dom/toolkit': fileURLToPath(new URL('./packages/dom/src/toolkit.ts', import.meta.url)),
      '@dzcalendar/dom/custom': fileURLToPath(new URL('./packages/dom/src/custom.ts', import.meta.url)),
      '@dzcalendar/core/views': fileURLToPath(new URL('./packages/core/src/views.ts', import.meta.url)),
      '@dzcalendar/angular': fileURLToPath(new URL('./packages/angular/src/index.ts', import.meta.url)),
      '@dzcalendar/core': fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)),
      '@dzcalendar/dom': fileURLToPath(new URL('./packages/dom/src/index.ts', import.meta.url)),
      '@dzcalendar/ical': fileURLToPath(new URL('./packages/ical/src/index.ts', import.meta.url)),
      '@dzcalendar/motion-gsap': fileURLToPath(new URL('./packages/motion-gsap/src/index.ts', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL('./playground/index.html', import.meta.url)),
        dst: fileURLToPath(new URL('./playground/dst.html', import.meta.url)),
        sources: fileURLToPath(new URL('./playground/sources.html', import.meta.url)),
        angular: fileURLToPath(new URL('./playground/angular.html', import.meta.url)),
        perf: fileURLToPath(new URL('./playground/perf.html', import.meta.url)),
        themes: fileURLToPath(new URL('./playground/themes.html', import.meta.url)),
        resets: fileURLToPath(new URL('./playground/resets.html', import.meta.url)),
      },
    },
  },
});
