# @dzcalendar/react

`<DzCalendar>` for React 18 and 19: a calendar where every event keeps its own time zone, with controlled or free view, date and selection, a controller read with hooks, and events drawn by your own components.

**English** · [Français](#français)

## What it is

`@dzcalendar/react` is the React binding of [DzCalendar](https://plinthworks.github.io/dzcalendar/), a calendar and scheduler written from scratch on Temporal. Days of 23 h, 25 h or 23 h 30 are drawn as they are, and each event is shown in the zone it was made in.

- **Options are props.** What changed since the last render goes to the calendar, nothing else.
- **`view`, `date` and `selection` are controlled like an input's `value`**, or free with `defaultView` / `defaultDate`.
- **Your components inside the calendar** (`renderEventContent`, `renderDayHeader`, …) through portals: your context, state, router and i18n reach them.
- **A controller** (`useCalendarController`, `useCalendarState`) for a header, a side panel or a status line of your own.
- **No `document` or `window` at import**: safe to import on a server; the calendar itself is made in the browser.

## Install

```bash
npm install @dzcalendar/core @dzcalendar/dom @dzcalendar/theme @dzcalendar/react
```

Peer dependencies: `react` and `react-dom`, `^18.2.0 || ^19.0.0`. Import the stylesheet once:

```ts
import '@dzcalendar/theme/dzcalendar.css';
```

Other views are opt-in imports, once, anywhere: `import '@dzcalendar/dom/list'` (list views), `import '@dzcalendar/dom/multimonth'` (multi-month year), `import '@dzcalendar/core/recurrence'` (repeating events with `rrule`).

## Quick start

```tsx
import { useState } from 'react';
import { Temporal } from '@dzcalendar/core';
import type { EventInput, Selection } from '@dzcalendar/core';
import { DzCalendar, useCalendarController, useCalendarState } from '@dzcalendar/react';
import '@dzcalendar/core/recurrence'; // repeating events (rrule)
import '@dzcalendar/theme/dzcalendar.css';

const events: EventInput[] = [
  { id: 'a', title: 'Consultation', start: '2026-10-21T09:00[Europe/Paris]', duration: { minutes: 45 } },
  { id: 'b', title: 'Call Chicago', start: '2026-10-22T10:00[America/Chicago]', duration: { hours: 1 } },
  { id: 'c', title: 'Day off', start: '2026-10-23', allDay: true },
  { id: 'w', title: 'Rounds', start: '2026-10-19T08:00[Europe/Paris]', duration: { hours: 2 }, rrule: 'FREQ=WEEKLY;BYDAY=MO,WE' },
];

export function Agenda() {
  const cal = useCalendarController();
  const { title, canUndo } = useCalendarState(cal);
  const [view, setView] = useState('timeGridWeek');
  const [selection, setSelection] = useState<Selection | null>(null);
  return (
    <>
      <header>
        <button onClick={cal.prev}>‹</button> <h2>{title}</h2> <button onClick={cal.next}>›</button>
        <button disabled={!canUndo} onClick={cal.undo}>Undo</button>
      </header>
      <DzCalendar
        controller={cal}
        timeZone="Europe/Paris"
        events={events}
        view={view} onViewChange={setView}
        defaultDate={Temporal.PlainDate.from('2026-10-21')}
        selection={selection} onSelectionChange={setSelection}
        editable selectable
        renderEventContent={(event, ctx) => <><b>{event.title}</b> {ctx.timeText}</>}
        onEventClick={(instance) => console.log(instance.event.id)}
      />
    </>
  );
}
```

### Temporal first

`<DzCalendar>` waits for Temporal by itself, but your own code makes Temporal values too (a `defaultDate`, a piece of state). A browser without Temporal of its own (Safari, every iOS browser) gets the polyfill with `loadTemporal()`: await it once before the first render.

```tsx
import { createRoot } from 'react-dom/client';
import { loadTemporal } from '@dzcalendar/core';
import { DzCalendar } from '@dzcalendar/react';

// At once where the browser has Temporal (Chrome, Edge, Firefox); Safari fetches its polyfill first.
await loadTemporal();
createRoot(document.getElementById('root')!).render(<DzCalendar timeZone="Europe/Paris" />);
```

Temporal always comes from `@dzcalendar/core` (one polyfill, one set of classes, shared with other DzCalendar and tzslot packages).

## API

### `<DzCalendar>` props

| Prop | Type | What it does |
|---|---|---|
| `events` | `EventInput[]` | The events you hold. Diffed by id and value: a new array with the same events redraws nothing. |
| `sources` | `EventSourceSpec[]` | Events the calendar fetches (`jsonSource`, `fnSource`, `liveSource`…). Compared by identity: keep them stable with `useMemo`. |
| `resources` | `ResourceInput[]` | Columns or rows of the resource views. |
| `view` / `defaultView` / `onViewChange` | `string` / `string` / `(view) => void` | Controlled or free view, see below. |
| `date` / `defaultDate` / `onDateChange` | `PlainDate` | Controlled or free date. |
| `selection` / `onSelectionChange` | `Selection \| null` | The selection shown (`null`: none) and what a person selects. |
| `timeZone`, `locale`, `editable`, `selectable`, `businessHours`, `weekends`, `weekNumbers`, `hiddenDays`, `messages`, `theme`, `scheme`, `density`, `displayCalendar`, `secondaryCalendar`, `availableSlots`, `timeGrid`, `headerToolbar`… | the option's type | Every other live option of the calendar is a prop of the same name (the full list: [Options](https://plinthworks.github.io/dzcalendar/options/)). |
| `axis` | `'wall' \| 'elapsed'` | Wall-clock rows (a 25-hour day has 25 rows) or elapsed time. Merged into `timeGrid`. |
| `controller` | `CalendarController` | A controller made with `useCalendarController()`; otherwise the component has its own. |
| `initial` | `DzCalendarDefaults` | Options read once, when the calendar is made. See "`options` and `initial`". |
| `motion` | `MotionAdapter` | Made at creation, not changed after. |
| `hooks` | `CalendarHooks` | Classes and mounts for any element, merged with the render props. |
| `headerItems` | `Record<string, ReactNode \| (ctx) => ReactNode>` | Your components in the header, named in `headerToolbar`. |
| `className`, `style`, `id`, `data-*`, `aria-*` | | Go on the calendar's element. |

Callbacks:

| Prop | Called with | When |
|---|---|---|
| `onEventClick` | `EventInstance` | An event is clicked. |
| `onDateClick` | `DateClick` | A day is clicked. |
| `onSlotClick` | `AvailableSlot` | A free slot is clicked (or Enter on it). Book it; your server checks again. |
| `onEventChange` | `EventChange` | A person changed an event (drag, resize, keyboard, menu, editor). Persist it; call `change.revert()` if the server refuses. |
| `onEventOpen` | `EventInstance` | "Open" in the menu. |
| `onCreateRequest` | `CreateRequest` | "New event here" in the menu. |
| `onSelect` | `Selection` | A person made a selection (`onSelectionChange` hears it too, first). |
| `onSourceNotice` | `SourceNotice` | Loading, a failed fetch, problems in a delivery, a refused save. |
| `onProblems` | `NormalizationReport` | What the `events` given could not be read as. |
| `onResourceProblems` | `Problem[]` | What the `resources` given could not be read as. |
| `onProblem` | `CalendarProblem` | Something the calendar could not do as asked, found while drawing. Without it: the console, once per code. |
| `onError` | `unknown` | A value the calendar refused (an unknown view, every day hidden): the others are applied. Default `console.error`. |

`onEventOpen`, `onCreateRequest`, `onSlotClick` and `onProblem` change what the calendar offers ("Open" in the menu, "New event here", slots as buttons): they are offered only while the prop is given. Callbacks such as `onDrop`, `onEventReceive` and `onEventLeave` are plain options, passed as props.

### Controlled or free `view`, `date`, `selection`

Given, they win, like an input's `value`: the calendar goes back to them if you do not follow `onViewChange`, `onDateChange` or `onSelectionChange`. Not given, use `defaultView` and `defaultDate` and the calendar keeps its own. A value the calendar refuses (an unknown view) goes to `onError` and your handler gets the real view back.

### `options` and `initial`

There is no `options` prop in React: live options are props. Two sets exist:

- **Live options**: anything that `update()` takes (`timeZone`, `events`, `locale`, `firstDay`, `rules`, `timeline`…), changed after creation by changing the prop. Arrays and objects are compared by their contents, so `resources={[…]}` written again at each render changes nothing. A prop that goes back to `undefined` leaves the calendar's value as it was: pass the default to restore it.
- **Creation options**, read once when the calendar is made (`now`, `kernel`, `store`, `views`, `historyLimit`, `titleFormat`, `injectStyles`, `cssLayers`…): `initial={{ historyLimit: 50 }}`, or for the whole application `DzCalendarProvider`. Later changes to `initial` are not read. Order of precedence: provider defaults, then `initial`, then props.

### Render props

Each draws one element with your components, through portals inside your own tree:

`renderEventContent(event, ctx)`, `renderDayHeader`, `renderDayCell`, `renderSlotLabel`, `renderAllDayLabel`, `renderMoreLink`, `renderNowIndicator`, `renderWeekNumber`, `renderNoEvents`, `renderListDayHeader`, `renderMonthHeader`, `renderResource`, `renderResourceGroupHeader`, `renderResourceAreaHeader`.

`ctx` for an event has `instance`, `timeText`, `displayZone`, `family` and, for a background event, `background`; return `null` from `renderEventContent` for a background event to leave it mute. A day head receives `day.date`, `day.resource`, `day.lengthMinutes`, `day.text`.

```tsx
import { DzCalendar } from '@dzcalendar/react';
import type { CalendarHooks } from '@dzcalendar/dom';

const hooks: CalendarHooks = { dayCell: { class: (d) => (d.outside ? 'muted' : null) } };

export function Custom() {
  return (
    <DzCalendar
      timeZone="Europe/Paris"
      hooks={hooks}
      headerToolbar={{ start: 'prev,next', center: 'title', end: 'filter timeGridWeek,dayGridMonth' }}
      headerItems={{ filter: <input placeholder="Filter" /> }}
      renderDayHeader={(day) => <span>{day.text}</span>}
      renderEventContent={(event, ctx) => (ctx.background ? null : <b>{event.title}</b>)}
    />
  );
}
```

### `<DzCalendarProvider>`

```tsx
import type { ReactNode } from 'react';
import { DzCalendarProvider } from '@dzcalendar/react';
import { createGsapMotion } from '@dzcalendar/motion-gsap';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <DzCalendarProvider defaults={{ timeZone: 'Europe/Paris', locale: 'fr-FR' }} motion={() => createGsapMotion()}>
      {children}
    </DzCalendarProvider>
  );
}
```

`defaults` are the options every `<DzCalendar>` below starts from (any option except `kernel`, `hooks` and `headerItems`, which are each calendar's own); providers nest and merge. `motion` is a factory: one adapter is made per calendar (optional, from `@dzcalendar/motion-gsap`; a `motion` prop or a `motion` in `defaults` wins). A factory that fails is reported to `onError` and the calendar is drawn still.

### The controller

`useCalendarController()` gives a controller that stays the same across renders; its methods are stable, so pass them as handlers as they are. `useCalendarState(controller)` reads it and renders again when it changes.

| Method | |
|---|---|
| `prev()`, `next()`, `today()` | Navigate. |
| `goTo(date)`, `changeView(view)` | Go to a date, change view. |
| `shift(by)` | Slides a timeline by hours and minutes (`{ minutes: -15 }`); `false` when the view does not slide. |
| `dispatch(command, { validate? })` | Runs a command, returns a `CommandResult` (`ok`, `problems`). Without `validate`, not reported to `onEventChange` (with `{ validate: true }` it is, as a person's change): persist it where your code runs it. |
| `undo()`, `redo()` | Return `boolean`. |
| `refetch(sourceId?)` | Fetches the sources again. |
| `takeOver({ onEventOpen, onCreateRequest })` | Hands "Open" and "New event here" to someone else (the Pro's editor does); returns how to give them back. |

`useCalendarState(controller)` returns a snapshot: `title`, `view`, `date`, `range`, `canUndo`, `canRedo`, `loading`, `problems`, `state` and `instance` (the DOM calendar, `null` before mounting). Before mounting, methods do nothing, and `dispatch` answers a refused `CommandResult`.

Inside what `renderEventContent` renders, `useParentCalendarController()` gives that calendar's controller (`null` elsewhere).

A `ref` on `<DzCalendar>` gives `{ instance, controller }` (`DzCalendarHandle`): the DOM calendar for what nothing else covers.

### Server rendering

Importing the packages touches no `document` or `window`. On a server `<DzCalendar>` renders an empty element; the calendar is made in the browser.

## Recipes

### Save what a person changes

`onEventChange` says what a person changed. Persist it, and revert if the server refuses:

```tsx
import { DzCalendar } from '@dzcalendar/react';
import type { EventInput } from '@dzcalendar/core';

export function Appointments({ events }: { events: EventInput[] }) {
  return (
    <DzCalendar
      timeZone="Europe/Paris"
      events={events}
      editable
      onEventChange={(change) =>
        fetch(`/api/appointments/${change.after?.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ start: String(change.after?.start) }),
        }).then((r) => {
          if (!r.ok) change.revert();
        })
      }
    />
  );
}
```

### Events from a server

```tsx
import { useMemo } from 'react';
import { jsonSource } from '@dzcalendar/core';
import { DzCalendar } from '@dzcalendar/react';

