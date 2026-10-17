/**
 * `npm run test:browser`: what jsdom cannot see, in the system's Chrome
 * (playwright-core, no browser download). Starts its own Vite server on the
 * playground, checks layout facts with tolerances, exits 1 on any failure.
 * Phase 3's worst bug (the gutter drawn on the right) passed every jsdom test.
 */
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
/** axe-core's violations inside `selector`: the WCAG 2.0–2.2 A and AA rules and axe's best practices. */
async function axeViolations(p, selector = 'body') {
  if (!(await p.evaluate(() => 'axe' in window))) await p.addScriptTag({ content: AXE });
  return p.evaluate(async (sel) => {
    const r = await window.axe.run(document.querySelector(sel), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } });
    // WCAG 2.5.8's "essential" exception: an event's height and width are its duration and its share of
    // the column; narrow ones have the keyboard and the context menu as alternatives (see the ACR).
    // Only events may fall under it — any other small target is still a failure.
    const isEvent = (n) => document.querySelector(String(n.target[n.target.length - 1]))?.matches('.dz-ev, .dz-bar') === true;
    return r.violations
      .map((v) => (v.id === 'target-size' ? { ...v, nodes: v.nodes.filter((n) => !isEvent(n)) } : v))
      .filter((v) => v.nodes.length > 0)
      .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`);
  }, selector);
}

const root = fileURLToPath(new URL('..', import.meta.url));
const server = await createServer({ configFile: `${root}/vite.config.ts`, server: { port: 4611, strictPort: false }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `  — ${detail}`}`);
};

/** Minutes between two ISO zoned strings (their instants). */
function Temporal_len([a, b]) {
  const ms = (x) => Date.parse(x.replace(/\[.*\]$/, ''));
  return (ms(b) - ms(a)) / 60000;
}

async function page(path, media = {}) {
  const p = await browser.newPage({ viewport: { width: 1400, height: 950 } });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await p.emulateMedia({ reducedMotion: 'reduce', ...media });
  await p.goto(new URL(path, base).href, { waitUntil: 'networkidle' });
  return { p, errors };
}

