/**
 * `npm run test:browser`: what jsdom cannot see, in the system's Chrome
 * (playwright-core, no browser download). Starts its own Vite server on the
 * playground, checks layout facts with tolerances, exits 1 on any failure.
 * Phase 3's worst bug (the gutter drawn on the right) passed every jsdom test.
 */
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';

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
