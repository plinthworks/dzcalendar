import { describe, it, expect } from 'vitest';
import { migrateSource, migrateTemplate } from '../src/index.js';

describe('dz-migrate: a vanilla application', () => {
  it('imports, plugins, a locale, new Calendar, the calls on it', async () => {
    const before = `import { Calendar } from '@fullcalendar/core';
import type { EventClickArg } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import listPlugin from '@fullcalendar/list';
import arLocale from '@fullcalendar/core/locales/ar';

const calendar = new Calendar(document.getElementById('cal')!, {
  plugins: [dayGridPlugin, listPlugin],
  locale: arLocale,
  initialView: 'dayGridMonth',
  eventClick: (info: EventClickArg) => console.log(info.event.title),
});
calendar.render();
document.getElementById('next')!.onclick = () => calendar.next();
calendar.changeView('listWeek');
calendar.gotoDate('2026-10-21');
`;
    const r = await migrateSource(before, 'main.ts');
    expect(r.text).toBe(`import { createFromFullCalendar } from "@dzcalendar/compat-fullcalendar";
import type { EventClickArg } from "@dzcalendar/compat-fullcalendar";
import "@dzcalendar/dom/list";
import "@dzcalendar/dom/locales/ar";

const calendar = createFromFullCalendar(document.getElementById('cal')!, {
  locale: 'ar',
  initialView: 'dayGridMonth',
  eventClick: (info: EventClickArg) => console.log(info.event.title),
}).calendar;
document.getElementById('next')!.onclick = () => calendar.navigate('next');
calendar.update({ view: 'listWeek' });
// dz-migrate: gotoDate() — see docs/migrating-from-fullcalendar.md
calendar.gotoDate('2026-10-21');
`);
    expect(r.notes).toEqual(['gotoDate() — see docs/migrating-from-fullcalendar.md']);
  });

  it('a file without FullCalendar is left as it is', async () => {
    expect(await migrateSource(`const x = 1;\n`, 'x.ts')).toEqual({ text: `const x = 1;\n`, notes: [], changed: false });
  });
});

describe('dz-migrate: Angular', () => {
  it('a standalone component: FullCalendarModule → the calendar and the options directive; an inline template', async () => {
    const before = `import { Component } from '@angular/core';
import { FullCalendarModule } from '@fullcalendar/angular';
import { CalendarOptions } from '@fullcalendar/core';
import timeGridPlugin from '@fullcalendar/timegrid';

@Component({
  selector: 'app-agenda',
  standalone: true,
  imports: [FullCalendarModule],
  template: '<full-calendar [options]="calendarOptions"></full-calendar>',
})
export class Agenda {
  calendarOptions: CalendarOptions = { plugins: [timeGridPlugin], initialView: 'timeGridWeek' };
}
`;
    const r = await migrateSource(before, 'agenda.ts');
    expect(r.text).toContain(`imports: [DZ_CALENDAR, DzFullCalendar],`);
    expect(r.text).toContain(`template: '<dz-calendar [dzFullCalendar]="calendarOptions"></dz-calendar>',`);
    expect(r.text).toContain(`calendarOptions: CalendarOptions = { initialView: 'timeGridWeek' };`);
    expect(r.text).toContain(`import { DZ_CALENDAR } from "@dzcalendar/angular";`);
    expect(r.text).toContain(`import { DzFullCalendar } from "@dzcalendar/angular/fullcalendar";`);
    expect(r.text).toContain(`import type { CalendarOptions } from "@dzcalendar/compat-fullcalendar";`);
    expect(r.text).not.toContain('@fullcalendar/');
  });

  it('an external template, read with Angular’s compiler: the tag, its closing tag, [options]; an input with nothing to do dropped', async () => {
    const r = await migrateTemplate(`<div class="x">\n  <full-calendar #cal [options]="opts" [deepChangeDetection]="true"></full-calendar>\n</div>\n`);
    expect([r.text, r.notes]).toEqual([`<div class="x">\n  <dz-calendar #cal [dzFullCalendar]="opts"></dz-calendar>\n</div>\n`, ['<full-calendar> deepChangeDetection: nothing to do (dropped)']]);
  });
});