export function Remote() {
  const sources = useMemo(() => [jsonSource('team', { url: '/api/events' })], []);
  return <DzCalendar timeZone="Europe/Paris" sources={sources} />;
}
```

### A "Back to live" button on a timeline

The timeline views are the Pro's (`import '@dzcalendar/pro'`).

```tsx
import { useState } from 'react';
import { DzCalendar, useCalendarController } from '@dzcalendar/react';
import '@dzcalendar/pro';

const PROCESSES = [{ id: 'import', title: 'Import' }, { id: 'billing', title: 'Billing' }];

export function Supervision() {
  const [following, setFollowing] = useState(true);
  const controller = useCalendarController();
  return (
    <>
      {!following && <button onClick={() => controller.today()}>Back to live</button>}
      <DzCalendar
        controller={controller}
        timeZone="Europe/Paris"
        defaultView="resourceTimelineDay"
        resources={PROCESSES}
        timeline={{ slot: 15, span: { hours: 4 }, follow: true }}
        onFollowChange={setFollowing}
      />
    </>
  );
}
```

The Pro's editor and exports for React are in [`@dzcalendar/pro-react`](https://www.npmjs.com/package/@dzcalendar/pro-react).

## Documentation

- [React guide](https://plinthworks.github.io/dzcalendar/getting-started/react/)
- [Installation](https://plinthworks.github.io/dzcalendar/getting-started/installation/)
- [Migrating from FullCalendar](https://plinthworks.github.io/dzcalendar/getting-started/migrating-from-fullcalendar/)
- [Options](https://plinthworks.github.io/dzcalendar/options/) and [API](https://plinthworks.github.io/dzcalendar/api/)
- Guides: [Events](https://plinthworks.github.io/dzcalendar/guides/events/), [Event sources](https://plinthworks.github.io/dzcalendar/guides/event-sources/), [Time zones](https://plinthworks.github.io/dzcalendar/guides/time-zones/), [Views](https://plinthworks.github.io/dzcalendar/guides/views/), [Drag and drop](https://plinthworks.github.io/dzcalendar/guides/drag-and-drop/), [Selection](https://plinthworks.github.io/dzcalendar/guides/selection/), [Recurrence](https://plinthworks.github.io/dzcalendar/guides/recurrence/), [Theming](https://plinthworks.github.io/dzcalendar/guides/theming/), [Keyboard and accessibility](https://plinthworks.github.io/dzcalendar/guides/keyboard-accessibility/), [Languages](https://plinthworks.github.io/dzcalendar/guides/languages/), [Resources and timeline](https://plinthworks.github.io/dzcalendar/guides/resources-timeline/), [Live supervision](https://plinthworks.github.io/dzcalendar/guides/supervision/)

## License

MIT

---

## Français

`<DzCalendar>` pour React 18 et 19 : un calendrier où chaque événement garde son fuseau horaire, avec vue, date et sélection contrôlées ou libres, un contrôleur lu par des hooks, et des événements dessinés par vos propres composants.

[English](#dzcalendarreact) · **Français**

### Ce que c'est

`@dzcalendar/react` est la liaison React de [DzCalendar](https://plinthworks.github.io/dzcalendar/fr/), un calendrier et planificateur écrit de zéro sur Temporal. Les jours de 23 h, 25 h ou 23 h 30 sont dessinés tels qu'ils sont, et chaque événement est montré dans le fuseau où il a été créé.

- **Les options sont des props.** Ce qui a changé depuis le dernier rendu va au calendrier, rien d'autre.
- **`view`, `date` et `selection` sont contrôlées comme la `value` d'un champ**, ou libres avec `defaultView` / `defaultDate`.
- **Vos composants dans le calendrier** (`renderEventContent`, `renderDayHeader`, …) par des portails : votre contexte, votre état, votre routeur et votre i18n les atteignent.
- **Un contrôleur** (`useCalendarController`, `useCalendarState`) pour un en-tête, un panneau latéral ou une ligne d'état à vous.
- **Ni `document` ni `window` à l'import** : l'import est sûr sur un serveur ; le calendrier lui-même se crée dans le navigateur.

### Installation

```bash
npm install @dzcalendar/core @dzcalendar/dom @dzcalendar/theme @dzcalendar/react
```

Dépendances homologues : `react` et `react-dom`, `^18.2.0 || ^19.0.0`. Importez la feuille de style une fois :

```ts
import '@dzcalendar/theme/dzcalendar.css';
```

Les autres vues sont des imports à la demande, une fois, n'importe où : `import '@dzcalendar/dom/list'` (vues liste), `import '@dzcalendar/dom/multimonth'` (année multi-mois), `import '@dzcalendar/core/recurrence'` (événements récurrents avec `rrule`).

### Démarrage rapide

```tsx
import { useState } from 'react';
import { Temporal } from '@dzcalendar/core';
import type { EventInput, Selection } from '@dzcalendar/core';
import { DzCalendar, useCalendarController, useCalendarState } from '@dzcalendar/react';
import '@dzcalendar/core/recurrence'; // événements récurrents (rrule)
import '@dzcalendar/theme/dzcalendar.css';

