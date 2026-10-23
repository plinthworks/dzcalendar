/**
 * `npm run bench:public`: DzCalendar against FullCalendar 6.1 and 7.1, the
 * same scenarios on the same machine, in Chrome, on minified builds
 * (bench-public/). FullCalendar is installed only there and driven through
 * its public API (CLEANROOM). Writes site/benchmark.json and
 * docs/benchmark.md (results and protocol).
 */
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { extname, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { cpus, totalmem } from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('..', import.meta.url));
const bench = join(root, 'bench-public');
const dist = join(bench, 'dist');
const RUNS = Number(process.env.RUNS ?? 7);
const PORT = Number(process.env.PORT ?? 4620);
const LIBS = ['dz', 'fc6', 'fc7'];

/** `--report`: the page written again from site/benchmark.json, nothing measured. */
const REPORT = process.argv.includes('--report');
const SCENARIOS = [
  { key: 'month', label: 'Month, 10 000 events in the year (October 2026)', view: 'dayGridMonth', date: '2026-10-21' },
  { key: 'week', label: 'Week, 10 000 events in the year (19–25 October 2026)', view: 'timeGridWeek', date: '2026-10-21' },
  { key: 'list', label: 'List of the week, 10 000 events in the year', view: 'listWeek', date: '2026-10-21' },
];
const result = REPORT ? JSON.parse(readFileSync(join(root, 'site', 'benchmark.json'), 'utf8')) : await measure();
report(result);

async function measure() {
for (const d of ['fc6', 'fc7']) if (!existsSync(join(bench, d, 'node_modules'))) execFileSync('npm', ['ci', '--no-audit', '--no-fund', '--loglevel=error'], { cwd: join(bench, d), stdio: 'inherit' });
execFileSync('npx', ['vite', 'build', '--config', 'bench-public/vite.config.ts'], { cwd: root, stdio: 'inherit' });

let commit = 'working tree';
try {
  commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root }).toString().trim();
} catch {}
const versions = {
  dz: `@ ${commit}`,
  fc6: JSON.parse(readFileSync(join(bench, 'fc6/node_modules/@fullcalendar/core/package.json'), 'utf8')).version,
  fc7: JSON.parse(readFileSync(join(bench, 'fc7/node_modules/fullcalendar/package.json'), 'utf8')).version,
};

