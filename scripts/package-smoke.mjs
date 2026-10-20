/**
 * `npm run test:package`: what a consumer gets. Installs the tarballs of
 * `npm run pack:local` into a fresh Angular application (no lockfile, so no
 * stale 0.0.0 from npm's cache) and runs `ng build` with strict templates and
 * the libraries' types checked. Needs the network for Angular itself.
 * tzslot's rule: a green test suite has shipped packages that did not build.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const packed = join(root, 'packed');
/** Every Angular major the package declares, each with the TypeScript its compiler takes. */
const MAJORS = { 19: '~5.8.0', 20: '~5.9.0', 21: '~5.9.0', 22: '~6.0.0' };
/** React and Vue: each version the packages declare, built by Vite with its own type checker. */
const FRAMEWORKS = {
  react18: { react: '18.3.1', types: '18.3.31', typesDom: '18.3.7' },
  react19: { react: '19.2.8', types: '19.2.18', typesDom: '19.2.7' },
  'vue3.4': { vue: '3.4.38' },
  'vue3.5': { vue: '3.5.43' },
};
const asked = process.argv.slice(2);
const majors = asked.length > 0 ? asked.filter((a) => a in MAJORS) : Object.keys(MAJORS);
const frameworks = asked.length > 0 ? asked.filter((a) => a in FRAMEWORKS) : Object.keys(FRAMEWORKS);
const tgz = (name) => {
  const f = readdirSync(packed).find((x) => x.startsWith(`dzcalendar-${name}-`) && x.endsWith('.tgz'));
  if (!f) throw new Error(`no ${name} tarball in packed/: run npm run pack:local`);
  return `file:${join(packed, f)}`;
};
for (const major of majors) smoke(major, MAJORS[major]);
// `ng add @dzcalendar/angular` on the oldest and the newest Angular: a bare application, the schematic, a build.
for (const major of majors.filter((m) => m === '19' || m === '22')) ngAdd(major, MAJORS[major]);
// dz-migrate on an application written for FullCalendar (not installed): rewritten, then it builds on ours alone.
for (const major of majors.filter((m) => m === '22')) migrateApp(major, MAJORS[major]);
for (const f of frameworks) (f.startsWith('react') ? reactApp : vueApp)(f, FRAMEWORKS[f]);

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
    '@dzcalendar/ical': tgz('ical'), '@dzcalendar/slots': tgz('slots'), '@dzcalendar/pro': tgz('pro'), '@dzcalendar/pro-angular': tgz('pro-angular'), '@tzslot/dom': '^2.2.0', '@dzcalendar/theme': tgz('theme'), rxjs: '~7.8.0', tslib: '^2.6.0',
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
import { findSlots } from '@dzcalendar/slots';
import { TIMELINE_CSS } from '@dzcalendar/pro';
import { buildTimelineAxis } from '@dzcalendar/pro/model';
import { openEventEditor } from '@dzcalendar/pro/editor';
import { findSlots as findSeats } from '@dzcalendar/pro/slots';
import { exportXLSX } from '@dzcalendar/pro/export';
import { printPages } from '@dzcalendar/pro/print';
import { DzEventEditor } from '@dzcalendar/pro-angular';
import { Temporal } from '@dzcalendar/core';
import type { EventInput, PlainDate, Selection } from '@dzcalendar/core';