const events: EventInput[] = [
  { id: 'a', title: 'Consultation', start: '2026-10-21T09:00[Europe/Paris]', duration: { minutes: 45 } },
  { id: 'b', title: 'Appel Chicago', start: '2026-10-22T10:00[America/Chicago]', duration: { hours: 1 } },
  { id: 'c', title: 'Jour off', start: '2026-10-23', allDay: true },
  { id: 'w', title: 'Tournée', start: '2026-10-19T08:00[Europe/Paris]', duration: { hours: 2 }, rrule: 'FREQ=WEEKLY;BYDAY=MO,WE' },
];

export function Agenda() {
  const cal = useCalendarController();
  const { title, canUndo } = useCalendarState(cal);
  const [view, setView] = useState('timeGridWeek');
  const [selection, setSelection] = useState<Selection | null>(null);
  return (
    <>
      <header>
        <button onClick={cal.prev}>‹</button> <h2>{title}</h2> <button onClick={cal.next}>›</button>
        <button disabled={!canUndo} onClick={cal.undo}>Annuler</button>
      </header>
      <DzCalendar
        controller={cal}
        timeZone="Europe/Paris"
        locale="fr-FR"
        events={events}
        view={view} onViewChange={setView}
        defaultDate={Temporal.PlainDate.from('2026-10-21')}
        selection={selection} onSelectionChange={setSelection}
        editable selectable
        renderEventContent={(event, ctx) => <><b>{event.title}</b> {ctx.timeText}</>}
        onEventClick={(instance) => console.log(instance.event.id)}
      />
    </>
  );
}
```

#### Temporal d'abord

`<DzCalendar>` attend Temporal tout seul, mais votre propre code fabrique aussi des valeurs Temporal (une `defaultDate`, un état). Un navigateur sans Temporal natif (Safari, tous les navigateurs d'iOS) reçoit le polyfill avec `loadTemporal()` : attendez-le une fois avant le premier rendu.

```tsx
import { createRoot } from 'react-dom/client';
import { loadTemporal } from '@dzcalendar/core';
import { DzCalendar } from '@dzcalendar/react';