describe('dz-migrate: after review', () => {
  it('a class holding its calendar: the field’s type, this.calendar = new Calendar, its calls; render chained', async () => {
    const before = `import { Calendar } from '@fullcalendar/core';

export class Agenda {
  calendar!: Calendar;
  start(el: HTMLElement) {
    this.calendar = new Calendar(el, { initialView: 'dayGridMonth' });
    this.calendar.render();
    this.calendar.next();
    this.calendar.select('2026-10-21');
  }
}
const other: Calendar = new Calendar(document.body, {}).render();
`;
    const r = await migrateSource(before, 'agenda.ts');
    expect(r.text).toBe(`import { createFromFullCalendar } from "@dzcalendar/compat-fullcalendar";
import type { CalendarInstance } from "@dzcalendar/dom";

export class Agenda {
  calendar!: CalendarInstance;
  start(el: HTMLElement) {
    this.calendar = createFromFullCalendar(el, { initialView: 'dayGridMonth' }).calendar;
    this.calendar.navigate('next');
    // dz-migrate: select() — see docs/migrating-from-fullcalendar.md
    this.calendar.select('2026-10-21');
  }
}
const other: CalendarInstance = createFromFullCalendar(document.body, {}).calendar;
`);
  });

  it('an inline template keeps its quotes; what is text stays text (\${…}, backslashes)', async () => {
    const before = "import { FullCalendarModule } from '@fullcalendar/angular';\n@Component({ imports: [FullCalendarModule], template: `<full-calendar [options]=\"o\"></full-calendar><p title=\"\\${a}\">a\\\\nb</p>` })\nclass A {}\n";
    const r = await migrateSource(before, 'a.ts');
    expect(r.text).toContain("template: `<dz-calendar [dzFullCalendar]=\"o\"></dz-calendar><p title=\"\\${a}\">a\\\\nb</p>`");
  });

  it('import * as is left and said; locales-all imports the languages that are an import here', async () => {
    const ns = await migrateSource(`import * as FC from '@fullcalendar/core';\nnew FC.Calendar(document.body, {});\n`, 'ns.ts');
    expect([ns.changed, ns.notes]).toEqual([false, ['@fullcalendar/core: import * as FC — not migrated (import the names instead)']]);
    const all = await migrateSource(`import allLocales from '@fullcalendar/core/locales-all';\nexport const o = { locales: allLocales };\n`, 'l.ts');
    expect(all.text).toBe(`import "@dzcalendar/dom/locales/ar";\nimport "@dzcalendar/dom/locales/es";\nimport "@dzcalendar/dom/locales/de";\n\nexport const o = { };\n`);
  });

  it('running it twice changes nothing more', async () => {
    const once = await migrateSource(`import { Calendar } from '@fullcalendar/core';\nconst c = new Calendar(document.body, {});\nc.render();\nc.today();\n`, 'x.ts');
    expect((await migrateSource(once.text, 'x.ts')).changed).toBe(false);
  });
});

describe('dz-migrate after Sehhaty’s test', () => {
  it('a type imported from a plugin (DateClickArg from interaction) is kept, from compat', async () => {
    const r = await migrateSource(`import interactionPlugin, { DateClickArg } from '@fullcalendar/interaction';\nexport const f = (a: DateClickArg) => a.dateStr;\nexport const p = [interactionPlugin];\n`, 'x.ts');
    expect([r.text.includes('import type { DateClickArg } from "@dzcalendar/compat-fullcalendar";'), r.notes]).toEqual([true, []]);
  });
});


describe('their Draggable (18f-4)', () => {
  it('is imported from the compat, as a value', async () => {
    const r = await migrateSource(`import interactionPlugin, { Draggable } from '@fullcalendar/interaction';\nnew Draggable(document.getElementById('list')!, { itemSelector: '.card' });\nexport const p = [interactionPlugin];\n`, 'x.ts');
    expect([r.text.includes('import { Draggable } from "@dzcalendar/compat-fullcalendar";'), r.text.includes('new Draggable('), r.notes.some((n) => n.includes('Draggable'))]).toEqual([true, true, false]);
  });
});