const agenda = defineView({ type: 'agenda', duration: { days: 3 }, render: (el, data) => (el.textContent = String(data.instances.length)) });
void [LIST_CSS, MULTIMONTH_CSS, buildListModel, parseICal, findSlots, CalendarController, TIMELINE_CSS, buildTimelineAxis, openEventEditor, findSeats, exportXLSX, printPages];

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [DZ_CALENDAR, DzEventEditor],
  template: \`
    <h1>{{ cal.controller.title() }}</h1>
    <dz-calendar #cal dzEventEditor [events]="events()" [(view)]="view" [(date)]="date" [(selection)]="selection" [editable]="true" [options]="options">
      <ng-template dzEventContent let-event="event" let-ctx="ctx"><b>{{ event.title }}</b> {{ ctx.timeText }}</ng-template>
    </dz-calendar>\`,
})
class App {
  readonly events = signal<readonly EventInput[]>([{ id: 'a', title: 'Réunion', start: '2026-10-21T09:00[Europe/Paris]', duration: { hours: 1 } }]);
  readonly view = signal<string | undefined>('listWeek');
  readonly date = signal<PlainDate | undefined>(Temporal.PlainDate.from('2026-10-21'));
  readonly selection = signal<Selection | null>(null);
  readonly options: DzCalendarOptions = { headerViews: ['listWeek', 'agenda', 'multiMonthYear', 'resourceTimelineDay'], weekNumbers: true, resources: [{ id: 'r', title: 'Salle' }], viewOptions: { timeline: { areaColumns: [{ field: 'title' }] } } };
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

function ngAdd(major, typescript) {
  const angular = `^${major}.0.0`;
  const app = join(packed, `ngadd-${major}`);
  console.log(`\n── ng add, Angular ${major} ──`);
  rmSync(app, { recursive: true, force: true });
  mkdirSync(join(app, 'src', 'app'), { recursive: true });
  const write = (file, text) => writeFileSync(join(app, file), text);
  // The tarballs first (they are not on npm); the schematic then adds the same names, skipping the install.
  write('package.json', JSON.stringify({
    name: 'dzcalendar-ngadd', private: true, type: 'module',
    dependencies: {
      '@angular/common': angular, '@angular/compiler': angular, '@angular/core': angular, '@angular/platform-browser': angular,
      '@dzcalendar/angular': tgz('angular'), '@dzcalendar/core': tgz('core'), '@dzcalendar/dom': tgz('dom'), '@dzcalendar/rrule': tgz('rrule'), '@dzcalendar/theme': tgz('theme'),
      '@dzcalendar/ical': tgz('ical'), '@dzcalendar/slots': tgz('slots'), '@dzcalendar/pro': tgz('pro'), '@dzcalendar/pro-angular': tgz('pro-angular'), '@dzcalendar/motion-gsap': tgz('motion-gsap'),
      '@tzslot/dom': '^2.2.0', gsap: '^3.13.0', rxjs: '~7.8.0', tslib: '^2.6.0',
    },
    devDependencies: { '@angular/build': angular, '@angular/cli': angular, '@angular/compiler-cli': angular, typescript },
  }, null, 2));
  write('angular.json', JSON.stringify({
    version: 1, projects: { app: { projectType: 'application', root: '', sourceRoot: 'src', architect: { build: { builder: '@angular/build:application',
      options: { outputPath: 'dist', index: 'src/index.html', browser: 'src/main.ts', tsConfig: 'tsconfig.json', styles: [] } } } } },
    cli: { analytics: false },
  }, null, 2));
  write('tsconfig.json', JSON.stringify({
    compilerOptions: { target: 'ES2022', module: 'ES2022', moduleResolution: 'bundler', lib: ['ES2022', 'DOM'], strict: true, skipLibCheck: false, useDefineForClassFields: false },
    angularCompilerOptions: { strictTemplates: true }, files: ['src/main.ts'],
  }, null, 2));
  write('src/index.html', '<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>ng add</title></head><body><app-root></app-root></body></html>\n');
  write('src/app/app.config.ts', `import type { ApplicationConfig } from '@angular/core';\nexport const appConfig: ApplicationConfig = { providers: [] };\n`);
  write('src/main.ts', `import { Component } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { Agenda } from './app/agenda';

