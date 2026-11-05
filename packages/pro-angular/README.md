# @dzcalendar/pro-angular

The DzCalendar Pro for Angular 19 to 22: a `dzEventEditor` directive for the event and recurrence editor, and a `DzExport` service for printing and exports to PDF, PNG, XLSX, CSV and ICS.

**English** · [Français](#français)

## What it is

`@dzcalendar/pro-angular` connects the [DzCalendar Pro](https://plinthworks.github.io/dzcalendar/) to a `<dz-calendar>` of [`@dzcalendar/angular`](https://www.npmjs.com/package/@dzcalendar/angular).

- **`dzEventEditor`** on `<dz-calendar>`: "Open" on an event and "New event here" from the context menu open the Pro's editor, a modal dialog with the usual recurrences. It saves through the calendar's history (checked against its rules, undoable). On an occurrence of a series it asks how far an edit reaches. It is fetched on its first opening, not with the application.
- **`DzExport`**, a root service: printing and exports, fetched on first use. Each call runs outside Angular's zone (the drawing, the canvas) and resolves inside it. Bad input never throws: a result's `problems` say what went wrong.
- **The timeline views** (resources in rows along an elapsed time axis) come with `import '@dzcalendar/pro'`, once in the application.

## Install

```bash
ng add @dzcalendar/angular --pro
```

adds `@dzcalendar/pro`, `@dzcalendar/pro-angular` and `@tzslot/dom` along with the base setup (and an example component using the editor). By hand:

```bash
npm install @dzcalendar/pro @dzcalendar/pro-angular @dzcalendar/angular @tzslot/dom
```

Peer dependencies: `@angular/core` `^19.0.0 || ^20.0.0 || ^21.0.0 || ^22.0.0`, `@dzcalendar/angular`, and `@tzslot/dom` `^2.4.0` (the editor uses tzslot's widget).

## Quick start

```ts
import { Component, inject } from '@angular/core';
import { DZ_CALENDAR } from '@dzcalendar/angular';
import { DzEventEditor, DzExport } from '@dzcalendar/pro-angular';
import type { EditorOutcome } from '@dzcalendar/pro-angular';
import type { EventInput, ResourceInput } from '@dzcalendar/core';
import '@dzcalendar/pro'; // the timeline views

@Component({
  selector: 'app-planning',
  imports: [DZ_CALENDAR, DzEventEditor],
  template: `
    <button (click)="exports.download(cal.controller, 'pdf', 'agenda.pdf')">PDF</button>
    <button (click)="exports.download(cal.controller, 'xlsx', 'agenda.xlsx')">Excel</button>
    <button (click)="exports.print(cal.controller)">Print</button>
    <span>{{ last }}</span>
    <dz-calendar #cal dzEventEditor (editorClosed)="last = $event"
      timeZone="Europe/Paris" view="resourceTimelineWeek" [resources]="rooms" [events]="events" [editable]="true" />`,
})
export class Planning {
  readonly exports = inject(DzExport);
  last: EditorOutcome | null = null;
  readonly rooms: ResourceInput[] = [{ id: 'r1', title: 'Room 1' }, { id: 'r2', title: 'Room 2' }];
  readonly events: EventInput[] = [{ id: 'a', title: 'Review', start: '2026-10-21T09:00[Europe/Paris]', duration: { hours: 1 }, resourceId: 'r1' }];
}
```

## API

### `dzEventEditor` (`DzEventEditor`)

A directive with the selector `dz-calendar[dzEventEditor]`; add `DzEventEditor` to the component's `imports`.

| | |
|---|---|
| `[dzEventEditor]` | `EditorOptions`, below. The bare attribute (`dzEventEditor`) takes the defaults. |
| `(editorClosed)` | `EditorOutcome`: `'saved'`, `'deleted'` or `'cancelled'` (also when the editor's chunk fails to load; the failure is then reported as an unhandled rejection too). |

It takes over `onEventOpen` and `onCreateRequest` on the calendar: the calendar's `(eventOpen)` and `(createRequest)` no longer fire.

`EditorOptions`:

| Option | Default | |
|---|---|---|
| `messages` | the locale's | Words of the form over the locale's (English, French, Arabic, Spanish and German are built in). |
| `container` | the calendar's element (its theme applies) | Where the dialog goes. |
| `stepMinutes` | `15` | Minutes the time arrows move by. |
| `defaultMinutes` | `60` | Length of a new timed event. |
| `tones` | the six of `@dzcalendar/theme` | The tones offered (`--dz-tone-*`). |
| `injectStyles` | `true` | `false` under a CSP without inline styles: include `EDITOR_CSS` (from `@dzcalendar/pro/editor`) yourself. |

### `DzExport`

`inject(DzExport)`, provided in root. Every method takes the calendar first: a **`DzExportTarget`**, which is a `CalendarController` (`cal.controller` from a `#cal` reference, or injected), the `<dz-calendar>` component itself, or the DOM calendar. A calendar not drawn yet answers a problem with `detail: 'not-attached'`.

| Method | Resolves with |
|---|---|
| `print(target, options?)` | `PrintJob`: `pages` (the sheets), `problems`, `close()`. Paged printing by the browser (A4, Letter or A3 sheets, a copy of the calendar per period). |
| `pdf(target, options?)` | `ExportResult`: `{ blob, problems }`. A PDF of the view over the dates asked, a sheet per page. |
| `png(target, options?)` | `{ blobs, problems }`: the same sheets as PNG images, one per sheet. |
| `xlsx(target, options?)` | `ExportResult`. A row per occurrence over the range (both zones, the real duration), real Excel dates. |
| `csv(target, options?)` | `ExportResult`. The same rows as CSV (UTF-8 with a BOM). |
| `ics(target, options?)` | `ExportResult`. An iCalendar file: events as they are, a series whole (rule and moved occurrences), each in its own zone. |
| `download(target, kind, filename, options?)` | `readonly Problem[]` (empty when the file was saved). `kind` is `'pdf' \| 'png' \| 'xlsx' \| 'csv' \| 'ics'`. PNG sheets are saved as one file, or a zip of them. |

Options:

| Type | Fields |
|---|---|
| `RangeOptions` (`xlsx`, `csv`, `ics`) | `from`, `to` (`PlainDate`, `[from, to)`, default what is shown), `messages`. |
| `csv` adds | `separator`: `','` (default), `';'` (a French Excel) or `'\t'`. |
| `ics` adds | `all: true` writes everything the calendar holds; `name` names the calendar. |
| `ImageOptions` (`pdf`, `png`) | `view` (default the one shown; a multi-month view goes a month a sheet), `from`, `to`, `paper` (`'a4'`, `'letter'`, `'a3'`), `orientation` (`'landscape'`, portrait for a list), `scale` (device pixels per CSS pixel, default 2), `messages`. `pdf` adds `title`. |
| `PrintOptions` (`print`) | `view`, `from`, `to`, `paper`, `orientation`, `rowsPerPage` (a resource timeline: rows per sheet), `print: false` (build the sheets and leave them to you: `close()` takes them away; no `window.print()`), `messages`. |

The sources are asked for the dates exported, beside what is shown; what could not be loaded is a warning in `problems` (the file lacks it).

Types are re-exported: `EditorOptions`, `EditorOutcome`, `DzExportTarget`, `ExportResult`, `ImageOptions`, `RangeOptions`, `PrintJob`, `PrintOptions`.

## Recipes

### An export menu

```ts
import { Component, inject } from '@angular/core';
import { DZ_CALENDAR, DzCalendar } from '@dzcalendar/angular';
import { DzExport } from '@dzcalendar/pro-angular';
import { Temporal } from '@dzcalendar/core';

@Component({
  selector: 'app-exports',
  imports: [DZ_CALENDAR],
  template: `
    <button (click)="month(cal)">October (PDF)</button>
    <button (click)="exports.download(cal, 'csv', 'agenda.csv', { separator: ';' })">CSV</button>
    <button (click)="ics(cal)">iCalendar</button>
    <dz-calendar #cal timeZone="Europe/Paris" />`,
})
export class Exports {
  readonly exports = inject(DzExport);

  async month(cal: DzCalendar) {
    // A month as A3 landscape PDF.
    const problems = await this.exports.download(cal, 'pdf', 'october.pdf', {
      view: 'dayGridMonth',
      from: Temporal.PlainDate.from('2026-10-01'),
      to: Temporal.PlainDate.from('2026-11-01'),
      paper: 'a3',
      orientation: 'landscape',
    });
    if (problems.length > 0) console.warn(problems.map((p) => `${p.code}: ${p.detail}`));
  }

  async ics(cal: DzCalendar) {
    const { blob, problems } = await this.exports.ics(cal, { all: true, name: 'Agenda' });
    if (blob) console.log(blob.size, problems.length);
  }
}
```

### The editor's options

```ts
import { Component } from '@angular/core';
import { DZ_CALENDAR } from '@dzcalendar/angular';
import { DzEventEditor } from '@dzcalendar/pro-angular';
import type { EditorOptions, EditorOutcome } from '@dzcalendar/pro-angular';

@Component({
  selector: 'app-rooms',
  imports: [DZ_CALENDAR, DzEventEditor],
  template: `<dz-calendar timeZone="Europe/Paris" [dzEventEditor]="editor" (editorClosed)="closed($event)" [editable]="true" />`,
})
export class Rooms {
  readonly editor: EditorOptions = { stepMinutes: 5, defaultMinutes: 30, tones: ['blue', 'green'] };

  closed(outcome: EditorOutcome) {
    console.log(outcome);
  }
}
```

### Supervision: a timeline that follows the present

A screen that shows what is running now: a three-day custom view whose four-hour window slides with the clock (`span`, `follow`), a tick every minute (`ticks`), a card per run, an ongoing run with no end yet (`ongoing`), a marker for an alert, a maintenance window as a background event, a live source from `@dzcalendar/core/live`, `onFollowChange` in `[options]` for a "Back to live" button, the editor on "Open" (context menu) for a run, and a CSV of what is shown.

```ts
import { Component, inject, signal, viewChild } from '@angular/core';
import { DZ_CALENDAR, DZ_CALENDAR_DEFAULTS, DzCalendar } from '@dzcalendar/angular';
import type { DzCalendarOptions } from '@dzcalendar/angular';
import { DzEventEditor, DzExport } from '@dzcalendar/pro-angular';
import { Temporal } from '@dzcalendar/core';
import type { EventInput, ResourceInput } from '@dzcalendar/core';
import { liveSource } from '@dzcalendar/core/live';
import type { LiveMessage } from '@dzcalendar/core/live';
import '@dzcalendar/pro';

@Component({
  selector: 'app-supervision',
  imports: [DZ_CALENDAR, DzEventEditor],
  // A view of the application's own is read once, when the calendar is made: in Angular, in the defaults.
  providers: [{ provide: DZ_CALENDAR_DEFAULTS, useValue: { views: { supervision: { family: 'timeline', resources: true, duration: { days: 3 } } } } }],
  template: `
    @if (!following()) { <button (click)="cal().controller.today()">Back to live</button> }
    <button (click)="exports.download(cal(), 'csv', 'runs.csv')">CSV</button>
    <dz-calendar #calendar dzEventEditor view="supervision" [date]="date" timeZone="Europe/Paris" scheme="light"
      [resources]="processes" [events]="events" [sources]="sources" [options]="options">
      <ng-template dzEventContent let-event let-ctx="ctx">
        @if (ctx.background) {
          <span class="maint">{{ event.title }}</span>
        } @else {
          <div class="card" [class.card--failed]="event.props.status === 'failed'">
            <b>{{ event.title }}</b> <span class="pill">{{ event.props.status }}</span>
          </div>
        }
      </ng-template>
    </dz-calendar>`,
})
export class Supervision {
  readonly exports = inject(DzExport);
  readonly cal = viewChild.required<DzCalendar>('calendar');
  readonly following = signal(true);
  readonly date = Temporal.PlainDate.from('2026-10-21');

  readonly processes: ResourceInput[] = [
    { id: 'import', title: 'Order import' },
    { id: 'backup', title: 'Backup' },
  ];

  readonly events: EventInput[] = [
    // Ongoing: no end yet, it grows with the clock.
    { id: 'run', title: 'Order import', start: '2026-10-21T11:00[Europe/Paris]', resourceId: 'import', ongoing: true, extendedProps: { status: 'running' } },
    // A marker: an instant, not a duration.
    { id: 'alert', title: 'Disk almost full', start: '2026-10-21T11:20:41[Europe/Paris]', resourceId: 'import', display: 'marker', tone: 'red' },
    // A background event: a maintenance window behind the rows.
    { id: 'maint', title: 'Maintenance', start: '2026-10-21T09:00[Europe/Paris]', duration: { hours: 2 }, resourceId: 'backup', display: 'background', tone: 'violet' },
  ];

  // The feed tells the calendar: each message creates, updates or removes an event.
  readonly sources = [
    liveSource('feed', {
      connect: (emit) => {
        const socket = new WebSocket('wss://example.com/runs');
        socket.onmessage = (m) => emit(JSON.parse(String(m.data)) as LiveMessage);
        return () => socket.close();
      },
    }),
  ];

  readonly options: DzCalendarOptions = {
    // Four hours on screen in quarters of an hour, the present kept 5 minutes from the left edge, a tick every minute (the time written every fifth).
    timeline: { slot: 15, span: { hours: 4 }, step: { minutes: 15 }, follow: { before: { minutes: 5 } }, ticks: { every: 1, label: 5 }, maxLanes: 4 },
    nowRefresh: { seconds: 5 },
    forget: { olderThan: { days: 7 } },
    // false when the person scrolled or slid away; true again after "Today".
    onFollowChange: (following: boolean) => this.following.set(following),
  };
}
```

`timeline.span` is the time on screen at once; `timeline.follow` keeps the present in view and pauses as soon as the person moves along time; `timeline.step` is what the arrows slide by; `timeline.ticks` draws small ticks inside each slot; `nowRefresh` is how often the now line moves (and a following timeline with it); `forget: { olderThan }` lets go of events that ended longer ago; `controller.shift({ minutes: -45 })` slides by any number of hours and minutes. See [`timeline`](https://plinthworks.github.io/dzcalendar/options/timeline/) and [`onFollowChange`](https://plinthworks.github.io/dzcalendar/options/on-follow-change/).

## Documentation

- [Angular guide](https://plinthworks.github.io/dzcalendar/getting-started/angular/)
- [Editor (Pro)](https://plinthworks.github.io/dzcalendar/guides/editor/)
- [Print and export (Pro)](https://plinthworks.github.io/dzcalendar/guides/print-export/)
- [Resources and timeline](https://plinthworks.github.io/dzcalendar/guides/resources-timeline/)
- [`timeline`](https://plinthworks.github.io/dzcalendar/options/timeline/), [`onFollowChange`](https://plinthworks.github.io/dzcalendar/options/on-follow-change/), [`resources`](https://plinthworks.github.io/dzcalendar/options/resources/)
- [Installation](https://plinthworks.github.io/dzcalendar/getting-started/installation/), [Options](https://plinthworks.github.io/dzcalendar/options/), [API](https://plinthworks.github.io/dzcalendar/api/)

## License

MIT

---

## Français

Le Pro de DzCalendar pour Angular 19 à 22 : une directive `dzEventEditor` pour l'éditeur d'événements et de récurrences, et un service `DzExport` pour l'impression et les exports en PDF, PNG, XLSX, CSV et ICS.

[English](#dzcalendarpro-angular) · **Français**

### Ce que c'est

`@dzcalendar/pro-angular` relie le [Pro de DzCalendar](https://plinthworks.github.io/dzcalendar/fr/) à un `<dz-calendar>` de [`@dzcalendar/angular`](https://www.npmjs.com/package/@dzcalendar/angular).

- **`dzEventEditor`** sur `<dz-calendar>` : « Ouvrir » sur un événement et « Nouvel événement ici » dans le menu contextuel ouvrent l'éditeur du Pro, une boîte de dialogue modale avec les récurrences usuelles. Il enregistre par l'historique du calendrier (vérifié contre ses règles, annulable). Sur une occurrence d'une série, il demande jusqu'où va la modification. Il est chargé à sa première ouverture, pas avec l'application.
- **`DzExport`**, un service racine : impression et exports, chargés à la première utilisation. Chaque appel s'exécute hors de la zone d'Angular (le dessin, le canvas) et se résout dedans. Une mauvaise entrée ne lève jamais d'exception : les `problems` d'un résultat disent ce qui a échoué.
- **Les vues timeline** (des ressources en lignes le long d'un axe de temps écoulé) viennent avec `import '@dzcalendar/pro'`, une fois dans l'application.

### Installation

```bash
ng add @dzcalendar/angular --pro
```

ajoute `@dzcalendar/pro`, `@dzcalendar/pro-angular` et `@tzslot/dom` avec la mise en place de base (et un composant d'exemple qui utilise l'éditeur). À la main :

```bash
npm install @dzcalendar/pro @dzcalendar/pro-angular @dzcalendar/angular @tzslot/dom
```

Dépendances homologues : `@angular/core` `^19.0.0 || ^20.0.0 || ^21.0.0 || ^22.0.0`, `@dzcalendar/angular`, et `@tzslot/dom` `^2.4.0` (l'éditeur utilise le widget de tzslot).

### Démarrage rapide

```ts
import { Component, inject } from '@angular/core';
import { DZ_CALENDAR } from '@dzcalendar/angular';
import { DzEventEditor, DzExport } from '@dzcalendar/pro-angular';
import type { EditorOutcome } from '@dzcalendar/pro-angular';
import type { EventInput, ResourceInput } from '@dzcalendar/core';
import '@dzcalendar/pro'; // les vues timeline

@Component({
  selector: 'app-planning',
  imports: [DZ_CALENDAR, DzEventEditor],
  template: `
    <button (click)="exports.download(cal.controller, 'pdf', 'agenda.pdf')">PDF</button>
    <button (click)="exports.download(cal.controller, 'xlsx', 'agenda.xlsx')">Excel</button>
    <button (click)="exports.print(cal.controller)">Imprimer</button>
    <span>{{ dernier }}</span>
    <dz-calendar #cal dzEventEditor (editorClosed)="dernier = $event"
      timeZone="Europe/Paris" locale="fr-FR" view="resourceTimelineWeek" [resources]="salles" [events]="events" [editable]="true" />`,
})
export class Planning {
  readonly exports = inject(DzExport);
  dernier: EditorOutcome | null = null;
  readonly salles: ResourceInput[] = [{ id: 'r1', title: 'Salle 1' }, { id: 'r2', title: 'Salle 2' }];
  readonly events: EventInput[] = [{ id: 'a', title: 'Revue', start: '2026-10-21T09:00[Europe/Paris]', duration: { hours: 1 }, resourceId: 'r1' }];
}
```

### API

#### `dzEventEditor` (`DzEventEditor`)

Une directive de sélecteur `dz-calendar[dzEventEditor]` ; ajoutez `DzEventEditor` aux `imports` du composant.

| | |
|---|---|
| `[dzEventEditor]` | `EditorOptions`, ci-dessous. L'attribut nu (`dzEventEditor`) prend les valeurs par défaut. |
| `(editorClosed)` | `EditorOutcome` : `'saved'`, `'deleted'` ou `'cancelled'` (aussi quand le chargement de l'éditeur échoue ; l'échec est alors aussi signalé comme un rejet non géré). |

Elle prend en charge `onEventOpen` et `onCreateRequest` du calendrier : `(eventOpen)` et `(createRequest)` du calendrier ne se déclenchent plus.

`EditorOptions` :

| Option | Défaut | |
|---|---|---|
| `messages` | ceux de la langue | Mots du formulaire par-dessus ceux de la langue (anglais, français, arabe, espagnol et allemand sont intégrés). |
| `container` | l'élément du calendrier (son thème s'applique) | Où va la boîte de dialogue. |
| `stepMinutes` | `15` | Minutes dont avancent les flèches de l'heure. |
| `defaultMinutes` | `60` | Durée d'un nouvel événement horaire. |
| `tones` | les six de `@dzcalendar/theme` | Les teintes proposées (`--dz-tone-*`). |
| `injectStyles` | `true` | `false` sous une CSP sans styles en ligne : incluez `EDITOR_CSS` (de `@dzcalendar/pro/editor`) vous-même. |

#### `DzExport`

`inject(DzExport)`, fourni à la racine. Chaque méthode prend d'abord le calendrier : un **`DzExportTarget`**, c'est-à-dire un `CalendarController` (`cal.controller` depuis une référence `#cal`, ou injecté), le composant `<dz-calendar>` lui-même, ou le calendrier DOM. Un calendrier pas encore dessiné répond un problème de `detail: 'not-attached'`.

| Méthode | Résout avec |
|---|---|
| `print(target, options?)` | `PrintJob` : `pages` (les feuilles), `problems`, `close()`. Impression paginée par le navigateur (feuilles A4, Letter ou A3, une copie du calendrier par période). |
| `pdf(target, options?)` | `ExportResult` : `{ blob, problems }`. Un PDF de la vue sur les dates demandées, une feuille par page. |
| `png(target, options?)` | `{ blobs, problems }` : les mêmes feuilles en images PNG, une par feuille. |
| `xlsx(target, options?)` | `ExportResult`. Une ligne par occurrence sur la plage (les deux fuseaux, la vraie durée), de vraies dates Excel. |
| `csv(target, options?)` | `ExportResult`. Les mêmes lignes en CSV (UTF-8 avec BOM). |
| `ics(target, options?)` | `ExportResult`. Un fichier iCalendar : les événements tels quels, une série entière (règle et occurrences déplacées), chacun dans son fuseau. |
| `download(target, kind, filename, options?)` | `readonly Problem[]` (vide quand le fichier a été enregistré). `kind` vaut `'pdf' \| 'png' \| 'xlsx' \| 'csv' \| 'ics'`. Les feuilles PNG sont enregistrées en un fichier, ou en un zip. |

Options :

| Type | Champs |
|---|---|
| `RangeOptions` (`xlsx`, `csv`, `ics`) | `from`, `to` (`PlainDate`, `[from, to)`, par défaut ce qui est affiché), `messages`. |
| `csv` ajoute | `separator` : `','` (défaut), `';'` (un Excel français) ou `'\t'`. |
| `ics` ajoute | `all: true` écrit tout ce que le calendrier contient ; `name` nomme le calendrier. |
| `ImageOptions` (`pdf`, `png`) | `view` (par défaut celle affichée ; une vue multi-mois va un mois par feuille), `from`, `to`, `paper` (`'a4'`, `'letter'`, `'a3'`), `orientation` (`'landscape'`, portrait pour une liste), `scale` (pixels d'appareil par pixel CSS, 2 par défaut), `messages`. `pdf` ajoute `title`. |
| `PrintOptions` (`print`) | `view`, `from`, `to`, `paper`, `orientation`, `rowsPerPage` (une timeline de ressources : lignes par feuille), `print: false` (construit les feuilles et vous les laisse : `close()` les retire ; pas de `window.print()`), `messages`. |

Les sources sont interrogées pour les dates exportées, à côté de ce qui est affiché ; ce qui n'a pas pu être chargé est un avertissement dans `problems` (le fichier ne l'a pas).

Les types sont réexportés : `EditorOptions`, `EditorOutcome`, `DzExportTarget`, `ExportResult`, `ImageOptions`, `RangeOptions`, `PrintJob`, `PrintOptions`.

### Recettes

#### Un menu d'exports

```ts
import { Component, inject } from '@angular/core';
import { DZ_CALENDAR, DzCalendar } from '@dzcalendar/angular';
import { DzExport } from '@dzcalendar/pro-angular';
import { Temporal } from '@dzcalendar/core';

@Component({
  selector: 'app-exports',
  imports: [DZ_CALENDAR],
  template: `
    <button (click)="mois(cal)">Octobre (PDF)</button>
    <button (click)="exports.download(cal, 'csv', 'agenda.csv', { separator: ';' })">CSV</button>
    <button (click)="ics(cal)">iCalendar</button>
    <dz-calendar #cal timeZone="Europe/Paris" locale="fr-FR" />`,
})
export class Exports {
  readonly exports = inject(DzExport);