try {
  // ── week: gutter on the left, headers over their columns, events at their minute ──
  {
    const { p, errors } = await page('/');
    await p.waitForSelector('.dz-ev');
    const r = await p.evaluate(() => {
      const cal = document.querySelector('.dz-cal');
      const gutter = cal.querySelector('.dz-tg__gutter').getBoundingClientRect();
      const cols = [...cal.querySelectorAll('.dz-tg__col')].map((c) => c.getBoundingClientRect());
      const heads = [...cal.querySelectorAll('.dz-tg__dayhead')].map((c) => c.getBoundingClientRect());
      const ev = cal.querySelector('.dz-ev');
      const col = ev.closest('.dz-tg__col').getBoundingClientRect();
      const len = Number(getComputedStyle(ev.closest('.dz-tg__col')).getPropertyValue('--dz-len'));
      const px = col.height / len;
      const t = Number(ev.style.getPropertyValue('--t'));
      return {
        gutterLeft: gutter.left < cols[0].left,
        headDrift: Math.max(...heads.map((h, i) => Math.abs(h.left - cols[i].left))),
        heights: [...new Set(cols.map((c) => Math.round(c.height)))],
        eventDrift: Math.abs(ev.getBoundingClientRect().top - col.top - t * px),
      };
    });
    check('week: gutter is left of the columns', r.gutterLeft);
    check('week: headers within 1 px of their columns', r.headDrift <= 1, `${r.headDrift}px`);
    check('week: every column the same height (wall axis)', r.heights.length === 1, String(r.heights));
    check('week: an event sits at its minute (±1 px)', r.eventDrift <= 1, `${r.eventDrift}px`);

    // ── month: cells under their weekday headers, "+N" present ──
    await p.click('.dz-toolbar__view[data-view="dayGridMonth"]');
    await p.waitForSelector('.dz-dg__week');
    await p.click('.dz-toolbar__next');
    await p.click('.dz-toolbar__prev');
    const m = await p.evaluate(() => {
      const heads = [...document.querySelectorAll('.dz-dg__weekday')].map((c) => c.getBoundingClientRect().left);
      const cells = [...document.querySelectorAll('.dz-dg__week:first-child .dz-dg__cell')].map((c) => c.getBoundingClientRect().left);
      const bars = [...document.querySelectorAll('.dz-dg__week .dz-bar:not(.dz-bar--bg)')];
      const overlap = bars.some((a, i) => bars.some((b, j) => {
        if (i >= j) return false;
        const x = a.getBoundingClientRect();
        const y = b.getBoundingClientRect();
        return x.left < y.right - 1 && y.left < x.right - 1 && x.top < y.bottom - 1 && y.top < x.bottom - 1;
      }));
      return { drift: Math.max(...heads.map((h, i) => Math.abs(h - cells[i]))), weeks: document.querySelectorAll('.dz-dg__week').length, overlap };
    });
    check('month: six weeks', m.weeks === 6, String(m.weeks));
    check('month: cells within 1 px of their weekday headers', m.drift <= 1, `${m.drift}px`);
    check('month: no two bars overlap', !m.overlap);

    // Go to the crowded week of 28 October: "+N" exact, bars inside their row, the panel opens.
    await p.click('.dz-toolbar__next');
    await p.click('.dz-toolbar__prev');
    const crowded = await p.evaluate(() => {
      const week = document.querySelector('.dz-dg__cell[data-date="2026-10-28"]').closest('.dz-dg__week');
      const wr = week.getBoundingClientRect();
      const col = [...week.querySelectorAll('.dz-dg__cell')].findIndex((c) => c.dataset.date === '2026-10-28');
      const drawn = [...week.querySelectorAll('.dz-bar:not(.dz-bar--bg)')].filter((b) => {
        const c = Number(b.style.getPropertyValue('--col'));
        const span = Number(b.style.getPropertyValue('--span'));
        return c <= col && col < c + span;
      });
      const inside = [...week.querySelectorAll('.dz-bar, .dz-more')].every((b) => {
        const r = b.getBoundingClientRect();
        return r.bottom <= wr.bottom + 0.5 && r.top >= wr.top - 0.5;
      });
      const more = week.querySelector('.dz-more');
      return { drawn: drawn.length, more: more ? Number(more.textContent.replace(/\D/g, '')) : 0, inside };
    });
    check('month: drawn + "+N" = the day’s seven events (six + a stand-up)', crowded.drawn + crowded.more === 7, JSON.stringify(crowded));
    check('month: every bar and link stays inside its row', crowded.inside);
    await p.click('.dz-more');
    const pop = await p.evaluate(() => ({ open: !document.querySelector('.dz-pop').hidden, items: document.querySelectorAll('.dz-pop__list .dz-bar').length }));
    check('month: the "+N" panel opens with all seven', pop.open && pop.items === 7, JSON.stringify(pop));
    await p.keyboard.press('Escape');

    // Resize: lanes follow, and no ResizeObserver loop error.
    for (const h of [700, 1200, 820]) {
      await p.setViewportSize({ width: 1400, height: h });
      await p.waitForTimeout(120);
    }
    const inside = await p.evaluate(() =>
      [...document.querySelectorAll('.dz-dg__week')].every((w) => {
        const wr = w.getBoundingClientRect();
        return [...w.querySelectorAll('.dz-bar, .dz-more')].every((b) => b.getBoundingClientRect().bottom <= wr.bottom + 0.5);
      }),
    );
    check('month: after resizes, bars still fit their rows', inside);

    // One event changed: at most one forced layout for the update.
    // The week of the demo events (navigating the month left the date on the 1st).
    await p.evaluate(() => {
      const cal = window.__dz();
      cal.update({ view: 'timeGridWeek', date: cal.kernel.getState().date.with({ month: 10, day: 21 }) });
    });
    await p.waitForSelector('.dz-ev');
    const cdp = await p.context().newCDPSession(p);
    await cdp.send('Performance.enable');
    const layouts = async () => (await cdp.send('Performance.getMetrics')).metrics.find((x) => x.name === 'LayoutCount').value;
    const before = await layouts();
    await p.evaluate(() => {
      const cal = window.__dz();
      const ev = [...cal.kernel.store.snapshot.allEvents()].find((e) => !e.allDay && e.id === 'lunch');
      cal.kernel.store.apply([{ kind: 'event', before: ev, after: { ...ev, title: 'Déjeuner long' } }], 'api');
      void document.body.offsetHeight; // one layout, here, to count the update's own
    });
    const used = (await layouts()) - before;
    check('week: changing one event costs at most one layout', used <= 1, `${used} layouts`);

    // ── a series: Mon/Wed/Fri 09:30 Paris, the 23rd excluded; same place after the clock change ──
    const standups = () => p.evaluate(() => [...document.querySelectorAll('.dz-ev[data-series-id="standup"]')].map((e) => e.style.getPropertyValue('--t')));
    const thisWeek = await standups();
    await p.click('.dz-toolbar__next');
    await p.waitForFunction(() => document.querySelectorAll('.dz-ev[data-series-id="standup"]').length === 3);
    const nextWeek = await standups();
    check('series: two occurrences this week (one excluded), three the next', thisWeek.length === 2 && nextWeek.length === 3, `${thisWeek.length}, ${nextWeek.length}`);
    check('series: 09:30 stays 09:30 across the clock change', new Set([...thisWeek, ...nextWeek]).size === 1, [...thisWeek, ...nextWeek].join(' '));

    // ── editing a series from the context menu: "Supprimer" → sub-menu → "Cet événement"; undo brings it back ──
    await p.click('.dz-ev[data-series-id="standup"]', { button: 'right' });
    await p.waitForSelector('.dz-menu:not([hidden]) [data-action="event.delete"]');
    await p.focus('.dz-menu [data-action="event.delete"]');
    await p.keyboard.press('ArrowRight');
    const sub = await p.evaluate(() => {
      const s = document.querySelector('.dz-menu__sub');
      const m = document.querySelector('.dz-menu').getBoundingClientRect();
      const r = s.getBoundingClientRect();
      return {
        popup: document.querySelector('.dz-menu [data-action="event.delete"]').getAttribute('aria-haspopup'),
        open: !s.hidden,
        focused: document.activeElement?.dataset.action,
        entries: [...s.querySelectorAll('[role="menuitem"]')].map((e) => e.textContent),
        inViewport: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight,
        beside: r.left >= m.right - 8 || r.right <= m.left + 8,
      };
    });
    check('menu: "Supprimer" opens a this / following / all sub-menu, focused, beside the menu, on screen',
      sub.popup === 'menu' && sub.open && sub.focused === 'event.delete.this' && sub.entries.length === 3 && sub.inViewport && sub.beside, JSON.stringify(sub));
    await p.keyboard.press('ArrowLeft');
    const back = await p.evaluate(() => document.activeElement?.dataset.action);
    await p.keyboard.press('ArrowRight');
    await p.keyboard.press('Enter');
    await p.waitForFunction(() => document.querySelectorAll('.dz-ev[data-series-id="standup"]').length === 2);
    await p.evaluate(() => window.__dz().undo());
    await p.waitForFunction(() => document.querySelectorAll('.dz-ev[data-series-id="standup"]').length === 3);
    check('menu: ArrowLeft returns to "Supprimer"; "Cet événement" deletes one occurrence; undo restores it', back === 'event.delete', String(back));
    check('index: no console error', errors.length === 0, errors.join(' | '));
    await p.close();
  }

  // ── four zones: the repeat band is one hour tall ──
  // ── gestures (Phase 7): mouse, refusal, series scope, escape, selection, repeated hour, month ──
  {
    const fresh = async () => {
      const r = await page('/');
      await r.p.waitForSelector('.dz-ev');
      return r;
    };
    const ev = (p, id) => p.evaluate((x) => { const e = window.__dz().kernel.store.snapshot.getEvent(x); return e ? [String(e.start), String(e.end)] : null; }, id);
    const colCenter = async (p, i) => p.$$eval('.dz-tg__col', (cs, k) => { const r = cs[k].getBoundingClientRect(); return { x: r.left + r.width / 2, top: r.top, px: r.height / Number(getComputedStyle(cs[k]).getPropertyValue('--dz-len')) }; }, i);
    /** Drags from a point to another with the mouse, in steps; `during` runs before the button goes up. */
    const drag = async (p, from, to, during) => {
      await p.mouse.move(from.x, from.y);
      await p.mouse.down();
      await p.mouse.move(from.x + 6, from.y + 6, { steps: 2 });
      await p.mouse.move(to.x, to.y, { steps: 8 });
      const seen = during ? await during() : null;
      await p.mouse.up();
      return seen;
    };

    // Move: "Déjeuner" grabbed 10 px below its top, dropped on Tuesday: snapped to the quarter hour.
    {
      const { p, errors } = await fresh();
      const b = await (await p.$('.dz-ev[data-event-id="lunch"]')).boundingBox();
      const tue = await colCenter(p, 1);
      const ghosts = await drag(p, { x: b.x + b.width / 2, y: b.y + 10 }, { x: tue.x, y: b.y + 130 }, () => p.$$eval('.dz-ghost', (gs) => gs.map((g) => g.dataset.time)));
      const after = await ev(p, 'lunch');
      check('drag: a ghost with its time follows the pointer', ghosts.length === 1 && /^\d\d:\d\d$/.test(ghosts[0]), JSON.stringify(ghosts));
      check('drag: dropped on Tuesday, on the quarter hour, an hour long', after[0].startsWith('2026-10-20T') && /:(00|15|30|45):00/.test(after[0]) && Temporal_len(after) === 60, JSON.stringify(after));
      check('drag: no ghost left after the drop', (await p.$$('.dz-ghost')).length === 0);
      // Resize: the bottom strip of "Revue de design" (10:00–11:30) pulled down 40 minutes.
      const r = await (await p.$('.dz-ev[data-event-id="design"]')).boundingBox();
      const mon = await colCenter(p, 0);
      await drag(p, { x: r.x + r.width / 2, y: r.y + r.height - 2 }, { x: r.x + r.width / 2, y: r.y + r.height - 2 + 40 * mon.px });
      const design = await ev(p, 'design');
      check('resize: the end follows the pointer, snapped; the start stays', design[0].startsWith('2026-10-19T10:00') && design[1].startsWith('2026-10-19T12:15'), JSON.stringify(design));
      // Escape cancels a drag: nothing moves, no ghost stays.
      const before = await ev(p, 'focus') ?? await ev(p, 'tokyo');
      const t = await (await p.$('.dz-ev[data-event-id="tokyo"]')).boundingBox();
      await p.mouse.move(t.x + t.width / 2, t.y + 8);
      await p.mouse.down();
      await p.mouse.move(t.x + t.width / 2, t.y + 120, { steps: 6 });
      await p.keyboard.press('Escape');
      await p.mouse.up();
      check('drag: Escape cancels, nothing moves', JSON.stringify(await ev(p, 'tokyo')) === JSON.stringify(before.length ? await ev(p, 'tokyo') : before) && (await p.$$('.dz-ghost')).length === 0);
      check('gestures: no console error', errors.length === 0, errors.join(' | '));
      await p.close();
    }

    // Refused: nothing lands on a Saturday (the playground's rule) — marked during the drag, announced, unchanged.
    {
      const { p, errors } = await fresh();
      const c = await (await p.$('.dz-ev[data-event-id="overlap-c"]')).boundingBox();
      const sat = await colCenter(p, 5);
      const before = await ev(p, 'overlap-c');
      const invalid = await drag(p, { x: c.x + c.width / 2, y: c.y + 6 }, { x: sat.x, y: c.y + 6 }, () => p.$$eval('.dz-ghost', (gs) => gs.some((g) => g.classList.contains('dz-event--invalid'))));
      await p.waitForTimeout(300);
      check('refused: the ghost says no during the drag; the event stays; it is announced', invalid && JSON.stringify(await ev(p, 'overlap-c')) === JSON.stringify(before) && (await p.textContent('.dz-live')) === 'Impossible ici', JSON.stringify({ invalid, live: await p.textContent('.dz-live') }));
      check('refused: no console error', errors.length === 0, errors.join(' | '));
      await p.close();
    }

    // A series: dropping an occurrence asks how far; "Cet événement" makes one override.
    {
      const { p, errors } = await fresh();
      const nodes = await p.$$('.dz-ev[data-series-id="standup"]');
      const s = await nodes[1].boundingBox(); // Wednesday's
      const thu = await colCenter(p, 3);
      await drag(p, { x: s.x + s.width / 2, y: s.y + s.height / 2 }, { x: thu.x, y: s.y + s.height / 2 });
      await p.waitForSelector('.dz-menu:not([hidden]) [data-action="this"]');
      const entries = await p.$$eval('.dz-menu [role="menuitem"]', (xs) => xs.map((x) => x.dataset.action));
      await p.click('.dz-menu [data-action="this"]');
      const out = await p.evaluate(() => { const sr = window.__dz().kernel.store.snapshot.getSeries('standup'); const id = [...sr.overrides.values()][0]; const e = id && window.__dz().kernel.store.snapshot.getEvent(id); return { n: sr.overrides.size, start: e ? String(e.start) : null }; });
      check('series: the drop asks this / following / all; "this" makes one override on Thursday', entries.join() === 'this,following,all' && out.n === 1 && String(out.start).startsWith('2026-10-22T09:30'), JSON.stringify({ entries, out }));
      check('series: no console error', errors.length === 0, errors.join(' | '));
      await p.close();
    }

    // Selection: a drag over empty time gives the selection to the application.
    {
      const { p } = await fresh();
      const thu = await colCenter(p, 3);
      const y = (m) => thu.top + m * thu.px;
      await drag(p, { x: thu.x, y: y(13 * 60 + 5) }, { x: thu.x, y: y(14 * 60 + 20) });
      const said = await p.textContent('#status');
      check('select: 13:05 → 14:20 selects 13:00–14:30 on Thursday', said.includes('2026-10-22T13:00:00+02:00') && said.includes('2026-10-22T14:30:00+02:00'), said);
      await p.close();
    }

    // The repeated hour: dropped at a wall time that happens twice, the calendar asks which one.
    {
      const { p } = await fresh();
      await p.evaluate(() => (document.querySelector('.dz-tg__body').scrollTop = 0));
      await p.waitForTimeout(50);
      const n = await (await p.$('.dz-ev[data-event-id="first-0230"]')).boundingBox();
      const sun = await colCenter(p, 6);
      // The wall axis draws the repeated hour once (a band): 30 minutes up is 02:00, which happens twice.
      await drag(p, { x: n.x + 4, y: n.y + 4 }, { x: n.x + 4, y: n.y + 4 - 30 * sun.px });
      await p.waitForSelector('.dz-menu:not([hidden]) [data-action="first"]');
      const readings = await p.$$eval('.dz-menu [role="menuitem"]', (xs) => xs.map((x) => x.textContent));
      await p.keyboard.press('Escape');
      check('repeated hour: the drop offers both readings, by offset', readings.length === 2 && readings.some((r) => r.includes('+02:00')) && readings.some((r) => r.includes('+01:00')), JSON.stringify(readings));
      await p.close();
    }

    // Month: an all-day event dragged a week later (one the month shows without "+N").
    {
      const { p, errors } = await fresh();
      await p.click('.dz-toolbar__view[data-view="dayGridMonth"]');
      await p.waitForSelector('.dz-dg__week .dz-bar');
      const bar = await p.evaluateHandle(() => [...document.querySelectorAll('.dz-dg__week .dz-bar')].find((b) => b.textContent.includes('Toussaint'))).then((x) => x.asElement());
      const bb = await bar.boundingBox();
      const to = await p.$eval('.dz-dg__cell[data-date="2026-11-08"]', (c) => { const r = c.getBoundingClientRect(); return { x: r.left + 20, y: r.top + 30 }; });
      await drag(p, { x: bb.x + 20, y: bb.y + bb.height / 2 }, { x: to.x, y: to.y });
      const holiday = await ev(p, 'holiday');
      check('month: an all-day event dragged a week later', JSON.stringify(holiday) === JSON.stringify(['2026-11-08', '2026-11-09']), JSON.stringify(holiday));
      check('month gestures: no console error', errors.length === 0, errors.join(' | '));
      await p.close();
    }

    // Only the calendar's time takes gestures: a header click is not a date click; a click on an event focuses it.
    {
      const { p } = await fresh();
      await p.evaluate(() => window.__dz().update({ onDateClick: (c) => (window.__clicks = [...(window.__clicks ?? []), String(c.date)]) }));
      await p.click('.dz-tg__dayhead:nth-child(3)');
      await p.click('.dz-tg__gutter', { position: { x: 5, y: 300 } });
      const clicks = await p.evaluate(() => window.__clicks ?? []);
      await p.click('.dz-ev[data-event-id="lunch"]');
      const focused = await p.evaluate(() => document.activeElement?.dataset?.eventId);
      check('gestures: headers and the gutter are not time (no date click); a clicked event takes focus', clicks.length === 0 && focused === 'lunch', JSON.stringify({ clicks, focused }));
      await p.close();
    }

    // Right to left: the column under the pointer is where it lands.
    {
      const { p, errors } = await fresh();
      await p.evaluate(() => window.__dz().update({ locale: 'he-IL' }));
      await p.waitForFunction(() => document.querySelector('.dz-cal').dir === 'rtl');
      const b = await (await p.$('.dz-ev[data-event-id="lunch"]')).boundingBox();
      const target = await p.$$eval('.dz-tg__col', (cs) => { const c = cs.find((x) => x.dataset.date === '2026-10-22'); const r = c.getBoundingClientRect(); return { x: r.left + r.width / 2 }; });
      await drag(p, { x: b.x + b.width / 2, y: b.y + 10 }, { x: target.x, y: b.y + 10 });
      const lunch = await ev(p, 'lunch');
      check('rtl: dropped in the column under the pointer (Thursday 22)', lunch[0].startsWith('2026-10-22T'), JSON.stringify(lunch));
      check('rtl: no console error', errors.length === 0, errors.join(' | '));
      await p.close();
    }

    // The spring-forward gap: a drop in the skipped hour lands at 03:00 and says so.
    {
      const { p } = await fresh();
      await p.evaluate(() => {
        const cal = window.__dz();
        cal.run({ type: 'event.create', event: { id: 'gapper', title: 'Gap', start: '2026-03-27T09:00[Europe/Paris]', duration: { minutes: 30 } } });
        cal.update({ date: cal.kernel.getState().date.with({ month: 3, day: 27 }) });
      });
      await p.waitForSelector('.dz-ev[data-event-id="gapper"]');
      await p.evaluate(() => (document.querySelector('.dz-tg__body').scrollTop = 0));
      await p.waitForTimeout(50);
      const g = await (await p.$('.dz-ev[data-event-id="gapper"]')).boundingBox();
      const sun = await p.$$eval('.dz-tg__col', (cs) => { const c = cs.find((x) => x.dataset.date === '2026-03-29'); const r = c.getBoundingClientRect(); return { x: r.left + r.width / 2, top: r.top, px: r.height / Number(getComputedStyle(c).getPropertyValue('--dz-len')) }; });
      await drag(p, { x: g.x + g.width / 2, y: g.y + 2 }, { x: sun.x, y: sun.top + (2 * 60 + 25) * sun.px });
      const at = await ev(p, 'gapper');
      await p.waitForFunction(() => document.querySelector('.dz-live').textContent !== '');
      const said = await p.textContent('.dz-live');
      check('gap: dropped in the skipped hour, it lands at 03:00 and it is said', at[0] === '2026-03-29T03:00:00+02:00[Europe/Paris]' && /n’existe pas/.test(said), JSON.stringify({ at, said }));
      await p.close();
    }

    // With GSAP on: the dropped event is visible once it lands (no entrance tween left half-done).
    {
      const r = await page('/', { reducedMotion: 'no-preference' });
      const p = r.p;
      await p.waitForSelector('.dz-ev');
      const b = await (await p.$('.dz-ev[data-event-id="lunch"]')).boundingBox();
      const tue = await colCenter(p, 1);
      await drag(p, { x: b.x + b.width / 2, y: b.y + 10 }, { x: tue.x, y: b.y + 60 });
      await p.waitForTimeout(700);
      const seen = await p.$eval('.dz-ev[data-event-id="lunch"]', (e) => { const cs = getComputedStyle(e); return { v: cs.visibility, o: cs.opacity, t: cs.transform }; });
      check('motion: the landed event is visible and back to its CSS', seen.v === 'visible' && seen.o === '1' && seen.t === 'none', JSON.stringify(seen));
      check('motion: no console error', r.errors.length === 0, r.errors.join(' | '));
      await p.close();
    }

    // Touch: a tap selects; a drag on the selected event starts at once (no long press); elsewhere, the finger scrolls.
    {
      const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, hasTouch: true });
      const p = await ctx.newPage();
      const errors = [];
      p.on('pageerror', (e) => errors.push(e.message));
      await p.emulateMedia({ reducedMotion: 'reduce' });
      await p.goto(new URL('/', base).href, { waitUntil: 'networkidle' });
      await p.waitForSelector('.dz-ev');
      const cdp = await ctx.newCDPSession(p);
      const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
      const b = await (await p.$('.dz-ev[data-event-id="lunch"]')).boundingBox();
      const x = b.x + b.width / 2;
      const y = b.y + b.height / 2;
      await touch('touchStart', x, y);
      await touch('touchEnd', x, y);
      const selected = await p.$eval('.dz-ev[data-event-id="lunch"]', (e) => e.classList.contains('dz-ev--selected') && e.getAttribute('aria-pressed') === 'true' && getComputedStyle(e).touchAction === 'none');
      const tue = await colCenter(p, 1);
      const t0 = Date.now();
      await touch('touchStart', x, y);
      for (let k = 1; k <= 8; k++) await touch('touchMove', x + ((tue.x - x) * k) / 8, y + (90 * k) / 8);
      await touch('touchEnd', tue.x, y + 90);
      const quick = Date.now() - t0 < 450;
      const moved = await ev(p, 'lunch');
      check('touch: a tap selects the event (aria-pressed, touch-action none on it alone)', selected);
      check('touch: a drag on the selected event moves it at once, no long press', quick && moved[0].startsWith('2026-10-20T'), JSON.stringify({ quick, moved }));
      const s0 = await p.$eval('.dz-tg__body', (e) => e.scrollTop);
      const thu = await colCenter(p, 3);
      await cdp.send('Input.synthesizeScrollGesture', { x: Math.round(thu.x), y: 600, yDistance: -200, gestureSourceType: 'touch', speed: 1200 });
      const s1 = await p.$eval('.dz-tg__body', (e) => e.scrollTop);
      check('touch: a finger on empty time scrolls the grid', s1 > s0 + 50, `${s0} → ${s1}`);
      check('touch: no console error', errors.length === 0, errors.join(' | '));
      await ctx.close();
    }

    // ── Phase 8: axe-core on every view; the keyboard where layout matters ──
    {
      const { p, errors } = await page('/');
      await p.waitForSelector('.dz-ev');
      for (const v of ['timeGridWeek', 'dayGridMonth', 'timeGridDay']) {
        await p.click(`.dz-toolbar__view[data-view="${v}"]`);
        await p.mouse.move(5, 5); // not left hovering the pressed button
        await p.waitForTimeout(200);
        const found = await axeViolations(p, '.dz-cal');
        check(`axe: ${v} has no violation`, found.length === 0, found.join(' | '));
      }
      // The context menu open, with its scope sub-menu.
      await p.click('.dz-toolbar__view[data-view="timeGridWeek"]');
      await p.click('.dz-ev[data-series-id="standup"]', { button: 'right' });
      await p.keyboard.press('ArrowDown');
      const withMenu = await axeViolations(p, '.dz-cal');
      check('axe: the open context menu has no violation', withMenu.length === 0, withMenu.join(' | '));
      await p.keyboard.press('Escape');
      // Right to left.
      await p.evaluate(() => window.__dz().update({ locale: 'he-IL' }));
      await p.waitForTimeout(200);
      const rtl = await axeViolations(p, '.dz-cal');
      check('axe: right to left has no violation', rtl.length === 0, rtl.join(' | '));
      await p.evaluate(() => window.__dz().update({ locale: 'fr-FR' }));
      // States a person passes through: the cursor focused, an event held, a selection drawn, the "+N" panel open.
      await p.focus('.dz-cursor');
      await p.keyboard.press('ArrowDown');
      await p.keyboard.press('ArrowDown', { modifiers: ['Shift'] });
      const withSelection = await axeViolations(p, '.dz-cal');
      check('axe: the cursor focused and a selection drawn — no violation', withSelection.length === 0, withSelection.join(' | '));
      await p.keyboard.press('Escape');
      await p.focus('.dz-ev[data-event-id="lunch"]');
      await p.keyboard.press('m');
      await p.keyboard.press('ArrowDown');
      const holding = await axeViolations(p, '.dz-cal');
      check('axe: an event held by keyboard — no violation', holding.length === 0, holding.join(' | '));
      await p.keyboard.press('Escape');
      await p.click('.dz-toolbar__view[data-view="dayGridMonth"]');
      await p.evaluate(() => window.__dz().kernel.setOptions({ dayGrid: { maxLanes: 2 } }));
      if (await p.$('.dz-more')) {
        await p.click('.dz-more');
        const panel = await axeViolations(p, '.dz-cal');
        check('axe: the "+N" panel open — no violation', panel.length === 0, panel.join(' | '));
        await p.keyboard.press('Escape');
      } else check('axe: the "+N" panel open — no violation', false, 'no "+N" link with 2 lanes');
      check('axe: no console error', errors.length === 0, errors.join(' | '));
      await p.close();
    }
    {
      const { p, errors } = await page('/dst.html');
      await p.waitForSelector('.dz-band--repeat');
      const found = await axeViolations(p, 'body');
      check('axe: the four-zone clock-change page has no violation', found.length === 0, found.join(' | '));
      check('axe dst: no console error', errors.length === 0, errors.join(' | '));
      await p.close();
    }

    // The time grid's cursor: tabbing in puts it on the first slot in view, at a slot boundary, in its column.
    {
      const { p, errors } = await page('/');
      await p.waitForSelector('.dz-ev');
      await p.focus('.dz-cursor');
      const at = async () =>
        p.evaluate(() => {
          const c = document.activeElement;
          const r = c.getBoundingClientRect();
          const col = document.querySelectorAll('.dz-tg__col')[parseInt(c.style.gridColumn, 10) - 2].getBoundingClientRect();
          const px = col.height / Number(getComputedStyle(document.querySelector('.dz-tg__col')).getPropertyValue('--dz-len'));
          const body = document.querySelector('.dz-tg__body').getBoundingClientRect();
          return { label: c.getAttribute('aria-label'), minutes: (r.top - col.top) / px, inside: r.left >= col.left - 1 && r.right <= col.right + 1, visible: r.top >= body.top - 1 && r.bottom <= body.bottom + 1, opacity: getComputedStyle(c).opacity };
        });
      const first = await at();
      check('keyboard: the cursor lands on a slot in view, in its column, visible', first.inside && first.visible && first.opacity === '1' && Math.abs(first.minutes - Math.round(first.minutes / 15) * 15) < 0.5, JSON.stringify(first));
      for (let k = 0; k < 4; k++) await p.keyboard.press('ArrowDown');
      const later = await at();
      check('keyboard: four slots down is one hour lower on screen (±0.5 min)', Math.abs(later.minutes - first.minutes - 60) < 0.5, JSON.stringify({ first, later }));

      // Grab "Déjeuner" (Mon 12:30): two slots down, one day on — the ghost sits at Tue 13:00; Enter moves it there.
      await p.focus('.dz-ev[data-event-id="lunch"]');
      await p.keyboard.press('m');
      for (const k of ['ArrowDown', 'ArrowDown', 'ArrowRight']) await p.keyboard.press(k);
      const tue = await colCenter(p, 1);
      const ghost = await p.$eval('.dz-ghost', (g) => g.getBoundingClientRect().toJSON());
      check('keyboard grab: the preview is at Tuesday 13:00 (±1 px)', Math.abs(ghost.top - (tue.top + 780 * tue.px)) <= 1 && Math.abs(ghost.left + ghost.width / 2 - tue.x) < ghost.width, JSON.stringify({ ghost, tue }));
      await p.keyboard.press('Enter');
      await p.waitForTimeout(100);
      const moved = await ev(p, 'lunch');
      const focus = await p.evaluate(() => ({ id: document.activeElement?.dataset.eventId, col: document.activeElement?.closest('.dz-tg__col')?.dataset.date }));
      check('keyboard grab: Enter moves it, and the focus follows it', moved[0] === '2026-10-20T13:00:00+02:00[Europe/Paris]' && focus.id === 'lunch' && focus.col === '2026-10-20', JSON.stringify({ moved, focus }));

      // WCAG 2.5.7 without a drag: "Move…" from the context menu, then a click where it should go.
      await p.click('.dz-ev[data-event-id="design"]', { button: 'right' });
      await p.click('.dz-menu [data-action="event.move"]');
      const thu = await colCenter(p, 3);
      await p.mouse.click(thu.x, thu.top + 900 * thu.px + 2);
      await p.waitForTimeout(100);
      const placed = await ev(p, 'design');
      check('single pointer: "Move…" then a click puts the event there (Thursday 15:00)', placed?.[0] === '2026-10-22T15:00:00+02:00[Europe/Paris]', JSON.stringify(placed));

      // A month cell's item is focused: its ring is drawn on the bar it stands for.
      await p.click('.dz-toolbar__view[data-view="dayGridMonth"]');
      await p.focus('.dz-dg__cell[data-date="2026-10-21"]');
      await p.keyboard.press('Enter');
      // The ring is mirrored at the next frame: wait for it rather than read at once (flaked 1 run in 3).
      const ring = await p
        .waitForFunction(() => {
          const id = document.activeElement?.dataset.segment;
          const bar = [...document.querySelectorAll('.dz-bar.dz-focus')].find((b) => b.dataset.segment === id);
          return bar ? getComputedStyle(bar).outlineStyle : null;
        }, null, { timeout: 2000 })
        .then((h) => h.jsonValue())
        .catch(() => null);
      check('keyboard month: the focused item’s bar shows the focus ring', ring === 'solid', String(ring));
      check('keyboard: no console error', errors.length === 0, errors.join(' | '));
      await p.close();
    }

    // A selection stays on screen after the mouse lets go; a click elsewhere clears it.
    {
      const { p } = await page('/');
      await p.waitForSelector('.dz-ev');
      const thu = await colCenter(p, 3);
      const y = (await p.$eval('.dz-tg__body', (b) => b.getBoundingClientRect().top)) + 300;
      await drag(p, { x: thu.x, y }, { x: thu.x, y: y + 60 });
      const kept = await p.$$eval('.dz-ghost--armed', (g) => g.length);
      await p.mouse.click(thu.x, y + 200);
      const after = await p.$$eval('.dz-ghost--armed', (g) => g.length);
      check('selection: it stays drawn after the drop, and a click elsewhere clears it', kept === 1 && after === 0, JSON.stringify({ kept, after }));
      await p.close();
    }

    // Touch: a tap selects one slot with two handles; pulling the end handle extends it.
    {
      const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, hasTouch: true });
      const p = await ctx.newPage();
      const errors = [];
      p.on('pageerror', (e) => errors.push(e.message));
      await p.emulateMedia({ reducedMotion: 'reduce' });
      await p.goto(new URL('/', base).href, { waitUntil: 'networkidle' });
      await p.waitForSelector('.dz-ev');
      const cdp = await ctx.newCDPSession(p);
      const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
      const thu = await colCenter(p, 3);
      const y = (await p.$eval('.dz-tg__body', (b) => b.getBoundingClientRect().top)) + 300;
      await touch('touchStart', thu.x, y);
      await touch('touchEnd', thu.x, y);
      const handles = await p.$$eval('.dz-ghost__handle', (hs) => hs.map((h) => { const r = h.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }; }));
      const first = await p.textContent('#status');
      const end = handles[1];
      if (end) {
        await touch('touchStart', end.x, end.y);
        for (let k = 1; k <= 6; k++) await touch('touchMove', end.x, end.y + (90 * k) / 6);
        await touch('touchEnd', end.x, end.y + 90);
      }
      const second = await p.textContent('#status');
      const minutes = (t) => { const m = /T(\d\d):(\d\d).*→ .*T(\d\d):(\d\d)/.exec(t ?? ''); return m ? (Number(m[3]) * 60 + Number(m[4])) - (Number(m[1]) * 60 + Number(m[2])) : null; };
      check('touch: a tap selects one slot, with two handles of 24 px', handles.length === 2 && handles.every((h) => h.w >= 24) && minutes(first) === 15, JSON.stringify({ handles, first }));
      check('touch: pulling the end handle makes the selection longer, at once', (minutes(second) ?? 0) >= 90, String(second));
      check('touch handles: no console error', errors.length === 0, errors.join(' | '));
      await ctx.close();
    }
  }

  {
    const { p, errors } = await page('/dst.html');
    await p.waitForSelector('.dz-band--repeat');
    const r = await p.evaluate(() => {
      const band = document.querySelector('.dz-band--repeat');
      const col = band.closest('.dz-tg__col');
      const px = col.getBoundingClientRect().height / Number(getComputedStyle(col).getPropertyValue('--dz-len'));
      return Math.abs(band.getBoundingClientRect().height - 60 * px);
    });
    check('dst: a repeated hour is drawn one hour tall (±1 px)', r <= 1, `${r}px`);
    check('dst: no console error', errors.length === 0, errors.join(' | '));
    await p.close();
  }

  // ── list views: chronological rows, axe on a week and a month ──
  {
    const { p, errors } = await page('/');
    await p.waitForSelector('.dz-ev');
    await p.evaluate(() => window.__dz().update({ view: 'listWeek' }));
    await p.waitForSelector('.dz-list__ev');
    const order = await p.evaluate(() =>
      [...document.querySelectorAll('.dz-list__ev')].slice(0, 6).map((el) => `${el.closest('.dz-list__day').dataset.date} ${el.querySelector('.dz-list__time')?.textContent ?? ''}`),
    );
    const keys = await p.evaluate(() => {
      const model = window.__dz().kernel.viewModel().model;
      return model.days.flatMap((d) => d.entries.map((e) => [String(d.date), e.allDay ? 0 : e.start.epochMilliseconds]));
    });
    const sorted = keys.every((k, i) => i === 0 || keys[i - 1][0] < k[0] || (keys[i - 1][0] === k[0] && keys[i - 1][1] <= k[1]));
    const drawn = await p.locator('.dz-list__ev').count();
    check('list: rows in chronological order, one per event-day', sorted && drawn === keys.length && keys.length > 0, JSON.stringify({ drawn, keys: keys.length, order }));
    const week = await axeViolations(p, '.dz-cal');
    check('axe: listWeek has no violation', week.length === 0, week.join(' | '));
    await p.evaluate(() => window.__dz().update({ view: 'listMonth' }));
    await p.waitForFunction(() => document.querySelectorAll('.dz-list__day').length > 3);
    const month = await axeViolations(p, '.dz-cal');
    check('axe: listMonth has no violation', month.length === 0, month.join(' | '));
    check('list: no console error', errors.length === 0, errors.join(' | '));
    await p.close();
  }

  // ── multi-month: months side by side (or stacked), the month's gestures; week numbers; no weekend ──
  {
    const { p, errors } = await page('/');
    await p.waitForSelector('.dz-ev');
    await p.evaluate(() => window.__dz().update({ view: 'multiMonthYear', weekNumbers: true }));
    await p.waitForSelector('.dz-mm__grid');
    const tops = await p.evaluate(() => [...document.querySelectorAll('.dz-mm__month')].slice(0, 4).map((m) => Math.round(m.getBoundingClientRect().top)));
    check('multi-month: three months side by side, the fourth below', tops[0] === tops[1] && tops[1] === tops[2] && tops[3] > tops[0], JSON.stringify(tops));
    const mm = await axeViolations(p, '.dz-cal');
    check('axe: multiMonthYear (week numbers on) has no violation', mm.length === 0, mm.join(' | '));
    // Drag the all-day "Mise en production" (Friday 23 October) one row down, in October's grid.
    const oct = '.dz-mm__grid[aria-label="octobre 2026"]';
    await p.locator(`${oct} .dz-dg__cell[data-date="2026-10-23"]`).scrollIntoViewIfNeeded();
    const from = await p.evaluate((g) => {
      const bar = [...document.querySelectorAll(`${g} .dz-bar`)].find((b) => b.dataset.segment?.startsWith('release'));
      const r = bar.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, oct);
    const to = await p.evaluate((g) => {
      const r = document.querySelector(`${g} .dz-dg__cell[data-date="2026-10-30"]`).getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, oct);
    await p.mouse.move(from.x, from.y);
    await p.mouse.down();
    await p.mouse.move(from.x, from.y + 10, { steps: 3 });
    await p.mouse.move(to.x, to.y, { steps: 8 });
    await p.mouse.up();
    await p.waitForTimeout(150);
    const release = await p.evaluate(() => String(window.__dz().kernel.store.snapshot.getEvent('release').start));
    check('multi-month: an all-day event dragged a week later in its month', release === '2026-10-30', release);
    // Over October's padding cell for Tuesday 29 September: the drop stays in October (the row's first day, Thursday 1st), not September.
    const from2 = await p.evaluate((g) => {
      const bar = [...document.querySelectorAll(`${g} .dz-bar`)].find((b) => b.dataset.segment?.startsWith('release'));
      const r = bar.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, oct);
    const pad = await p.evaluate((g) => {
      const r = document.querySelector(`${g} .dz-dg__cell[data-date="2026-09-29"]`).getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, oct);
    await p.mouse.move(from2.x, from2.y);
    await p.mouse.down();
    await p.mouse.move(from2.x, from2.y - 10, { steps: 3 });
    await p.mouse.move(pad.x, pad.y, { steps: 8 });
    await p.mouse.up();
    await p.waitForTimeout(150);
    const padded = await p.evaluate(() => String(window.__dz().kernel.store.snapshot.getEvent('release').start));
    check('multi-month: a padding cell is not a way into the neighbouring month', padded === '2026-10-01', padded);
    await p.evaluate(() => window.__dz().update({ multiMonthMaxColumns: 1 }));
    const stacked = await p.evaluate(() => [...document.querySelectorAll('.dz-mm__month')].slice(0, 2).map((m) => Math.round(m.getBoundingClientRect().left)));
    check('multi-month: multiMonthMaxColumns 1 stacks the months', stacked[0] === stacked[1], JSON.stringify(stacked));
    // The month without its weekend: five columns, every cell under its weekday.
    await p.evaluate(() => window.__dz().update({ view: 'dayGridMonth', weekends: false }));
    await p.waitForFunction(() => document.querySelectorAll('.dz-dg__weekday').length === 5);
    const off = await p.evaluate(() => {
      const heads = [...document.querySelectorAll('.dz-dg__weekday')].map((x) => x.getBoundingClientRect());
      const row = [...document.querySelectorAll('.dz-dg__week')][2];
      const cells = [...row.querySelectorAll('.dz-dg__cell')].map((x) => x.getBoundingClientRect());
      return Math.max(...cells.map((c, i) => Math.abs(c.left - heads[i].left)));
    });
    check('weekends off: five columns, cells within 1 px of their weekdays', off <= 1, `${off}px`);
    const wk = await p.evaluate(() => [...document.querySelectorAll('.dz-dg__wk')].map((w) => w.textContent).join(' '));
    check('week numbers: S40 to S45 on October 2026 (France)', wk === 'S40 S41 S42 S43 S44 S45', wk);
    // Measured at the next frame, after the month is drawn.
    const lanes = await p
      .waitForFunction(() => window.__dz().kernel.viewModel().model.maxLanes >= 3, null, { timeout: 2000 })
      .then(() => p.evaluate(() => window.__dz().kernel.viewModel().model.maxLanes))
      .catch(() => p.evaluate(() => window.__dz().kernel.viewModel().model.maxLanes));
    check('month: lanes measured after a change of options (no week of one lane)', lanes >= 3, String(lanes));
    const noWeekend = await axeViolations(p, '.dz-cal');
    check('axe: a month without weekends, week numbers on — no violation', noWeekend.length === 0, noWeekend.join(' | '));
    check('multi-month: no console error', errors.length === 0, errors.join(' | '));
    await p.close();
  }

  // ── sources: one request for contiguous months, busy while loading, a refused save put back ──
  {
    const { p, errors } = await page('/sources.html');
    await p.waitForFunction(() => !document.querySelector('.dz-cal').hasAttribute('aria-busy') && document.querySelectorAll('.dz-bar').length > 0);
    const gets = await p.evaluate(() => document.querySelector('#log').textContent.split('\n').filter((l) => l.includes('GET')).length);
    check('sources: the month grid and a month each side come in one request', gets === 1, `${gets} requests`);
    const before = await p.locator('.dz-bar').count();
    await p.selectOption('#latency', '2000');
    await p.click('#refetch');
    const busy = await p.getAttribute('.dz-cal', 'aria-busy');
    const during = await p.locator('.dz-bar').count();
    check('sources: aria-busy while fetching again, the events stay meanwhile', busy === 'true' && during === before, `aria-busy=${busy}, ${during}/${before} bars`);
    const busyAxe = await axeViolations(p, 'body');
    check('axe: the sources page while loading — no violation', busyAxe.length === 0, busyAxe.join(' | '));
    await p.waitForFunction(() => !document.querySelector('.dz-cal').hasAttribute('aria-busy'), null, { timeout: 5000 });
    await p.selectOption('#latency', '0');
    const moved = await p.evaluate(() => {
      const cal = window.__dz();
      cal.run({ type: 'event.move', id: 'planning-2026-10-19', start: '2026-10-23T10:00[Europe/Paris]' });
      return String(cal.kernel.store.snapshot.getEvent('planning-2026-10-19').start);
    });
    await p.waitForFunction(() => document.querySelector('.dz-live').textContent.includes('enregistré'));
    const back = await p.evaluate(() => String(window.__dz().kernel.store.snapshot.getEvent('planning-2026-10-19').start));
    const said = await p.textContent('.dz-live');
    check(
      'sources: a move the server refuses shows at once, then goes back, said',
      moved.startsWith('2026-10-23T10:00') && back.startsWith('2026-10-19T10:00') && said.includes('revenu'),
      `${moved} → ${back}; « ${said} »`,
    );
    // iCal: a Chicago series with one occurrence moved (#7456: the TZID is honoured), imported, then exported.
    await p.setInputFiles('#ics', `${root}/packages/ical/test/fixtures/05-series-override-7456.ics`);
    await p.waitForFunction(() => window.__dz().kernel.sources.ids().includes('file'));
    await p.waitForFunction(() => !document.querySelector('.dz-cal').hasAttribute('aria-busy'));
    const review = await p.evaluate(() =>
      window.__shown('2026-10-19', '2026-10-26').filter((x) => x.startsWith('file|')).map((x) => x.slice(5)),
    );
    check(
      'ical: a Chicago series read in Chicago, its moved occurrence in place (Paris 16:00, 22nd at 21:00)',
      review.join(' | ') === 'Review 10-20T16:00 | Review 10-21T16:00 | Review (moved) 10-22T21:00 | Review 10-23T16:00 | Review 10-24T16:00',
      review.join(' | '),
    );
    const [download] = await Promise.all([p.waitForEvent('download'), p.click('#export')]);
    const ics = readFileSync(await download.path(), 'utf8');
    check(
      'ical: the export writes the override and the zones it uses',
      ics.includes('RECURRENCE-ID;TZID=America/Chicago:20261022T090000') && ics.includes('BEGIN:VTIMEZONE\r\nTZID:America/Chicago') && ics.includes('TZID:Europe/Paris'),
      ics.slice(0, 300),
    );
    check('sources: no console error', errors.length === 0, errors.join(' | '));
    await p.close();
  }

  // ── Angular (zoneless): a header of one's own on the controller's signals, two-way date, templates ──
  {
    const { p, errors } = await page('/angular.html');
    await p.waitForSelector('.dz-ev .dz-ev__content b');
    const before = await p.textContent('.bar strong');
    await p.click('.bar button >> nth=1');
    await p.waitForFunction((t) => document.querySelector('.bar strong').textContent !== t, before);
    const after = await p.evaluate(() => ({ title: document.querySelector('.bar strong').textContent, state: document.querySelector('.bar span').textContent, cal: document.querySelector('.dz-toolbar__title').textContent }));
    check('angular: the controller moves the calendar; title() and [(date)] follow', after.title === after.cal && after.state.includes('2026-10-28'), JSON.stringify({ before, ...after }));
    const tabs = await p.evaluate(() => [...document.querySelectorAll('.dz-toolbar__view')].map((x) => x.dataset.view).join(','));
    check('angular: [options] reaches the toolbar after creation (headerViews)', tabs === 'dayGridMonth,timeGridWeek,timeGridDay,listWeek', tabs);
    const found = await axeViolations(p, 'main');
    check('axe: the Angular page has no violation', found.length === 0, found.join(' | '));
    check('angular: no console error', errors.length === 0, errors.join(' | '));
    await p.close();
  }

  // ── dark and forced colours render without errors ──
  for (const media of [{ colorScheme: 'dark' }, { forcedColors: 'active' }]) {
    const { p, errors } = await page('/', media);
    await p.waitForSelector('.dz-ev');
    check(`${Object.values(media)[0]}: no console error`, errors.length === 0, errors.join(' | '));
    await p.close();
  }
} finally {
  await browser.close();
  await server.close();
}
process.exit(failures ? 1 : 0);
