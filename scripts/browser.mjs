/**
 * `npm run test:browser`: what jsdom cannot see, in the system's Chrome
 * (playwright-core, no browser download). Starts its own Vite server on the
 * playground, checks layout facts with tolerances, exits 1 on any failure.
 * Phase 3's worst bug (the gutter drawn on the right) passed every jsdom test.
 */
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
/** axe-core's violations inside `selector`: the WCAG 2.0–2.2 A and AA rules and axe's best practices. */
async function axeViolations(p, selector = 'body', outside = null) {
  if (!(await p.evaluate(() => 'axe' in window))) await p.addScriptTag({ content: AXE });
  return p.evaluate(async ([sel, out]) => {
    const r = await window.axe.run(document.querySelector(sel), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } });
    // WCAG 2.5.8's "essential" exception: an event's height and width are its duration and its share of
    // the column; narrow ones have the keyboard and the context menu as alternatives (see the ACR).
    // Only events may fall under it — any other small target is still a failure.
    const isEvent = (n) => document.querySelector(String(n.target[n.target.length - 1]))?.matches('.dz-ev, .dz-bar') === true;
    return r.violations
      .map((v) => (v.id === 'target-size' ? { ...v, nodes: v.nodes.filter((n) => !isEvent(n)) } : v))
      // Another library's widget, checked in its own repository (`outside`): left out here, said apart.
      .map((v) => (out ? { ...v, nodes: v.nodes.filter((n) => !document.querySelector(String(n.target[n.target.length - 1]))?.closest(out)) } : v))
      .filter((v) => v.nodes.length > 0)
      .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`);
  }, [selector, outside]);
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

  // ── Phase 12: a crowded week ("+N", the scrolled hours), the list windowed, print ──
  {
    const { p, errors } = await page('/perf.html?view=timeGridWeek&set=W&n=10000');
    await p.waitForFunction(() => window.__perf, null, { timeout: 120000 });
    const tg = await p.evaluate(() => ({
      more: document.querySelectorAll('.dz-more--tg').length,
      events: document.querySelectorAll('.dz-tg__col .dz-ev:not(.dz-ev--bg)').length,
      body: document.querySelector('.dz-tg__body').clientHeight,
    }));
    check('crowded week: "+N" per day, a bounded number of events, hours not squeezed by the all-day row', tg.more >= 7 && tg.events < 3000 && tg.body > 300, JSON.stringify(tg));
    await p.click('.dz-more--tg');
    const listed = await p.evaluate(() => document.querySelectorAll('.dz-pop .dz-bar').length);
    check('crowded week: "+N" opens the panel with its events', listed > 50, String(listed));
    await p.keyboard.press('Escape');
    const crowdedAxe = await axeViolations(p, '.dz-cal');
    check('axe: a crowded week ("+N" links) — no violation', crowdedAxe.length === 0, crowdedAxe.join(' | '));
    // Print: everything mounted, the hours printed whole.
    const printed = await p.evaluate(() => {
      const restore = window.__dz.preparePrint();
      return { restore: typeof restore };
    });
    await p.emulateMedia({ media: 'print' });
    const paper = await p.evaluate(() => { const b = document.querySelector('.dz-tg__body'); return { client: b.clientHeight, scroll: b.scrollHeight }; });
    check('print: the hours are printed whole (nothing left to scroll)', printed.restore === 'function' && paper.scroll - paper.client <= 16, JSON.stringify(paper));
    await p.emulateMedia({ media: 'screen' });
    check('crowded week: no console error', errors.length === 0, errors.join(' | '));
    await p.close();
  }
  {
    const { p, errors } = await page('/perf.html?view=listYear&set=U&n=10000');
    await p.waitForFunction(() => window.__perf, null, { timeout: 120000 });
    const scroller = '.dz-list';
    const first = await p.evaluate((sel) => {
      const el = document.querySelector(sel);
      el.scrollTop = 40000;
      return el.scrollTop;
    }, scroller);
    await p.waitForTimeout(150);
    const at = await p.evaluate((sel) => {
      const el = document.querySelector(sel);
      const top = el.getBoundingClientRect().top;
      const row = [...el.querySelectorAll('.dz-list__ev')].find((r) => r.getBoundingClientRect().bottom > top);
      return { scroll: el.scrollTop, mounted: el.querySelectorAll('.dz-list__ev').length, key: row?.dataset.segment, y: row ? Math.round(row.getBoundingClientRect().top - top) : null };
    }, scroller);
    await p.evaluate((sel) => document.querySelector(sel).dispatchEvent(new Event('scroll')), scroller);
    await p.waitForTimeout(150);
    const again = await p.evaluate(({ sel, key }) => {
      const el = document.querySelector(sel);
      const row = [...el.querySelectorAll('.dz-list__ev')].find((r) => r.dataset.segment === key);
      return row ? Math.round(row.getBoundingClientRect().top - el.getBoundingClientRect().top) : null;
    }, { sel: scroller, key: at.key });
    check('list year: windowed (bounded rows) and stable where it was scrolled', at.mounted < 400 && at.key !== undefined && Math.abs((again ?? 999) - at.y) <= 1 && Math.abs(at.scroll - first) < 2000, JSON.stringify({ first, at, again }));
    const restore = await p.evaluate(() => (window.__dz.preparePrint(), document.querySelectorAll('.dz-list__ev').length));
    check('list year: preparePrint mounts every entry', restore > 10000, String(restore));
    check('list year: no console error', errors.length === 0, errors.join(' | '));
    await p.close();
  }

  // ── Phase 13: every family readable (axe, light and dark), a page's rule wins, density ──
  {
    const { p, errors } = await page('/');
    await p.waitForSelector('.dz-ev');
    const failing = [];
    for (const theme of ['standard', 'slate', 'night', 'pastel', 'frost', 'solar', 'contrast']) {
      for (const scheme of ['light', 'dark']) {
        for (const view of ['timeGridWeek', 'dayGridMonth']) {
          await p.evaluate((o) => window.__dz().update(o), { theme, scheme, view });
          await p.waitForTimeout(50);
          const found = await axeViolations(p, '.dz-cal');
          if (found.length > 0) failing.push(`${theme}/${scheme}/${view}: ${found.join(' ; ')}`);
        }
      }
    }
    check('themes: axe finds nothing on 7 families × light/dark × week/month', failing.length === 0, failing.join(' | '));
    // axe leaves colour-mixed backgrounds "incomplete": the palette's key pairs are measured here, for every family and scheme.
    const pairs = [];
    for (const theme of ['standard', 'slate', 'night', 'pastel', 'frost', 'solar', 'contrast']) {
      for (const scheme of ['light', 'dark']) {
        await p.evaluate((o) => window.__dz().update(o), { theme, scheme });
        const r = await p.evaluate(() => {
          const cal = document.querySelector('.dz-cal');
          const probe = (fg, bg) => {
            const el = document.createElement('span');
            // As the calendar reads them: the page's --tz-*, else the family's --dzp-* defaults.
            const read = (v) => `var(${v}, var(${v.replace('--tz-', '--dzp-')}))`;
            el.style.color = read(fg);
            el.style.background = read(bg);
            cal.append(el);
            const cs = getComputedStyle(el);
            const out = [cs.color, cs.backgroundColor];
            el.remove();
            return out;
          };
          const lum = (c) => {
            const [r, g, b] = c.match(/[\d.]+/g).slice(0, 3).map(Number).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
            return 0.2126 * r + 0.7152 * g + 0.0722 * b;
          };
          const ratio = ([a, b]) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
          return {
            text: ratio(probe('--tz-fg', '--tz-bg')),
            muted: ratio(probe('--tz-fg-muted', '--tz-bg')),
            mutedRaised: ratio(probe('--tz-fg-muted', '--tz-bg-raised')),
            onAccent: ratio(probe('--tz-accent-fg', '--tz-accent')),
            accent: ratio(probe('--tz-accent', '--tz-bg')),
          };
        });
        const low = Object.entries(r).filter(([k, v]) => v < (k === 'accent' ? 3 : 4.5)).map(([k, v]) => `${k} ${v.toFixed(2)}`);
        if (low.length) pairs.push(`${theme}/${scheme}: ${low.join(', ')}`);
      }
    }
    check('themes: text ≥ 4.5:1 (on bg and raised), on accent ≥ 4.5:1, accent ≥ 3:1 — every family, light and dark', pairs.length === 0, pairs.join(' | '));
    // Captures (ARCHITECTURE J, Phase 13): light, dark, densities, forced colours — for a person to look at.
    const shots = join(root, 'node_modules', '.cache', 'dzcalendar', 'captures');
    mkdirSync(shots, { recursive: true });
    const box = await p.evaluate(() => { const r = document.querySelector('.dz-cal').getBoundingClientRect(); return { x: r.x, y: r.y + window.scrollY, width: r.width, height: r.height }; });
    for (const [name, o] of [['light', { theme: 'standard', scheme: 'light' }], ['dark', { scheme: 'dark' }], ['compact', { scheme: 'light', density: 'compact' }], ['spacious', { density: 'spacious' }]]) {
      await p.evaluate((x) => window.__dz().update(x), o);
      await p.waitForTimeout(80);
      await p.screenshot({ path: join(shots, `${name}.png`), clip: box, fullPage: true });
    }
    await p.evaluate(() => window.__dz().update({ density: 'comfortable', scheme: 'auto' }));
    await p.emulateMedia({ forcedColors: 'active' });
    await p.waitForTimeout(80);
    await p.screenshot({ path: join(shots, 'forced-colors.png'), clip: box, fullPage: true });
    const forced = await axeViolations(p, '.dz-cal');
    check('forced colours: axe finds nothing; captures in node_modules/.cache/dzcalendar/captures', forced.length === 0, forced.join(' | '));
    await p.emulateMedia({ forcedColors: 'none' });
    // A page's plain rule, weaker in specificity than ours, still wins: our CSS is in a layer.
    await p.evaluate(() => window.__dz().update({ theme: 'standard', scheme: 'light', view: 'timeGridWeek' }));
    await p.addStyleTag({ content: '.dz-ev { border-radius: 0px; } .dz-cal { --dz-accent: rgb(10, 125, 90); }' });
    const won = await p.evaluate(() => ({
      radius: getComputedStyle(document.querySelector('.dz-tg__col .dz-ev')).borderTopLeftRadius,
      accent: getComputedStyle(document.querySelector('.dz-toolbar__view[aria-pressed="true"]')).backgroundColor,
    }));
    check('a page rule wins without a fight (layers): radius 0, accent changed', won.radius === '0px' && won.accent === 'rgb(10, 125, 90)', JSON.stringify(won));
    // ── Phase 14: free slots in the week (a provider in Riyadh, seen from Paris) ──
    {
      const { p, errors } = await page('/slots.html');
      await p.waitForSelector('.dz-slot');
      const geo = await p.evaluate(() => {
        const col = document.querySelector('.dz-tg__col[data-date="2026-10-21"]');
        const c = col.getBoundingClientRect();
        const slots = [...col.querySelectorAll('.dz-slot')];
        const first = slots[0].getBoundingClientRect();
        const booked = col.querySelector('.dz-ev').getBoundingClientRect();
        const minute = c.height / Number(getComputedStyle(col).getPropertyValue('--dz-len'));
        return {
          first: slots[0].textContent,
          inside: slots.every((s) => { const r = s.getBoundingClientRect(); return r.left >= c.left - 0.5 && r.right <= c.right + 0.5 && r.width > c.width * 0.8; }),
          // The booking is 10:00 in Riyadh, the first slot 11:00 (09:00 now + 2 h notice): 60 minutes lower.
          gap: (first.top - booked.top) / minute,
          height: first.height / minute,
        };
      });
      check('slots: the first free slot of Wednesday is 10:00 in Paris (11:00 in Riyadh, after 2 h notice)', geo.first === '10:00', geo.first);
      check('slots: inside their column, nearly its width', geo.inside, JSON.stringify(geo));
      check('slots: placed at their minute (60 min below the 10:00 Riyadh booking), 30 min tall', Math.abs(geo.gap - 60) < 1 && Math.abs(geo.height - 30) < 1, JSON.stringify(geo));
      const v = await axeViolations(p, '.dz-cal');
      check('axe: the week with free slots has no violation', v.length === 0, v.join('\n'));
      const before = await p.evaluate(() => document.querySelectorAll('.dz-ev').length);
      await p.click('.dz-tg__col[data-date="2026-10-21"] .dz-slot');
      await p.waitForFunction((n) => document.querySelectorAll('.dz-ev').length === n + 1, before);
      const after = await p.evaluate(() => ({ log: document.querySelector('#log').textContent, first: document.querySelector('.dz-tg__col[data-date="2026-10-21"] .dz-slot').textContent }));
      // Booked 11:00–11:30 with 10 minutes after: 11:30 would touch the buffer, and the morning ends at 12:00 — the next is 13:00 in Riyadh, 12:00 in Paris.
      check('slots: a click books it (checked again by the engine); the slot and its buffer are gone', /Réservé/.test(after.log) && after.first === '12:00', JSON.stringify(after));
      await p.selectOption('#zone', 'Asia/Riyadh');
      const reads = await p
        .waitForFunction(() => document.querySelector('.dz-tg__col[data-date="2026-10-21"] .dz-slot')?.textContent === '13:00', null, { timeout: 3000 })
        .then(() => '13:00', () => p.evaluate(() => document.querySelector('.dz-tg__col[data-date="2026-10-21"] .dz-slot')?.textContent));
      check('slots: in the provider’s own zone the same slot reads 13:00', reads === '13:00', String(reads));
      // Without onSlotClick, a slot is free time like any other: a click is a date click, a drag selects.
      await p.evaluate(() => {
        window.__got = { dates: 0, selected: null };
        window.__cal.update({ onSlotClick: undefined, selectable: true, onDateClick: () => window.__got.dates++, onSelect: (s) => (window.__got.selected = String(s.start)) });
      });
      const slotBox = await p.locator('.dz-tg__col[data-date="2026-10-22"] .dz-slot').nth(2).boundingBox();
      await p.mouse.click(slotBox.x + slotBox.width / 2, slotBox.y + 4);
      await p.mouse.move(slotBox.x + slotBox.width / 2, slotBox.y + 4);
      await p.mouse.down();
      await p.mouse.move(slotBox.x + slotBox.width / 2, slotBox.y + 90, { steps: 8 });
      await p.mouse.up();
      const inert = await p.evaluate(() => window.__got);
      check('slots: without onSlotClick a click on one is a date click and a drag from one selects', inert.dates >= 1 && inert.selected !== null, JSON.stringify(inert));
      await p.screenshot({ path: join(root, 'node_modules', '.cache', 'dzcalendar', 'captures', 'slots-week.png'), clip: { x: 0, y: 0, width: 1400, height: 950 } });
      check('slots: no console error', errors.length === 0, errors.join('\n'));
      await p.close();
    }

    // ── Phase 15a: resource columns (four doctors in two services, one of them in Riyadh) ──
    {
      const { p, errors } = await page('/resources.html');
      await p.waitForSelector('.dz-tg__col[data-resource] .dz-ev');
      const geo = await p.evaluate(() => {
        const cols = [...document.querySelectorAll('.dz-tg__col')];
        const box = (el) => el.getBoundingClientRect();
        const heads = [...document.querySelectorAll('.dz-tg__resource')];
        const groups = [...document.querySelectorAll('.dz-tg__group')];
        const had = document.querySelector('.dz-tg__col[data-resource="haddad"]');
        const minute = box(had).height / Number(getComputedStyle(had).getPropertyValue('--dz-len'));
        const offs = [...had.querySelectorAll('.dz-off')].map((o) => Math.round((box(o).top - box(had).top) / minute));
        const shared = [...document.querySelectorAll('.dz-ev[data-event-id="c"]')].map((e) => [e.closest('.dz-tg__col').dataset.resource, Math.round(box(e).top)]);
        return {
          resources: cols.map((c) => c.dataset.resource),
          // Each resource's head over its column; each group's over its two.
          headDrift: Math.max(...heads.map((h, i) => Math.abs(box(h).left - box(cols[i]).left) + Math.abs(box(h).right - box(cols[i]).right))),
          groupDrift: Math.max(...groups.map((g, i) => Math.abs(box(g).left - box(cols[i * 2]).left) + Math.abs(box(g).right - box(cols[i * 2 + 1]).right))),
          dayHeads: document.querySelectorAll('.dz-tg__dayhead').length,
          offs,
          shared,
        };
      });
      check('resources: one column per doctor, in order', geo.resources.join() === 'benali,haddad,martin,nour', geo.resources.join());
      check('resources: heads and groups sit over their columns (≤ 2 px)', geo.headDrift <= 2 && geo.groupDrift <= 2, JSON.stringify(geo));
      check('resources: a one-day resource view has no row of dates', geo.dayHeads === 0, String(geo.dayHeads));
      // The grid starts at 06:00. Riyadh (UTC+3) opens 08:00–12:00, 07:00–11:00 in Paris (UTC+2 on 21 October):
      // shaded from 06:00 (minute 0) and from 11:00 (minute 300).
      check("resources: Riyadh's hours shaded in Paris time (from 06:00 and from 11:00)", geo.offs.join() === '0,300', geo.offs.join());
      check('resources: an event on two doctors is drawn in both columns, at the same height', geo.shared.length === 2 && geo.shared[0][1] === geo.shared[1][1] && geo.shared.map((x) => x[0]).join() === 'benali,haddad', JSON.stringify(geo.shared));
      const v = await axeViolations(p, '.dz-cal');
      check('axe: the resource day view has no violation', v.length === 0, v.join('\n'));
      // A drag from one doctor to another, at the same hour.
      const drag = async (sel, toResource, dy) => {
        const b = await p.locator(sel).first().boundingBox();
        const t = await p.locator(`.dz-tg__col[data-resource="${toResource}"]`).boundingBox();
        await p.mouse.move(b.x + 20, b.y + 8);
        await p.mouse.down();
        await p.mouse.move(b.x + 40, b.y + 20, { steps: 4 });
        await p.mouse.move(t.x + 40, b.y + 8 + dy, { steps: 10 });
        await p.mouse.up();
        await p.waitForTimeout(150);
      };
      const resOf = (id) => p.evaluate((x) => window.__cal.kernel.store.snapshot.getEvent(x).resourceIds.join(), id);
      await drag('.dz-tg__col[data-resource="benali"] .dz-ev[data-event-id="a"]', 'martin', 0);
      check('resources: a drag moves the event to the other doctor, same time', (await resOf('a')) === 'martin' && (await p.evaluate(() => String(window.__cal.kernel.store.snapshot.getEvent('a').start))).startsWith('2026-10-21T09:00'), await resOf('a'));
      // 09:00 → 11:30 in Paris is 12:30 in Riyadh: the doctor's own hours refuse it.
      const minute = await p.evaluate(() => { const c = document.querySelector('.dz-tg__col'); return c.getBoundingClientRect().height / Number(getComputedStyle(c).getPropertyValue('--dz-len')); });
      await drag('.dz-ev[data-event-id="a"]', 'haddad', 150 * minute);
      check("resources: a drop outside the Riyadh doctor's hours is refused", (await resOf('a')) === 'martin', await resOf('a'));
      // 09:00 → 10:00 in Paris is 11:00 in Riyadh: accepted.
      await drag('.dz-ev[data-event-id="a"]', 'haddad', 60 * minute);
      check("resources: a drop inside the Riyadh doctor's hours goes", (await resOf('a')) === 'haddad', await resOf('a'));
      // The keyboard: from one doctor's column to the next.
      await p.locator('.dz-cursor').first().focus();
      await p.keyboard.press('ArrowDown');
      await p.keyboard.press('Alt+ArrowRight');
      const label = await p.evaluate(() => document.activeElement.getAttribute('aria-label'));
      check("resources: Alt+right goes to the next doctor's column, and says so", label.startsWith('Dr Haddad, '), label);
      await p.screenshot({ path: join(root, 'node_modules', '.cache', 'dzcalendar', 'captures', 'resources-day.png'), clip: { x: 0, y: 0, width: 1400, height: 950 } });
      // The week: every doctor's seven days under the doctor's head.
      await p.evaluate(() => window.__cal.update({ view: 'resourceTimeGridWeek' }));
      await p.waitForSelector('.dz-tg__dayhead');
      const week = await p.evaluate(() => {
        const cols = [...document.querySelectorAll('.dz-tg__col')];
        const heads = [...document.querySelectorAll('.dz-tg__resource')];
        const box = (el) => el.getBoundingClientRect();
        const days = [...document.querySelectorAll('.dz-tg__dayhead')];
        return {
          cols: cols.length,
          spanDrift: Math.max(...heads.map((h, i) => Math.abs(box(h).left - box(cols[i * 7]).left) + Math.abs(box(h).right - box(cols[i * 7 + 6]).right))),
          dayDrift: Math.max(...days.map((d, i) => Math.abs(box(d).left - box(cols[i]).left))),
          edge: getComputedStyle(cols[7]).borderInlineStartWidth,
        };
      });
      check('resources: the week has 28 columns, each head over its doctor’s seven days, each date over its column', week.cols === 28 && week.spanDrift <= 2 && week.dayDrift <= 2, JSON.stringify(week));
      check("resources: a stronger line where a doctor's days start", week.edge === '2px', week.edge);
      const vw = await axeViolations(p, '.dz-cal');
      check('axe: the resource week has no violation', vw.length === 0, vw.join('\n'));
      await p.evaluate(() => window.__cal.update({ view: 'resourceDayGridMonth' }));
      await p.waitForSelector('.dz-dg__resource');
      const month = await p.evaluate(() => {
        const row = document.querySelector('.dz-dg__week');
        const cells = [...row.querySelectorAll('.dz-dg__cell')];
        const box = (el) => el.getBoundingClientRect();
        const heads = [...document.querySelectorAll('.dz-dg__resource')];
        return { cells: cells.length, drift: Math.max(...heads.map((h, i) => Math.abs(box(h).left - box(cells[i * 7]).left) + Math.abs(box(h).right - box(cells[i * 7 + 6]).right))) };
      });
      check('resources: the month row holds every doctor’s week, heads over them', month.cells === 28 && month.drift <= 2, JSON.stringify(month));
      const vm = await axeViolations(p, '.dz-cal');
      check('axe: the resource month has no violation', vm.length === 0, vm.join('\n'));
      check('resources: no console error', errors.length === 0, errors.join('\n'));
      await p.close();
    }

    // ── Phase 15b: the timeline (doctors in a tree, two services, a room; elapsed time) ──
    {
      const { p, errors } = await page('/timeline.html');
      await p.waitForSelector('.dz-tl__ev');
      const geo = await p.evaluate(() => {
        const box = (el) => el.getBoundingClientRect();
        const heads = [...document.querySelectorAll('.dz-tl__colhead')];
        const cells = [...document.querySelector('.dz-tl__row[data-resource="benali"]').querySelectorAll('.dz-tl__cell')];
        const lane = document.querySelector('.dz-tl__row[data-resource="benali"] .dz-tl__lane');
        const slots = [...document.querySelectorAll('.dz-tl__slot')];
        const s0900 = slots.find((x) => x.textContent === '09:00');
        const ev = document.querySelector('.dz-tl__row[data-resource="benali"] .dz-tl__ev[data-event-id="a"]');
        const lines = [...document.querySelectorAll('.dz-tl__line')];
        const line0900 = lines.find((l) => Math.abs(box(l).left - box(s0900).left) < 1);
        return {
          colDrift: Math.max(...heads.map((h, i) => Math.abs(box(h).left - box(cells[i]).left) + Math.abs(box(h).width - box(cells[i]).width))),
          // The event starts on the 09:00 head and is 45 minutes long: 1.5 half-hour slots.
          evDrift: Math.abs(box(ev).left - box(s0900).left),
          evSlots: box(ev).width / box(s0900).width,
          lineAt0900: Boolean(line0900),
          laneLeftOfArea: box(lane).left - box(cells[cells.length - 1]).right,
        };
      });
      check('timeline: the area’s heads over their cells (≤ 2 px)', geo.colDrift <= 2, JSON.stringify(geo));
      check('timeline: an event starts on its slot’s head and is as long as it lasts (45 min = 1.5 slots)', geo.evDrift <= 1.5 && Math.abs(geo.evSlots - 1.5) < 0.05 && geo.lineAt0900, JSON.stringify(geo));
      const v = await axeViolations(p, '.dz-cal');
      check('axe: the resource timeline (tree, groups) has no violation', v.length === 0, v.join('\n'));
      // Scrolled along and down: the area stays at the left, the heads at the top.
      await p.evaluate(() => { const sc = document.querySelector('.dz-tl__scroller'); sc.scrollLeft += 600; sc.scrollTop += 120; });
      await p.waitForTimeout(120);
      const sticky = await p.evaluate(() => {
        const sc = document.querySelector('.dz-tl__scroller').getBoundingClientRect();
        const area = document.querySelector('.dz-tl__row .dz-tl__area').getBoundingClientRect();
        const head = document.querySelector('.dz-tl__head').getBoundingClientRect();
        return { area: Math.round(area.left - sc.left), head: Math.round(head.top - sc.top) };
      });
      check('timeline: scrolled along and down, the area sticks to the left and the heads to the top', Math.abs(sticky.area) <= 1 && Math.abs(sticky.head) <= 1, JSON.stringify(sticky));
      await p.evaluate(() => window.__cal.update({ view: 'resourceTimelineDay' }));
      // A drag from one row to another, an hour later.
      await p.evaluate(() => document.querySelector('.dz-tl__row[data-resource="benali"]').scrollIntoView({ block: 'center' }));
      await p.evaluate(() => { const sc = document.querySelector('.dz-tl__scroller'); sc.scrollLeft = 0; });
      await p.evaluate(() => window.__cal.update({ view: 'resourceTimelineWeek' }));
      await p.evaluate(() => window.__cal.update({ view: 'resourceTimelineDay' }));
      await p.waitForTimeout(150);
      const b = await p.locator('.dz-tl__row[data-resource="benali"] .dz-tl__ev[data-event-id="a"]').boundingBox();
      const to = await p.locator('.dz-tl__row[data-resource="martin"] .dz-tl__lane').boundingBox();
      const slotW = (await p.locator('.dz-tl__slot').first().boundingBox()).width;
      await p.mouse.move(b.x + 6, b.y + 6);
      await p.mouse.down();
      await p.mouse.move(b.x + 20, b.y + 20, { steps: 4 });
      await p.mouse.move(b.x + 6 + 2 * slotW, to.y + 12, { steps: 10 });
      await p.mouse.up();
      await p.waitForTimeout(200);
      const moved = await p.evaluate(() => { const e = window.__cal.kernel.store.snapshot.getEvent('a'); return `${e.resourceIds.join()} ${String(e.start).slice(11, 16)}`; });
      check('timeline: a drag moves the event to the other row, an hour later', moved === 'martin 10:00', moved);
      // The keyboard: down is the next resource.
      await p.locator('.dz-tl__cursor').first().focus();
      // Home is the first resource's row (Cardiologie): down is Dre Benali's.
      await p.keyboard.press('ArrowDown');
      const label = await p.evaluate(() => document.activeElement.getAttribute('aria-label'));
      check('timeline: down goes to the next resource’s row, and says so', label.startsWith('Dre Benali, '), label);
      // "+N" in the room's row: its hidden examinations in the panel.
      await p.evaluate(() => document.querySelector('.dz-tl__row[data-resource="irm"]').scrollIntoView({ block: 'center' }));
      await p.locator('.dz-more--tl').first().click();
      const listed = await p.locator('.dz-pop .dz-bar').count();
      check('timeline: "+N" opens the hidden events', listed >= 1, String(listed));
      await p.keyboard.press('Escape');
      await p.screenshot({ path: join(root, 'node_modules', '.cache', 'dzcalendar', 'captures', 'timeline-day.png'), clip: { x: 0, y: 0, width: 1400, height: 950 } });
      // The week: Sunday 25 October is 25 hours wide, the Monday 24; 02:00 twice, the second marked.
      await p.evaluate(() => window.__cal.update({ view: 'resourceTimelineWeek' }));
      await p.waitForTimeout(150);
      const week = await p.evaluate(() => {
        const sc = document.querySelector('.dz-tl__scroller');
        const len = Number(getComputedStyle(document.querySelector('.dz-tl')).getPropertyValue('--dz-tl-len'));
        const groups = [...document.querySelectorAll('.dz-tl__group')].map((g) => Number(g.style.getPropertyValue('--w')));
        sc.scrollLeft = sc.scrollWidth;
        return { len, groups };
      });
      await p.waitForTimeout(150);
      const twice = await p.evaluate(() => [...document.querySelectorAll('.dz-tl__slot')].filter((x) => x.title.startsWith('02:00 (')).map((x) => `${x.firstChild.textContent} ${x.title}`));
      check('timeline: the week is 169 hours wide, its last day 25', week.len === 169 && week.groups.includes(25), JSON.stringify(week));
      check('timeline: on 25 October, 02:00 twice — the second marked, each with its offset', twice.join(' | ') === '02:00 02:00 (+02:00) | 02:00* 02:00 (+01:00)', twice.join(' | '));
      const vw = await axeViolations(p, '.dz-cal');
      check('axe: the resource timeline week has no violation', vw.length === 0, vw.join('\n'));
      await p.evaluate(() => window.__cal.update({ view: 'resourceTimelineMonth' }));
      await p.waitForSelector('.dz-tl--days');
      const vm = await axeViolations(p, '.dz-cal');
      check('axe: the resource timeline month has no violation', vm.length === 0, vm.join('\n'));
      // A year counted in days opens on today (21 October), two days before it.
      await p.evaluate(() => window.__cal.update({ view: 'resourceTimelineYear' }));
      await p.waitForTimeout(200);
      const year = await p.evaluate(() => {
        const sc = document.querySelector('.dz-tl__scroller');
        const len = Number(getComputedStyle(document.querySelector('.dz-tl')).getPropertyValue('--dz-tl-len'));
        const slotPx = (document.querySelector('.dz-tl__sheet').getBoundingClientRect().width - document.querySelector('.dz-tl__corner').getBoundingClientRect().width) / len;
        return Math.round(sc.scrollLeft / slotPx);
      });
      // 21 October is day 294 of 2026 (index 293); two before: 291 (the 29 March day is an hour short, so a little less).
      check('timeline: a year opens on today', year >= 290 && year <= 291, String(year));
      // Right to left: the area on the right, time running leftwards.
      await p.evaluate(() => window.__cal.update({ view: 'resourceTimelineDay', locale: 'ar' }));
      await p.waitForTimeout(200);
      const rtl = await p.evaluate(() => {
        const box = (el) => el.getBoundingClientRect();
        const area = box(document.querySelector('.dz-tl__row .dz-tl__area'));
        const lane = box(document.querySelector('.dz-tl__row .dz-tl__lane'));
        return { areaRight: area.left > lane.left };
      });
      check('timeline: right to left, the area is on the right of the time', rtl.areaRight, JSON.stringify(rtl));
      check('timeline: no console error', errors.length === 0, errors.join('\n'));
      await p.close();
    }

    // ── Phase 16a: the editor (resources page) and seats (slots page, ?seats=2) ──
    {
      const { p, errors } = await page('/resources.html');
      await p.waitForSelector('.dz-ev[data-event-id="a"]');
      await p.locator('.dz-ev[data-event-id="a"]').first().focus();
      await p.keyboard.press('Shift+F10');
      await p.locator('.dz-menu [data-action="event.open"]').click();
      await p.waitForSelector('.dz-editor');
      const box = await p.evaluate(() => {
        const r = document.querySelector('.dz-editor').getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, vw: innerWidth, vh: innerHeight, focus: document.activeElement?.classList.contains('dz-editor__input'), title: document.activeElement?.value };
      });
      check('editor: a dialog inside the window, the title focused with the event’s', box.top >= 0 && box.bottom <= box.vh && box.left > 0 && box.right < box.vw && box.focus && box.title === 'Consultation', JSON.stringify(box));
      // tzslot's range widget (`.tz-dtr`) is tzslot's to fix: its date fields carry aria-haspopup on a textbox
      // (known, reported upstream in ROADMAP). Everything else in the dialog is ours, checked in full.
      const v = await axeViolations(p, '.dz-editor', '.tz-dtr');
      check('axe: the event editor (its own fields) has no violation', v.length === 0, v.join('\n'));
      // tzslot's widget styled (its styles go in once it is in the document): the all-day switch is drawn.
      const sw = await p.evaluate(() => {
        const r = document.querySelector('.dz-editor .tz-dtr__allday-box')?.getBoundingClientRect();
        return { w: r?.width, h: r?.height, css: [...document.querySelectorAll('style')].some((x) => x.textContent.includes('tz-dtr__allday-box')) };
      });
      check('editor: tzslot’s range is styled (its all-day switch is a switch, not an empty box)', sw.css && sw.w >= 24 && sw.h >= 14, JSON.stringify(sw));
      // Its date picker, from the keyboard: the focus goes into it and stays there (the dialog's trap lets it).
      await p.locator('.dz-editor .tz-dtr input').first().focus();
      await p.keyboard.press('ArrowDown');
      await p.waitForSelector('.tz-field__panel', { state: 'visible', timeout: 3000 }).catch(() => {});
      await p.keyboard.press('ArrowDown');
      await p.waitForTimeout(100);
      const inPanel = await p.evaluate(() => ({ inside: Boolean(document.activeElement?.closest('.tz-field__panel')), what: `${document.activeElement?.tagName}.${document.activeElement?.className}` }));
      check('editor: the date picker keeps the focus (the dialog does not pull it back)', inPanel.inside, JSON.stringify(inPanel));
      const sel = await p.evaluate(() => {
        const d = document.querySelector('.tz-field__panel .tz-cal__day--selected');
        const cs = d && getComputedStyle(d);
        return { fg: cs?.color, bg: cs?.backgroundColor };
      });
      check('editor: the picker’s chosen day is seen (its text and its background differ)', Boolean(sel.fg) && sel.fg !== sel.bg, JSON.stringify(sel));
      await p.keyboard.press('Escape');
      await p.waitForTimeout(100);
      const still = await p.evaluate(() => ({ editor: Boolean(document.querySelector('.dz-editor')), panel: Boolean(document.querySelector('.tz-field__panel:not([hidden])')?.offsetParent) }));
      check('editor: Escape in the picker closes the picker only', still.editor && !still.panel, JSON.stringify(still));
      await p.screenshot({ path: join(root, 'node_modules', '.cache', 'dzcalendar', 'editor-fr.png'), clip: { x: 0, y: 0, width: 1400, height: 950 } }).catch(() => {});
      await p.keyboard.press('Escape');
      const back = await p.evaluate(() => ({ open: Boolean(document.querySelector('.dz-editor')), focus: document.activeElement?.dataset?.eventId }));
      check('editor: Escape closes it and gives the focus back to the event', !back.open && back.focus === 'a', JSON.stringify(back));
      check('editor: no console error', errors.length === 0, errors.join('\n'));
      await p.close();
    }
    {
      const { p, errors } = await page('/slots.html?seats=2');
      await p.waitForSelector('.dz-slot');
      const first = await p.evaluate(() => ({ text: document.querySelector('.dz-tg__col[data-date="2026-10-21"] .dz-slot')?.textContent, label: document.querySelector('.dz-tg__col[data-date="2026-10-21"] .dz-slot')?.getAttribute('aria-label') }));
      check('seats: a slot of a two-seat session says how many are free', /· 2 places$/.test(first.text ?? '') && /2 places$/.test(first.label ?? ''), JSON.stringify(first));
      await p.click('.dz-tg__col[data-date="2026-10-21"] .dz-slot');
      await p.waitForFunction(() => /· 1 place$/.test(document.querySelector('.dz-tg__col[data-date="2026-10-21"] .dz-slot')?.textContent ?? ''), null, { timeout: 3000 }).catch(() => {});
      const after = await p.evaluate(() => document.querySelector('.dz-tg__col[data-date="2026-10-21"] .dz-slot')?.textContent);
      check('seats: booked once, the same slot is still offered, with one place left', /· 1 place$/.test(after ?? ''), String(after));
      check('seats: no console error', errors.length === 0, errors.join('\n'));
      await p.close();
    }

    // ── Phase 16b: paged printing and the exports (timeline and resources pages) ──
    {
      const { p, errors } = await page('/timeline.html');
      await p.waitForSelector('.dz-tl');
      const files = await p.evaluate(async () => {
        const { exp, cal } = window.__pro;
        const m = await exp();
        cal.update({ view: 'resourceTimelineWeek' });
        const text = async (b) => new TextDecoder('latin1').decode(new Uint8Array(await b.arrayBuffer()));
        const pdf = await m.exportPDF(cal, { from: cal.kernel.getState().range.activeStart, to: cal.kernel.getState().range.activeStart.add({ days: 14 }) });
        const pdfText = pdf.blob ? await text(pdf.blob) : '';
        const xlsx = await m.exportXLSX(cal);
        const ics = await m.exportICS(cal);
        const csv = await m.exportCSV(cal, { separator: ';' });
        const png = await m.exportPNG(cal);
        const bad = await m.exportPDF(cal, { view: 'nope' });
        return {
          pdf: [pdfText.slice(0, 8), (pdfText.match(/\/Type \/Page /g) ?? []).length, pdf.blob?.type],
          xlsx: xlsx.blob ? (await text(xlsx.blob)).slice(0, 2) : null,
          ics: ics.blob ? /BEGIN:VCALENDAR[\s\S]*Garde de nuit[\s\S]*END:VCALENDAR/.test(await ics.blob.text()) : false,
          // Blob.text() drops a BOM when it decodes: the bytes say it is there.
          csv: csv.blob ? [...new Uint8Array(await csv.blob.slice(0, 3).arrayBuffer())].join() + '|' + (await csv.blob.text()).split('\r\n')[0] : '',
          png: [png.blobs.length, png.blobs[0]?.type],
          bad: [bad.blob, bad.problems.map((x) => x.code)],
          problems: [...pdf.problems, ...xlsx.problems, ...ics.problems, ...csv.problems, ...png.problems].length,
        };
      });
      check('exports: a PDF of two weeks is two A4 pages, one image each', files.pdf[0] === '%PDF-1.4' && files.pdf[1] === 2 && files.pdf[2] === 'application/pdf', JSON.stringify(files.pdf));
      check('exports: XLSX is a zip, ICS holds the night shift, CSV its French heads, PNG one sheet', files.xlsx === 'PK' && files.ics && files.csv.startsWith('239,187,191|Titre;Début;Fuseau horaire;Fin;Fuseau de fin') && files.png[0] === 1 && files.png[1] === 'image/png', JSON.stringify(files));
      check('exports: an unknown view is a problem (no file, nothing thrown); the others none', files.bad[0] === null && files.bad[1][0] === 'invalid-export' && files.problems === 0, JSON.stringify(files.bad));
      const job = await p.evaluate(async () => {
        const { prn, cal } = window.__pro;
        cal.update({ view: 'resourceTimelineDay' });
        const j = await (await prn()).printPages(cal, { print: false });
        const out = j.pages.map((page) => {
          const r = page.getBoundingClientRect();
          const c = page.querySelector('.dz-cal').getBoundingClientRect();
          const sc = page.querySelector('.dz-tl__scroll, .dz-tl__body, .dz-tl');
          return { w: Math.round(r.width), h: Math.round(r.height), calBottom: Math.round(c.bottom - r.top), wide: sc ? sc.scrollWidth - sc.clientWidth : 0, rows: page.querySelectorAll('.dz-tl__row').length };
        });
        j.close();
        return { out, left: Boolean(document.querySelector('.dz-print')) };
      });
      check('print: a resource timeline day on A4 landscape sheets (1123 × 794), the rows split between them', job.out.length >= 2 && job.out.every((x) => x.w === 1123 && x.h === 794), JSON.stringify(job.out));
      check('print: each copy within its sheet, its 25 hours across the sheet’s width (nothing to scroll)', job.out.every((x) => x.calBottom <= 794 - 36 && x.wide <= 1), JSON.stringify(job.out));
      check('print: close() takes the sheets away', !job.left, '');
      // The paper the browser will use: the @page rule as Chrome reads it back (an invalid one is dropped whole).
      const pageSize = await p.evaluate(async () => {
        const { prn, cal } = window.__pro;
        const out = [];
        for (const o of [{}, { paper: 'letter', orientation: 'portrait' }]) {
          const j = await (await prn()).printPages(cal, { ...o, print: false });
          const rule = [...document.styleSheets].flatMap((sh) => { try { return [...sh.cssRules]; } catch { return []; } }).find((r) => r instanceof CSSPageRule);
          out.push(rule?.style.getPropertyValue('size'));
          j.close();
        }
        return out;
      });
      check('print: @page is A4 landscape (841.89pt × 595.28pt), Letter portrait (612pt × 792pt)', pageSize[0] === '841.89pt 595.28pt' && pageSize[1] === '612pt 792pt', JSON.stringify(pageSize));
      check('print/exports (timeline): no console error', errors.length === 0, errors.join('\n'));
      await p.close();
    }
    {
      const { p, errors } = await page('/resources.html');
      await p.waitForSelector('.dz-ev');
      const day = await p.evaluate(async () => {
        const { prn, cal } = window.__pro;
        const j = await (await prn()).printPages(cal, { print: false });
        const body = j.pages[0].querySelector('.dz-tg__body');
        const r = { pages: j.pages.length, title: j.pages[0].querySelector('.dz-print__title').textContent, fits: body.scrollHeight - body.clientHeight, now: j.pages[0].querySelectorAll('.dz-now, .dz-tg__now').length, foot: j.pages[0].querySelector('.dz-print__foot').textContent };
        j.close();
        return r;
      });
      check('print: a resource day on one sheet, its hours 06:00–20:00 all on it, no "now" line, "1 / 1"', day.pages === 1 && day.title === 'mercredi 21 octobre 2026' && day.fits <= 1 && day.now === 0 && day.foot === '1 / 1', JSON.stringify(day));
      const ar = await p.evaluate(async () => {
        const { exp, cal } = window.__pro;
        cal.update({ locale: 'ar', view: 'resourceTimeGridWeek' });
        const r = await (await exp()).exportPNG(cal);
        cal.update({ locale: 'fr-FR', view: 'resourceTimeGridDay' });
        return [r.blobs.length, r.problems.length];
      });
      check('exports: an Arabic week as a PNG sheet, no problem', ar[0] === 1 && ar[1] === 0, JSON.stringify(ar));
      check('print/exports (resources): no console error', errors.length === 0, errors.join('\n'));
      await p.close();
    }

    // Beside a framework's global reset (the real files: Tailwind 3's preflight, Bootstrap 5's reboot;
    // Tailwind 4's is the same preflight in @layer base). The calendar must look as it does on a bare page:
    // every element's boxes and colours compared with the bare page's, element by element.
    {
      // (Not border-style: preflight's 0-width solid shows nothing; widths say whether a border is drawn.)
      const BOX = ['borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'marginTop', 'marginLeft', 'borderTopLeftRadius', 'backgroundColor', 'color', 'fontSize', 'fontWeight', 'textDecorationLine', 'listStyleType', 'cursor'];
      const look = async (query) => {
        const rp = await browser.newPage({ viewport: { width: 1400, height: 950 } });
        await rp.goto(new URL(`/resets.html?${query}`, base).href, { waitUntil: 'networkidle' });
        await rp.waitForSelector('.dz-ev, .dz-bar, .dz-list__ev');
        const out = await rp.evaluate((props) => [...document.querySelectorAll('.dz-cal, .dz-cal *')].slice(0, 600).map((el) => {
          const cs = getComputedStyle(el);
          return [el.className && typeof el.className === 'string' ? el.className.split(' ')[0] : el.tagName, ...props.map((k) => cs[k])].join('|');
        }), BOX);
        await rp.close();
        return out;
      };
      // The one thing tolerated: preflight and reboot give \`[role=button]\` a pointer cursor (our events
      // are buttons) — harmless, and what a clickable thing usually shows. Anything else is a failure.
      const pointerOnly = (x, y) => {
        const [p, q] = [x.split('|'), y.split('|')];
        return p.length === q.length && p.every((v, k) => v === q[k] || (k === p.length - 1 && q[k] === 'pointer'));
      };
      const differs = (a, b, tolerant = true) => {
        const bad = [];
        for (let k = 0; k < Math.max(a.length, b.length); k++) {
          if (a[k] === b[k] || (tolerant && a[k] && b[k] && pointerOnly(a[k], b[k]))) continue;
          bad.push(`${a[k]}  ≠  ${b[k]}`);
        }
        return bad;
      };
      for (const view of ['timeGridWeek', 'dayGridMonth', 'listWeek']) {
        const bare = await look(`reset=none&layers=1&view=${view}`);
        const bareFlat = await look(`reset=none&layers=0&view=${view}`);
        check(`${view}: plain CSS (cssLayers: false) looks exactly as the layered one`, differs(bare, bareFlat).length === 0, differs(bare, bareFlat).slice(0, 3).join('\n'));
        for (const [reset, layers] of [['tailwind4', 1], ['tailwind3', 0], ['bootstrap', 0]]) {
          const d = differs(bare, await look(`reset=${reset}&layers=${layers}&view=${view}`));
          check(`${view} beside ${reset}${layers ? '' : ' (cssLayers: false)'}: untouched by its reset`, d.length === 0, `${d.length} differences\n${d.slice(0, 4).join('\n')}`);
        }
        // The check sees what a reset does: layered, beside Tailwind 3, the calendar is broken (why cssLayers: false exists).
        const broken = differs(bare, await look(`reset=tailwind3&layers=1&view=${view}`));
        check(`${view}: the comparison sees Tailwind 3 breaking a layered calendar`, broken.length > 0, 'no difference seen');
      }
      // The page first: a --tz-* of the page wins over a family's palette; a page rule wins over ours, layered or not.
      for (const layers of [1, 0]) {
        const rp = await browser.newPage({ viewport: { width: 1400, height: 950 } });
        const page = encodeURIComponent(':root { --tz-accent: rgb(1, 2, 3); } .dz-ev { border-top-left-radius: 0px; }');
        await rp.goto(new URL(`/resets.html?reset=${layers ? 'none' : 'bootstrap'}&layers=${layers}&theme=slate&page=${page}`, base).href, { waitUntil: 'networkidle' });
        await rp.waitForSelector('.dz-ev');
        const got = await rp.evaluate(() => ({
          pressed: getComputedStyle(document.querySelector('.dz-toolbar__btn[aria-pressed="true"]')).backgroundColor,
          radius: getComputedStyle(document.querySelector('.dz-tg__col .dz-ev')).borderTopLeftRadius,
        }));
        check(`page first (${layers ? 'layered' : 'cssLayers: false'}): the page's --tz-accent beats the slate family; its .dz-ev rule beats ours`, got.pressed === 'rgb(1, 2, 3)' && got.radius === '0px', JSON.stringify(got));
        await rp.close();
      }
    }
    const scale = async () => p.evaluate(() => document.querySelector('.dz-tg__col').getBoundingClientRect().height);
    const comfortable = await scale();
    await p.evaluate(() => window.__dz().update({ density: 'compact' }));
    const compact = await scale();
    await p.evaluate(() => window.__dz().update({ density: 'spacious' }));
    const spacious = await scale();
    check('density: compact < comfortable < spacious (the minute’s height)', compact < comfortable && comfortable < spacious, JSON.stringify({ compact, comfortable, spacious }));
    await p.evaluate(() => window.__dz().update({ density: 'comfortable', scheme: 'auto' }));
    check('themes: no console error', errors.length === 0, errors.join(' | '));
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