  async mois(cal: DzCalendar) {
    // Un mois en PDF A3 paysage.
    const problems = await this.exports.download(cal, 'pdf', 'octobre.pdf', {
      view: 'dayGridMonth',
      from: Temporal.PlainDate.from('2026-10-01'),
      to: Temporal.PlainDate.from('2026-11-01'),
      paper: 'a3',
      orientation: 'landscape',
    });
    if (problems.length > 0) console.warn(problems.map((p) => `${p.code}: ${p.detail}`));
  }

  async ics(cal: DzCalendar) {
    const { blob, problems } = await this.exports.ics(cal, { all: true, name: 'Agenda' });
    if (blob) console.log(blob.size, problems.length);
  }
}
```

#### Les options de l'éditeur

```ts
import { Component } from '@angular/core';
import { DZ_CALENDAR } from '@dzcalendar/angular';
import { DzEventEditor } from '@dzcalendar/pro-angular';
import type { EditorOptions, EditorOutcome } from '@dzcalendar/pro-angular';

@Component({
  selector: 'app-salles',
  imports: [DZ_CALENDAR, DzEventEditor],
  template: `<dz-calendar timeZone="Europe/Paris" locale="fr-FR" [dzEventEditor]="editor" (editorClosed)="closed($event)" [editable]="true" />`,
})
export class Salles {
  readonly editor: EditorOptions = { stepMinutes: 5, defaultMinutes: 30, tones: ['blue', 'green'] };

