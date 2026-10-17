/**
 * `npm run test:package`: what a consumer gets. Installs the tarballs of
 * `npm run pack:local` into a fresh Angular application (no lockfile, so no
 * stale 0.0.0 from npm's cache) and runs `ng build` with strict templates and
 * the libraries' types checked. Needs the network for Angular itself.
 * tzslot's rule: a green test suite has shipped packages that did not build.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const packed = join(root, 'packed');
/** Every Angular major the package declares, each with the TypeScript its compiler takes. */
const MAJORS = { 19: '~5.8.0', 20: '~5.9.0', 21: '~5.9.0', 22: '~6.0.0' };
const asked = process.argv.slice(2);
const majors = asked.length > 0 ? asked : Object.keys(MAJORS);
const tgz = (name) => {
  const f = readdirSync(packed).find((x) => x.startsWith(`dzcalendar-${name}-`) && x.endsWith('.tgz'));
  if (!f) throw new Error(`no ${name} tarball in packed/: run npm run pack:local`);
  return `file:${join(packed, f)}`;
};
for (const major of majors) smoke(major, MAJORS[major]);

function smoke(major, typescript) {
const angular = `^${major}.0.0`;
const app = join(packed, `app-${major}`);
console.log(`\n── Angular ${major} ──`);
rmSync(app, { recursive: true, force: true });
mkdirSync(join(app, 'src'), { recursive: true });
const write = (file, text) => writeFileSync(join(app, file), text);
write('package.json', JSON.stringify({
  name: 'dzcalendar-smoke', private: true, type: 'module',
  dependencies: {
    '@angular/common': angular, '@angular/compiler': angular, '@angular/core': angular, '@angular/platform-browser': angular,
    '@dzcalendar/angular': tgz('angular'), '@dzcalendar/core': tgz('core'), '@dzcalendar/dom': tgz('dom'), '@dzcalendar/rrule': tgz('rrule'),
    '@dzcalendar/ical': tgz('ical'), '@dzcalendar/theme': tgz('theme'), rxjs: '~7.8.0', tslib: '^2.6.0',
  },
  devDependencies: { '@angular/build': angular, '@angular/cli': angular, '@angular/compiler-cli': angular, typescript },
}, null, 2));
write('angular.json', JSON.stringify({
  version: 1, projects: { app: { projectType: 'application', root: '', sourceRoot: 'src', architect: { build: { builder: '@angular/build:application',
    options: { outputPath: 'dist', index: 'src/index.html', browser: 'src/main.ts', tsConfig: 'tsconfig.json', styles: ['node_modules/@dzcalendar/theme/dzcalendar.css'] } } } } },
  cli: { analytics: false },
}, null, 2));
write('tsconfig.json', JSON.stringify({
  compilerOptions: { target: 'ES2022', module: 'ES2022', moduleResolution: 'bundler', lib: ['ES2022', 'DOM'], strict: true, skipLibCheck: false, useDefineForClassFields: false },
  angularCompilerOptions: { strictTemplates: true }, files: ['src/main.ts'],
}, null, 2));
write('src/index.html', '<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>smoke</title></head><body><app-root></app-root></body></html>\n');
// Every entry a consumer imports, used in a template with strict checking.
write('src/main.ts', `import * as ng from '@angular/core';
import { Component, signal } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { CalendarController, DZ_CALENDAR, provideDzCalendar } from '@dzcalendar/angular';
import type { DzCalendarOptions } from '@dzcalendar/angular';
import { LIST_CSS } from '@dzcalendar/dom/list';
import { MULTIMONTH_CSS } from '@dzcalendar/dom/multimonth';
import { defineView } from '@dzcalendar/dom/custom';
import { buildListModel } from '@dzcalendar/core/views';
import { parseICal } from '@dzcalendar/ical';
import { Temporal } from '@dzcalendar/core';
import type { EventInput, PlainDate, Selection } from '@dzcalendar/core';

const agenda = defineView({ type: 'agenda', duration: { days: 3 }, render: (el, data) => (el.textContent = String(data.instances.length)) });
void [LIST_CSS, MULTIMONTH_CSS, buildListModel, parseICal, CalendarController];

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [DZ_CALENDAR],
  template: \`
    <h1>{{ cal.controller.title() }}</h1>
    <dz-calendar #cal [events]="events()" [(view)]="view" [(date)]="date" [(selection)]="selection" [editable]="true" [options]="options">
      <ng-template dzEventContent let-event="event" let-ctx="ctx"><b>{{ event.title }}</b> {{ ctx.timeText }}</ng-template>
    </dz-calendar>\`,
})
class App {
  readonly events = signal<readonly EventInput[]>([{ id: 'a', title: 'Réunion', start: '2026-10-21T09:00[Europe/Paris]', duration: { hours: 1 } }]);
  readonly view = signal<string | undefined>('listWeek');
  readonly date = signal<PlainDate | undefined>(Temporal.PlainDate.from('2026-10-21'));
  readonly selection = signal<Selection | null>(null);
  readonly options: DzCalendarOptions = { headerViews: ['listWeek', 'agenda', 'multiMonthYear'], weekNumbers: true };
}

// Angular 19 names it experimental; 20.2 and later, stable.
const zoneless = ((ng as Record<string, unknown>)['provideZonelessChangeDetection'] ?? (ng as Record<string, unknown>)['provideExperimentalZonelessChangeDetection']) as () => ng.EnvironmentProviders;
bootstrapApplication(App, { providers: [zoneless(), provideDzCalendar({ timeZone: 'Europe/Paris', locale: 'fr-FR', views: { agenda } })] });
`);

const run = (cmd, args) => execFileSync(cmd, args, { cwd: app, stdio: 'inherit' });
run('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error']);
run('npx', ['ng', 'build']);
console.log(`✓ Angular ${major}: a fresh application built against the packed tarballs`);
}