// Immédiat là où le navigateur a Temporal (Chrome, Edge, Firefox) ; Safari va d'abord chercher son polyfill.
await loadTemporal();
createRoot(document.getElementById('root')!).render(<DzCalendar timeZone="Europe/Paris" />);
```

Temporal vient toujours de `@dzcalendar/core` (un seul polyfill, un seul jeu de classes, partagé avec les autres paquets DzCalendar et tzslot).

### API

#### Props de `<DzCalendar>`

| Prop | Type | Rôle |
|---|---|---|
| `events` | `EventInput[]` | Les événements que vous tenez. Comparés par id et par valeur : un nouveau tableau aux mêmes événements ne redessine rien. |
| `sources` | `EventSourceSpec[]` | Des événements que le calendrier va chercher (`jsonSource`, `fnSource`, `liveSource`…). Comparées par identité : gardez-les stables avec `useMemo`. |
| `resources` | `ResourceInput[]` | Colonnes ou lignes des vues par ressources. |
| `view` / `defaultView` / `onViewChange` | `string` / `string` / `(view) => void` | Vue contrôlée ou libre, voir plus bas. |
| `date` / `defaultDate` / `onDateChange` | `PlainDate` | Date contrôlée ou libre. |
| `selection` / `onSelectionChange` | `Selection \| null` | La sélection montrée (`null` : aucune) et ce qu'une personne sélectionne. |
| `timeZone`, `locale`, `editable`, `selectable`, `businessHours`, `weekends`, `weekNumbers`, `hiddenDays`, `messages`, `theme`, `scheme`, `density`, `displayCalendar`, `secondaryCalendar`, `availableSlots`, `timeGrid`, `headerToolbar`… | le type de l'option | Toute autre option vive du calendrier est une prop du même nom (la liste complète : [Options](https://plinthworks.github.io/dzcalendar/fr/options/)). |
| `axis` | `'wall' \| 'elapsed'` | Lignes à l'heure murale (un jour de 25 h a 25 lignes) ou temps écoulé. Fusionnée dans `timeGrid`. |
| `controller` | `CalendarController` | Un contrôleur fait avec `useCalendarController()` ; sinon le composant a le sien. |
| `initial` | `DzCalendarDefaults` | Options lues une fois, à la création du calendrier. Voir « `options` et `initial` ». |
| `motion` | `MotionAdapter` | Fait à la création, pas changé ensuite. |
| `hooks` | `CalendarHooks` | Classes et montages pour n'importe quel élément, fusionnés avec les props `render…`. |
| `headerItems` | `Record<string, ReactNode \| (ctx) => ReactNode>` | Vos composants dans l'en-tête, nommés dans `headerToolbar`. |
| `className`, `style`, `id`, `data-*`, `aria-*` | | Vont sur l'élément du calendrier. |

Rappels :

| Prop | Reçoit | Quand |
|---|---|---|
| `onEventClick` | `EventInstance` | Un événement est cliqué. |
| `onDateClick` | `DateClick` | Un jour est cliqué. |
| `onSlotClick` | `AvailableSlot` | Un créneau libre est cliqué (ou Entrée dessus). Réservez-le ; votre serveur revérifie. |
| `onEventChange` | `EventChange` | Une personne a modifié un événement (glisser, redimensionner, clavier, menu, éditeur). Enregistrez-le ; appelez `change.revert()` si le serveur refuse. |
| `onEventOpen` | `EventInstance` | « Ouvrir » dans le menu. |
| `onCreateRequest` | `CreateRequest` | « Nouvel événement ici » dans le menu. |
| `onSelect` | `Selection` | Une personne a fait une sélection (`onSelectionChange` l'entend aussi, en premier). |
| `onSourceNotice` | `SourceNotice` | Chargement, échec d'une requête, problèmes dans une livraison, enregistrement refusé. |
| `onProblems` | `NormalizationReport` | Ce que les `events` donnés n'ont pas pu être lus comme. |
| `onResourceProblems` | `Problem[]` | Ce que les `resources` données n'ont pas pu être lues comme. |
| `onProblem` | `CalendarProblem` | Ce que le calendrier n'a pas pu faire comme demandé, trouvé en dessinant. Sans elle : la console, une fois par code. |
| `onError` | `unknown` | Une valeur que le calendrier a refusée (vue inconnue, tous les jours masqués) : les autres sont appliquées. Par défaut `console.error`. |

`onEventOpen`, `onCreateRequest`, `onSlotClick` et `onProblem` changent ce que le calendrier propose (« Ouvrir » dans le menu, « Nouvel événement ici », créneaux en boutons) : ils ne sont proposés que tant que la prop est donnée. Les rappels comme `onDrop`, `onEventReceive` et `onEventLeave` sont de simples options, passées en props.

#### `view`, `date`, `selection` : contrôlées ou libres

Données, elles l'emportent, comme la `value` d'un champ : le calendrier y revient si vous ne suivez pas `onViewChange`, `onDateChange` ou `onSelectionChange`. Non données, utilisez `defaultView` et `defaultDate` et le calendrier garde les siennes. Une valeur que le calendrier refuse (une vue inconnue) va à `onError` et votre gestionnaire reçoit la vraie vue en retour.

#### `options` et `initial`

Il n'y a pas de prop `options` en React : les options vives sont des props. Il y en a deux sortes :

- **Options vives** : tout ce que `update()` accepte (`timeZone`, `events`, `locale`, `firstDay`, `rules`, `timeline`…), modifiées après la création en changeant la prop. Tableaux et objets sont comparés par leur contenu : `resources={[…]}` réécrit à chaque rendu ne change rien. Une prop qui redevient `undefined` laisse la valeur du calendrier telle qu'elle était : passez la valeur par défaut pour la rétablir.
- **Options de création**, lues une fois quand le calendrier est fait (`now`, `kernel`, `store`, `views`, `historyLimit`, `titleFormat`, `injectStyles`, `cssLayers`…) : `initial={{ historyLimit: 50 }}`, ou pour toute l'application `DzCalendarProvider`. Les changements ultérieurs de `initial` ne sont pas lus. Ordre de priorité : valeurs du provider, puis `initial`, puis props.

#### Props `render…`

Chacune dessine un élément avec vos composants, par des portails dans votre propre arbre :

`renderEventContent(event, ctx)`, `renderDayHeader`, `renderDayCell`, `renderSlotLabel`, `renderAllDayLabel`, `renderMoreLink`, `renderNowIndicator`, `renderWeekNumber`, `renderNoEvents`, `renderListDayHeader`, `renderMonthHeader`, `renderResource`, `renderResourceGroupHeader`, `renderResourceAreaHeader`.

Le `ctx` d'un événement a `instance`, `timeText`, `displayZone`, `family` et, pour un événement d'arrière-plan, `background` ; renvoyez `null` depuis `renderEventContent` pour qu'un événement d'arrière-plan reste muet. Un en-tête de jour reçoit `day.date`, `day.resource`, `day.lengthMinutes`, `day.text`.

```tsx
import { DzCalendar } from '@dzcalendar/react';
import type { CalendarHooks } from '@dzcalendar/dom';

