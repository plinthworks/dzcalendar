import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

/** The playground: http://localhost:4600 (tzslot's runs on 4500). */
export default defineConfig({
  root: 'playground',
  server: { port: 4600, strictPort: true },
  resolve: {
    alias: {
      // Subpaths first: '@dzcalendar/dom' would otherwise swallow '@dzcalendar/dom/list'.
      '@dzcalendar/dom/list': fileURLToPath(new URL('./packages/dom/src/list.ts', import.meta.url)),
      '@dzcalendar/dom/multimonth': fileURLToPath(new URL('./packages/dom/src/multimonth.ts', import.meta.url)),
      '@dzcalendar/dom/toolkit': fileURLToPath(new URL('./packages/dom/src/toolkit.ts', import.meta.url)),
      '@dzcalendar/dom/custom': fileURLToPath(new URL('./packages/dom/src/custom.ts', import.meta.url)),
      '@dzcalendar/core/views': fileURLToPath(new URL('./packages/core/src/views.ts', import.meta.url)),
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
      },
    },
  },
});
