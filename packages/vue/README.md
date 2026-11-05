# @dzcalendar/vue

`<DzCalendar>` for Vue 3.4 and 3.5: a calendar where every event keeps its own time zone, with `v-model:view`, `v-model:date` and `v-model:selection`, a controller of refs, and slots drawn by your own components.

**English** · [Français](#français)

## What it is

`@dzcalendar/vue` is the Vue binding of [DzCalendar](https://plinthworks.github.io/dzcalendar/), a calendar and scheduler written from scratch on Temporal. Days of 23 h, 25 h or 23 h 30 are drawn as they are, and each event is shown in the zone it was made in.

- **Props** for the common options, **`options`** for every other live option, **`initial`** for what is read once.
- **`v-model:view`, `v-model:date`, `v-model:selection`**, and events (`@event-click`, `@event-change`…) for what a person does.
- **Slots** (`#event-content`, `#day-header`…) teleported into the calendar: your provides, store, router and i18n reach them.
- **A controller of refs** (`createCalendarController`, `injectCalendarController`) for what sits around the calendar.
- **No `document` or `window` at import**: the calendar is made in `onMounted`, in the browser only.

## Install

```bash
npm install @dzcalendar/core @dzcalendar/dom @dzcalendar/theme @dzcalendar/vue
```

Peer dependency: `vue` `^3.4.0`. Import the stylesheet once, and settle the defaults of every calendar with the plugin (optional):

```ts
import { createApp, defineComponent, h } from 'vue';
import '@dzcalendar/theme/dzcalendar.css';
import { DzCalendar, DzCalendarPlugin } from '@dzcalendar/vue';
import '@dzcalendar/core/recurrence'; // repeating events (rrule)

// Your root component (usually App.vue).
const App = defineComponent({ render: () => h(DzCalendar) });

createApp(App)
  .use(DzCalendarPlugin, { defaults: { timeZone: 'Europe/Paris', locale: 'fr-FR' } })
  .mount('#app');
```

Other views are opt-in imports, once, anywhere: `import '@dzcalendar/dom/list'` (list views), `import '@dzcalendar/dom/multimonth'` (multi-month year), `import '@dzcalendar/core/recurrence'` (repeating events with `rrule`).

## Quick start

```vue
<script setup lang="ts">
import { ref, shallowRef } from 'vue';
import { Temporal } from '@dzcalendar/core';
import type { EventInput, PlainDate, Selection } from '@dzcalendar/core';
import { DzCalendar, createCalendarController } from '@dzcalendar/vue';
import '@dzcalendar/core/recurrence'; // repeating events (rrule)

const cal = createCalendarController();
const view = ref('timeGridWeek');
const date = shallowRef<PlainDate>(Temporal.PlainDate.from('2026-10-21'));
const selection = shallowRef<Selection | null>(null);
const events = shallowRef<EventInput[]>([
  { id: 'a', title: 'Consultation', start: '2026-10-21T09:00[Europe/Paris]', duration: { minutes: 45 } },
  { id: 'b', title: 'Call Chicago', start: '2026-10-22T10:00[America/Chicago]', duration: { hours: 1 } },
  { id: 'c', title: 'Day off', start: '2026-10-23', allDay: true },
  { id: 'w', title: 'Rounds', start: '2026-10-19T08:00[Europe/Paris]', duration: { hours: 2 }, rrule: 'FREQ=WEEKLY;BYDAY=MO,WE' },
]);
</script>

<template>
  <header>
    <button @click="cal.prev()">‹</button> <h2>{{ cal.title.value }}</h2> <button @click="cal.next()">›</button>
    <button :disabled="!cal.canUndo.value" @click="cal.undo()">Undo</button>
  </header>
  <DzCalendar
    :controller="cal"
    time-zone="Europe/Paris"
    :events="events"
    v-model:view="view" v-model:date="date" v-model:selection="selection"
    editable selectable
    @event-click="(instance) => console.log(instance.event.id)">
    <template #event-content="{ event, ctx }"><b>{{ event.title }}</b> {{ ctx.timeText }}</template>
  </DzCalendar>
</template>
```

### Temporal first

`<DzCalendar>` waits for Temporal by itself, but your own code makes Temporal values too (a `ref` holding a date). A browser without Temporal of its own (Safari, every iOS browser) gets the polyfill with `loadTemporal()`: await it once before mounting.

```ts
import { createApp, defineComponent, h } from 'vue';
import { loadTemporal } from '@dzcalendar/core';
import { DzCalendar } from '@dzcalendar/vue';

// At once where the browser has Temporal (Chrome, Edge, Firefox); Safari fetches its polyfill first.
await loadTemporal();
// Your root component (usually App.vue).
const App = defineComponent({ render: () => h(DzCalendar) });
createApp(App).mount('#app');
```

Temporal always comes from `@dzcalendar/core` (one polyfill, one set of classes, shared with other DzCalendar and tzslot packages).

## API

### Props

| Prop | Type | What it does |
|---|---|---|
| `events` | `EventInput[]` | The events you hold. Diffed by id and value. **Give a new array to change them** (`events.value = [...events.value, e]`): a `push` on the same array is not seen. |
| `sources` | `EventSourceSpec[]` | Events the calendar fetches (`jsonSource`, `fnSource`, `liveSource`…). The whole list; a spec is compared by identity, keep the objects stable. |
| `resources` | `ResourceInput[]` | Columns or rows of the resource views. |
| `view` | `string` | The view; `v-model:view`. |
| `date` | `PlainDate` | The date shown; `v-model:date`. |
| `selection` | `Selection \| null` | The selection (`null`: none; not bound: left to the calendar); `v-model:selection`. |
| `timeZone`, `locale`, `axis`, `editable`, `selectable`, `businessHours`, `weekends`, `weekNumbers`, `hiddenDays`, `messages`, `theme`, `scheme`, `density`, `displayCalendar`, `secondaryCalendar`, `availableSlots` | see [Options](https://plinthworks.github.io/dzcalendar/options/) | The common options. `axis` is `'wall'` (a 25-hour day has 25 rows) or `'elapsed'`. `business-hours` as a bare attribute is `true` (Monday to Friday, 9:00 to 17:00). |
| `options` | `DzCalendarOptions` | Everything else `update()` takes (`headerToolbar`, `nowIndicator`, `dayMaxLanes`, `timeline`…), live. |
| `initial` | `DzCalendarDefaults` | Options read once, when the calendar is made. |
| `controller` | `CalendarController` | A controller made with `createCalendarController()`; otherwise the component has its own. |
| `motion` | `MotionAdapter` | Made at creation, not changed after. |
| `hooks` | `CalendarHooks` | Classes and mounts for any element, merged with the slots. |

Arrays and objects are compared by their contents. A prop that goes back to `undefined` leaves the calendar's value as it was. `class`, `style`, `id` and other attributes go on the calendar's element.

`view` and `date` bound **without** their `update:` handler win: the calendar goes back to them after a person navigates. Use `v-model:view` and `v-model:date`.

### Events

| Event | Payload | When |
|---|---|---|
| `update:view`, `update:date`, `update:selection` | `string`, `PlainDate`, `Selection \| null` | The calendar's view, date or selection changed (the `v-model`s). |
| `@event-click` | `EventInstance` | An event is clicked. |
| `@date-click` | `DateClick` | A day is clicked. |
| `@slot-click` | `AvailableSlot` | A free slot is clicked (or Enter on it). Book it; your server checks again. |
| `@event-change` | `EventChange` | A person changed an event (drag, resize, keyboard, menu, editor). Persist it; call `change.revert()` if the server refuses. |
| `@event-open` | `EventInstance` | "Open" in the menu. |
| `@create-request` | `CreateRequest` | "New event here" in the menu. |
| `@selected` | `Selection` | A person made a selection (`v-model:selection` follows it too). |
| `@dropped` | `DropInfo` | An element of the page was dropped here (`makeDraggable`), its event made. |
| `@event-receive` | `EventChange` | An event came in; `revert()` takes it back. |
| `@event-leave` | `EventLeave` | An event went to another calendar; `revert()` puts it back on both. |
| `@source-notice` | `SourceNotice` | Loading, a failed fetch, problems in a delivery, a refused save. |
| `@problems` | `NormalizationReport` | What the `events` given could not be read as. |
| `@resource-problems` | `Problem[]` | What the `resources` given could not be read as. |
| `@problem` | `CalendarProblem` | Something the calendar could not do as asked, found while drawing. Without a listener: the console, once per code. |
| `@error` | `unknown` | A value the calendar refused (an unknown view, every day hidden): the others are applied. Not listened to, it goes to `app.config.errorHandler`, else the console. |

`@event-open`, `@create-request`, `@slot-click` and `@problem` change what the calendar offers ("Open" in the menu, "New event here", slots as buttons): they are offered only while listened to.

### `options` and `initial`

Two sets of options exist:

- **Live options**, changed after creation: the props above, and `options` for the rest (`:options="{ headerToolbar: { end: 'filter timeGridWeek' } }"`). What changed goes to the calendar, nothing else.
- **Creation options**, read once when the calendar is made (`now`, `kernel`, `store`, `views`, `historyLimit`, `titleFormat`, `injectStyles`, `cssLayers`…): `:initial="{ historyLimit: 50 }"`, or for the whole application the plugin's `defaults`. Later changes to `initial` are not read. Order of precedence: plugin defaults, then `initial`, then props and `options`.

### Slots

- **`#event-content="{ event, ctx }"`**: each event's content, teleported into the event. `ctx` has `instance`, `timeText`, `displayZone`, `family` and, for a background event, `background`; an empty slot leaves a background event mute.
- **`#day-header="{ day }"`**: each day's head (`day.date`, `day.resource`, `day.lengthMinutes`, `day.text`; `ctx` is the same object).
- A slot per element with a content, each given `{ ctx }`: `#day-cell`, `#slot-label`, `#all-day-label`, `#more-link`, `#now-indicator`, `#week-number`, `#no-events`, `#list-day-header`, `#month-header`, `#resource`, `#resource-group-header`, `#resource-area-header`.
- **`#header-item-<name>="{ ctx }"`**: your place in the header, named in `headerToolbar` (`ctx` holds `name` and the `title`).

```vue
<script setup lang="ts">
import { DzCalendar } from '@dzcalendar/vue';
import type { CalendarHooks } from '@dzcalendar/dom';

const hooks: CalendarHooks = { dayCell: { class: (d) => (d.outside ? 'muted' : null) } };
const options = { headerToolbar: { start: 'prev,next', center: 'title', end: 'filter timeGridWeek,dayGridMonth' } };
</script>

<template>
  <DzCalendar time-zone="Europe/Paris" :hooks="hooks" :options="options">
    <template #header-item-filter="{ ctx }"><input :placeholder="`Filter ${ctx.title}`" /></template>
    <template #day-header="{ day }"><span>{{ day.text }}</span></template>
    <template #event-content="{ event, ctx }"><b v-if="!ctx.background">{{ event.title }}</b></template>
  </DzCalendar>
</template>
```

### Plugin and defaults

`app.use(DzCalendarPlugin, { defaults, motion })`: `defaults` are the options every `<DzCalendar>` starts from (any option except `kernel`, `hooks` and `headerItems`, which are each calendar's own); `motion` is a factory, one motion adapter is made per calendar (optional, from `@dzcalendar/motion-gsap`). A `motion` prop or a `motion` in `defaults` wins. A factory that fails goes to `@error` and the calendar is drawn still.

For one part of the application, `provideDzCalendar({ defaults, motion })` in a component's `setup` lays its settings over what is settled above:

```vue
<script setup lang="ts">
import { DzCalendar, provideDzCalendar } from '@dzcalendar/vue';

provideDzCalendar({ defaults: { timeZone: 'America/Chicago', locale: 'en-US' } });
</script>

<template>
  <DzCalendar />
</template>
```

### The controller

`createCalendarController()` beside the calendar (`<DzCalendar :controller="cal">`), or `injectCalendarController()` in a component inside it (an event's content; `null` outside one).

| Ref | |
|---|---|
| `title`, `view`, `date`, `range` | Computed from the calendar's state (`''` / `null` before mounting). |
| `state`, `instance` | The kernel's state; the DOM calendar (`null` before mounting and after). |
| `canUndo`, `canRedo`, `loading`, `problems` | What can be undone or redone, a source is fetching, what the last load reported. |

| Method | |
|---|---|
| `prev()`, `next()`, `today()` | Navigate. |
| `goTo(date)`, `changeView(view)` | Go to a date, change view. |
| `shift(by)` | Slides a timeline by hours and minutes (`{ minutes: -15 }`); `false` when the view does not slide. |
| `dispatch(command, { validate? })` | Runs a command, returns a `CommandResult` (`ok`, `problems`). Without `validate`, not reported to `@event-change` (with `{ validate: true }` it is, as a person's change): persist it where your code runs it. |
| `undo()`, `redo()` | Return `boolean`. |
| `refetch(sourceId?)` | Fetches the sources again. |
| `takeOver({ onEventOpen, onCreateRequest })` | Hands "Open" and "New event here" to someone else (the Pro's editor does); returns how to give them back. |

Before mounting, methods do nothing, and `dispatch` answers a refused `CommandResult`.

```vue
<!-- Status.vue: inside an event's content or any child of <DzCalendar> -->
<script setup lang="ts">
import { injectCalendarController } from '@dzcalendar/vue';

const cal = injectCalendarController();
</script>

<template>
  <button v-if="cal" :disabled="!cal.canUndo.value" @click="cal.undo()">Undo</button>
</template>
```

A template ref on `<DzCalendar>` exposes `controller` and `instance` (the DOM calendar, `null` before mounting).

### Server rendering

Importing the packages touches no `document` or `window`; the calendar is made in the browser only (`onMounted`).

## Recipes

### Save what a person changes

```vue
<script setup lang="ts">
import { shallowRef } from 'vue';
import type { EventInput } from '@dzcalendar/core';
import type { EventChange } from '@dzcalendar/dom';
import { DzCalendar } from '@dzcalendar/vue';

const events = shallowRef<EventInput[]>([]);

async function save(change: EventChange) {
  const r = await fetch(`/api/appointments/${change.after?.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ start: String(change.after?.start) }),
  });
  if (!r.ok) change.revert();
}
</script>

<template>
  <DzCalendar time-zone="Europe/Paris" :events="events" editable @event-change="save" />
</template>
```

### Events from a server

```vue
<script setup lang="ts">
import { jsonSource } from '@dzcalendar/core';
import { DzCalendar } from '@dzcalendar/vue';

// Stable: a source is compared by identity.
const sources = [jsonSource('team', { url: '/api/events' })];
</script>

<template>
  <DzCalendar time-zone="Europe/Paris" :sources="sources" />
</template>
```

### A "Back to live" button on a timeline

The timeline views are the Pro's (`import '@dzcalendar/pro'`).

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { DzCalendar, createCalendarController } from '@dzcalendar/vue';
import '@dzcalendar/pro';

const processes = [{ id: 'import', title: 'Import' }, { id: 'billing', title: 'Billing' }];
const following = ref(true);
const controller = createCalendarController();
const options = { timeline: { slot: 15, span: { hours: 4 }, follow: true }, onFollowChange: (f: boolean) => (following.value = f) };
</script>

<template>
  <button v-if="!following" @click="controller.today()">Back to live</button>
  <DzCalendar :controller="controller" time-zone="Europe/Paris" view="resourceTimelineDay" :resources="processes" :options="options" />
</template>
```

The Pro's editor and exports for Vue are in [`@dzcalendar/pro-vue`](https://www.npmjs.com/package/@dzcalendar/pro-vue).

## Documentation

- [Vue guide](https://plinthworks.github.io/dzcalendar/getting-started/vue/)
- [Installation](https://plinthworks.github.io/dzcalendar/getting-started/installation/)
- [Migrating from FullCalendar](https://plinthworks.github.io/dzcalendar/getting-started/migrating-from-fullcalendar/)
- [Options](https://plinthworks.github.io/dzcalendar/options/) and [API](https://plinthworks.github.io/dzcalendar/api/)
- Guides: [Events](https://plinthworks.github.io/dzcalendar/guides/events/), [Event sources](https://plinthworks.github.io/dzcalendar/guides/event-sources/), [Time zones](https://plinthworks.github.io/dzcalendar/guides/time-zones/), [Views](https://plinthworks.github.io/dzcalendar/guides/views/), [Drag and drop](https://plinthworks.github.io/dzcalendar/guides/drag-and-drop/), [Selection](https://plinthworks.github.io/dzcalendar/guides/selection/), [Recurrence](https://plinthworks.github.io/dzcalendar/guides/recurrence/), [Theming](https://plinthworks.github.io/dzcalendar/guides/theming/), [Keyboard and accessibility](https://plinthworks.github.io/dzcalendar/guides/keyboard-accessibility/), [Languages](https://plinthworks.github.io/dzcalendar/guides/languages/), [Resources and timeline](https://plinthworks.github.io/dzcalendar/guides/resources-timeline/)

## License

MIT

---

## Français

`<DzCalendar>` pour Vue 3.4 et 3.5 : un calendrier où chaque événement garde son fuseau horaire, avec `v-model:view`, `v-model:date` et `v-model:selection`, un contrôleur de refs, et des slots dessinés par vos propres composants.

[English](#dzcalendarvue) · **Français**

### Ce que c'est

`@dzcalendar/vue` est la liaison Vue de [DzCalendar](https://plinthworks.github.io/dzcalendar/fr/), un calendrier et planificateur écrit de zéro sur Temporal. Les jours de 23 h, 25 h ou 23 h 30 sont dessinés tels qu'ils sont, et chaque événement est montré dans le fuseau où il a été créé.

- **Des props** pour les options courantes, **`options`** pour toutes les autres options vives, **`initial`** pour ce qui est lu une fois.
- **`v-model:view`, `v-model:date`, `v-model:selection`**, et des événements (`@event-click`, `@event-change`…) pour ce que fait une personne.
- **Des slots** (`#event-content`, `#day-header`…) téléportés dans le calendrier : vos provides, votre store, votre routeur et votre i18n les atteignent.
- **Un contrôleur de refs** (`createCalendarController`, `injectCalendarController`) pour ce qui entoure le calendrier.
- **Ni `document` ni `window` à l'import** : le calendrier se crée dans `onMounted`, dans le navigateur seulement.

### Installation

```bash
npm install @dzcalendar/core @dzcalendar/dom @dzcalendar/theme @dzcalendar/vue
```

Dépendance homologue : `vue` `^3.4.0`. Importez la feuille de style une fois, et réglez les valeurs par défaut de tous les calendriers avec le plugin (facultatif) :

```ts
import { createApp, defineComponent, h } from 'vue';
import '@dzcalendar/theme/dzcalendar.css';
import { DzCalendar, DzCalendarPlugin } from '@dzcalendar/vue';
import '@dzcalendar/core/recurrence'; // événements récurrents (rrule)

// Votre composant racine (en général App.vue).
const App = defineComponent({ render: () => h(DzCalendar) });

createApp(App)
  .use(DzCalendarPlugin, { defaults: { timeZone: 'Europe/Paris', locale: 'fr-FR' } })
  .mount('#app');
```

Les autres vues sont des imports à la demande, une fois, n'importe où : `import '@dzcalendar/dom/list'` (vues liste), `import '@dzcalendar/dom/multimonth'` (année multi-mois), `import '@dzcalendar/core/recurrence'` (événements récurrents avec `rrule`).

### Démarrage rapide

```vue
<script setup lang="ts">
import { ref, shallowRef } from 'vue';
import { Temporal } from '@dzcalendar/core';
import type { EventInput, PlainDate, Selection } from '@dzcalendar/core';
import { DzCalendar, createCalendarController } from '@dzcalendar/vue';
import '@dzcalendar/core/recurrence'; // événements récurrents (rrule)

const cal = createCalendarController();
const view = ref('timeGridWeek');
const date = shallowRef<PlainDate>(Temporal.PlainDate.from('2026-10-21'));
const selection = shallowRef<Selection | null>(null);
const events = shallowRef<EventInput[]>([
  { id: 'a', title: 'Consultation', start: '2026-10-21T09:00[Europe/Paris]', duration: { minutes: 45 } },
  { id: 'b', title: 'Appel Chicago', start: '2026-10-22T10:00[America/Chicago]', duration: { hours: 1 } },
  { id: 'c', title: 'Jour off', start: '2026-10-23', allDay: true },
  { id: 'w', title: 'Tournée', start: '2026-10-19T08:00[Europe/Paris]', duration: { hours: 2 }, rrule: 'FREQ=WEEKLY;BYDAY=MO,WE' },
]);
</script>

<template>
  <header>
    <button @click="cal.prev()">‹</button> <h2>{{ cal.title.value }}</h2> <button @click="cal.next()">›</button>
    <button :disabled="!cal.canUndo.value" @click="cal.undo()">Annuler</button>
  </header>
  <DzCalendar
    :controller="cal"
    time-zone="Europe/Paris"
    locale="fr-FR"
    :events="events"
    v-model:view="view" v-model:date="date" v-model:selection="selection"
    editable selectable
    @event-click="(instance) => console.log(instance.event.id)">
    <template #event-content="{ event, ctx }"><b>{{ event.title }}</b> {{ ctx.timeText }}</template>
  </DzCalendar>
</template>
```

#### Temporal d'abord

`<DzCalendar>` attend Temporal tout seul, mais votre propre code fabrique aussi des valeurs Temporal (une `ref` qui porte une date). Un navigateur sans Temporal natif (Safari, tous les navigateurs d'iOS) reçoit le polyfill avec `loadTemporal()` : attendez-le une fois avant le montage.

```ts
import { createApp, defineComponent, h } from 'vue';
import { loadTemporal } from '@dzcalendar/core';
import { DzCalendar } from '@dzcalendar/vue';

// Immédiat là où le navigateur a Temporal (Chrome, Edge, Firefox) ; Safari va d'abord chercher son polyfill.
await loadTemporal();
// Votre composant racine (en général App.vue).
const App = defineComponent({ render: () => h(DzCalendar) });
createApp(App).mount('#app');
```

Temporal vient toujours de `@dzcalendar/core` (un seul polyfill, un seul jeu de classes, partagé avec les autres paquets DzCalendar et tzslot).

### API

#### Props

| Prop | Type | Rôle |
|---|---|---|
| `events` | `EventInput[]` | Les événements que vous tenez. Comparés par id et par valeur. **Donnez un nouveau tableau pour les changer** (`events.value = [...events.value, e]`) : un `push` sur le même tableau n'est pas vu. |
| `sources` | `EventSourceSpec[]` | Des événements que le calendrier va chercher (`jsonSource`, `fnSource`, `liveSource`…). La liste entière ; une spec est comparée par identité, gardez les objets stables. |
| `resources` | `ResourceInput[]` | Colonnes ou lignes des vues par ressources. |
| `view` | `string` | La vue ; `v-model:view`. |
| `date` | `PlainDate` | La date montrée ; `v-model:date`. |
| `selection` | `Selection \| null` | La sélection (`null` : aucune ; non liée : laissée au calendrier) ; `v-model:selection`. |
| `timeZone`, `locale`, `axis`, `editable`, `selectable`, `businessHours`, `weekends`, `weekNumbers`, `hiddenDays`, `messages`, `theme`, `scheme`, `density`, `displayCalendar`, `secondaryCalendar`, `availableSlots` | voir les [Options](https://plinthworks.github.io/dzcalendar/fr/options/) | Les options courantes. `axis` vaut `'wall'` (un jour de 25 h a 25 lignes) ou `'elapsed'`. `business-hours` en simple attribut vaut `true` (du lundi au vendredi, de 9 h à 17 h). |
| `options` | `DzCalendarOptions` | Tout le reste de ce que `update()` accepte (`headerToolbar`, `nowIndicator`, `dayMaxLanes`, `timeline`…), à chaud. |
| `initial` | `DzCalendarDefaults` | Options lues une fois, à la création du calendrier. |
| `controller` | `CalendarController` | Un contrôleur fait avec `createCalendarController()` ; sinon le composant a le sien. |
| `motion` | `MotionAdapter` | Fait à la création, pas changé ensuite. |
| `hooks` | `CalendarHooks` | Classes et montages pour n'importe quel élément, fusionnés avec les slots. |

Tableaux et objets sont comparés par leur contenu. Une prop qui redevient `undefined` laisse la valeur du calendrier telle qu'elle était. `class`, `style`, `id` et les autres attributs vont sur l'élément du calendrier.

`view` et `date` liées **sans** leur gestionnaire `update:` l'emportent : le calendrier y revient quand une personne navigue. Utilisez `v-model:view` et `v-model:date`.

#### Événements

| Événement | Charge | Quand |
|---|---|---|
| `update:view`, `update:date`, `update:selection` | `string`, `PlainDate`, `Selection \| null` | La vue, la date ou la sélection du calendrier a changé (les `v-model`). |
| `@event-click` | `EventInstance` | Un événement est cliqué. |
| `@date-click` | `DateClick` | Un jour est cliqué. |
| `@slot-click` | `AvailableSlot` | Un créneau libre est cliqué (ou Entrée dessus). Réservez-le ; votre serveur revérifie. |
| `@event-change` | `EventChange` | Une personne a modifié un événement (glisser, redimensionner, clavier, menu, éditeur). Enregistrez-le ; appelez `change.revert()` si le serveur refuse. |
| `@event-open` | `EventInstance` | « Ouvrir » dans le menu. |
| `@create-request` | `CreateRequest` | « Nouvel événement ici » dans le menu. |
| `@selected` | `Selection` | Une personne a fait une sélection (`v-model:selection` la suit aussi). |
| `@dropped` | `DropInfo` | Un élément de la page a été déposé ici (`makeDraggable`), son événement créé. |
| `@event-receive` | `EventChange` | Un événement est arrivé ; `revert()` le reprend. |
| `@event-leave` | `EventLeave` | Un événement est parti vers un autre calendrier ; `revert()` le remet sur les deux. |
| `@source-notice` | `SourceNotice` | Chargement, échec d'une requête, problèmes dans une livraison, enregistrement refusé. |
| `@problems` | `NormalizationReport` | Ce que les `events` donnés n'ont pas pu être lus comme. |
| `@resource-problems` | `Problem[]` | Ce que les `resources` données n'ont pas pu être lues comme. |
| `@problem` | `CalendarProblem` | Ce que le calendrier n'a pas pu faire comme demandé, trouvé en dessinant. Sans écouteur : la console, une fois par code. |
| `@error` | `unknown` | Une valeur que le calendrier a refusée (vue inconnue, tous les jours masqués) : les autres sont appliquées. Non écouté, il va à `app.config.errorHandler`, sinon à la console. |

`@event-open`, `@create-request`, `@slot-click` et `@problem` changent ce que le calendrier propose (« Ouvrir » dans le menu, « Nouvel événement ici », créneaux en boutons) : ils ne sont proposés que tant qu'ils sont écoutés.

#### `options` et `initial`

Il y a deux sortes d'options :

- **Options vives**, modifiables après la création : les props ci-dessus, et `options` pour le reste (`:options="{ headerToolbar: { end: 'filter timeGridWeek' } }"`). Ce qui a changé va au calendrier, rien d'autre.
- **Options de création**, lues une fois quand le calendrier est fait (`now`, `kernel`, `store`, `views`, `historyLimit`, `titleFormat`, `injectStyles`, `cssLayers`…) : `:initial="{ historyLimit: 50 }"`, ou pour toute l'application les `defaults` du plugin. Les changements ultérieurs de `initial` ne sont pas lus. Ordre de priorité : valeurs du plugin, puis `initial`, puis props et `options`.

#### Slots

- **`#event-content="{ event, ctx }"`** : le contenu de chaque événement, téléporté dans l'événement. `ctx` a `instance`, `timeText`, `displayZone`, `family` et, pour un événement d'arrière-plan, `background` ; un slot vide laisse l'événement d'arrière-plan muet.
- **`#day-header="{ day }"`** : l'en-tête de chaque jour (`day.date`, `day.resource`, `day.lengthMinutes`, `day.text` ; `ctx` est le même objet).
- Un slot par élément ayant un contenu, chacun reçoit `{ ctx }` : `#day-cell`, `#slot-label`, `#all-day-label`, `#more-link`, `#now-indicator`, `#week-number`, `#no-events`, `#list-day-header`, `#month-header`, `#resource`, `#resource-group-header`, `#resource-area-header`.
- **`#header-item-<nom>="{ ctx }"`** : votre place dans l'en-tête, nommée dans `headerToolbar` (`ctx` porte `name` et le `title`).

```vue
<script setup lang="ts">
import { DzCalendar } from '@dzcalendar/vue';
import type { CalendarHooks } from '@dzcalendar/dom';

const hooks: CalendarHooks = { dayCell: { class: (d) => (d.outside ? 'muted' : null) } };
const options = { headerToolbar: { start: 'prev,next', center: 'title', end: 'filter timeGridWeek,dayGridMonth' } };
</script>

<template>
  <DzCalendar time-zone="Europe/Paris" :hooks="hooks" :options="options">
    <template #header-item-filter="{ ctx }"><input :placeholder="`Filtrer ${ctx.title}`" /></template>
    <template #day-header="{ day }"><span>{{ day.text }}</span></template>
    <template #event-content="{ event, ctx }"><b v-if="!ctx.background">{{ event.title }}</b></template>
  </DzCalendar>
</template>
```

#### Plugin et valeurs par défaut

`app.use(DzCalendarPlugin, { defaults, motion })` : `defaults` sont les options dont part chaque `<DzCalendar>` (toute option sauf `kernel`, `hooks` et `headerItems`, propres à chaque calendrier) ; `motion` est une fabrique, un adaptateur de mouvement est fait par calendrier (facultatif, de `@dzcalendar/motion-gsap`). Une prop `motion` ou un `motion` dans `defaults` l'emporte. Une fabrique qui échoue va à `@error` et le calendrier est dessiné quand même.

Pour une partie de l'application, `provideDzCalendar({ defaults, motion })` dans le `setup` d'un composant pose ses réglages par-dessus ceux d'au-dessus :

```vue
<script setup lang="ts">
import { DzCalendar, provideDzCalendar } from '@dzcalendar/vue';

provideDzCalendar({ defaults: { timeZone: 'America/Chicago', locale: 'en-US' } });
</script>

<template>
  <DzCalendar />
</template>
```

#### Le contrôleur

`createCalendarController()` à côté du calendrier (`<DzCalendar :controller="cal">`), ou `injectCalendarController()` dans un composant à l'intérieur (le contenu d'un événement ; `null` en dehors).

| Ref | |
|---|---|
| `title`, `view`, `date`, `range` | Calculées depuis l'état du calendrier (`''` / `null` avant le montage). |
| `state`, `instance` | L'état du noyau ; le calendrier DOM (`null` avant le montage et après). |
| `canUndo`, `canRedo`, `loading`, `problems` | Ce qui peut être annulé ou rétabli, une source charge, ce qu'a signalé le dernier chargement. |

| Méthode | |
|---|---|
| `prev()`, `next()`, `today()` | Naviguer. |
| `goTo(date)`, `changeView(view)` | Aller à une date, changer de vue. |
| `shift(by)` | Fait glisser une timeline d'un nombre d'heures et de minutes (`{ minutes: -15 }`) ; `false` quand la vue ne glisse pas. |
| `dispatch(command, { validate? })` | Exécute une commande, renvoie un `CommandResult` (`ok`, `problems`). Sans `validate`, non signalée à `@event-change` (avec `{ validate: true }` elle l'est, comme le changement d'une personne) : enregistrez-la là où votre code l'exécute. |
| `undo()`, `redo()` | Renvoient un `boolean`. |
| `refetch(sourceId?)` | Redemande les sources. |
| `takeOver({ onEventOpen, onCreateRequest })` | Confie « Ouvrir » et « Nouvel événement ici » à quelqu'un d'autre (l'éditeur du Pro le fait) ; renvoie comment les rendre. |

Avant le montage, les méthodes ne font rien et `dispatch` répond un `CommandResult` refusé.

```vue
<!-- Status.vue : dans le contenu d'un événement ou n'importe quel enfant de <DzCalendar> -->
<script setup lang="ts">
import { injectCalendarController } from '@dzcalendar/vue';

const cal = injectCalendarController();
</script>

<template>
  <button v-if="cal" :disabled="!cal.canUndo.value" @click="cal.undo()">Annuler</button>
</template>
```

Une ref de gabarit sur `<DzCalendar>` expose `controller` et `instance` (le calendrier DOM, `null` avant le montage).

#### Rendu serveur

L'import des paquets ne touche ni `document` ni `window` ; le calendrier se crée dans le navigateur seulement (`onMounted`).

### Recettes

#### Enregistrer ce qu'une personne change

```vue
<script setup lang="ts">
import { shallowRef } from 'vue';
import type { EventInput } from '@dzcalendar/core';
import type { EventChange } from '@dzcalendar/dom';
import { DzCalendar } from '@dzcalendar/vue';

const events = shallowRef<EventInput[]>([]);

async function save(change: EventChange) {
  const r = await fetch(`/api/rendez-vous/${change.after?.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ start: String(change.after?.start) }),
  });
  if (!r.ok) change.revert();
}
</script>

<template>
  <DzCalendar time-zone="Europe/Paris" :events="events" editable @event-change="save" />
</template>
```

#### Des événements depuis un serveur

```vue
<script setup lang="ts">
import { jsonSource } from '@dzcalendar/core';
import { DzCalendar } from '@dzcalendar/vue';

// Stable : une source est comparée par identité.
const sources = [jsonSource('equipe', { url: '/api/evenements' })];
</script>

<template>
  <DzCalendar time-zone="Europe/Paris" :sources="sources" />
</template>
```

#### Un bouton « Retour au direct » sur une timeline

Les vues timeline sont celles du Pro (`import '@dzcalendar/pro'`).

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { DzCalendar, createCalendarController } from '@dzcalendar/vue';
import '@dzcalendar/pro';

const processus = [{ id: 'import', title: 'Import' }, { id: 'billing', title: 'Facturation' }];
const suit = ref(true);
const controller = createCalendarController();
const options = { timeline: { slot: 15, span: { hours: 4 }, follow: true }, onFollowChange: (f: boolean) => (suit.value = f) };
</script>

<template>
  <button v-if="!suit" @click="controller.today()">Retour au direct</button>
  <DzCalendar :controller="controller" time-zone="Europe/Paris" view="resourceTimelineDay" :resources="processus" :options="options" />
</template>
```

L'éditeur et les exports du Pro pour Vue sont dans [`@dzcalendar/pro-vue`](https://www.npmjs.com/package/@dzcalendar/pro-vue).

### Documentation

- [Guide Vue](https://plinthworks.github.io/dzcalendar/fr/getting-started/vue/)
- [Installation](https://plinthworks.github.io/dzcalendar/fr/getting-started/installation/)
- [Migrer depuis FullCalendar](https://plinthworks.github.io/dzcalendar/fr/getting-started/migrating-from-fullcalendar/)
- [Options](https://plinthworks.github.io/dzcalendar/fr/options/) et [API](https://plinthworks.github.io/dzcalendar/fr/api/)
- Guides : [Événements](https://plinthworks.github.io/dzcalendar/fr/guides/events/), [Sources d'événements](https://plinthworks.github.io/dzcalendar/fr/guides/event-sources/), [Fuseaux horaires](https://plinthworks.github.io/dzcalendar/fr/guides/time-zones/), [Vues](https://plinthworks.github.io/dzcalendar/fr/guides/views/), [Glisser-déposer](https://plinthworks.github.io/dzcalendar/fr/guides/drag-and-drop/), [Sélection](https://plinthworks.github.io/dzcalendar/fr/guides/selection/), [Récurrence](https://plinthworks.github.io/dzcalendar/fr/guides/recurrence/), [Thèmes](https://plinthworks.github.io/dzcalendar/fr/guides/theming/), [Clavier et accessibilité](https://plinthworks.github.io/dzcalendar/fr/guides/keyboard-accessibility/), [Langues](https://plinthworks.github.io/dzcalendar/fr/guides/languages/), [Ressources et timeline](https://plinthworks.github.io/dzcalendar/fr/guides/resources-timeline/)

### Licence

MIT