const hooks: CalendarHooks = { dayCell: { class: (d) => (d.outside ? 'muted' : null) } };

export function Custom() {
  return (
    <DzCalendar
      timeZone="Europe/Paris"
      hooks={hooks}
      headerToolbar={{ start: 'prev,next', center: 'title', end: 'filter timeGridWeek,dayGridMonth' }}
      headerItems={{ filter: <input placeholder="Filtrer" /> }}
      renderDayHeader={(day) => <span>{day.text}</span>}
      renderEventContent={(event, ctx) => (ctx.background ? null : <b>{event.title}</b>)}
    />
  );
}
```

#### `<DzCalendarProvider>`

```tsx
import type { ReactNode } from 'react';
import { DzCalendarProvider } from '@dzcalendar/react';
import { createGsapMotion } from '@dzcalendar/motion-gsap';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <DzCalendarProvider defaults={{ timeZone: 'Europe/Paris', locale: 'fr-FR' }} motion={() => createGsapMotion()}>
      {children}
    </DzCalendarProvider>
  );
}
```

`defaults` sont les options dont part chaque `<DzCalendar>` en dessous (toute option sauf `kernel`, `hooks` et `headerItems`, propres à chaque calendrier) ; les providers s'emboîtent et fusionnent. `motion` est une fabrique : un adaptateur est fait par calendrier (optionnel, de `@dzcalendar/motion-gsap` ; une prop `motion` ou un `motion` dans `defaults` l'emporte). Une fabrique qui échoue est signalée à `onError` et le calendrier est dessiné quand même.

#### Le contrôleur

`useCalendarController()` donne un contrôleur qui reste le même d'un rendu à l'autre ; ses méthodes sont stables, passez-les telles quelles comme gestionnaires. `useCalendarState(controller)` le lit et refait le rendu quand il change.

| Méthode | |
|---|---|
| `prev()`, `next()`, `today()` | Naviguer. |
| `goTo(date)`, `changeView(view)` | Aller à une date, changer de vue. |
| `shift(by)` | Fait glisser une timeline d'un nombre d'heures et de minutes (`{ minutes: -15 }`) ; `false` quand la vue ne glisse pas. |
| `dispatch(command, { validate? })` | Exécute une commande, renvoie un `CommandResult` (`ok`, `problems`). Sans `validate`, non signalée à `onEventChange` (avec `{ validate: true }` elle l'est, comme le changement d'une personne) : enregistrez-la là où votre code l'exécute. |
| `undo()`, `redo()` | Renvoient un `boolean`. |
| `refetch(sourceId?)` | Redemande les sources. |
| `takeOver({ onEventOpen, onCreateRequest })` | Confie « Ouvrir » et « Nouvel événement ici » à quelqu'un d'autre (l'éditeur du Pro le fait) ; renvoie comment les rendre. |

`useCalendarState(controller)` renvoie un instantané : `title`, `view`, `date`, `range`, `canUndo`, `canRedo`, `loading`, `problems`, `state` et `instance` (le calendrier DOM, `null` avant le montage). Avant le montage, les méthodes ne font rien et `dispatch` répond un `CommandResult` refusé.

Dans ce que rend `renderEventContent`, `useParentCalendarController()` donne le contrôleur de ce calendrier (`null` ailleurs).

Une `ref` sur `<DzCalendar>` donne `{ instance, controller }` (`DzCalendarHandle`) : le calendrier DOM pour ce que rien d'autre ne couvre.

#### Rendu serveur

L'import des paquets ne touche ni `document` ni `window`. Sur un serveur, `<DzCalendar>` rend un élément vide ; le calendrier se crée dans le navigateur.

### Recettes

#### Enregistrer ce qu'une personne change

`onEventChange` dit ce qu'une personne a changé. Enregistrez-le, et annulez si le serveur refuse :

```tsx
import { DzCalendar } from '@dzcalendar/react';
import type { EventInput } from '@dzcalendar/core';