@Component({ selector: 'app-root', standalone: true, imports: [Agenda], template: '<app-agenda />' })
class App {}
bootstrapApplication(App, appConfig);
`);
  const run = (cmd, args) => execFileSync(cmd, args, { cwd: app, stdio: 'inherit' });
  run('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error']);
  run('npx', ['ng', 'generate', '@dzcalendar/angular:ng-add', '--gsap', '--pro', '--example', '--skip-install', '--interactive=false']);
  const read = (f) => readFileSync(join(app, f), 'utf8');
  const config = read('src/app/app.config.ts');
  const styles = JSON.parse(read('angular.json')).projects.app.architect.build.options.styles;
  const deps = JSON.parse(read('package.json')).dependencies;
  const missing = [
    !config.includes('provideDzCalendar(') && 'provideDzCalendar in app.config.ts',
    !config.includes('provideDzMotion(') && 'provideDzMotion in app.config.ts',
    !styles.includes('node_modules/@dzcalendar/theme/dzcalendar.css') && 'the theme in angular.json',
    !deps['@dzcalendar/pro-angular'] && 'the Pro in package.json',
  ].filter(Boolean);
  if (missing.length > 0) throw new Error(`ng add left out: ${missing.join(', ')}`);
  // Run again: nothing added twice.
  run('npx', ['ng', 'generate', '@dzcalendar/angular:ng-add', '--gsap', '--pro', '--example', '--skip-install', '--interactive=false']);
  const again = read('src/app/app.config.ts');
  const twice = ['provideDzCalendar(', 'provideDzMotion('].filter((x) => again.split(x).length > 2);
  if (twice.length > 0 || JSON.parse(read('angular.json')).projects.app.architect.build.options.styles.length !== styles.length) throw new Error(`ng add run twice doubled: ${twice.join(', ') || 'the styles'}`);
  run('npx', ['ng', 'build']);
  console.log(`✓ ng add, Angular ${major}: theme, providers, GSAP motion, the Pro and the example component (run twice, nothing doubled), then built`);
}

function migrateApp(major, typescript) {
  const angular = `^${major}.0.0`;
  const app = join(packed, `migrate-${major}`);
  console.log(`\n── dz-migrate, Angular ${major} ──`);
  rmSync(app, { recursive: true, force: true });
  mkdirSync(join(app, 'src', 'app'), { recursive: true });
  const write = (file, text) => writeFileSync(join(app, file), text);
  write('package.json', JSON.stringify({
    name: 'dzcalendar-migrate', private: true, type: 'module',
    dependencies: {
      '@angular/common': angular, '@angular/compiler': angular, '@angular/core': angular, '@angular/platform-browser': angular,
      '@dzcalendar/angular': tgz('angular'), '@dzcalendar/core': tgz('core'), '@dzcalendar/dom': tgz('dom'), '@dzcalendar/rrule': tgz('rrule'), '@dzcalendar/theme': tgz('theme'),
      '@dzcalendar/ical': tgz('ical'), '@dzcalendar/compat-fullcalendar': tgz('compat-fullcalendar'), rxjs: '~7.8.0', tslib: '^2.6.0',
    },
    devDependencies: { '@angular/build': angular, '@angular/cli': angular, '@angular/compiler-cli': angular, typescript, '@dzcalendar/migrate': tgz('migrate') },
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
  write('src/index.html', '<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>migrate</title></head><body><app-root></app-root></body></html>\n');
  // Written as for FullCalendar 6 (from its public documentation's usage), not runnable until migrated.
  write('src/app/agenda.ts', `import { Component } from '@angular/core';
import { FullCalendarModule } from '@fullcalendar/angular';
import { CalendarOptions, EventClickArg, DateSelectArg } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import frLocale from '@fullcalendar/core/locales/fr';

@Component({
  selector: 'app-agenda',
  standalone: true,
  imports: [FullCalendarModule],
  templateUrl: './agenda.html',
})
export class Agenda {
  readonly picked: string[] = [];
  calendarOptions: CalendarOptions = {
    plugins: [dayGridPlugin, timeGridPlugin, interactionPlugin],
    initialView: 'timeGridWeek',
    timeZone: 'Europe/Paris',
    locale: frLocale,
    firstDay: 1,
    slotMinTime: '07:00:00',
    editable: true,
    selectable: true,
    headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek' },
    events: [{ id: 'a', title: 'Réunion', start: '2026-10-21T09:00:00', end: '2026-10-21T10:00:00' }],
    eventClick: (info: EventClickArg) => this.picked.push(info.event.title),
    select: (info: DateSelectArg) => this.picked.push(info.startStr),
  };
}
`);
  write('src/app/agenda.html', '<h1>Agenda</h1>\n<full-calendar [options]="calendarOptions"></full-calendar>\n');
  write('src/main.ts', `import { Component } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { Agenda } from './app/agenda';

