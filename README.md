# DzCalendar

A calendar and scheduler written from scratch on Temporal: every event keeps its own time zone, and days of 23 h,
25 h or 23 h 30 are drawn as they are. Plain DOM at its core, with components for React, Vue and Angular, a Web
Component, and a Pro timeline for resources and supervision.

**English** · [Français](#français)

[Documentation](https://plinthworks.github.io/dzcalendar/) · [Documentation en français](https://plinthworks.github.io/dzcalendar/fr/) · MIT

## Why

- **Time zones done right.** An event made in Paris stays at 09:00 in Paris for whoever looks at it from Chicago,
  and the calendar draws it in the reader's zone — or in the event's, or both side by side.
- **Clock changes drawn as they are.** The 25-hour Sunday has its two 02:00s, the 23-hour one skips its missing
  hour, Lord Howe's half-hour shift is half an hour. Recurrence follows the wall clock (RFC 5545).
- **No `Date`.** Temporal everywhere (the polyfill loaded only where the browser has none).
- **Bad input never throws.** An event that cannot be read becomes a *problem* (a code and a detail) that the
  calendar reports; the rest is drawn.
- **Accessible.** Keyboard everywhere (a cursor through time, moving and resizing events), screen readers told
  what changes, WCAG target sizes.
- **Light.** About 47 kB gzip for the core and 59 kB for the DOM with its views (41 kB without), everything else loaded on demand.

## Packages

| Package | What it is |
|---|---|
| [`@dzcalendar/core`](packages/core) | The model: events with their own zone, stores, commands with undo, sources (JSON, function, live feeds in `/live`). No DOM. |
| [`@dzcalendar/dom`](packages/dom) | `createCalendar`: month, week, day, list, year and custom views, drag and drop, selection, keyboard. |
| [`@dzcalendar/theme`](packages/theme) | The stylesheet and its families (standard, slate, night, pastel, frost, solar, contrast), `defineTheme`. |
| [`@dzcalendar/react`](packages/react) | `<DzCalendar>` for React 18 and 19. |
| [`@dzcalendar/vue`](packages/vue) | `<DzCalendar>` for Vue 3.4 and 3.5. |
| [`@dzcalendar/angular`](packages/angular) | `<dz-calendar>` for Angular 19 to 22, signals only, `ng add`. |
| [`@dzcalendar/element`](packages/element) | `<dz-calendar>` as a Web Component, for any page. |
| [`@dzcalendar/pro`](packages/pro) | The timeline (resources in rows, supervision), slot capacity, the event editor, printing and exports. |
| [`@dzcalendar/pro-react`](packages/pro-react), [`pro-vue`](packages/pro-vue), [`pro-angular`](packages/pro-angular) | The Pro's editor and exports in each framework. |
| [`@dzcalendar/motion-gsap`](packages/motion-gsap) | Optional GSAP motion, reduced-motion aware. |
| [`@dzcalendar/rrule`](packages/rrule) | RFC 5545 recurrence rules on Temporal. |
| [`@dzcalendar/ical`](packages/ical) | iCalendar: read and write events with their real zones, an iCal source. |
| [`@dzcalendar/slots`](packages/slots) | Bookable slots: weekly hours, exceptions, buffers, notice, horizon. |
| [`@dzcalendar/compat-fullcalendar`](packages/compat-fullcalendar) | FullCalendar-shaped options translated at run time, every guess said. |
| [`@dzcalendar/migrate`](packages/migrate) | `dz-migrate`: rewrites a FullCalendar application for DzCalendar. |

## Quick start

```bash
npm install @dzcalendar/dom @dzcalendar/core @dzcalendar/theme
```

```ts
import { createCalendar } from '@dzcalendar/dom';
import '@dzcalendar/theme/dzcalendar.css';

const calendar = createCalendar(element, {
  timeZone: 'Europe/Paris',
  initialView: 'timeGridWeek',
  editable: true,
  events: [{ id: 'standup', title: 'Stand-up', start: '2026-10-21T09:00[Europe/Paris]', duration: { minutes: 15 }, rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR' }],
  // A person moved, resized or deleted: persist it (change.revert() if the server says no).
  onEventChange: (change) => console.log(change.cause, change.after?.title, change.after?.start.toString()),
});
calendar.navigate('next');
```

### React

```tsx
import { DzCalendar } from '@dzcalendar/react';
import '@dzcalendar/theme/dzcalendar.css';

const EVENTS = [{ id: 'a', title: 'Review', start: '2026-10-21T14:00[Europe/Paris]', duration: { hours: 1 } }];

export function Agenda() {
  return <DzCalendar timeZone="Europe/Paris" defaultView="timeGridWeek" events={EVENTS} />;
}
```

### Vue

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { DzCalendar } from '@dzcalendar/vue';
import '@dzcalendar/theme/dzcalendar.css';

const view = ref('timeGridWeek');
const events = [{ id: 'a', title: 'Review', start: '2026-10-21T14:00[Europe/Paris]', duration: { hours: 1 } }];
</script>

<template>
  <DzCalendar v-model:view="view" time-zone="Europe/Paris" :events="events" />
</template>
```

### Angular

```bash
ng add @dzcalendar/angular
```

```ts
import { Component, signal } from '@angular/core';
import { DZ_CALENDAR } from '@dzcalendar/angular';
import type { EventInput } from '@dzcalendar/core';

@Component({
  selector: 'app-agenda',
  imports: [DZ_CALENDAR],
  template: `<dz-calendar timeZone="Europe/Paris" [events]="events()" [(view)]="view" />`,
})
export class Agenda {
  readonly events = signal<EventInput[]>([{ id: 'a', title: 'Review', start: '2026-10-21T14:00[Europe/Paris]', duration: { hours: 1 } }]);
  readonly view = signal<string | undefined>('timeGridWeek');
}
```

## Supervision

The Pro's timeline follows the present: processes in rows, runs arriving from a live feed as cards, alerts as
markers, maintenance windows behind.

```ts
import { createCalendar } from '@dzcalendar/dom';
import { sseSource } from '@dzcalendar/core/live';
import '@dzcalendar/pro';

createCalendar(element, {
  timeZone: 'Europe/Paris',
  views: { supervision: { family: 'timeline', resources: true, duration: { days: 3 } } },
  initialView: 'supervision',
  resources: [{ id: 'import', title: 'Import' }, { id: 'billing', title: 'Billing' }],
  // Four hours on screen, the present five minutes from the left edge, gliding; a ruler of minutes.
  timeline: { slot: 15, span: { hours: 4 }, step: { minutes: 15 }, follow: { before: { minutes: 5 } }, ticks: { every: 1, label: 5 } },
  nowRefresh: { seconds: 5 },
  forget: { olderThan: { days: 7 } },
  sources: [
    sseSource('runs', '/api/runs/stream', {
      map: (msg) => {
        const m = msg as { kind: 'start' | 'end' | 'alert'; id: string; process: string; at: string; failed?: boolean };
        if (m.kind === 'alert') return { create: { id: m.id, title: 'Alert', start: m.at, resourceId: m.process, display: 'marker', tone: 'amber' } };
        return m.kind === 'start'
          ? { create: { id: m.id, title: m.process, start: m.at, resourceId: m.process, ongoing: true, tone: 'blue' } }
          : { update: m.id, patch: { ongoing: false, end: m.at, tone: m.failed ? 'red' : 'green' } };
      },
    }),
  ],
});
```

## Development

```bash
npm install
npm start              # the playground on http://localhost:4600
npm test               # vitest
npm run typecheck
npm run build
npm run test:browser   # layout checks in Chrome
npm run docs:check     # every example of the site and of the READMEs compiled
```

FullCalendar is a reference for behaviour only: nothing of its code is here (see `CLEANROOM.md`).

## License

MIT — © 2026 Plinthworks.

---

## Français

Un calendrier et un planificateur écrits de zéro sur Temporal : chaque événement garde son propre fuseau, et les
jours de 23 h, 25 h ou 23 h 30 sont dessinés tels qu'ils sont. Du DOM simple en son cœur, des composants pour
React, Vue et Angular, un Web Component, et une timeline Pro pour les ressources et la supervision.

[Documentation en français](https://plinthworks.github.io/dzcalendar/fr/) · [English documentation](https://plinthworks.github.io/dzcalendar/) · MIT

### Pourquoi

- **Les fuseaux bien faits.** Un événement créé à Paris reste à 09:00 à Paris pour qui le regarde depuis Chicago,
  et le calendrier le dessine dans le fuseau du lecteur — ou dans celui de l'événement, ou les deux côte à côte.
- **Les changements d'heure dessinés tels qu'ils sont.** Le dimanche de 25 heures a ses deux 02:00, celui de 23
  heures saute son heure manquante, le décalage d'une demi-heure de Lord Howe fait une demi-heure. La récurrence
  suit l'horloge murale (RFC 5545).
- **Pas de `Date`.** Temporal partout (le polyfill chargé seulement là où le navigateur n'en a pas).
- **Une mauvaise donnée ne lève jamais d'exception.** Un événement illisible devient un *problème* (un code et un
  détail) que le calendrier signale ; le reste est dessiné.
- **Accessible.** Le clavier partout (un curseur dans le temps, déplacer et redimensionner), les lecteurs d'écran
  informés de ce qui change, les tailles de cible WCAG.
- **Léger.** Environ 47 ko gzip pour le cœur et 59 ko pour le DOM avec ses vues (41 ko sans), le reste chargé à la demande.

### Paquets

| Paquet | Ce que c'est |
|---|---|
| [`@dzcalendar/core`](packages/core) | Le modèle : événements avec leur fuseau, stores, commandes avec annulation, sources (JSON, fonction, flux en direct dans `/live`). Pas de DOM. |
| [`@dzcalendar/dom`](packages/dom) | `createCalendar` : vues mois, semaine, jour, liste, année et sur mesure, glisser-déposer, sélection, clavier. |
| [`@dzcalendar/theme`](packages/theme) | La feuille de style et ses familles (standard, slate, night, pastel, frost, solar, contrast), `defineTheme`. |
| [`@dzcalendar/react`](packages/react) | `<DzCalendar>` pour React 18 et 19. |
| [`@dzcalendar/vue`](packages/vue) | `<DzCalendar>` pour Vue 3.4 et 3.5. |
| [`@dzcalendar/angular`](packages/angular) | `<dz-calendar>` pour Angular 19 à 22, en signaux, `ng add`. |
| [`@dzcalendar/element`](packages/element) | `<dz-calendar>` en Web Component, pour n'importe quelle page. |
| [`@dzcalendar/pro`](packages/pro) | La timeline (ressources en lignes, supervision), la capacité des créneaux, l'éditeur d'événements, l'impression et les exports. |
| [`@dzcalendar/pro-react`](packages/pro-react), [`pro-vue`](packages/pro-vue), [`pro-angular`](packages/pro-angular) | L'éditeur et les exports du Pro dans chaque framework. |
| [`@dzcalendar/motion-gsap`](packages/motion-gsap) | Des animations GSAP optionnelles, attentives à « réduire les animations ». |
| [`@dzcalendar/rrule`](packages/rrule) | Les règles de récurrence RFC 5545 sur Temporal. |
| [`@dzcalendar/ical`](packages/ical) | iCalendar : lire et écrire des événements avec leurs vrais fuseaux, une source iCal. |
| [`@dzcalendar/slots`](packages/slots) | Les créneaux réservables : horaires hebdomadaires, exceptions, battements, préavis, horizon. |
| [`@dzcalendar/compat-fullcalendar`](packages/compat-fullcalendar) | Des options à la manière de FullCalendar traduites à l'exécution, chaque supposition dite. |
| [`@dzcalendar/migrate`](packages/migrate) | `dz-migrate` : réécrit une application FullCalendar pour DzCalendar. |

### Démarrage

```bash
npm install @dzcalendar/dom @dzcalendar/core @dzcalendar/theme
```

```ts
import { createCalendar } from '@dzcalendar/dom';
import '@dzcalendar/theme/dzcalendar.css';

const calendrier = createCalendar(element, {
  timeZone: 'Europe/Paris',
  initialView: 'timeGridWeek',
  editable: true,
  events: [{ id: 'point', title: 'Point du matin', start: '2026-10-21T09:00[Europe/Paris]', duration: { minutes: 15 }, rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR' }],
  // Une personne a déplacé, redimensionné ou supprimé : à enregistrer (change.revert() si le serveur refuse).
  onEventChange: (change) => console.log(change.cause, change.after?.title, change.after?.start.toString()),
});
calendrier.navigate('next');
```

Les mêmes démarrages en React, Vue et Angular sont plus haut (le code ne change pas d'une langue à l'autre), et la
supervision aussi : une timeline qui suit le présent, des traitements reçus d'un flux en direct sous forme de
cartes, les alertes en repères, les maintenances en fond.

### Développement

```bash
npm install
npm start              # le terrain de jeu sur http://localhost:4600
npm test               # vitest
npm run typecheck
npm run build
npm run test:browser   # les contrôles de mise en page dans Chrome
npm run docs:check     # chaque exemple du site et des README compilé
```

FullCalendar n'est une référence que pour le comportement : rien de son code n'est ici (voir `CLEANROOM.md`).

### Licence

MIT — © 2026 Plinthworks.