export function Rendezvous({ events }: { events: EventInput[] }) {
  return (
    <DzCalendar
      timeZone="Europe/Paris"
      events={events}
      editable
      onEventChange={(change) =>
        fetch(`/api/rendez-vous/${change.after?.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ start: String(change.after?.start) }),
        }).then((r) => {
          if (!r.ok) change.revert();
        })
      }
    />
  );
}
```

#### Des événements depuis un serveur

```tsx
import { useMemo } from 'react';
import { jsonSource } from '@dzcalendar/core';
import { DzCalendar } from '@dzcalendar/react';

export function Distant() {
  const sources = useMemo(() => [jsonSource('equipe', { url: '/api/evenements' })], []);
  return <DzCalendar timeZone="Europe/Paris" sources={sources} />;
}
```

#### Un bouton « Retour au direct » sur une timeline

Les vues timeline sont celles du Pro (`import '@dzcalendar/pro'`).

```tsx
import { useState } from 'react';
import { DzCalendar, useCalendarController } from '@dzcalendar/react';
import '@dzcalendar/pro';

const PROCESSUS = [{ id: 'import', title: 'Import' }, { id: 'billing', title: 'Facturation' }];

export function Supervision() {
  const [suit, setSuit] = useState(true);
  const controller = useCalendarController();
  return (
    <>
      {!suit && <button onClick={() => controller.today()}>Retour au direct</button>}
      <DzCalendar
        controller={controller}
        timeZone="Europe/Paris"
        defaultView="resourceTimelineDay"
        resources={PROCESSUS}
        timeline={{ slot: 15, span: { hours: 4 }, follow: true }}
        onFollowChange={setSuit}
      />
    </>
  );
}
```

L'éditeur et les exports du Pro pour React sont dans [`@dzcalendar/pro-react`](https://www.npmjs.com/package/@dzcalendar/pro-react).

### Documentation

- [Guide React](https://plinthworks.github.io/dzcalendar/fr/getting-started/react/)
- [Installation](https://plinthworks.github.io/dzcalendar/fr/getting-started/installation/)
- [Migrer depuis FullCalendar](https://plinthworks.github.io/dzcalendar/fr/getting-started/migrating-from-fullcalendar/)
- [Options](https://plinthworks.github.io/dzcalendar/fr/options/) et [API](https://plinthworks.github.io/dzcalendar/fr/api/)
- Guides : [Événements](https://plinthworks.github.io/dzcalendar/fr/guides/events/), [Sources d'événements](https://plinthworks.github.io/dzcalendar/fr/guides/event-sources/), [Fuseaux horaires](https://plinthworks.github.io/dzcalendar/fr/guides/time-zones/), [Vues](https://plinthworks.github.io/dzcalendar/fr/guides/views/), [Glisser-déposer](https://plinthworks.github.io/dzcalendar/fr/guides/drag-and-drop/), [Sélection](https://plinthworks.github.io/dzcalendar/fr/guides/selection/), [Récurrence](https://plinthworks.github.io/dzcalendar/fr/guides/recurrence/), [Thèmes](https://plinthworks.github.io/dzcalendar/fr/guides/theming/), [Clavier et accessibilité](https://plinthworks.github.io/dzcalendar/fr/guides/keyboard-accessibility/), [Langues](https://plinthworks.github.io/dzcalendar/fr/guides/languages/), [Ressources et timeline](https://plinthworks.github.io/dzcalendar/fr/guides/resources-timeline/), [Supervision en direct](https://plinthworks.github.io/dzcalendar/fr/guides/supervision/)

### Licence

MIT