@Component({ selector: 'app-root', standalone: true, imports: [Agenda], template: '<app-agenda />' })
class App {}
bootstrapApplication(App);
`);
  const run = (cmd, args) => execFileSync(cmd, args, { cwd: app, stdio: 'inherit' });
  run('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error']);
  run('npx', ['dz-migrate', 'src', '--write']);
  const left = ['src/app/agenda.ts', 'src/app/agenda.html'].filter((f) => readFileSync(join(app, f), 'utf8').includes('fullcalendar/') || readFileSync(join(app, f), 'utf8').includes('<full-calendar'));
  if (left.length > 0) throw new Error(`dz-migrate left FullCalendar in: ${left.join(', ')}`);
  run('npx', ['ng', 'build']);
  console.log(`✓ dz-migrate, Angular ${major}: an application written for FullCalendar rewritten, then built on DzCalendar alone`);
}

/** A fresh Vite application (no lockfile) with the tarballs; `files` written, then `check` and `vite build`. */
function viteApp(name, deps, devDeps, files, check, done) {
  const app = join(packed, `app-${name}`);
  console.log(`\n── ${name} ──`);
  rmSync(app, { recursive: true, force: true });
  mkdirSync(join(app, 'src'), { recursive: true });
  const ours = { '@dzcalendar/core': tgz('core'), '@dzcalendar/dom': tgz('dom'), '@dzcalendar/rrule': tgz('rrule'), '@dzcalendar/ical': tgz('ical'), '@dzcalendar/slots': tgz('slots'), '@dzcalendar/pro': tgz('pro'), '@dzcalendar/theme': tgz('theme'), '@tzslot/dom': '^2.2.0' };
  writeFileSync(join(app, 'package.json'), JSON.stringify({ name: `dzcalendar-${name}`, private: true, type: 'module', dependencies: { ...ours, ...deps }, devDependencies: { vite: '6.3.6', typescript: '5.9.3', ...devDeps } }, null, 2));
  writeFileSync(join(app, 'index.html'), '<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>smoke</title></head><body><div id="root"></div><script type="module" src="/src/main.ts"></script></body></html>\n');
  for (const [file, text] of Object.entries(files)) writeFileSync(join(app, file), text);
  const run = (cmd, args) => execFileSync(cmd, args, { cwd: app, stdio: 'inherit' });
  run('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error']);
  run('npx', check);
  run('npx', ['vite', 'build', '--logLevel', 'warn']);
  // The Pro's editor is fetched on its first opening: in a chunk of its own, never in the one the page loads.
  const assets = join(app, 'dist', 'assets');
  const scripts = readdirSync(assets).filter((f) => f.endsWith('.js'));
  const entry = readFileSync(join(app, 'dist', 'index.html'), 'utf8').match(/assets\/([^"]+\.js)/)?.[1];
  const holding = scripts.filter((f) => readFileSync(join(assets, f), 'utf8').includes('dz-editor__btn'));
  if (!entry || holding.length === 0 || holding.includes(entry)) throw new Error(`${name}: the editor is not in a chunk of its own (entry ${entry}, editor in ${holding.join(', ') || 'none'})`);
  console.log(`✓ ${done}`);
}

function reactApp(name, v) {
  const tsconfig = { compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler', lib: ['ES2023', 'DOM', 'DOM.Iterable'], jsx: 'react-jsx', strict: true, skipLibCheck: false, noEmit: true }, include: ['src'] };
  viteApp(
    name,
    { react: v.react, 'react-dom': v.react, '@dzcalendar/react': tgz('react'), '@dzcalendar/pro-react': tgz('pro-react') },
    { '@types/react': v.types, '@types/react-dom': v.typesDom },
    {
      'tsconfig.json': JSON.stringify(tsconfig, null, 2),
      'src/main.ts': "import './app.tsx';\n",
      // Every entry a consumer imports, in JSX, its types checked.
      'src/app.tsx': `import '@dzcalendar/theme/dzcalendar.css';
import '@dzcalendar/pro';
import { createContext, useContext, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Temporal } from '@dzcalendar/core';
import type { CalEvent, EventInput, Selection } from '@dzcalendar/core';
import { DzCalendar, DzCalendarProvider, useCalendarController, useCalendarState } from '@dzcalendar/react';
import type { DzCalendarHandle } from '@dzcalendar/react';
import { useDzExport, useEventEditor } from '@dzcalendar/pro-react';

const Room = createContext('A');
const events: EventInput[] = [{ id: 'a', title: 'Consultation', start: '2026-10-21T09:00[Europe/Paris]', duration: { minutes: 45 } }];

function Badge({ event }: { event: CalEvent }) {
  return <b>{event.title} · {useContext(Room)}</b>;
}