  closed(outcome: EditorOutcome) {
    console.log(outcome);
  }
}
```

#### Supervision : une timeline qui suit le présent

Un écran qui montre ce qui tourne maintenant : une vue sur mesure de trois jours dont la fenêtre de quatre heures glisse avec l'horloge (`span`, `follow`), un trait chaque minute (`ticks`), une carte par exécution, une exécution en cours sans fin connue (`ongoing`), un repère pour une alerte, une fenêtre de maintenance en événement d'arrière-plan, une source en direct de `@dzcalendar/core/live`, `onFollowChange` dans `[options]` pour un bouton « Retour au direct », l'éditeur sur « Ouvrir » (menu contextuel) d'une exécution, et un CSV de ce qui est affiché.

```ts
import { Component, inject, signal, viewChild } from '@angular/core';
import { DZ_CALENDAR, DZ_CALENDAR_DEFAULTS, DzCalendar } from '@dzcalendar/angular';
import type { DzCalendarOptions } from '@dzcalendar/angular';
import { DzEventEditor, DzExport } from '@dzcalendar/pro-angular';
import { Temporal } from '@dzcalendar/core';
import type { EventInput, ResourceInput } from '@dzcalendar/core';
import { liveSource } from '@dzcalendar/core/live';
import type { LiveMessage } from '@dzcalendar/core/live';
import '@dzcalendar/pro';

