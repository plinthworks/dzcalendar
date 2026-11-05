# @dzcalendar/theme

The optional stylesheet of DzCalendar: seven families, light and dark, plain CSS with a Sass source and Tailwind files.

**English** · [Français](#français)

## What it is

`@dzcalendar/theme` makes the calendar presentable with one import. It gives each family a light and a dark palette (checked for WCAG AA contrast), the calendar's named tones, and its default sizes. It is of one family with `@tzslot/theme`: the same nine palette colours under the same `--tz-*` names, so a palette set once reaches both libraries. It is plain CSS (no framework); a Sass source lets you rebuild it with your own values, and separate files cover Tailwind 4, Tailwind 3 and pages whose reset is not in a cascade layer. The calendar works without it, drawn with the platform's colours.

## Install

```bash
npm install @dzcalendar/theme
```

It is used beside `@dzcalendar/dom` (and `@dzcalendar/core`), or `@dzcalendar/element`, or one of the framework wrappers:

```bash
npm install @dzcalendar/core @dzcalendar/dom @dzcalendar/theme
```

## Quick start

```ts
import '@dzcalendar/theme/dzcalendar.css';
import { createCalendar } from '@dzcalendar/dom';

createCalendar(element, {
  theme: 'night', // standard, slate, night, pastel, frost, solar, contrast
  scheme: 'auto', // 'light', 'dark', or the page's
  density: 'comfortable', // 'compact' | 'comfortable' | 'spacious'
  eventStyle: 'tinted', // 'tinted' | 'solid'
});
```

The same import works in a stylesheet: `@import '@dzcalendar/theme/dzcalendar.css';`.

## Files and entries

| Import | What it is |
|---|---|
| `@dzcalendar/theme`, `@dzcalendar/theme/dzcalendar.css` | The compiled stylesheet, in the cascade layer `dzcalendar.theme` (after the calendar's own `dzcalendar.base`): any rule of your page outside a layer wins. |
| `@dzcalendar/theme/dzcalendar.scss` | The Sass source, with configurable `!default` variables. |
| `@dzcalendar/theme/dzcalendar` | The same, resolved by condition: Sass gets the `.scss`, everything else the `.css`. |
| `@dzcalendar/theme/tailwind.css` | For Tailwind CSS v4: declares the layer order and imports the stylesheet. Import it before Tailwind. |
| `@dzcalendar/theme/tailwind-theme.css` | The calendar's tokens as Tailwind v4 theme values, so `bg-dz-accent`, `text-dz-fg`, `rounded-dz`… follow the calendar's theme and scheme. |
| `@dzcalendar/theme/tailwind3.css` | For Tailwind CSS v3 (and Bootstrap, normalize.css): the same theme as plain CSS, no layers. Pair it with `cssLayers: false`. |
| `@dzcalendar/theme/unlayered.css` | The theme outside any cascade layer: the file `tailwind3.css` builds on, for any page whose global reset is unlayered. |
| `@dzcalendar/theme/unlayered.scss` | The Sass source of `unlayered.css`: `dzcalendar.scss` with `$layer: false`. |

## Families

Seven ready-made families, each a `(light, dark)` palette. Select one with the `theme` option (it sets `data-dz-theme` on the calendar):

| Family | Feel |
|---|---|
| `standard` | The default: zinc and blue, tzslot's palette. |
| `slate` | Cool grey and blue (inspired by GitHub Primer). |
| `night` | Deep blue-grey (inspired by Tokyo Night / One Dark). |
| `pastel` | Soft mauve and blue (inspired by Catppuccin). |
| `frost` | Nordic blue-grey (inspired by Nord). |
| `solar` | Warm cream in light, deep teal in dark, blue accent (inspired by Solarized). |
| `contrast` | High contrast: black on white, white on black, a visible outline on events. |

Light and dark are chosen without `light-dark()` (it works back to Safari 15.4): by the calendar's `scheme`, then the page's `data-theme="light|dark"` on an ancestor, then the system's `prefers-color-scheme`. The sheet also sets forced-colors rules, soft transitions under `prefers-reduced-motion: no-preference`, and exact colours for print.

Six named tones are defined for events (`tone: 'blue' | 'green' | 'red' | 'amber' | 'violet' | 'slate'` → `--dz-tone-<name>`), each as a pair that follows the scheme, plus `--dz-on-tone` (the text on a solid event).

### Your own family: `defineTheme`

Families of your own are made in JavaScript with `defineTheme` from `@dzcalendar/dom`, on top of the standard family (anything left out keeps its value):

```ts
import '@dzcalendar/theme/dzcalendar.css';
import { createCalendar, defineTheme } from '@dzcalendar/dom';

defineTheme('clinic', {
  accent: ['#0a7d5a', '#3ddc97'], // [light, dark]
  radius: '8px',
  tones: { brand: ['#0a7d5a', '#3ddc97'] },
});

createCalendar(element, { theme: 'clinic' });
```

The tokens `defineTheme` takes are `bg`, `bgRaised`, `fg`, `fgMuted`, `border`, `accent`, `accentFg`, `danger`, `warning`, `radius`, `font`, `todayBg`, `now`, `eventBg`, `eventFg`, `eventAccent` and `tones`.

## Tokens

The calendar reads every colour as `--dz-x`, else `--tz-x` (the palette shared with tzslot), else the theme's private `--dzp-x`, else a system colour. Set the `--dz-…` ones, on any ancestor or on `.dz-cal`:

```css
.agenda {
  --dz-accent: #0f766e;
  --dz-radius: 10px;
  --dz-height: 48rem;
}
```

The sheet itself sets the sizes on `:root` and `:host` (so a size set on any ancestor reaches the calendar): `--dz-minute: 1.2px` (72 px an hour), `--dz-gutter-width: 3.75rem`, `--dz-bar-height: 1.375rem`, `--dz-height: 40rem`. The full list of tokens, parts and `data-*` states is the styling contract in `docs/styling.md` of the repository; `--dzc-…` and `--dzp-…` are private.

## Sass

`dzcalendar.scss` is the source of `dzcalendar.css` (a test fails when they drift apart). Configure its variables, each a value or a `(light, dark)` pair:

```scss
@use '@dzcalendar/theme/dzcalendar' with (
  $accent: (#be123c, #fb7185),
  $radius: 0.5rem
);
```

| Variable | What |
|---|---|
| `$bg`, `$bg-raised`, `$fg`, `$fg-muted`, `$border` | Surfaces, text, lines. |
| `$accent`, `$accent-fg`, `$danger`, `$warning` | The accent and text on it, refusals and warnings. |
| `$font`, `$radius` | Font (default `inherit`), corners (`0.375rem`, tzslot's shared radius). |
| `$calendar` | The calendar's sizes: `minute`, `gutter-width`, `bar-height`, `height`. |
| `$tones` | Named tones for events, each a `(light, dark)` pair. |
| `$on-tone` | The text on a solid event. |
| `$event-shade` | How much of its tone a tinted event's text takes (`45%`, AA on every family). |
| `$themes` | The families other than standard: a map of name to palette. |
| `$emit` | `false`: define the variables only, emit nothing. |
| `$layer` | `false`: no cascade layer (see `unlayered`). |

## With Tailwind

Tailwind CSS v4: import the layer order before Tailwind, and optionally the tokens as theme values:

```css
@import '@dzcalendar/theme/tailwind.css';
@import 'tailwindcss';
@import '@dzcalendar/theme/tailwind-theme.css';
```

`tailwind-theme.css` defines `bg-dz-bg`, `bg-dz-raised`, `text-dz-fg`, `text-dz-muted`, `border-dz-line`, `border-dz-border`, `bg-dz-accent`, `text-dz-accent-fg`, `text-dz-danger`, `text-dz-warning`, `bg-dz-event`, `text-dz-on-tone`, `rounded-dz`, `rounded-dz-event` and `font-dz`. Tailwind CSS v3, Bootstrap or any unlayered reset:

```css
@import 'tailwindcss/base';
@import '@dzcalendar/theme/tailwind3.css';
@import 'tailwindcss/components';
@import 'tailwindcss/utilities';
```

with `createCalendar(element, { cssLayers: false })`.

## Documentation

- [Theming and CSS](https://plinthworks.github.io/dzcalendar/guides/theming/)
- [Tailwind](https://plinthworks.github.io/dzcalendar/guides/tailwind/)
- [Unstyled calendar](https://plinthworks.github.io/dzcalendar/guides/unstyled/)
- Options: [`theme`](https://plinthworks.github.io/dzcalendar/options/theme/), [`scheme`](https://plinthworks.github.io/dzcalendar/options/scheme/), [`density`](https://plinthworks.github.io/dzcalendar/options/density/), [`eventStyle`](https://plinthworks.github.io/dzcalendar/options/event-style/), [`look`](https://plinthworks.github.io/dzcalendar/options/look/), [`cssLayers`](https://plinthworks.github.io/dzcalendar/options/css-layers/)

## License

MIT

## Français

La feuille de style optionnelle de DzCalendar : sept familles, clair et sombre, du CSS pur avec une source Sass et des fichiers Tailwind.

### Présentation

`@dzcalendar/theme` rend le calendrier présentable en un import. Il donne à chaque famille une palette claire et une sombre (contrôlées pour le contraste WCAG AA), les tons nommés du calendrier et ses tailles par défaut. Il est de la même famille que `@tzslot/theme` : les mêmes neuf couleurs de palette sous les mêmes noms `--tz-*`, si bien qu'une palette définie une fois atteint les deux bibliothèques. C'est du CSS pur (aucun framework) ; une source Sass permet de le recompiler avec vos valeurs, et des fichiers séparés couvrent Tailwind 4, Tailwind 3 et les pages dont le reset n'est pas dans une couche de cascade. Le calendrier fonctionne sans lui, dessiné avec les couleurs de la plateforme.

### Installation

```bash
npm install @dzcalendar/theme
```

Il s'utilise à côté de `@dzcalendar/dom` (et `@dzcalendar/core`), ou de `@dzcalendar/element`, ou d'un wrapper de framework :

```bash
npm install @dzcalendar/core @dzcalendar/dom @dzcalendar/theme
```

### Démarrage rapide

```ts
import '@dzcalendar/theme/dzcalendar.css';
import { createCalendar } from '@dzcalendar/dom';

createCalendar(element, {
  theme: 'night', // standard, slate, night, pastel, frost, solar, contrast
  scheme: 'auto', // 'light', 'dark', ou celui de la page
  density: 'comfortable', // 'compact' | 'comfortable' | 'spacious'
  eventStyle: 'tinted', // 'tinted' | 'solid'
});
```

Le même import fonctionne dans une feuille de style : `@import '@dzcalendar/theme/dzcalendar.css';`.

### Fichiers et points d'entrée

| Import | Ce que c'est |
|---|---|
| `@dzcalendar/theme`, `@dzcalendar/theme/dzcalendar.css` | La feuille compilée, dans la couche de cascade `dzcalendar.theme` (après la couche `dzcalendar.base` du calendrier) : toute règle de votre page hors couche gagne. |
| `@dzcalendar/theme/dzcalendar.scss` | La source Sass, avec des variables `!default` configurables. |
| `@dzcalendar/theme/dzcalendar` | La même, résolue par condition : Sass reçoit le `.scss`, tout le reste le `.css`. |
| `@dzcalendar/theme/tailwind.css` | Pour Tailwind CSS v4 : déclare l'ordre des couches et importe la feuille. À importer avant Tailwind. |
| `@dzcalendar/theme/tailwind-theme.css` | Les tokens du calendrier comme valeurs de thème Tailwind v4, pour que `bg-dz-accent`, `text-dz-fg`, `rounded-dz`… suivent le thème et le schéma du calendrier. |
| `@dzcalendar/theme/tailwind3.css` | Pour Tailwind CSS v3 (et Bootstrap, normalize.css) : le même thème en CSS simple, sans couches. À associer à `cssLayers: false`. |
| `@dzcalendar/theme/unlayered.css` | Le thème hors de toute couche de cascade : le fichier sur lequel s'appuie `tailwind3.css`, pour toute page dont le reset global n'est pas en couche. |
| `@dzcalendar/theme/unlayered.scss` | La source Sass de `unlayered.css` : `dzcalendar.scss` avec `$layer: false`. |

### Familles

Sept familles prêtes à l'emploi, chacune une palette `(clair, sombre)`. On en choisit une avec l'option `theme` (elle pose `data-dz-theme` sur le calendrier) :

| Famille | Ambiance |
|---|---|
| `standard` | Par défaut : zinc et bleu, la palette de tzslot. |
| `slate` | Gris froid et bleu (inspirée de GitHub Primer). |
| `night` | Bleu-gris profond (inspirée de Tokyo Night / One Dark). |
| `pastel` | Mauve doux et bleu (inspirée de Catppuccin). |
| `frost` | Bleu-gris nordique (inspirée de Nord). |
| `solar` | Crème chaud en clair, sarcelle profond en sombre, accent bleu (inspirée de Solarized). |
| `contrast` | Fort contraste : noir sur blanc, blanc sur noir, un contour visible sur les événements. |

Le clair et le sombre sont choisis sans `light-dark()` (cela fonctionne jusqu'à Safari 15.4) : par le `scheme` du calendrier, puis par `data-theme="light|dark"` sur un ancêtre de la page, puis par `prefers-color-scheme` du système. La feuille pose aussi des règles pour les couleurs forcées, de douces transitions sous `prefers-reduced-motion: no-preference` et des couleurs exactes à l'impression.

Six tons nommés sont définis pour les événements (`tone: 'blue' | 'green' | 'red' | 'amber' | 'violet' | 'slate'` → `--dz-tone-<nom>`), chacun en paire qui suit le schéma, plus `--dz-on-tone` (le texte sur un événement plein).

#### Votre propre famille : `defineTheme`

Les familles à vous se créent en JavaScript avec `defineTheme` de `@dzcalendar/dom`, au-dessus de la famille standard (ce qui est omis garde sa valeur) :

```ts
import '@dzcalendar/theme/dzcalendar.css';
import { createCalendar, defineTheme } from '@dzcalendar/dom';

defineTheme('clinic', {
  accent: ['#0a7d5a', '#3ddc97'], // [clair, sombre]
  radius: '8px',
  tones: { brand: ['#0a7d5a', '#3ddc97'] },
});

createCalendar(element, { theme: 'clinic' });
```

Les tokens que prend `defineTheme` sont `bg`, `bgRaised`, `fg`, `fgMuted`, `border`, `accent`, `accentFg`, `danger`, `warning`, `radius`, `font`, `todayBg`, `now`, `eventBg`, `eventFg`, `eventAccent` et `tones`.

### Tokens

Le calendrier lit chaque couleur comme `--dz-x`, sinon `--tz-x` (la palette partagée avec tzslot), sinon le `--dzp-x` privé du thème, sinon une couleur système. Définissez les `--dz-…`, sur n'importe quel ancêtre ou sur `.dz-cal` :

```css
.agenda {
  --dz-accent: #0f766e;
  --dz-radius: 10px;
  --dz-height: 48rem;
}
```

La feuille pose elle-même les tailles sur `:root` et `:host` (une taille définie sur un ancêtre atteint donc le calendrier) : `--dz-minute: 1.2px` (72 px par heure), `--dz-gutter-width: 3.75rem`, `--dz-bar-height: 1.375rem`, `--dz-height: 40rem`. La liste complète des tokens, parties et états `data-*` est le contrat de style de `docs/styling.md` dans le dépôt ; `--dzc-…` et `--dzp-…` sont privés.

### Sass

`dzcalendar.scss` est la source de `dzcalendar.css` (un test échoue si elles divergent). Configurez ses variables, chacune une valeur ou une paire `(clair, sombre)` :

```scss
@use '@dzcalendar/theme/dzcalendar' with (
  $accent: (#be123c, #fb7185),
  $radius: 0.5rem
);
```

| Variable | Rôle |
|---|---|
| `$bg`, `$bg-raised`, `$fg`, `$fg-muted`, `$border` | Surfaces, texte, lignes. |
| `$accent`, `$accent-fg`, `$danger`, `$warning` | L'accent et le texte dessus, refus et avertissements. |
| `$font`, `$radius` | Police (défaut `inherit`), coins (`0.375rem`, le rayon partagé de tzslot). |
| `$calendar` | Les tailles du calendrier : `minute`, `gutter-width`, `bar-height`, `height`. |
| `$tones` | Les tons nommés des événements, chacun une paire `(clair, sombre)`. |
| `$on-tone` | Le texte sur un événement plein. |
| `$event-shade` | La part de son ton que prend le texte d'un événement teinté (`45%`, AA sur toutes les familles). |
| `$themes` | Les familles autres que standard : une map nom vers palette. |
| `$emit` | `false` : définit les variables seulement, n'émet rien. |
| `$layer` | `false` : pas de couche de cascade (voir `unlayered`). |

### Avec Tailwind

Tailwind CSS v4 : importez l'ordre des couches avant Tailwind, et au besoin les tokens comme valeurs de thème :

```css
@import '@dzcalendar/theme/tailwind.css';
@import 'tailwindcss';
@import '@dzcalendar/theme/tailwind-theme.css';
```

`tailwind-theme.css` définit `bg-dz-bg`, `bg-dz-raised`, `text-dz-fg`, `text-dz-muted`, `border-dz-line`, `border-dz-border`, `bg-dz-accent`, `text-dz-accent-fg`, `text-dz-danger`, `text-dz-warning`, `bg-dz-event`, `text-dz-on-tone`, `rounded-dz`, `rounded-dz-event` et `font-dz`. Tailwind CSS v3, Bootstrap ou tout reset hors couche :

```css
@import 'tailwindcss/base';
@import '@dzcalendar/theme/tailwind3.css';
@import 'tailwindcss/components';
@import 'tailwindcss/utilities';
```

avec `createCalendar(element, { cssLayers: false })`.

### Documentation

- [Thèmes et CSS](https://plinthworks.github.io/dzcalendar/fr/guides/theming/)
- [Tailwind](https://plinthworks.github.io/dzcalendar/fr/guides/tailwind/)
- [Calendrier sans style](https://plinthworks.github.io/dzcalendar/fr/guides/unstyled/)
- Options : [`theme`](https://plinthworks.github.io/dzcalendar/fr/options/theme/), [`scheme`](https://plinthworks.github.io/dzcalendar/fr/options/scheme/), [`density`](https://plinthworks.github.io/dzcalendar/fr/options/density/), [`eventStyle`](https://plinthworks.github.io/dzcalendar/fr/options/event-style/), [`look`](https://plinthworks.github.io/dzcalendar/fr/options/look/), [`cssLayers`](https://plinthworks.github.io/dzcalendar/fr/options/css-layers/)

### Licence

MIT
