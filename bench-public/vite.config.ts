import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import root from '../vite.config';

const page = (p: string) => fileURLToPath(new URL(`./${p}/index.html`, import.meta.url));

// Minified, as an application ships them; DzCalendar from the repository's sources (the playground's aliases).
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  resolve: { alias: (root as { resolve: { alias: Record<string, string> } }).resolve.alias },
  build: { outDir: 'dist', emptyOutDir: true, minify: true, sourcemap: false, rollupOptions: { input: { dz: page('dz'), fc6: page('fc6'), fc7: page('fc7') } } },
  logLevel: 'warn',
});