@Component({
  selector: 'app-supervision',
  imports: [DZ_CALENDAR, DzEventEditor],
  // Une vue propre à l'application est lue une fois, à la création du calendrier : en Angular, dans les valeurs par défaut.
  providers: [{ provide: DZ_CALENDAR_DEFAULTS, useValue: { views: { supervision: { family: 'timeline', resources: true, duration: { days: 3 } } } } }],
  template: `
    @if (!following()) { <button (click)="cal().controller.today()">Retour au direct</button> }
    <button (click)="exports.download(cal(), 'csv', 'executions.csv')">CSV</button>
    <dz-calendar #calendar dzEventEditor view="supervision" [date]="date" timeZone="Europe/Paris" locale="fr-FR" scheme="light"
      [resources]="processus" [events]="events" [sources]="sources" [options]="options">
      <ng-template dzEventContent let-event let-ctx="ctx">
        @if (ctx.background) {
          <span class="maint">{{ event.title }}</span>
        } @else {
          <div class="card" [class.card--failed]="event.props.status === 'failed'">
            <b>{{ event.title }}</b> <span class="pill">{{ event.props.status }}</span>
          </div>
        }
      </ng-template>
    </dz-calendar>`,
})
export class Supervision {
  readonly exports = inject(DzExport);
  readonly cal = viewChild.required<DzCalendar>('calendar');
  readonly following = signal(true);
  readonly date = Temporal.PlainDate.from('2026-10-21');