// What each page ships: its own scripts and styles, gzipped (the shared scenario code left out).
const assets = join(dist, 'assets');
const size = Object.fromEntries(
  LIBS.map((lib) => {
    const html = readFileSync(join(dist, lib, 'index.html'), 'utf8');
    const files = [...html.matchAll(/assets\/([^"]+\.(?:js|css))/g)].map((m) => m[1]).filter((f) => !f.startsWith('scenarios-'));
    return [lib, files.reduce((n, f) => n + gzipSync(readFileSync(join(assets, f)), { level: 9 }).length, 0)];
  }),
);

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = createServer((req, res) => {
  const path = join(dist, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  const file = existsSync(path) && statSync(path).isDirectory() ? join(path, 'index.html') : path;
  if (!file.startsWith(dist) || !existsSync(file)) return void res.writeHead(404).end();
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
});
await new Promise((ok, fail) => {
  server.once('error', (e) => fail(new Error(`port ${PORT}: ${e.code ?? e.message} (another benchmark running?)`)));
  server.listen(PORT, ok);
});

const browser = await chromium.launch({ channel: 'chrome' });
const chrome = browser.version();

/** A fresh page of `lib`, its CDP session for the heap and the main thread's work. */
async function open(lib, query = '') {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://localhost:${PORT}/${lib}/${query}`);
  await page.waitForFunction(() => 'bench' in window);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  return { page, cdp, errors };
}
const heap = async (cdp) => {
  await cdp.send('HeapProfiler.collectGarbage');
  return (await cdp.send('Runtime.getHeapUsage')).usedSize;
};
/** Seconds of main-thread tasks so far (scripts, style, layout, paint): what an operation cost, whatever the frame rate. */
const work = async (cdp) => (await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === 'TaskDuration').value * 1000;
async function timed(cdp, page, fn, arg) {
  const w0 = await work(cdp);
  const ms = await page.evaluate(fn, arg);
  return { ms, work: (await work(cdp)) - w0 };
}

const KEYS = ['first', 'firstWork', 'loaded', 'kernel', 'nodes', 'shown', 'update', 'updateWork', 'next', 'nextWork', 'heap'];
const runs = Object.fromEntries(LIBS.map((l) => [l, Object.fromEntries(SCENARIOS.map((s) => [s.key, Object.fromEntries(KEYS.map((k) => [k, []]))]))]));
// Libraries in turn within each round (not one after the other): what drifts on the machine drifts for all.
for (let i = 0; i < RUNS; i++) {
  for (const s of SCENARIOS) {
    for (const lib of LIBS) {
      const r = runs[lib][s.key];
      const { page, cdp, errors } = await open(lib);
      await page.evaluate(() => void (window.__ev = window.events(10000)));
      const before = await heap(cdp);
      const first = await timed(cdp, page, async ({ view, date }) => {
        const t = performance.now();
        await window.bench.mount({ view, date, zone: 'Europe/Paris', events: window.__ev });
        return performance.now() - t;
      }, s);
      r.first.push(first.ms);
      r.firstWork.push(first.work);
      // Until every event is loaded (DzCalendar loads beyond the shown period while the page is idle): what follows is measured after it.
      r.loaded.push(first.ms + (await page.evaluate(async () => {
        const t = performance.now();
        await window.bench.settled?.();
        return performance.now() - t;
      })));
      if (lib === 'dz') r.kernel.push(await page.evaluate(() => window.kernelMs()));
      r.heap.push((await heap(cdp)) - before);
      r.nodes.push(await page.evaluate(() => document.getElementById('cal').querySelectorAll('*').length));
      r.shown.push(await page.evaluate(() => window.shownEvents()));
      // An event shown in the week of 19 October: the first of the generated ones on the 21st.
      const up = await timed(cdp, page, async () => {
        const e = window.__ev.find((x) => !x.allDay && x.start >= '2026-10-21' && x.start < '2026-10-22');
        const t = performance.now();
        await window.bench.update(e.id, 'Changed', e.start.replace(/T\d\d/, 'T08'), e.end.replace(/T\d\d/, 'T09'));
        return performance.now() - t;
      });
      r.update.push(up.ms);
      r.updateWork.push(up.work);
      const nx = await timed(cdp, page, async () => {
        const t = performance.now();
        for (let k = 0; k < 5; k++) await window.bench.next();
        return (performance.now() - t) / 5;
      });
      r.next.push(nx.ms);
      r.nextWork.push(nx.work / 5);
      if (errors.length) throw new Error(`${lib} ${s.key}: ${errors[0]}`);
      await page.close();
    }
  }
  console.log(`round ${i + 1}/${RUNS}`);
}
const stat = (xs) => (xs.length === 0 ? null : { median: [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)], min: Math.min(...xs), max: Math.max(...xs) });
const perf = Object.fromEntries(LIBS.map((l) => [l, Object.fromEntries(SCENARIOS.map((s) => [s.key, Object.fromEntries(KEYS.map((k) => [k, stat(runs[l][s.key][k])]))]))]));

// Correctness: an event across a clock change, in hours of the day's own drawing.
const correct = {};
// DzCalendar twice: its default wall axis (the transition marked, rows aligned) and its elapsed axis (real time to scale).
const CORRECT = [['dz', 'dz', ''], ['dzElapsed', 'dz', '?axis=elapsed'], ['fc6', 'fc6', ''], ['fc7', 'fc7', '']];
for (const [key, lib, query] of CORRECT) {
  correct[key] = [];
  const { page, errors } = await open(lib, query);
  const cases = await page.evaluate(() => window.DST_CASES);
  for (const c of cases) {
    const drawn = await page.evaluate(async (c) => {
      window.bench.destroy();
      const ev = (id, [start, end]) => ({ id, title: id, start, end });
      await window.bench.mount({ view: c.view, date: c.date, zone: c.zone, events: [ev('x', c.event), ev('ref', c.ref), ev('ref2', c.ref2)] });
      const x = window.drawnHeight('x');
      const one = window.drawnHeight('ref');
      const two = window.drawnHeight('ref2');
      // An hour is two hours' height minus one's; what each piece loses (a margin, a border) is an hour minus one hour's piece.
      const hour = two.height - one.height;
      if (!(hour > 0) || x.pieces === 0) return null;
      return (x.height + x.pieces * (hour - one.height)) / hour;
    }, c);
    correct[key].push({ name: c.name, hours: c.hours, drawn: drawn === null ? null : Math.round(drawn * 100) / 100 });
  }
  if (errors.length) throw new Error(`${key} correctness: ${errors[0]}`);
  await page.close();
}
await browser.close();
server.close();

const machine = `${cpus()[0].model}, ${cpus().length} cores, ${Math.round(totalmem() / 2 ** 30)} GB, Chrome ${chrome}`;
const date = new Date().toISOString().slice(0, 10);
const result = { date, machine, runs: RUNS, versions, size, perf, correct };
writeFileSync(join(root, 'site', 'benchmark.json'), JSON.stringify(result, null, 2) + '\n');
return result;
}

function report({ date, machine, runs: RUNS, versions, size, perf, correct }) {
const NAME = { dz: `DzCalendar ${versions.dz}`, fc6: `FullCalendar ${versions.fc6}`, fc7: `FullCalendar ${versions.fc7}` };
const n = (x, d = 1) => x.toFixed(d);
/** The median, and the spread of the runs. */
const ms = (st) => `${n(st.median)} ms <sub>${n(st.min)}–${n(st.max)}</sub>`;
const kb = (x) => `${(x / 1000).toFixed(1)} kB`;
const mb = (st) => `${(st.median / 1e6).toFixed(1)} MB`;
const row = (label, f) => `| ${label} | ${LIBS.map((l) => f(l)).join(' | ')} |`;
const head = `| | ${LIBS.map((l) => NAME[l]).join(' | ')} |\n|---|${LIBS.map(() => '---').join('|')}|`;
const kernelShare = Math.round((100 * perf.dz.month.kernel.median) / perf.dz.month.first.median);
const md = `# Benchmark — DzCalendar, FullCalendar 6 and 7

Measured on ${date}, ${machine}. Median of ${RUNS} runs (the smallest and
largest in small type), each in a fresh page, the libraries in turn within each
round. Generated by \`npm run bench:public\` (\`scripts/bench-public.mjs\`,
\`bench-public/\`); the raw numbers are in \`site/benchmark.json\`. DzCalendar
is not released yet: these are numbers of a work in progress, measured to be
improved.

## Protocol

- The same 10 000 events for every library, generated from a seed over 2026
  (90 % timed, 30 to 120 minutes between 07:00 and 19:00; 10 % all-day, 1 to
  3 days), the calendar in \`Europe/Paris\`, 1 200 × 800 px, editable and
  selectable; in the month at most 3 events a day before "+N", in the week no
  limit. How many events each one shows is in the tables (the libraries do
  not cut the same way).
- Each library as an application ships it: built by Vite, minified, its
  stylesheets included. FullCalendar 6 with its Luxon connector (named zones
  need it); FullCalendar 7 with temporal-polyfill and its classic theme;
  DzCalendar with its theme and the list view's import. Each ships a Temporal
  polyfill except FullCalendar 6.
- FullCalendar is installed only in \`bench-public/\` (lockfiles there) and
  used through its public API — its code is never read (CLEANROOM.md).
- **First render**: from creating the calendar to the second animation frame
  after it (what the browser has painted). **Update**: one event's title and
  hours — FullCalendar takes two calls (\`setProp\`, \`setDates\`), DzCalendar
  one command. **Navigation**: "next" five times, per step. Each also as
  **main-thread work**: the time Chrome's main thread spent on tasks
  (scripts, style, layout, paint) during it — the frame-rate floor of the
  first measure (17 to 33 ms) does not apply to it. **Heap**: the JavaScript
  heap after a garbage collection, minus the same before creating the
  calendar (the DOM's own memory is not in it). **Size**: the page's own
  scripts and styles, gzipped.

## Reading the numbers

- DzCalendar reads, checks and indexes every event — with more than 2 000
  events, those of the shown period (and a week either side) before the first
  frame, the others while the page is idle, by week (the view does not redraw
  for them; any read of everything finishes them first). Its kernel is
  ${kernelShare} % of its month's first render here, measured apart; "All
  events loaded" is when the rest is in, and the update, the navigation and the
  heap are measured after it. What the indexing buys: an update, a query or an
  undo touches only what changed, and nothing is guessed silently.
- "Elements drawn" follows each library's way of cutting a day (lanes, "+N",
  pieces): read it with "events shown".

## Speed and weight

${SCENARIOS.map((sc) => `### ${sc.label}

${head}
${row('First render', (l) => ms(perf[l][sc.key].first))}
${row('— main-thread work', (l) => ms(perf[l][sc.key].firstWork))}
${row('All events loaded', (l) => ms(perf[l][sc.key].loaded))}
${row('Events shown', (l) => String(perf[l][sc.key].shown.median))}
${row('Elements drawn', (l) => String(perf[l][sc.key].nodes.median))}
${row('Update one event', (l) => ms(perf[l][sc.key].update))}
${row('— main-thread work', (l) => ms(perf[l][sc.key].updateWork))}
${row('Navigate (next)', (l) => ms(perf[l][sc.key].next))}
${row('— main-thread work', (l) => ms(perf[l][sc.key].nextWork))}
${row('Heap (JS)', (l) => mb(perf[l][sc.key].heap))}`).join('\n\n')}

### Size

${head}
${row('Scripts and styles, gzipped', (l) => kb(size[l]))}

## Days that are not 24 hours long

An event across the clock change. **The measure is the length drawn at the
scale of real time**: the event's drawn height in hours of that day's own
drawing (two references the same day, one and two hours long, give an hour's
height and what each library takes off a piece), against its real length
from the zones' published rules.

That measure favours an axis drawn at the scale of real time. DzCalendar's
default **wall** axis does not: it keeps every day's rows aligned with the
others (as Google, Outlook and Apple do) and marks the transition instead —
the hour that does not exist is a hatched band saying so, the repeated hour
is drawn twice, and an event across it carries its real length in a badge.
On this measure it is right where the hours drawn and the hours lived agree
(the 25-hour day, Apia's missing day) and not on the 23-hour and
23 h 30 days, as FullCalendar. Its **elapsed** axis
(\`timeGrid: { axis: 'elapsed' }\`) draws real time to scale. The marking
itself is not measured here.

| Day | Real length | ${NAME.dz} (wall) | ${NAME.dz} (elapsed) | ${NAME.fc6} | ${NAME.fc7} |
|---|---|---|---|---|---|
${correct.dz.map((c, i) => `| ${c.name} | ${c.hours} h | ${['dz', 'dzElapsed', 'fc6', 'fc7'].map((l) => { const d = correct[l][i].drawn; return d === null ? 'not drawn' : `${d} h${Math.abs(d - c.hours) < 0.05 ? ' ✓' : ''}`; }).join(' | ')} |`).join('\n')}
`;
writeFileSync(join(root, 'docs', 'benchmark.md'), md);
console.log(md);
}
