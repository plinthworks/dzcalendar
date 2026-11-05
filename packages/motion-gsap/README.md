# @dzcalendar/motion-gsap

Optional GSAP motion for DzCalendar: two presets, fourteen effects, reduced-motion aware.

**English** · [Français](#français)

## What it is

`@dzcalendar/motion-gsap` is an adapter behind the motion hooks of `@dzcalendar/dom`. The calendar never depends on an animation library: you opt in with `motion: createGsapMotion()`. It brings zone glides, DST unfolding, the title odometer, a month to day morph, drag tilt and magnetic slots, dissolving deletes, overlays that open from their origin and a timeline accordion. Only transforms and opacity move, `clearProps` gives every element back to its CSS when a tween ends, and under `prefers-reduced-motion: reduce` nothing moves at all.

## Install

```bash
npm install @dzcalendar/core @dzcalendar/dom @dzcalendar/motion-gsap gsap
```

`gsap` (`^3.13.0`) is a peer dependency: it is your application's own. GSAP's `Flip` plugin is registered by the adapter; the other plugins are given by you (see Plugins). `@dzcalendar/dom` is a dependency.

## Quick start

```ts
import { createCalendar } from '@dzcalendar/dom';
import { createGsapMotion } from '@dzcalendar/motion-gsap';

// "sober" by default: soft curves, 200-350 ms, no bounce.
const calendar = createCalendar(element, {
  timeZone: 'Europe/Paris',
  motion: createGsapMotion(),
});

// Swap it live; the old adapter's animations finish first.
calendar.update({ motion: createGsapMotion({ preset: 'expressive' }) });
```

One adapter may serve several calendars in turn. The calendar owns the adapter it is given: it is destroyed with the calendar or when replaced.

## API

```text
createGsapMotion(options?: GsapMotionOptions): MotionAdapter

SOBER, EXPRESSIVE: MotionPreset
PRESETS: { sober: MotionPreset; expressive: MotionPreset }

types: GsapMotionOptions, MotionPreset, PresetName ('sober' | 'expressive'), MotionEffects, MotionPlugins
```

`MotionAdapter` is the interface of `@dzcalendar/dom` that the result implements (`beforeChange`, `afterChange`, `viewChange`, `titleChange`, `nowTick`, `eventsEnter`, `eventsLeave`, `wantsLeave`, `seatsChange`, `scroll`, `stopScroll`, `dragStart`, `dropRejected`, `captureLayout`, `animateLayout`, `dropSettle`, `overlayOpen`, `overlayClose`, `destroy`).

### Options (`GsapMotionOptions`)

| Option | What it does |
|---|---|
| `preset` | `'sober'` (default) or `'expressive'`. Any value below is laid over it. |
| `effects` | `{ name: false }` turns an effect off; each is on by default. |
| `plugins` | GSAP plugins given by the application (`InertiaPlugin`, `ScrollToPlugin`). |
| any `MotionPreset` key | `view`, `enter`, `drop`, `zone`, `morph`, `odometer`, `dst`, `slide`, `ease`, `move`, `settle`, `pop`, `stagger`, `tilt`, `leave` (see Presets). |
| `viewDuration`, `enterDuration`, `dropDuration` | Deprecated: use `view`, `enter` and `drop`. |

### Presets

Durations in seconds; `slide` is the percent of the body's width a period slides; `tilt` the degrees a dragged event leans at full speed.

| Value | `sober` | `expressive` |
|---|---|---|
| feel | soft curves, no bounce | springs, a little squash, bounces |
| `view`, `enter`, `drop` | 0.3, 0.22, 0.3 | 0.42, 0.34, 0.45 |
| `zone`, `morph` | 0.5, 0.42 | 0.7, 0.55 |
| `odometer`, `dst`, `leave` | 0.32, 0.45, 0.28 | 0.45, 0.6, 0.42 |
| `slide` | 4 | 7 |
| `ease`, `move`, `settle`, `pop` | `power2.out`, `power2.inOut`, `power3.out`, `power2.out` | `back.out(1.4)`, `power3.inOut`, `elastic.out(1, 0.6)`, `back.out(2.2)` |
| `stagger`, `tilt` | 0.012, 3 | 0.022, 9 |

### Effects (`MotionEffects`)

| Effect | What moves |
|---|---|
| `zone` | A zone change: every event glides to its new time (the instant stays, the clock changes). |
| `dst` | The repeated hour of a 25-hour day unfolds, a 23-hour day's skipped hour folds in, as the day comes into view. |
| `now` | The "now" line glides to its next minute and pulses. |
| `morph` | A grid of day cells (a month, a year's month) to one day: the cell opens into the day. |
| `odometer` | The title's changed words roll. |
| `today` | "Today" from far away: a quick run, then a soft stop. |
| `depth` | Heads and body slide at different speeds. |
| `drag` | A dragged event leans with the gesture's speed and glides from slot to slot (magnetic). |
| `leave` | A deleted event dissolves; undone, it gathers back. |
| `enter` | A new event pours out of the selection it was made from; others arrive as a wave. |
| `overlay` | Menus, "+N" panels and the editor open from what they were opened from. |
| `seats` | A slot's seats left pop when they change. |
| `scroll` | Scrolls after a change (back to today: to now) are eased. |
| `rows` | A timeline's resource rows open and close as an accordion. |

```ts
import { createCalendar } from '@dzcalendar/dom';
import { createGsapMotion, EXPRESSIVE } from '@dzcalendar/motion-gsap';

console.log(EXPRESSIVE.zone); // 0.7

createCalendar(element, {
  motion: createGsapMotion({
    preset: 'expressive',
    zone: 0.9, // a value over the preset
    effects: { odometer: false, today: false },
  }),
});
```

### Plugins

Nothing is loaded behind your back: GSAP's Inertia and ScrollTo plugins are given by the application. Without them the effects are done more simply.

| Plugin | With it |
|---|---|
| `InertiaPlugin` | A dropped event lands with the speed it was thrown with. |
| `ScrollToPlugin` | Eased scrolls go through the plugin (else the scroll properties are tweened directly). |

```ts
import { createCalendar } from '@dzcalendar/dom';
import { createGsapMotion } from '@dzcalendar/motion-gsap';
import { InertiaPlugin } from 'gsap/InertiaPlugin';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin';

createCalendar(element, {
  motion: createGsapMotion({ plugins: { InertiaPlugin, ScrollToPlugin } }),
});
```

## Reduced motion

Under `prefers-reduced-motion: reduce` nothing moves, at any level. The setting is followed through `gsap.matchMedia`, from the first hook on (not at creation: an adapter made at a module's top, or on a server, reads no media yet), so it changes while the page is open. Nothing is ever hidden with `visibility` (opacity only): a focused event keeps the focus. For no motion at all, pass `NO_MOTION` from `@dzcalendar/dom` instead.

## Documentation

- [The `motion` option](https://plinthworks.github.io/dzcalendar/options/motion/)
- [Views](https://plinthworks.github.io/dzcalendar/guides/views/), [Time zones](https://plinthworks.github.io/dzcalendar/guides/time-zones/), [Drag and drop](https://plinthworks.github.io/dzcalendar/guides/drag-and-drop/), [Keyboard and accessibility](https://plinthworks.github.io/dzcalendar/guides/keyboard-accessibility/)
- [All options](https://plinthworks.github.io/dzcalendar/options/)

## License

MIT

## Français

Du mouvement GSAP optionnel pour DzCalendar : deux préréglages, quatorze effets, respectueux de la réduction des animations.

### Présentation

`@dzcalendar/motion-gsap` est un adaptateur branché sur les points d'entrée de mouvement de `@dzcalendar/dom`. Le calendrier ne dépend jamais d'une bibliothèque d'animation : on s'y abonne avec `motion: createGsapMotion()`. Il apporte les glissements de fuseau, le déploiement des changements d'heure, l'odomètre du titre, la transformation mois vers jour, l'inclinaison au glisser et les créneaux magnétiques, la dissolution des suppressions, les surcouches qui s'ouvrent depuis leur origine et un accordéon de timeline. Seuls les transforms et l'opacité bougent, `clearProps` rend chaque élément à son CSS quand une animation se termine, et sous `prefers-reduced-motion: reduce` plus rien ne bouge.

### Installation

```bash
npm install @dzcalendar/core @dzcalendar/dom @dzcalendar/motion-gsap gsap
```

`gsap` (`^3.13.0`) est une dépendance pair : c'est celle de votre application. Le plugin `Flip` de GSAP est enregistré par l'adaptateur ; les autres plugins sont fournis par vous (voir Plugins). `@dzcalendar/dom` est une dépendance.

### Démarrage rapide

```ts
import { createCalendar } from '@dzcalendar/dom';
import { createGsapMotion } from '@dzcalendar/motion-gsap';

// « sober » par défaut : courbes douces, 200 à 350 ms, sans rebond.
const calendar = createCalendar(element, {
  timeZone: 'Europe/Paris',
  motion: createGsapMotion(),
});

// À changer à chaud ; les animations de l'ancien adaptateur se terminent d'abord.
calendar.update({ motion: createGsapMotion({ preset: 'expressive' }) });
```

Un même adaptateur peut servir plusieurs calendriers à la suite. Le calendrier possède l'adaptateur qu'on lui donne : il est détruit avec lui ou quand on le remplace.

### API

```text
createGsapMotion(options?: GsapMotionOptions): MotionAdapter

SOBER, EXPRESSIVE: MotionPreset
PRESETS: { sober: MotionPreset; expressive: MotionPreset }

types : GsapMotionOptions, MotionPreset, PresetName ('sober' | 'expressive'), MotionEffects, MotionPlugins
```

`MotionAdapter` est l'interface de `@dzcalendar/dom` que le résultat implémente (`beforeChange`, `afterChange`, `viewChange`, `titleChange`, `nowTick`, `eventsEnter`, `eventsLeave`, `wantsLeave`, `seatsChange`, `scroll`, `stopScroll`, `dragStart`, `dropRejected`, `captureLayout`, `animateLayout`, `dropSettle`, `overlayOpen`, `overlayClose`, `destroy`).

#### Options (`GsapMotionOptions`)

| Option | Rôle |
|---|---|
| `preset` | `'sober'` (défaut) ou `'expressive'`. Toute valeur ci-dessous est posée par-dessus. |
| `effects` | `{ nom: false }` coupe un effet ; chacun est actif par défaut. |
| `plugins` | Les plugins GSAP fournis par l'application (`InertiaPlugin`, `ScrollToPlugin`). |
| toute clé de `MotionPreset` | `view`, `enter`, `drop`, `zone`, `morph`, `odometer`, `dst`, `slide`, `ease`, `move`, `settle`, `pop`, `stagger`, `tilt`, `leave` (voir Préréglages). |
| `viewDuration`, `enterDuration`, `dropDuration` | Dépréciées : utilisez `view`, `enter` et `drop`. |

#### Préréglages

Durées en secondes ; `slide` est le pourcentage de la largeur du corps dont une période glisse ; `tilt` les degrés dont un événement glissé s'incline à pleine vitesse.

| Valeur | `sober` | `expressive` |
|---|---|---|
| ambiance | courbes douces, sans rebond | ressorts, un peu d'écrasement, rebonds |
| `view`, `enter`, `drop` | 0,3 ; 0,22 ; 0,3 | 0,42 ; 0,34 ; 0,45 |
| `zone`, `morph` | 0,5 ; 0,42 | 0,7 ; 0,55 |
| `odometer`, `dst`, `leave` | 0,32 ; 0,45 ; 0,28 | 0,45 ; 0,6 ; 0,42 |
| `slide` | 4 | 7 |
| `ease`, `move`, `settle`, `pop` | `power2.out`, `power2.inOut`, `power3.out`, `power2.out` | `back.out(1.4)`, `power3.inOut`, `elastic.out(1, 0.6)`, `back.out(2.2)` |
| `stagger`, `tilt` | 0,012 ; 3 | 0,022 ; 9 |

#### Effets (`MotionEffects`)

| Effet | Ce qui bouge |
|---|---|
| `zone` | Un changement de fuseau : chaque événement glisse vers sa nouvelle heure (l'instant reste, l'horloge change). |
| `dst` | L'heure répétée d'un jour de 25 h se déploie, l'heure sautée d'un jour de 23 h se replie, quand le jour entre en vue. |
| `now` | La ligne « maintenant » glisse vers sa minute suivante et pulse. |
| `morph` | D'une grille de jours (un mois, un mois de l'année) à un seul jour : la cellule s'ouvre en jour. |
| `odometer` | Les mots modifiés du titre défilent. |
| `today` | « Aujourd'hui » depuis loin : une course rapide, puis un arrêt doux. |
| `depth` | Les en-têtes et le corps glissent à des vitesses différentes. |
| `drag` | Un événement glissé s'incline selon la vitesse du geste et glisse de créneau en créneau (magnétique). |
| `leave` | Un événement supprimé se dissout ; annulé, il se reforme. |
| `enter` | Un nouvel événement jaillit de la sélection qui l'a créé ; les autres arrivent en vague. |
| `overlay` | Les menus, les panneaux « +N » et l'éditeur s'ouvrent depuis ce qui les a ouverts. |
| `seats` | Les places restantes d'un créneau font un bond quand elles changent. |
| `scroll` | Les défilements après un changement (retour à aujourd'hui : vers maintenant) sont adoucis. |
| `rows` | Les lignes de ressources d'une timeline s'ouvrent et se ferment en accordéon. |

```ts
import { createCalendar } from '@dzcalendar/dom';
import { createGsapMotion, EXPRESSIVE } from '@dzcalendar/motion-gsap';

console.log(EXPRESSIVE.zone); // 0.7

createCalendar(element, {
  motion: createGsapMotion({
    preset: 'expressive',
    zone: 0.9, // une valeur par-dessus le préréglage
    effects: { odometer: false, today: false },
  }),
});
```

#### Plugins

Rien n'est chargé dans votre dos : les plugins Inertia et ScrollTo de GSAP sont fournis par l'application. Sans eux, les effets sont réalisés plus simplement.

| Plugin | Avec lui |
|---|---|
| `InertiaPlugin` | Un événement déposé atterrit avec la vitesse à laquelle il a été lancé. |
| `ScrollToPlugin` | Les défilements adoucis passent par le plugin (sinon les propriétés de défilement sont animées directement). |

```ts
import { createCalendar } from '@dzcalendar/dom';
import { createGsapMotion } from '@dzcalendar/motion-gsap';
import { InertiaPlugin } from 'gsap/InertiaPlugin';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin';

createCalendar(element, {
  motion: createGsapMotion({ plugins: { InertiaPlugin, ScrollToPlugin } }),
});
```

### Mouvement réduit

Sous `prefers-reduced-motion: reduce`, rien ne bouge, à aucun niveau. Le réglage est suivi via `gsap.matchMedia`, dès le premier appel (pas à la création : un adaptateur créé en tête de module, ou sur un serveur, ne lit encore aucun média), donc il change pendant que la page est ouverte. Rien n'est jamais masqué avec `visibility` (opacité seulement) : un événement qui a le focus le garde. Pour aucun mouvement du tout, passez plutôt `NO_MOTION` de `@dzcalendar/dom`.

### Documentation

- [L'option `motion`](https://plinthworks.github.io/dzcalendar/fr/options/motion/)
- [Vues](https://plinthworks.github.io/dzcalendar/fr/guides/views/), [Fuseaux horaires](https://plinthworks.github.io/dzcalendar/fr/guides/time-zones/), [Glisser-déposer](https://plinthworks.github.io/dzcalendar/fr/guides/drag-and-drop/), [Clavier et accessibilité](https://plinthworks.github.io/dzcalendar/fr/guides/keyboard-accessibility/)
- [Toutes les options](https://plinthworks.github.io/dzcalendar/fr/options/)

### Licence

MIT