  readonly processus: ResourceInput[] = [
    { id: 'import', title: 'Import des commandes' },
    { id: 'backup', title: 'Sauvegarde' },
  ];

  readonly events: EventInput[] = [
    // En cours : pas encore de fin, elle grandit avec l'horloge.
    { id: 'run', title: 'Import des commandes', start: '2026-10-21T11:00[Europe/Paris]', resourceId: 'import', ongoing: true, extendedProps: { status: 'running' } },
    // Un repère : un instant, pas une durée.
    { id: 'alert', title: 'Disque presque plein', start: '2026-10-21T11:20:41[Europe/Paris]', resourceId: 'import', display: 'marker', tone: 'red' },
    // Un événement d'arrière-plan : une fenêtre de maintenance derrière les lignes.
    { id: 'maint', title: 'Maintenance', start: '2026-10-21T09:00[Europe/Paris]', duration: { hours: 2 }, resourceId: 'backup', display: 'background', tone: 'violet' },
  ];

  // Le flux informe le calendrier : chaque message crée, modifie ou retire un événement.
  readonly sources = [
    liveSource('feed', {
      connect: (emit) => {
        const socket = new WebSocket('wss://example.com/runs');
        socket.onmessage = (m) => emit(JSON.parse(String(m.data)) as LiveMessage);
        return () => socket.close();
      },
    }),
  ];