function App() {
  const cal = useCalendarController();
  const { title, canUndo } = useCalendarState(cal);
  const [view, setView] = useState('timeGridWeek');
  const [selection, setSelection] = useState<Selection | null>(null);
  useEventEditor(cal, { onClosed: (o) => console.log(o) });
  const exports = useDzExport(cal);
  return (
    <Room.Provider value="B">
      <header>
        <button onClick={cal.prev}>‹</button> <strong>{title}</strong> <button onClick={cal.next}>›</button>
        <button disabled={!canUndo} onClick={cal.undo}>Annuler</button>
        <button onClick={() => void exports.download('pdf', 'agenda.pdf')}>PDF</button>
      </header>
      <DzCalendar
        ref={(h: DzCalendarHandle | null) => void h?.instance}
        controller={cal}
        view={view}
        onViewChange={setView}
        defaultDate={Temporal.PlainDate.from('2026-10-21')}
        selection={selection}
        onSelectionChange={setSelection}
        timeZone="Europe/Paris"
        editable
        events={events}
        initial={{ firstDay: 1 }}
        renderEventContent={(event) => <Badge event={event} />}
        onEventClick={(i) => console.log(i.event.id)}
        onProblems={(r) => console.log(r.problems.length)}
      />
    </Room.Provider>
  );
}

createRoot(document.getElementById('root')!).render(<DzCalendarProvider defaults={{ locale: 'fr-FR' }}><App /></DzCalendarProvider>);
`,
    },
    ['tsc', '-p', 'tsconfig.json'],
    `React ${v.react}: an application in JSX, its types checked strictly, built by Vite against the packed tarballs`,
  );
}

function vueApp(name, v) {
  const tsconfig = { compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler', lib: ['ES2023', 'DOM', 'DOM.Iterable'], strict: true, skipLibCheck: false, noEmit: true, jsx: 'preserve' }, include: ['src/**/*.ts', 'src/**/*.vue'] };
  viteApp(
    name,
    { vue: v.vue, '@dzcalendar/vue': tgz('vue'), '@dzcalendar/pro-vue': tgz('pro-vue') },
    { '@vitejs/plugin-vue': '6.0.9', 'vue-tsc': '3.3.11' },
    {
      'tsconfig.json': JSON.stringify(tsconfig, null, 2),
      'vite.config.mjs': "import vue from '@vitejs/plugin-vue';\nexport default { plugins: [vue()] };\n",
      'src/shims.d.ts': "declare module '*.vue' {\n  import type { DefineComponent } from 'vue';\n  const c: DefineComponent;\n  export default c;\n}\n",
      'src/main.ts': "import '@dzcalendar/theme/dzcalendar.css';\nimport '@dzcalendar/pro';\nimport { createApp } from 'vue';\nimport { DzCalendarPlugin } from '@dzcalendar/vue';\nimport App from './App.vue';\n\ncreateApp(App).use(DzCalendarPlugin, { defaults: { locale: 'fr-FR' } }).mount('#root');\n",
      // Every entry a consumer imports, in a single-file component, its template's types checked.
      'src/App.vue': `<script setup lang="ts">
import { provide, ref, shallowRef } from 'vue';
import { Temporal } from '@dzcalendar/core';
import type { EventInput, PlainDate, Selection } from '@dzcalendar/core';
import { DzCalendar, createCalendarController } from '@dzcalendar/vue';
import { useDzExport, useEventEditor } from '@dzcalendar/pro-vue';

const cal = createCalendarController();
const view = ref('timeGridWeek');
const date = shallowRef<PlainDate>(Temporal.PlainDate.from('2026-10-21'));
const selection = shallowRef<Selection | null>(null);
const events: EventInput[] = [{ id: 'a', title: 'Consultation', start: '2026-10-21T09:00[Europe/Paris]', duration: { minutes: 45 } }];
provide('room', 'B');
useEventEditor(cal, { onClosed: (o) => console.log(o) });
const exports = useDzExport(cal);
</script>

<template>
  <header>
    <button @click="cal.prev()">‹</button> <strong>{{ cal.title.value }}</strong> <button @click="cal.next()">›</button>
    <button :disabled="!cal.canUndo.value" @click="cal.undo()">Annuler</button>
    <button @click="exports.download('pdf', 'agenda.pdf')">PDF</button>
  </header>
  <DzCalendar
    v-model:view="view"
    v-model:date="date"
    v-model:selection="selection"
    class="calendar"
    :controller="cal"
    time-zone="Europe/Paris"
    editable
    :events="events"
    :initial="{ firstDay: 1 }"
    @event-click="(i) => console.log(i.event.id)"
    @problems="(r) => console.log(r.problems.length)"
  >
    <template #event-content="{ event }">
      <b>{{ event.title }}</b>
    </template>
  </DzCalendar>
</template>
`,
    },
    ['vue-tsc', '--noEmit', '-p', 'tsconfig.json'],
    `Vue ${v.vue}: a single-file component application, its template's types checked, built by Vite against the packed tarballs`,
  );
}

