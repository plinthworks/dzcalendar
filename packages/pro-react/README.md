# @dzcalendar/pro-react

The DzCalendar Pro for React 18 and 19: an event and recurrence editor, printing, and exports to PDF, PNG, XLSX, CSV and ICS, as two hooks.

**English** · [Français](#français)

## What it is

`@dzcalendar/pro-react` connects the [DzCalendar Pro](https://plinthworks.github.io/dzcalendar/) to a `<DzCalendar>` of [`@dzcalendar/react`](https://www.npmjs.com/package/@dzcalendar/react), through its controller.

- **`useEventEditor(controller)`**: "Open" on an event and "New event here" from the context menu open the Pro's editor, a modal dialog with the usual recurrences. It saves through the calendar's history (checked against its rules, undoable). On an occurrence of a series it asks how far an edit reaches. It is fetched on its first opening, not with the application.
- **`useDzExport(controller)`**: printing and exports of the calendar, fetched on first use. Bad input never throws: a result's `problems` say what went wrong.
- **The timeline views** (resources in rows along an elapsed time axis) come with `import '@dzcalendar/pro'`, once in the application.

## Install

```bash
npm install @dzcalendar/pro @dzcalendar/pro-react @dzcalendar/react @tzslot/dom
```

Peer dependencies: `react` `^18.2.0 || ^19.0.0`, `@dzcalendar/react`, and `@tzslot/dom` `^2.4.0` (the editor uses tzslot's widget). Plus what `@dzcalendar/react` needs (`@dzcalendar/core`, `@dzcalendar/dom`, `@dzcalendar/theme`).

## Quick start

```tsx
import { useState } from 'react';
import { DzCalendar, useCalendarController } from '@dzcalendar/react';
import { useDzExport, useEventEditor } from '@dzcalendar/pro-react';
import type { EditorOutcome } from '@dzcalendar/pro-react';
import '@dzcalendar/pro'; // the timeline views
import '@dzcalendar/theme/dzcalendar.css';

export function Planning() {
  const cal = useCalendarController();
  const [last, setLast] = useState<EditorOutcome | null>(null);
  useEventEditor(cal, { onClosed: setLast });
  const exports = useDzExport(cal);
  return (
    <>
      <button onClick={() => exports.download('pdf', 'agenda.pdf')}>PDF</button>
      <button onClick={() => exports.download('xlsx', 'agenda.xlsx')}>Excel</button>
      <button onClick={() => exports.print()}>Print</button>
      <span>{last}</span>
      <DzCalendar controller={cal} timeZone="Europe/Paris" defaultView="timeGridWeek" editable />
    </>
  );
}
```

Give `<DzCalendar>` the same `controller` the hooks receive.

## API

### `useEventEditor(controller, { options?, onClosed? })`

| | |
|---|---|
| `controller` | The `CalendarController` of the calendar (`useCalendarController()`). |
| `options` | `EditorOptions`, below. |
| `onClosed(outcome)` | `'saved'`, `'deleted'` or `'cancelled'` (also when the editor's chunk fails to load; the failure is then reported as an unhandled rejection too). |

The editor takes over "Open" and "New event here" through the controller (`takeOver`): the calendar's own `onEventOpen` and `onCreateRequest` props no longer fire, whatever they say, until the component using the hook goes away.

`EditorOptions`:

| Option | Default | |
|---|---|---|
| `messages` | the locale's | Words of the form over the locale's (English, French, Arabic, Spanish and German are built in). |
| `container` | the calendar's element (its theme applies) | Where the dialog goes. |
| `stepMinutes` | `15` | Minutes the time arrows move by. |
| `defaultMinutes` | `60` | Length of a new timed event. |
| `tones` | the six of `@dzcalendar/theme` | The tones offered (`--dz-tone-*`). |
| `injectStyles` | `true` | `false` under a CSP without inline styles: include `EDITOR_CSS` (from `@dzcalendar/pro/editor`) yourself. |

### `useDzExport(controller)`

Returns `DzExports`, bound to the calendar of `controller` (a stable object while the controller stays). Nothing here throws or rejects. Before the calendar is mounted, a call answers a problem with `detail: 'not-attached'`.

| Method | Resolves with |
|---|---|
| `print(options?)` | `PrintJob`: `pages` (the sheets), `problems`, `close()`. Paged printing by the browser (A4, Letter or A3 sheets, a copy of the calendar per period). |
| `pdf(options?)` | `ExportResult`: `{ blob, problems }`. A PDF of the view over the dates asked, a sheet per page. |
| `png(options?)` | `{ blobs, problems }`: the same sheets as PNG images, one per sheet. |
| `xlsx(options?)` | `ExportResult`. A row per occurrence over the range (both zones, the real duration), real Excel dates. |
| `csv(options?)` | `ExportResult`. The same rows as CSV (UTF-8 with a BOM). |
| `ics(options?)` | `ExportResult`. An iCalendar file: events as they are, a series whole (rule and moved occurrences), each in its own zone. |
| `download(kind, filename, options?)` | `Problem[]` (empty when the file was saved). `kind` is `'pdf' \| 'png' \| 'xlsx' \| 'csv' \| 'ics'`. PNG sheets are saved as one file, or a zip of them. |

Options:

| Type | Fields |
|---|---|
| `RangeOptions` (`xlsx`, `csv`, `ics`) | `from`, `to` (`PlainDate`, `[from, to)`, default what is shown), `messages`. |
| `csv` adds | `separator`: `','` (default), `';'` (a French Excel) or `'\t'`. |
| `ics` adds | `all: true` writes everything the calendar holds; `name` names the calendar. |
| `ImageOptions` (`pdf`, `png`) | `view` (default the one shown; a multi-month view goes a month a sheet), `from`, `to`, `paper` (`'a4'`, `'letter'`, `'a3'`), `orientation` (`'landscape'`, portrait for a list), `scale` (device pixels per CSS pixel, default 2), `messages`. `pdf` adds `title`. |
| `PrintOptions` (`print`) | `view`, `from`, `to`, `paper`, `orientation`, `rowsPerPage` (a resource timeline: rows per sheet), `print: false` (build the sheets and leave them to you: `close()` takes them away; no `window.print()`), `messages`. |

The sources are asked for the dates exported, beside what is shown; what could not be loaded is a warning in `problems` (the file lacks it).

Types are re-exported: `EditorOptions`, `EditorOutcome`, `ExportKind`, `ExportResult`, `ImageOptions`, `RangeOptions`, `PrintJob`, `PrintOptions`, `DzExports`.

## Recipes

### An export menu

```tsx
import { DzCalendar, useCalendarController } from '@dzcalendar/react';
import { useDzExport } from '@dzcalendar/pro-react';
import { Temporal } from '@dzcalendar/core';

export function Exports() {
  const cal = useCalendarController();
  const exports = useDzExport(cal);

  const month = async () => {
    // A month as A3 landscape PDF.
    const problems = await exports.download('pdf', 'october.pdf', {
      view: 'dayGridMonth',
      from: Temporal.PlainDate.from('2026-10-01'),
      to: Temporal.PlainDate.from('2026-11-01'),
      paper: 'a3',
      orientation: 'landscape',
    });
    if (problems.length > 0) console.warn(problems.map((p) => `${p.code}: ${p.detail}`));
  };

  const ics = async () => {
    const { blob, problems } = await exports.ics({ all: true, name: 'Agenda' });
    if (blob) console.log(blob.size, problems.length);
  };

  return (
    <>
      <button onClick={month}>October (PDF)</button>
      <button onClick={() => exports.download('csv', 'agenda.csv', { separator: ';' })}>CSV</button>
      <button onClick={ics}>iCalendar</button>
      <DzCalendar controller={cal} timeZone="Europe/Paris" />
    </>
  );
}
```

### The editor on a resource timeline

```tsx
import { DzCalendar, useCalendarController } from '@dzcalendar/react';
import { useEventEditor } from '@dzcalendar/pro-react';
import '@dzcalendar/pro';

const ROOMS = [{ id: 'r1', title: 'Room 1' }, { id: 'r2', title: 'Room 2' }];

export function Rooms() {
  const cal = useCalendarController();
  useEventEditor(cal, {
    options: { stepMinutes: 5, defaultMinutes: 30, tones: ['blue', 'green'] },
    onClosed: (outcome) => console.log(outcome),
  });
  return <DzCalendar controller={cal} timeZone="Europe/Paris" defaultView="resourceTimelineDay" resources={ROOMS} editable />;
}
```

Timeline settings (`slot`, `span`, `follow`, `ticks`…), `onFollowChange` and a supervision screen are covered in [`timeline`](https://plinthworks.github.io/dzcalendar/options/timeline/) and [`onFollowChange`](https://plinthworks.github.io/dzcalendar/options/on-follow-change/); in React they are props of `<DzCalendar>`.

## Documentation

- [React guide](https://plinthworks.github.io/dzcalendar/getting-started/react/)
- [Editor (Pro)](https://plinthworks.github.io/dzcalendar/guides/editor/)
- [Print and export (Pro)](https://plinthworks.github.io/dzcalendar/guides/print-export/)
- [Resources and timeline](https://plinthworks.github.io/dzcalendar/guides/resources-timeline/)
- [`timeline`](https://plinthworks.github.io/dzcalendar/options/timeline/), [`onFollowChange`](https://plinthworks.github.io/dzcalendar/options/on-follow-change/), [`resources`](https://plinthworks.github.io/dzcalendar/options/resources/)
- [Installation](https://plinthworks.github.io/dzcalendar/getting-started/installation/), [Options](https://plinthworks.github.io/dzcalendar/options/), [API](https://plinthworks.github.io/dzcalendar/api/)

## License

MIT

---

## Français

Le Pro de DzCalendar pour React 18 et 19 : un éditeur d'événements et de récurrences, l'impression, et les exports en PDF, PNG, XLSX, CSV et ICS, en deux hooks.

[English](#dzcalendarpro-react) · **Français**

### Ce que c'est

`@dzcalendar/pro-react` relie le [Pro de DzCalendar](https://plinthworks.github.io/dzcalendar/fr/) à un `<DzCalendar>` de [`@dzcalendar/react`](https://www.npmjs.com/package/@dzcalendar/react), par son contrôleur.

- **`useEventEditor(controller)`** : « Ouvrir » sur un événement et « Nouvel événement ici » dans le menu contextuel ouvrent l'éditeur du Pro, une boîte de dialogue modale avec les récurrences usuelles. Il enregistre par l'historique du calendrier (vérifié contre ses règles, annulable). Sur une occurrence d'une série, il demande jusqu'où va la modification. Il est chargé à sa première ouverture, pas avec l'application.
- **`useDzExport(controller)`** : impression et exports du calendrier, chargés à la première utilisation. Une mauvaise entrée ne lève jamais d'exception : les `problems` d'un résultat disent ce qui a échoué.
- **Les vues timeline** (des ressources en lignes le long d'un axe de temps écoulé) viennent avec `import '@dzcalendar/pro'`, une fois dans l'application.

### Installation

```bash
npm install @dzcalendar/pro @dzcalendar/pro-react @dzcalendar/react @tzslot/dom
```

Dépendances homologues : `react` `^18.2.0 || ^19.0.0`, `@dzcalendar/react`, et `@tzslot/dom` `^2.4.0` (l'éditeur utilise le widget de tzslot). Plus ce dont `@dzcalendar/react` a besoin (`@dzcalendar/core`, `@dzcalendar/dom`, `@dzcalendar/theme`).

### Démarrage rapide

```tsx
import { useState } from 'react';
import { DzCalendar, useCalendarController } from '@dzcalendar/react';
import { useDzExport, useEventEditor } from '@dzcalendar/pro-react';
import type { EditorOutcome } from '@dzcalendar/pro-react';
import '@dzcalendar/pro'; // les vues timeline
import '@dzcalendar/theme/dzcalendar.css';

export function Planning() {
  const cal = useCalendarController();
  const [dernier, setDernier] = useState<EditorOutcome | null>(null);
  useEventEditor(cal, { onClosed: setDernier });
  const exports = useDzExport(cal);
  return (
    <>
      <button onClick={() => exports.download('pdf', 'agenda.pdf')}>PDF</button>
      <button onClick={() => exports.download('xlsx', 'agenda.xlsx')}>Excel</button>
      <button onClick={() => exports.print()}>Imprimer</button>
      <span>{dernier}</span>
      <DzCalendar controller={cal} timeZone="Europe/Paris" locale="fr-FR" defaultView="timeGridWeek" editable />
    </>
  );
}
```

Donnez à `<DzCalendar>` le même `controller` que celui que reçoivent les hooks.

### API

#### `useEventEditor(controller, { options?, onClosed? })`

| | |
|---|---|
| `controller` | Le `CalendarController` du calendrier (`useCalendarController()`). |
| `options` | `EditorOptions`, ci-dessous. |
| `onClosed(outcome)` | `'saved'`, `'deleted'` ou `'cancelled'` (aussi quand le chargement de l'éditeur échoue ; l'échec est alors aussi signalé comme un rejet non géré). |

L'éditeur prend en charge « Ouvrir » et « Nouvel événement ici » par le contrôleur (`takeOver`) : les props `onEventOpen` et `onCreateRequest` du calendrier ne se déclenchent plus, quoi qu'elles disent, jusqu'à ce que le composant qui utilise le hook disparaisse.

`EditorOptions` :

| Option | Défaut | |
|---|---|---|
| `messages` | ceux de la langue | Mots du formulaire par-dessus ceux de la langue (anglais, français, arabe, espagnol et allemand sont intégrés). |
| `container` | l'élément du calendrier (son thème s'applique) | Où va la boîte de dialogue. |
| `stepMinutes` | `15` | Minutes dont avancent les flèches de l'heure. |
| `defaultMinutes` | `60` | Durée d'un nouvel événement horaire. |
| `tones` | les six de `@dzcalendar/theme` | Les teintes proposées (`--dz-tone-*`). |
| `injectStyles` | `true` | `false` sous une CSP sans styles en ligne : incluez `EDITOR_CSS` (de `@dzcalendar/pro/editor`) vous-même. |

#### `useDzExport(controller)`

Renvoie `DzExports`, lié au calendrier de `controller` (un objet stable tant que le contrôleur l'est). Rien ici ne lève d'exception ni ne rejette. Avant le montage du calendrier, un appel répond un problème de `detail: 'not-attached'`.

| Méthode | Résout avec |
|---|---|
| `print(options?)` | `PrintJob` : `pages` (les feuilles), `problems`, `close()`. Impression paginée par le navigateur (feuilles A4, Letter ou A3, une copie du calendrier par période). |
| `pdf(options?)` | `ExportResult` : `{ blob, problems }`. Un PDF de la vue sur les dates demandées, une feuille par page. |
| `png(options?)` | `{ blobs, problems }` : les mêmes feuilles en images PNG, une par feuille. |
| `xlsx(options?)` | `ExportResult`. Une ligne par occurrence sur la plage (les deux fuseaux, la vraie durée), de vraies dates Excel. |
| `csv(options?)` | `ExportResult`. Les mêmes lignes en CSV (UTF-8 avec BOM). |
| `ics(options?)` | `ExportResult`. Un fichier iCalendar : les événements tels quels, une série entière (règle et occurrences déplacées), chacun dans son fuseau. |
| `download(kind, filename, options?)` | `Problem[]` (vide quand le fichier a été enregistré). `kind` vaut `'pdf' \| 'png' \| 'xlsx' \| 'csv' \| 'ics'`. Les feuilles PNG sont enregistrées en un fichier, ou en un zip. |

Options :

| Type | Champs |
|---|---|
| `RangeOptions` (`xlsx`, `csv`, `ics`) | `from`, `to` (`PlainDate`, `[from, to)`, par défaut ce qui est affiché), `messages`. |
| `csv` ajoute | `separator` : `','` (défaut), `';'` (un Excel français) ou `'\t'`. |
| `ics` ajoute | `all: true` écrit tout ce que le calendrier contient ; `name` nomme le calendrier. |
| `ImageOptions` (`pdf`, `png`) | `view` (par défaut celle affichée ; une vue multi-mois va un mois par feuille), `from`, `to`, `paper` (`'a4'`, `'letter'`, `'a3'`), `orientation` (`'landscape'`, portrait pour une liste), `scale` (pixels d'appareil par pixel CSS, 2 par défaut), `messages`. `pdf` ajoute `title`. |
| `PrintOptions` (`print`) | `view`, `from`, `to`, `paper`, `orientation`, `rowsPerPage` (une timeline de ressources : lignes par feuille), `print: false` (construit les feuilles et vous les laisse : `close()` les retire ; pas de `window.print()`), `messages`. |

Les sources sont interrogées pour les dates exportées, à côté de ce qui est affiché ; ce qui n'a pas pu être chargé est un avertissement dans `problems` (le fichier ne l'a pas).

Les types sont réexportés : `EditorOptions`, `EditorOutcome`, `ExportKind`, `ExportResult`, `ImageOptions`, `RangeOptions`, `PrintJob`, `PrintOptions`, `DzExports`.

### Recettes

#### Un menu d'exports

```tsx
import { DzCalendar, useCalendarController } from '@dzcalendar/react';
import { useDzExport } from '@dzcalendar/pro-react';
import { Temporal } from '@dzcalendar/core';

export function Exports() {
  const cal = useCalendarController();
  const exports = useDzExport(cal);

  const mois = async () => {
    // Un mois en PDF A3 paysage.
    const problems = await exports.download('pdf', 'octobre.pdf', {
      view: 'dayGridMonth',
      from: Temporal.PlainDate.from('2026-10-01'),
      to: Temporal.PlainDate.from('2026-11-01'),
      paper: 'a3',
      orientation: 'landscape',
    });
    if (problems.length > 0) console.warn(problems.map((p) => `${p.code}: ${p.detail}`));
  };

  const ics = async () => {
    const { blob, problems } = await exports.ics({ all: true, name: 'Agenda' });
    if (blob) console.log(blob.size, problems.length);
  };

  return (
    <>
      <button onClick={mois}>Octobre (PDF)</button>
      <button onClick={() => exports.download('csv', 'agenda.csv', { separator: ';' })}>CSV</button>
      <button onClick={ics}>iCalendar</button>
      <DzCalendar controller={cal} timeZone="Europe/Paris" locale="fr-FR" />
    </>
  );
}
```

#### L'éditeur sur une timeline de ressources

```tsx
import { DzCalendar, useCalendarController } from '@dzcalendar/react';
import { useEventEditor } from '@dzcalendar/pro-react';
import '@dzcalendar/pro';

const SALLES = [{ id: 'r1', title: 'Salle 1' }, { id: 'r2', title: 'Salle 2' }];

export function Salles() {
  const cal = useCalendarController();
  useEventEditor(cal, {
    options: { stepMinutes: 5, defaultMinutes: 30, tones: ['blue', 'green'] },
    onClosed: (outcome) => console.log(outcome),
  });
  return <DzCalendar controller={cal} timeZone="Europe/Paris" locale="fr-FR" defaultView="resourceTimelineDay" resources={SALLES} editable />;
}
```

Les réglages de la timeline (`slot`, `span`, `follow`, `ticks`…), `onFollowChange` et un écran de supervision sont décrits dans [`timeline`](https://plinthworks.github.io/dzcalendar/fr/options/timeline/) et [`onFollowChange`](https://plinthworks.github.io/dzcalendar/fr/options/on-follow-change/) ; en React ce sont des props de `<DzCalendar>`.

### Documentation

- [Guide React](https://plinthworks.github.io/dzcalendar/fr/getting-started/react/)
- [Éditeur (Pro)](https://plinthworks.github.io/dzcalendar/fr/guides/editor/)
- [Impression et export (Pro)](https://plinthworks.github.io/dzcalendar/fr/guides/print-export/)
- [Ressources et timeline](https://plinthworks.github.io/dzcalendar/fr/guides/resources-timeline/)
- [`timeline`](https://plinthworks.github.io/dzcalendar/fr/options/timeline/), [`onFollowChange`](https://plinthworks.github.io/dzcalendar/fr/options/on-follow-change/), [`resources`](https://plinthworks.github.io/dzcalendar/fr/options/resources/)
- [Installation](https://plinthworks.github.io/dzcalendar/fr/getting-started/installation/), [Options](https://plinthworks.github.io/dzcalendar/fr/options/), [API](https://plinthworks.github.io/dzcalendar/fr/api/)

### Licence

MIT