  readonly options: DzCalendarOptions = {
    // Quatre heures à l'écran en quarts d'heure, le présent gardé à 5 minutes du bord gauche, un trait chaque minute (l'heure écrite toutes les cinq).
    timeline: { slot: 15, span: { hours: 4 }, step: { minutes: 15 }, follow: { before: { minutes: 5 } }, ticks: { every: 1, label: 5 }, maxLanes: 4 },
    nowRefresh: { seconds: 5 },
    forget: { olderThan: { days: 7 } },
    // false quand la personne a fait défiler ou glisser ailleurs ; true de nouveau après « Aujourd'hui ».
    onFollowChange: (following: boolean) => this.following.set(following),
  };
}
```

`timeline.span` est le temps affiché à la fois ; `timeline.follow` garde le présent en vue et se met en pause dès que la personne se déplace dans le temps ; `timeline.step` est ce dont les flèches font glisser ; `timeline.ticks` dessine de petits traits dans chaque créneau ; `nowRefresh` dit à quelle fréquence la ligne du présent avance (et une timeline qui le suit avec elle) ; `forget: { olderThan }` lâche les événements terminés depuis plus longtemps ; `controller.shift({ minutes: -45 })` fait glisser de n'importe quel nombre d'heures et de minutes. Voir [`timeline`](https://plinthworks.github.io/dzcalendar/fr/options/timeline/) et [`onFollowChange`](https://plinthworks.github.io/dzcalendar/fr/options/on-follow-change/).

### Documentation

- [Guide Angular](https://plinthworks.github.io/dzcalendar/fr/getting-started/angular/)
- [Éditeur (Pro)](https://plinthworks.github.io/dzcalendar/fr/guides/editor/)
- [Impression et export (Pro)](https://plinthworks.github.io/dzcalendar/fr/guides/print-export/)
- [Ressources et timeline](https://plinthworks.github.io/dzcalendar/fr/guides/resources-timeline/)
- [`timeline`](https://plinthworks.github.io/dzcalendar/fr/options/timeline/), [`onFollowChange`](https://plinthworks.github.io/dzcalendar/fr/options/on-follow-change/), [`resources`](https://plinthworks.github.io/dzcalendar/fr/options/resources/)
- [Installation](https://plinthworks.github.io/dzcalendar/fr/getting-started/installation/), [Options](https://plinthworks.github.io/dzcalendar/fr/options/), [API](https://plinthworks.github.io/dzcalendar/fr/api/)

### Licence

MIT
