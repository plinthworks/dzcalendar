import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

/** The playground: http://localhost:4600 (tzslot's runs on 4500). */
export default defineConfig({
  root: 'playground',
  server: { port: 4600, strictPort: true },
  resolve: {
    alias: {
      '@dzcalendar/core': fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)),
      '@dzcalendar/dom': fileURLToPath(new URL('./packages/dom/src/index.ts', import.meta.url)),
      '@dzcalendar/motion-gsap': fileURLToPath(new URL('./packages/motion-gsap/src/index.ts', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL('./playground/index.html', import.meta.url)),
        dst: fileURLToPath(new URL('./playground/dst.html', import.meta.url)),
      },
    },
  },
});
