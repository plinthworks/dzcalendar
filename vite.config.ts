import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

/** Compiled by Angular; everything else by Vite. */
const ANGULAR = /[\\/]packages[\\/]angular[\\/]src[\\/]|[\\/]playground[\\/]angular\.ts/;

/** The playground: http://localhost:4600 (tzslot's runs on 4500). */
export default defineConfig({
  root: 'playground',
  // Only the Angular page and package are compiled by Angular (playground/tsconfig.angular.json).
  // Everything else is left to Vite's own TypeScript transform.
  // Vue's compile-time flags (its esm-bundler build asks for them): the playground's React and Vue pages.
  define: { __VUE_OPTIONS_API__: 'true', __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false' },
  plugins: [
    // Only for the CSS that imports Tailwind (playground/tailwind.css): the Tailwind 4 page.
    tailwindcss(),
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
      '@dzcalendar/dom/drag': fileURLToPath(new URL('./packages/dom/src/drag.ts', import.meta.url)),
      '@dzcalendar/core/views': fileURLToPath(new URL('./packages/core/src/views.ts', import.meta.url)),
      '@dzcalendar/angular': fileURLToPath(new URL('./packages/angular/src/index.ts', import.meta.url)),
      '@dzcalendar/core': fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)),
      '@dzcalendar/dom': fileURLToPath(new URL('./packages/dom/src/index.ts', import.meta.url)),
      '@dzcalendar/ical': fileURLToPath(new URL('./packages/ical/src/index.ts', import.meta.url)),
      '@dzcalendar/slots': fileURLToPath(new URL('./packages/slots/src/index.ts', import.meta.url)),
      '@dzcalendar/angular/fullcalendar': fileURLToPath(new URL('./packages/angular/fullcalendar/src/index.ts', import.meta.url)),
      '@dzcalendar/pro-react': fileURLToPath(new URL('./packages/pro-react/src/index.ts', import.meta.url)),
      '@dzcalendar/pro-vue': fileURLToPath(new URL('./packages/pro-vue/src/index.ts', import.meta.url)),
      '@dzcalendar/react': fileURLToPath(new URL('./packages/react/src/index.ts', import.meta.url)),
      '@dzcalendar/vue': fileURLToPath(new URL('./packages/vue/src/index.ts', import.meta.url)),
      '@dzcalendar/compat-fullcalendar': fileURLToPath(new URL('./packages/compat-fullcalendar/src/index.ts', import.meta.url)),
      '@dzcalendar/element/define': fileURLToPath(new URL('./packages/element/src/define.ts', import.meta.url)),
      '@dzcalendar/element': fileURLToPath(new URL('./packages/element/src/index.ts', import.meta.url)),
      '@dzcalendar/pro/export': fileURLToPath(new URL('./packages/pro/src/export-entry.ts', import.meta.url)),
      '@dzcalendar/pro/print': fileURLToPath(new URL('./packages/pro/src/print-entry.ts', import.meta.url)),
      '@dzcalendar/pro/editor': fileURLToPath(new URL('./packages/pro/src/editor-entry.ts', import.meta.url)),
      '@dzcalendar/pro/slots': fileURLToPath(new URL('./packages/pro/src/slots-entry.ts', import.meta.url)),
      '@dzcalendar/pro/model': fileURLToPath(new URL('./packages/pro/src/model-entry.ts', import.meta.url)),
      '@dzcalendar/pro': fileURLToPath(new URL('./packages/pro/src/index.ts', import.meta.url)),
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
        slots: fileURLToPath(new URL('./playground/slots.html', import.meta.url)),
        resources: fileURLToPath(new URL('./playground/resources.html', import.meta.url)),
        element: fileURLToPath(new URL('./playground/element.html', import.meta.url)),
        fullcalendar: fileURLToPath(new URL('./playground/fullcalendar.html', import.meta.url)),
        react: fileURLToPath(new URL('./playground/react.html', import.meta.url)),
        vue: fileURLToPath(new URL('./playground/vue.html', import.meta.url)),
        sehhaty: fileURLToPath(new URL('./playground/sehhaty.html', import.meta.url)),
        timeline: fileURLToPath(new URL('./playground/timeline.html', import.meta.url)),
        dragdrop: fileURLToPath(new URL('./playground/dragdrop.html', import.meta.url)),
        tailwind: fileURLToPath(new URL('./playground/tailwind.html', import.meta.url)),
        unstyled: fileURLToPath(new URL('./playground/unstyled.html', import.meta.url)),
      },
    },
  },
});
