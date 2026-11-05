# @dzcalendar/element

DzCalendar as a Web Component: `<dz-calendar>` for any page or framework.

**English** · [Français](#français)

## What it is

`@dzcalendar/element` defines the `<dz-calendar>` custom element on top of `@dzcalendar/dom`, for plain HTML, a CMS, React, Vue, Svelte or anything that can write a tag. Options are attributes and properties, callbacks are DOM events (`dz-select`, `dz-event-click`, `dz-follow-change`…) that bubble and cross shadow roots. It lives in the page by default (the page's CSS, a theme or Tailwind apply as anywhere), or isolated in a shadow root with the `shadow` attribute. Bad input never throws: it becomes a `dz-problem` event. The recurrence engine is included: repeating events work as they come.

## Install

```bash
npm install @dzcalendar/core @dzcalendar/dom @dzcalendar/element @dzcalendar/theme
```

`@dzcalendar/core` and `@dzcalendar/dom` are dependencies. `@dzcalendar/theme` is the optional stylesheet (`@dzcalendar/theme/dzcalendar.css`).

## Quick start

```html
<dz-calendar view="timeGridWeek" time-zone="Europe/Paris" locale="en-US" editable selectable></dz-calendar>

<script type="module">
  import '@dzcalendar/element/define';
  import '@dzcalendar/theme/dzcalendar.css';
  const cal = document.querySelector('dz-calendar');
  cal.events = [{ id: 'a', title: 'Consultation', start: '2026-10-21T09:00[Europe/Paris]' }];
  cal.addEventListener('dz-event-click', (e) => console.log(e.detail.event.title));
</script>
```

The same in TypeScript, with the element's types:

```ts
import '@dzcalendar/element/define';
import '@dzcalendar/theme/dzcalendar.css';
import type { DzCalendarElement } from '@dzcalendar/element';

const cal = document.querySelector<DzCalendarElement>('dz-calendar')!;

cal.events = [
  { id: 'a', title: 'Consultation', start: '2026-10-21T09:00[Europe/Paris]', duration: { minutes: 45 } },
  { id: 'c', title: 'Day off', start: '2026-10-23', allDay: true },
];
cal.options = { businessHours: true, firstDay: 1 };

cal.addEventListener('dz-event-click', (e: Event) => console.log((e as CustomEvent).detail.event.title));
cal.addEventListener('dz-dates-set', (e: Event) => console.log((e as CustomEvent).detail.title));

await cal.ready; // drawn (on Safari: once Temporal's polyfill has arrived)
cal.navigate('next');
```

The element is `display: block` (an unknown element is inline) and its height is `--dz-height` (40rem by default).

## Entries

| Import | What it gives |
|---|---|
| `@dzcalendar/element/define` | Side effect: defines `<dz-calendar>` for the whole page and loads the recurrence engine. Also exports `DzCalendarElement` and `defineDzCalendar`. |
| `@dzcalendar/element` | `DzCalendarElement` (the class) and `defineDzCalendar(name = 'dz-calendar')`. Importing it defines nothing; it never throws on a server (no DOM), and defining does nothing there. |

```text
class DzCalendarElement extends HTMLElement
defineDzCalendar(name = 'dz-calendar'): void   // defines the element under `name`, once
```

To use another tag name (for example beside an Angular `<dz-calendar>`, which uses the same name), define it yourself:

```ts
import '@dzcalendar/core/recurrence'; // repeating events: define.ts does it for you, this entry does not
import { defineDzCalendar } from '@dzcalendar/element';

defineDzCalendar('dz-calendar-wc');
```

## Attributes

Live: changing one updates the calendar in place. A value that cannot be read is a `dz-problem`, never an exception.

| Attribute | Option | Notes |
|---|---|---|
| `view` | `initialView` / `view` | A view type (`timeGridWeek`, `dayGridMonth`…); an unknown one is a problem. |
| `date` | `initialDate` / `date` | An ISO date (`2026-10-21`). |
| `time-zone` | `timeZone` | An IANA zone; an unknown one is a problem and left out. |
| `locale` | `locale` | A BCP 47 tag. |
| `theme` | `theme` | `standard`, `slate`, `night`, `pastel`, `frost`, `solar`, `contrast`, or one made with `defineTheme`. |
| `scheme` | `scheme` | `auto`, `light` or `dark`. |
| `density` | `density` | `compact`, `comfortable` or `spacious`. |
| `editable` | `editable` | Boolean. |
| `selectable` | `selectable` | Boolean. |
| `week-numbers` | `weekNumbers` | Boolean. |
| `weekends` | `weekends` | Boolean (default on). |
| `now-indicator` | `nowIndicator` | Boolean (default on). |
| `shadow` | | Isolates the calendar in a shadow root. Read when the element first connects; the mode is kept afterwards. |
| `stylesheet` | | With `shadow`: the URL of a stylesheet linked inside the shadow root (for example the theme). Read again each time the calendar is mounted. |

Boolean attributes are on when present (or `"true"`), off with `"false"`; taken away after the start, the option goes back to the calendar's default. Taking away `view`, `date`, `time-zone`, `locale`, `theme`, `scheme` or `density` keeps the current value.

## Properties and methods

| Member | What it does |
|---|---|
| `events` | The events (`EventInput[]`). Live; what cannot be read is a `dz-problem`. |
| `resources` | The resources (`ResourceInput[]`). Live. |
| `sources` | The event sources (`EventSourceSpec[]`): the whole list; one that cannot be read is left out and said. |
| `options` | Every other option of `createCalendar` (`businessHours`, `hooks`, `motion`, `firstDay`, callbacks…). The attributes win over it. |
| `calendar` | The underlying DOM `CalendarInstance` (`run`, `undo`, `kernel`…); null while the element is not in the document. |
| `ready` | A `Promise<void>`, settled once: resolved when first drawn, rejected when it cannot be (options refused, Temporal's polyfill not loaded, an Angular `<dz-calendar>` already there). |
| `problems` | Every problem seen so far (the last 100), for a page that listened late. |
| `navigate('prev' \| 'next' \| 'today')` | Moves the period (queued if called before the first draw). |
| `shift(by)` | Slides a timeline by a duration (`{ minutes: -15 }`); false when the view does not slide. |
| `update(changes)` | `CalendarUpdate`: changes any live option, as `calendar.update` does. |
| `undo()`, `redo()` | Step through the history; false when there is nothing to do. |

A new `options` object is compared key by key (a framework handing a new object each render changes nothing). A live key (the zone, the theme, `editable`, `businessHours`, `hooks`, `motion`, `messages`…) changes in place: events, edits and undo stay. Any other key makes the calendar again on the same store (events and edits kept, the undo history not), showing the same view and date, and fires `dz-remade`. Properties set before the element was defined (a framework rendering first) are taken.

## Events

All events bubble and are composed (they cross a shadow root). For a callback of the calendar, `detail` is the callback's argument.

| Event | `detail` |
|---|---|
| `dz-dates-set` | `{ view, date, range, title, timeZone }`: once drawn and on every move. |
| `dz-select` | The selection (`onSelect`). |
| `dz-unselect` | The selection went away (`onUnselect`). |
| `dz-date-click` | The click on a day or moment (`onDateClick`). |
| `dz-event-click` | The clicked `EventInstance` (`onEventClick`). |
| `dz-event-open` | "Open" from the menu, Enter on an event (`onEventOpen`). |
| `dz-create-request` | "New event here" (`onCreateRequest`). |
| `dz-slot-click` | A free slot of `availableSlots` (`onSlotClick`). |
| `dz-command-refused` | `{ result, command }` (`onCommandRefused`). |
| `dz-proposal-refused` | The refused proposal (`onProposalRefused`). |
| `dz-resource-problems` | What the resources could not be read as (`onResourceProblems`). |
| `dz-follow-change` | A boolean: a timeline following the present paused (`false`) or resumed (`true`) (`onFollowChange`). |
| `dz-calendar-problem` | A `CalendarProblem` found while drawing (`onProblem`). |
| `dz-problem` | A `Problem[]`: what the element could not read (`invalid-option`, with a `path` such as `attribute:time-zone` and a short `detail`: `unknown-zone`, `unknown-view`, `not-a-date`, `not-a-list`, `not-an-object`, `refused`, `already-a-calendar`), and what the events and sources could not be read as. Sent in a microtask (a page listening once the element is parsed hears it). |
| `dz-remade` | `{ calendar }`: the calendar was made again after an `options` change. |

Four events offer something on screen only when listened to on the element (or given as a callback in `options`): `dz-event-open` ("Open" in the menu), `dz-create-request` ("New event here"), `dz-slot-click` (bookable slots as buttons) and `dz-calendar-problem` (without a listener the calendar's own console warning stays). Callbacks that have no event (`onEventChange`, `onDrop`, `onEventReceive`, `onEventLeave`, `onResourceToggle`, `onSource`…) go in `options`:

```ts
import '@dzcalendar/element/define';
import type { DzCalendarElement } from '@dzcalendar/element';

const cal = document.querySelector<DzCalendarElement>('dz-calendar')!;

cal.options = {
  editable: true,
  onEventChange: (change) => {
    // Persist it; take it back if the server refuses.
    fetch('/api/events', { method: 'POST', body: JSON.stringify(change.after) }).then((r) => !r.ok && change.revert());
  },
};

cal.addEventListener('dz-problem', (e: Event) => console.warn((e as CustomEvent).detail));
cal.addEventListener('dz-follow-change', (e: Event) => console.log('following the present:', (e as CustomEvent<boolean>).detail));
```

## In the page, or isolated

By default the calendar is drawn inside the element, in the page: its CSS, a theme and Tailwind apply as anywhere. With `shadow` it is isolated in an open shadow root: the calendar's own CSS is injected there, the page's does not reach in. Style it then with the palette (`--tz-*` and `--dz-*`, inherited through the shadow root), a theme linked with `stylesheet`, and its two parts:

```html
<dz-calendar shadow stylesheet="/dzcalendar.css" view="dayGridMonth"></dz-calendar>

<style>
  dz-calendar { --dz-accent: #0f766e; --dz-height: 32rem; }
  dz-calendar::part(calendar) { border-radius: 8px; }
  dz-calendar::part(toolbar) { padding: 4px; }
</style>
```

## In an Angular application

Use `@dzcalendar/angular`, not this element: both use the tag name `dz-calendar`. If a page needs both, define the element under another name with `defineDzCalendar('dz-calendar-wc')`. An element that finds an Angular calendar already drawn in it leaves it alone and says `already-a-calendar`.

## Documentation

- [The Web Component, in the vanilla JavaScript guide](https://plinthworks.github.io/dzcalendar/getting-started/vanilla/#the-web-component)
- [Installation](https://plinthworks.github.io/dzcalendar/getting-started/installation/)
- [Theming](https://plinthworks.github.io/dzcalendar/guides/theming/), [Tailwind](https://plinthworks.github.io/dzcalendar/guides/tailwind/), [Languages](https://plinthworks.github.io/dzcalendar/guides/languages/), [Time zones](https://plinthworks.github.io/dzcalendar/guides/time-zones/)
- [All options](https://plinthworks.github.io/dzcalendar/options/), for example [`hooks`](https://plinthworks.github.io/dzcalendar/options/hooks/) and [`onEventChange`](https://plinthworks.github.io/dzcalendar/options/on-event-change/)

## License

MIT

---

## Français

DzCalendar en Web Component : `<dz-calendar>` pour toute page ou tout framework.

**[English](#dzcalendarelement)** · Français

### Présentation

`@dzcalendar/element` définit l'élément personnalisé `<dz-calendar>` au-dessus de `@dzcalendar/dom`, pour du HTML pur, un CMS, React, Vue, Svelte ou tout ce qui sait écrire une balise. Les options sont des attributs et des propriétés, les callbacks sont des événements DOM (`dz-select`, `dz-event-click`, `dz-follow-change`…) qui remontent et traversent les shadow roots. Il vit dans la page par défaut (le CSS de la page, un thème ou Tailwind s'appliquent comme partout), ou isolé dans un shadow root avec l'attribut `shadow`. Une entrée invalide ne lève jamais d'exception : elle devient un événement `dz-problem`. Le moteur de récurrence est inclus : les événements récurrents fonctionnent d'emblée.

### Installation

```bash
npm install @dzcalendar/core @dzcalendar/dom @dzcalendar/element @dzcalendar/theme
```

`@dzcalendar/core` et `@dzcalendar/dom` sont des dépendances. `@dzcalendar/theme` est la feuille de style optionnelle (`@dzcalendar/theme/dzcalendar.css`).

### Démarrage rapide

```html
<dz-calendar view="timeGridWeek" time-zone="Europe/Paris" locale="fr-FR" editable selectable></dz-calendar>

<script type="module">
  import '@dzcalendar/element/define';
  import '@dzcalendar/theme/dzcalendar.css';
  const cal = document.querySelector('dz-calendar');
  cal.events = [{ id: 'a', title: 'Consultation', start: '2026-10-21T09:00[Europe/Paris]' }];
  cal.addEventListener('dz-event-click', (e) => console.log(e.detail.event.title));
</script>
```

La même chose en TypeScript, avec les types de l'élément :

```ts
import '@dzcalendar/element/define';
import '@dzcalendar/theme/dzcalendar.css';
import type { DzCalendarElement } from '@dzcalendar/element';

const cal = document.querySelector<DzCalendarElement>('dz-calendar')!;

cal.events = [
  { id: 'a', title: 'Consultation', start: '2026-10-21T09:00[Europe/Paris]', duration: { minutes: 45 } },
  { id: 'c', title: 'Jour de congé', start: '2026-10-23', allDay: true },
];
cal.options = { businessHours: true, firstDay: 1 };

cal.addEventListener('dz-event-click', (e: Event) => console.log((e as CustomEvent).detail.event.title));
cal.addEventListener('dz-dates-set', (e: Event) => console.log((e as CustomEvent).detail.title));

await cal.ready; // dessiné (sur Safari : une fois le polyfill de Temporal arrivé)
cal.navigate('next');
```

L'élément est `display: block` (un élément inconnu est en ligne) et sa hauteur est `--dz-height` (40rem par défaut).

### Points d'entrée

| Import | Ce qu'il apporte |
|---|---|
| `@dzcalendar/element/define` | Effet de bord : définit `<dz-calendar>` pour toute la page et charge le moteur de récurrence. Exporte aussi `DzCalendarElement` et `defineDzCalendar`. |
| `@dzcalendar/element` | `DzCalendarElement` (la classe) et `defineDzCalendar(name = 'dz-calendar')`. L'importer ne définit rien ; il ne lève jamais sur un serveur (sans DOM), et définir n'y fait rien. |

```text
class DzCalendarElement extends HTMLElement
defineDzCalendar(name = 'dz-calendar'): void   // définit l'élément sous `name`, une seule fois
```

Pour utiliser un autre nom de balise (par exemple à côté d'un `<dz-calendar>` Angular, qui porte le même nom), définissez-le vous-même :

```ts
import '@dzcalendar/core/recurrence'; // événements récurrents : define.ts le fait pour vous, pas cette entrée
import { defineDzCalendar } from '@dzcalendar/element';

defineDzCalendar('dz-calendar-wc');
```

### Attributs

Dynamiques : en changer un met le calendrier à jour sur place. Une valeur illisible est un `dz-problem`, jamais une exception.

| Attribut | Option | Remarques |
|---|---|---|
| `view` | `initialView` / `view` | Un type de vue (`timeGridWeek`, `dayGridMonth`…) ; une vue inconnue est un problème. |
| `date` | `initialDate` / `date` | Une date ISO (`2026-10-21`). |
| `time-zone` | `timeZone` | Un fuseau IANA ; un fuseau inconnu est un problème et écarté. |
| `locale` | `locale` | Une balise BCP 47. |
| `theme` | `theme` | `standard`, `slate`, `night`, `pastel`, `frost`, `solar`, `contrast`, ou une famille créée avec `defineTheme`. |
| `scheme` | `scheme` | `auto`, `light` ou `dark`. |
| `density` | `density` | `compact`, `comfortable` ou `spacious`. |
| `editable` | `editable` | Booléen. |
| `selectable` | `selectable` | Booléen. |
| `week-numbers` | `weekNumbers` | Booléen. |
| `weekends` | `weekends` | Booléen (actif par défaut). |
| `now-indicator` | `nowIndicator` | Booléen (actif par défaut). |
| `shadow` | | Isole le calendrier dans un shadow root. Lu à la première connexion ; le mode est conservé ensuite. |
| `stylesheet` | | Avec `shadow` : l'URL d'une feuille de style liée dans le shadow root (par exemple le thème). Relue à chaque montage du calendrier. |

Les attributs booléens sont actifs quand ils sont présents (ou `"true"`), inactifs avec `"false"` ; retirés après le démarrage, l'option revient à la valeur par défaut du calendrier. Retirer `view`, `date`, `time-zone`, `locale`, `theme`, `scheme` ou `density` conserve la valeur courante.

### Propriétés et méthodes

| Membre | Rôle |
|---|---|
| `events` | Les événements (`EventInput[]`). Dynamique ; ce qui est illisible est un `dz-problem`. |
| `resources` | Les ressources (`ResourceInput[]`). Dynamique. |
| `sources` | Les sources d'événements (`EventSourceSpec[]`) : la liste entière ; une source illisible est écartée et signalée. |
| `options` | Toutes les autres options de `createCalendar` (`businessHours`, `hooks`, `motion`, `firstDay`, callbacks…). Les attributs l'emportent sur elle. |
| `calendar` | Le `CalendarInstance` DOM sous-jacent (`run`, `undo`, `kernel`…) ; null tant que l'élément n'est pas dans le document. |
| `ready` | Une `Promise<void>`, réglée une seule fois : résolue au premier dessin, rejetée s'il n'a pas lieu (options refusées, polyfill de Temporal non chargé, un `<dz-calendar>` Angular déjà là). |
| `problems` | Tous les problèmes vus jusqu'ici (les 100 derniers), pour une page qui a écouté tard. |
| `navigate('prev' \| 'next' \| 'today')` | Déplace la période (mise en file si appelée avant le premier dessin). |
| `shift(by)` | Fait glisser une timeline d'une durée (`{ minutes: -15 }`) ; false si la vue ne glisse pas. |
| `update(changes)` | `CalendarUpdate` : change toute option dynamique, comme `calendar.update`. |
| `undo()`, `redo()` | Parcourent l'historique ; false s'il n'y a rien à faire. |

Un nouvel objet `options` est comparé clé par clé (un framework qui fournit un nouvel objet à chaque rendu ne change rien). Une clé dynamique (le fuseau, le thème, `editable`, `businessHours`, `hooks`, `motion`, `messages`…) change sur place : événements, modifications et annulation restent. Toute autre clé refait le calendrier sur le même store (événements et modifications conservés, l'historique d'annulation non), avec la même vue et la même date, et déclenche `dz-remade`. Les propriétés posées avant que l'élément soit défini (un framework qui rend en premier) sont reprises.

### Événements

Tous les événements remontent et sont composés (ils traversent un shadow root). Pour un callback du calendrier, `detail` est l'argument du callback.

| Événement | `detail` |
|---|---|
| `dz-dates-set` | `{ view, date, range, title, timeZone }` : une fois dessiné et à chaque déplacement. |
| `dz-select` | La sélection (`onSelect`). |
| `dz-unselect` | La sélection a disparu (`onUnselect`). |
| `dz-date-click` | Le clic sur un jour ou un moment (`onDateClick`). |
| `dz-event-click` | L'`EventInstance` cliquée (`onEventClick`). |
| `dz-event-open` | « Ouvrir » depuis le menu, Entrée sur un événement (`onEventOpen`). |
| `dz-create-request` | « Nouvel événement ici » (`onCreateRequest`). |
| `dz-slot-click` | Un créneau libre de `availableSlots` (`onSlotClick`). |
| `dz-command-refused` | `{ result, command }` (`onCommandRefused`). |
| `dz-proposal-refused` | La proposition refusée (`onProposalRefused`). |
| `dz-resource-problems` | Ce que les ressources n'ont pas pu être lues comme (`onResourceProblems`). |
| `dz-follow-change` | Un booléen : une timeline qui suit le présent s'est mise en pause (`false`) ou a repris (`true`) (`onFollowChange`). |
| `dz-calendar-problem` | Un `CalendarProblem` trouvé au dessin (`onProblem`). |
| `dz-problem` | Un `Problem[]` : ce que l'élément n'a pas pu lire (`invalid-option`, avec un `path` comme `attribute:time-zone` et un `detail` court : `unknown-zone`, `unknown-view`, `not-a-date`, `not-a-list`, `not-an-object`, `refused`, `already-a-calendar`), et ce que les événements et les sources n'ont pas pu être lus comme. Envoyé dans une microtâche (une page qui écoute une fois l'élément analysé l'entend). |
| `dz-remade` | `{ calendar }` : le calendrier a été refait après un changement d'`options`. |

Quatre événements ne proposent quelque chose à l'écran que s'ils sont écoutés sur l'élément (ou donnés comme callback dans `options`) : `dz-event-open` (« Ouvrir » dans le menu), `dz-create-request` (« Nouvel événement ici »), `dz-slot-click` (créneaux réservables en boutons) et `dz-calendar-problem` (sans écouteur, l'avertissement console du calendrier reste). Les callbacks sans événement (`onEventChange`, `onDrop`, `onEventReceive`, `onEventLeave`, `onResourceToggle`, `onSource`…) vont dans `options` :

```ts
import '@dzcalendar/element/define';
import type { DzCalendarElement } from '@dzcalendar/element';

const cal = document.querySelector<DzCalendarElement>('dz-calendar')!;

cal.options = {
  editable: true,
  onEventChange: (change) => {
    // La persister ; la reprendre si le serveur refuse.
    fetch('/api/events', { method: 'POST', body: JSON.stringify(change.after) }).then((r) => !r.ok && change.revert());
  },
};

cal.addEventListener('dz-problem', (e: Event) => console.warn((e as CustomEvent).detail));
cal.addEventListener('dz-follow-change', (e: Event) => console.log('suit le présent :', (e as CustomEvent<boolean>).detail));
```

### Dans la page, ou isolé

Par défaut le calendrier est dessiné dans l'élément, dans la page : son CSS, un thème et Tailwind s'appliquent comme partout. Avec `shadow`, il est isolé dans un shadow root ouvert : le CSS propre du calendrier y est injecté, celui de la page n'y entre pas. On le style alors avec la palette (`--tz-*` et `--dz-*`, héritées à travers le shadow root), un thème lié par `stylesheet`, et ses deux parties :

```html
<dz-calendar shadow stylesheet="/dzcalendar.css" view="dayGridMonth"></dz-calendar>

<style>
  dz-calendar { --dz-accent: #0f766e; --dz-height: 32rem; }
  dz-calendar::part(calendar) { border-radius: 8px; }
  dz-calendar::part(toolbar) { padding: 4px; }
</style>
```

### Dans une application Angular

Utilisez `@dzcalendar/angular`, pas cet élément : les deux portent le nom de balise `dz-calendar`. Si une page a besoin des deux, définissez l'élément sous un autre nom avec `defineDzCalendar('dz-calendar-wc')`. Un élément qui trouve un calendrier Angular déjà dessiné en lui le laisse tranquille et signale `already-a-calendar`.

### Documentation

- [Le Web Component, dans le guide JavaScript pur](https://plinthworks.github.io/dzcalendar/fr/getting-started/vanilla/#le-web-component)
- [Installation](https://plinthworks.github.io/dzcalendar/fr/getting-started/installation/)
- [Thèmes](https://plinthworks.github.io/dzcalendar/fr/guides/theming/), [Tailwind](https://plinthworks.github.io/dzcalendar/fr/guides/tailwind/), [Langues](https://plinthworks.github.io/dzcalendar/fr/guides/languages/), [Fuseaux horaires](https://plinthworks.github.io/dzcalendar/fr/guides/time-zones/)
- [Toutes les options](https://plinthworks.github.io/dzcalendar/fr/options/), par exemple [`hooks`](https://plinthworks.github.io/dzcalendar/fr/options/hooks/) et [`onEventChange`](https://plinthworks.github.io/dzcalendar/fr/options/on-event-change/)

### Licence

MIT
