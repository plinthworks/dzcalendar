/**
 * `npm run perf:browser`: first render and DOM size of every view in Chrome (median of 5),
 * on U (10 000 events over a year) and W (10 000 in one week), against
 * perf/browser-budgets.json. The playground is built minified first: the
 * Temporal polyfill slows unminified code down (CLAUDE.md). Exits 1 over budget.
 */
import { build, preview } from 'vite';
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const outDir = join(root, 'node_modules', '.cache', 'dzcalendar', 'playground');
await build({ configFile: join(root, 'vite.config.ts'), build: { outDir, emptyOutDir: true }, logLevel: 'error' });
const server = await preview({ configFile: join(root, 'vite.config.ts'), build: { outDir }, preview: { port: 4613, strictPort: false }, logLevel: 'error' });
const base = server.resolvedUrls.local[0];
const budgets = JSON.parse(readFileSync(join(root, 'perf', 'browser-budgets.json'), 'utf8'));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
let over = 0;
try {
  for (const [name, budget] of Object.entries(budgets)) {
    if (name.startsWith('_')) continue;
    const [view, set] = name.split(':');
    // A third part names a variant; its query is in the budget.
    const query = budget.query ?? '';
    const runs = [];
    for (let i = 0; i < 5; i++) {
      const p = await browser.newPage({ viewport: { width: 1400, height: 950 } });
      await p.goto(new URL(`perf.html?view=${view}&set=${set}${query}`, base).href);
      await p.waitForFunction(() => window.__perf, null, { timeout: 120000 });
      runs.push(await p.evaluate(() => window.__perf));
      await p.close();
    }
    runs.sort((a, b) => a.firstFrame - b.firstFrame);
    const m = runs[2];
    const ok = m.firstFrame <= budget.firstFrame && m.nodes <= budget.nodes;
    if (!ok) over++;
    console.log(`${ok ? '✓' : '✗'} ${name.padEnd(18)} ${String(m.firstFrame).padStart(5)} ms (≤ ${budget.firstFrame})  ${String(m.nodes).padStart(6)} nodes (≤ ${budget.nodes})`);
    if (budget.scroll) {
      // Scrolling (G.2: script ≤ 8 ms a frame): 60 frames, down and along, the script time CDP counts.
      const p = await browser.newPage({ viewport: { width: 1400, height: 950 } });
      await p.goto(new URL(`perf.html?view=${view}&set=${set}${query}`, base).href);
      await p.waitForFunction(() => window.__perf, null, { timeout: 120000 });
      await p.waitForTimeout(300);
      const cdp = await p.context().newCDPSession(p);
      await cdp.send('Performance.enable');
      const script = async () => (await cdp.send('Performance.getMetrics')).metrics.find((x) => x.name === 'ScriptDuration').value;
      const before = await script();
      // The longest frame too: a window mounted every half screen must not hide in the average.
      const longest = await p.evaluate(
        () =>
          new Promise((resolve) => {
            const sc = document.querySelector('.dz-tl__scroller, .dz-tg__body, .dz-dg__body, .dz-list');
            let n = 0;
            let last = performance.now();
            let max = 0;
            const step = (t) => {
              max = Math.max(max, t - last);
              last = t;
              sc.scrollTop += 140;
              sc.scrollLeft += 90;
              if (++n < 60) requestAnimationFrame(step);
              else requestAnimationFrame(() => resolve(Math.round(max)));
            };
            requestAnimationFrame((t) => {
              last = t;
              requestAnimationFrame(step);
            });
          }),
      );
      const perFrame = Math.round((((await script()) - before) * 1000) / 60 * 10) / 10;
      const fine = perFrame <= budget.scroll && longest <= (budget.scrollFrame ?? Infinity);
      if (!fine) over++;
      console.log(`${fine ? '✓' : '✗'} ${(name + ' scroll').padEnd(18)} ${String(perFrame).padStart(5)} ms script a frame (≤ ${budget.scroll}), longest frame ${longest} ms (≤ ${budget.scrollFrame ?? '—'})`);
      await p.close();
    }
    if (budget.update) {
      // One event changed (G.2): the time to the next frame, and the layouts it forced (G.3: ≤ 1).
      const p = await browser.newPage({ viewport: { width: 1400, height: 950 } });
      await p.goto(new URL(`perf.html?view=${view}&set=${set}${query}`, base).href);
      await p.waitForFunction(() => window.__perf, null, { timeout: 120000 });
      await p.waitForTimeout(300);
      const cdp = await p.context().newCDPSession(p);
      await cdp.send('Performance.enable');
      const layouts = async () => (await cdp.send('Performance.getMetrics')).metrics.find((x) => x.name === 'LayoutCount').value;
      const before = await layouts();
      const ms = await p.evaluate(
        () =>
          new Promise((resolve) => {
            const cal = window.__dz;
            const ev = cal.kernel.store.snapshot.getEvent('e5');
            const t0 = performance.now();
            cal.run({ type: 'event.update', id: 'e5', patch: { title: `${ev.title}!` } });
            requestAnimationFrame(() => resolve(Math.round(performance.now() - t0)));
          }),
      );
      const forced = (await layouts()) - before;
      const fine = ms <= budget.update && forced <= 1;
      if (!fine) over++;
      console.log(`${fine ? '✓' : '✗'} ${(name + ' update').padEnd(18)} ${String(ms).padStart(5)} ms (≤ ${budget.update})  ${forced} layout(s) (≤ 1)`);
      await p.close();
    }
  }
} finally {
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}
process.exit(over ? 1 : 0);
