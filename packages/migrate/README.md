# @dzcalendar/migrate

`dz-migrate`: rewrites a FullCalendar application for DzCalendar and marks what needs a person.

**English** · [Français](#français)

## What it is

`dz-migrate` is a command-line tool (and a small programmatic API) that reads the TypeScript, JavaScript and Angular template files of your application and rewrites what uses FullCalendar:

- **imports and plugins**: `@fullcalendar/*` imports are replaced, plugins that are built in disappear;
- **`new Calendar(el, options)`** becomes `createFromFullCalendar(el, options).calendar` (from `@dzcalendar/compat-fullcalendar`);
- **the common calendar calls** (`next`, `prev`, `today`, `changeView`, `refetchEvents`, `unselect`, `destroy`, `render`) are translated;
- **Angular**: `FullCalendarModule` and `<full-calendar [options]>`, in inline templates and in `.html` files;
- **what needs a person** is left in place and marked with a `// dz-migrate:` comment above its statement, and listed in the report.

It is a tool, never a dependency of your application: install it with `-D`. It reads source with `ts-morph`; for Angular templates it uses Angular's own compiler when your project has it (`@angular/compiler`, an optional peer dependency), and falls back to a pattern match otherwise.

The rewritten code runs on `@dzcalendar/compat-fullcalendar`, which translates your FullCalendar options object at run time. `dz-migrate` only changes your code, never your options.

## Install

```bash
npm install -D @dzcalendar/migrate
```

## Quick start

```bash
# See what would change (nothing is written)
npx dz-migrate src

# Rewrite the files
npx dz-migrate src --write
```

Then swap the packages, as the last line of the report says:

```bash
npm install @dzcalendar/core @dzcalendar/dom @dzcalendar/theme @dzcalendar/compat-fullcalendar
npm uninstall @fullcalendar/core @fullcalendar/daygrid @fullcalendar/timegrid @fullcalendar/interaction
```

The report names each file (`would change` or `rewritten`, or `notes` when the file only has something for a person), the notes of each file, and a summary:

```text
would change  src/main.ts
    · gotoDate() — see https://plinthworks.github.io/dzcalendar/getting-started/migrating-from-fullcalendar/

1 file(s) to rewrite (run again with --write), 1 note(s). Then: npm install @dzcalendar/compat-fullcalendar @dzcalendar/core @dzcalendar/dom @dzcalendar/theme, and remove @fullcalendar/*.
```

The packages listed in the last line are the `@dzcalendar/*` modules the rewritten files import, plus `core`, `dom` and `theme`.

## The command

```text
dz-migrate [paths…] [--write]
dz-migrate --help
```

| Argument | Effect |
|---|---|
| `paths…` | Files or folders to read. Default: `src`. A path that does not exist is skipped. |
| `--write` | Write the rewritten files. Without it, nothing is written. |
| `--help`, `-h` | Print the usage and exit. |

- It reads files ending in `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs` and `.html` (not `.d.ts`), skipping `node_modules`, `dist`, `.angular` and `.git`. A file that does not mention `@fullcalendar/` (or `full-calendar` for a template) is left alone.
- A file that cannot be read or parsed does not stop the others: it is reported as `failed  <file>: <reason>` and the exit code is 1.
- It is idempotent: running it again on its own output changes nothing, and does not repeat its `// dz-migrate:` notes.
- The exit code is 0, or 1 when at least one file failed.

## What it rewrites

| Before | After |
|---|---|
| `import { Calendar } from '@fullcalendar/core'` | `import { createFromFullCalendar } from '@dzcalendar/compat-fullcalendar'` |
| `new Calendar(el, options)` | `createFromFullCalendar(el, options).calendar` |
| `new Calendar(el, options).render()`, `calendar.render()` | The `render()` call is removed: the calendar is drawn when made. |
| `Calendar` as a type (a field, a variable) | `CalendarInstance`, from `@dzcalendar/dom` |
| `next()`, `prev()`, `today()` | `navigate('next')`, `navigate('prev')`, `navigate('today')` |
| `changeView(v)` (one argument) | `update({ view: v })` |
| `refetchEvents()` | `refetch()` |
| `unselect()` | `select(null)` |
| `destroy()` | `destroy()` |
| Types (`CalendarOptions`, `EventInput`, `EventSourceInput`, `EventApi`, `ViewApi`, `EventClickArg`, `DateClickArg`, `DateSelectArg`, `EventChangeArg`, `EventDropArg`, `EventResizeDoneArg`, `EventAddArg`, `EventRemoveArg`, `DatesSetArg`, `EventContentArg`, `EventMountArg`) | The same names, imported from `@dzcalendar/compat-fullcalendar`. |
| `Draggable` from `@fullcalendar/interaction` | `Draggable` from `@dzcalendar/compat-fullcalendar`. |
| Plugins `@fullcalendar/daygrid`, `timegrid`, `interaction`, `icalendar`, `resource`, `resource-timegrid`, `resource-daygrid`, `scrollgrid`, `adaptive` | Removed: built in. |
| `@fullcalendar/rrule` | `import '@dzcalendar/core/recurrence'` |
| `@fullcalendar/list` | `import '@dzcalendar/dom/list'` |
| `@fullcalendar/multimonth` | `import '@dzcalendar/dom/multimonth'` |
| `@fullcalendar/timeline`, `@fullcalendar/resource-timeline` | `import '@dzcalendar/pro'` |
| `plugins: [...]` and `locales: [...]` in the options | The entries that were removed imports are taken out; the property too when it becomes empty. |
| `@fullcalendar/core/locales/ar` (also `es`, `de`) | `import '@dzcalendar/dom/locales/ar'` (and so on); `locale: arLocale` becomes `locale: 'ar'`. English and French are built in: their import is just removed. |
| `@fullcalendar/core/locales-all` | The Arabic, Spanish and German imports, with a note; other languages: `defineLocale`. |
| Angular `FullCalendarModule` (in `imports: [...]`) | `DZ_CALENDAR, DzFullCalendar`, imported from `@dzcalendar/angular` and `@dzcalendar/angular/fullcalendar`. |
| `<full-calendar [options]="o">…</full-calendar>` | `<dz-calendar [dzFullCalendar]="o">…</dz-calendar>`; the inputs `deepChangeDetection` and `customRenderingMetaMap` are dropped, with a note. |

Calendar instances are found by following `new Calendar(...)`: a `const`, a class field, or `this.x = new Calendar(...)`.

### Marked for a person

A call whose shape changes, or that has no direct translation, is left as it is with a comment above its statement:

```text
// dz-migrate: gotoDate() — see https://plinthworks.github.io/dzcalendar/getting-started/migrating-from-fullcalendar/
calendar.gotoDate('2026-10-21');
```

The calls marked this way are the methods called on a known calendar instance other than the ones translated above and `run`, `undo`, `redo`, `update`, `navigate`, `refetch`: for instance `select(start, end)` (here `select({ start, end, allDay })`), `gotoDate(d)` (`update({ date: Temporal.PlainDate.from(d) })`), `addEvent(e)` (`run({ type: 'event.create', event })`), `getEventById`, `getEvents` (`kernel.store.snapshot`), `setOption(k, v)` (`update({ … })`), `on` / `off` (use the callbacks). The [migration guide](https://plinthworks.github.io/dzcalendar/getting-started/migrating-from-fullcalendar/) lists the equivalents.

Other notes are reported without a comment in the code:

| Note | Meaning |
|---|---|
| `<module>: <name> has no equivalent (dropped)` | A named import of a plugin with no counterpart (for instance a plugin object); removed. |
| `@fullcalendar/core: <name> has no equivalent` | A named import from the core other than `Calendar` and the types above; left. |
| `<module>: import * as X — not migrated (import the names instead)` | A namespace import cannot be told apart safely; the file keeps it. |
| `@fullcalendar/angular: <name> — use <dz-calendar>'s CalendarController (inject it, or #cal then cal.controller)` | An Angular export other than `FullCalendarModule` (for instance a component class). |
| `<module>: not migrated — by hand, with @dzcalendar/react or @dzcalendar/vue (<guide>)` | Any other `@fullcalendar/*` import, such as the React or Vue wrappers: left, to move by hand to `@dzcalendar/react` or `@dzcalendar/vue` (the note links the migration guide). |
| `<full-calendar> <input>: nothing to do (dropped)` | An Angular input with no counterpart. |

## API

```text
migrateSource(text: string, fileName?: string): Promise<Edited>     // one TypeScript or JavaScript file; its inline Angular templates too
migrateTemplate(text: string, url?: string): Promise<Edited>        // one Angular template (.html)

interface Edited {
  readonly text: string;               // the rewritten text (the same when nothing changed)
  readonly notes: readonly string[];   // what needs a person, or was dropped
  readonly changed: boolean;
}
```

`fileName` (default `file.ts`) decides how a file is parsed (JavaScript is allowed). A text without `@fullcalendar/` (or without `full-calendar` for a template) comes back as it is, with `changed: false`. Both functions are what the command runs.

```ts
import { migrateSource, migrateTemplate } from '@dzcalendar/migrate';

const source = await migrateSource(
  `import { Calendar } from '@fullcalendar/core';\nconst calendar = new Calendar(document.body, { initialView: 'dayGridMonth' });\ncalendar.render();\ncalendar.next();\n`,
  'main.ts',
);
console.log(source.changed, source.notes.length);
console.log(source.text);

const template = await migrateTemplate('<full-calendar [options]="opts"></full-calendar>');
// <dz-calendar [dzFullCalendar]="opts"></dz-calendar>
console.log(template.text);
```

## Recipes

### Migrate one folder, review, then the rest

```bash
npx dz-migrate src/agenda          # the report only
npx dz-migrate src/agenda --write  # rewrite that folder
grep -rn "dz-migrate:" src         # what still needs a person
npx dz-migrate src --write         # the rest; already rewritten files are left as they are
```

### Run it in CI as a check

Without `--write` the command only reports; a file that fails to parse makes it exit with 1. Files that would still change do not: the exit code stays 0, so read the summary line to see what is left.

```bash
npx dz-migrate src
```

### After the rewrite

1. Swap the packages (see Quick start).
2. Read the `problems` that `createFromFullCalendar` returns once: each guess (`zone-guessed`) and each option with no equivalent (`compat-unsupported`). Give the zone as the third argument (`{ timeZone: 'Europe/Paris' }`) if your options name none.
3. Look for the `// dz-migrate:` comments and finish those calls by hand.

## Documentation

- [Migrating from FullCalendar](https://plinthworks.github.io/dzcalendar/getting-started/migrating-from-fullcalendar/)
- [Installation](https://plinthworks.github.io/dzcalendar/getting-started/installation/)
- [Angular](https://plinthworks.github.io/dzcalendar/getting-started/angular/), [React](https://plinthworks.github.io/dzcalendar/getting-started/react/), [Vue](https://plinthworks.github.io/dzcalendar/getting-started/vue/), [vanilla](https://plinthworks.github.io/dzcalendar/getting-started/vanilla/)

## License

MIT

---

## Français

`dz-migrate` : réécrit une application FullCalendar pour DzCalendar et marque ce qui demande une personne.

[English](#dzcalendarmigrate) · **Français**

### Ce que c'est

`dz-migrate` est un outil en ligne de commande (avec une petite API programmatique) qui lit les fichiers TypeScript, JavaScript et les gabarits Angular de votre application et réécrit ce qui utilise FullCalendar :

- **les imports et les plugins** : les imports `@fullcalendar/*` sont remplacés, les plugins intégrés disparaissent ;
- **`new Calendar(el, options)`** devient `createFromFullCalendar(el, options).calendar` (de `@dzcalendar/compat-fullcalendar`) ;
- **les appels courants sur le calendrier** (`next`, `prev`, `today`, `changeView`, `refetchEvents`, `unselect`, `destroy`, `render`) sont traduits ;
- **Angular** : `FullCalendarModule` et `<full-calendar [options]>`, dans les gabarits en ligne et dans les fichiers `.html` ;
- **ce qui demande une personne** est laissé en place et marqué d'un commentaire `// dz-migrate:` au-dessus de son instruction, et listé dans le rapport.

C'est un outil, jamais une dépendance de votre application : installez-le avec `-D`. Il lit le code avec `ts-morph` ; pour les gabarits Angular il utilise le compilateur d'Angular quand votre projet l'a (`@angular/compiler`, une dépendance homologue facultative), sinon une recherche par motif.

Le code réécrit tourne sur `@dzcalendar/compat-fullcalendar`, qui traduit à l'exécution votre objet d'options FullCalendar. `dz-migrate` ne change que votre code, jamais vos options.

### Installation

```bash
npm install -D @dzcalendar/migrate
```

### Démarrage rapide

```bash
# Voir ce qui changerait (rien n'est écrit)
npx dz-migrate src

# Réécrire les fichiers
npx dz-migrate src --write
```

Puis changez les paquets, comme le dit la dernière ligne du rapport :

```bash
npm install @dzcalendar/core @dzcalendar/dom @dzcalendar/theme @dzcalendar/compat-fullcalendar
npm uninstall @fullcalendar/core @fullcalendar/daygrid @fullcalendar/timegrid @fullcalendar/interaction
```

Le rapport nomme chaque fichier (`would change` ou `rewritten`, ou `notes` quand le fichier n'a que quelque chose pour une personne), les notes de chaque fichier, et un résumé :

```text
would change  src/main.ts
    · gotoDate() — see https://plinthworks.github.io/dzcalendar/getting-started/migrating-from-fullcalendar/

1 file(s) to rewrite (run again with --write), 1 note(s). Then: npm install @dzcalendar/compat-fullcalendar @dzcalendar/core @dzcalendar/dom @dzcalendar/theme, and remove @fullcalendar/*.
```

Les paquets de la dernière ligne sont les modules `@dzcalendar/*` que les fichiers réécrits importent, plus `core`, `dom` et `theme`. Le rapport est en anglais.

### La commande

```text
dz-migrate [chemins…] [--write]
dz-migrate --help
```

| Argument | Effet |
|---|---|
| `chemins…` | Fichiers ou dossiers à lire. Par défaut : `src`. Un chemin qui n'existe pas est ignoré. |
| `--write` | Écrit les fichiers réécrits. Sans lui, rien n'est écrit. |
| `--help`, `-h` | Affiche l'usage et s'arrête. |

- Il lit les fichiers en `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs` et `.html` (pas `.d.ts`), en sautant `node_modules`, `dist`, `.angular` et `.git`. Un fichier qui ne mentionne pas `@fullcalendar/` (ou `full-calendar` pour un gabarit) est laissé tel quel.
- Un fichier qui ne peut être ni lu ni analysé n'arrête pas les autres : il est rapporté `failed  <fichier>: <raison>` et le code de sortie est 1.
- Il est idempotent : le relancer sur sa propre sortie ne change plus rien, et ne répète pas ses notes `// dz-migrate:`.
- Le code de sortie est 0, ou 1 quand au moins un fichier a échoué.

### Ce qu'il réécrit

| Avant | Après |
|---|---|
| `import { Calendar } from '@fullcalendar/core'` | `import { createFromFullCalendar } from '@dzcalendar/compat-fullcalendar'` |
| `new Calendar(el, options)` | `createFromFullCalendar(el, options).calendar` |
| `new Calendar(el, options).render()`, `calendar.render()` | L'appel à `render()` est retiré : le calendrier est dessiné à sa création. |
| `Calendar` comme type (un champ, une variable) | `CalendarInstance`, de `@dzcalendar/dom` |
| `next()`, `prev()`, `today()` | `navigate('next')`, `navigate('prev')`, `navigate('today')` |
| `changeView(v)` (un argument) | `update({ view: v })` |
| `refetchEvents()` | `refetch()` |
| `unselect()` | `select(null)` |
| `destroy()` | `destroy()` |
| Types (`CalendarOptions`, `EventInput`, `EventSourceInput`, `EventApi`, `ViewApi`, `EventClickArg`, `DateClickArg`, `DateSelectArg`, `EventChangeArg`, `EventDropArg`, `EventResizeDoneArg`, `EventAddArg`, `EventRemoveArg`, `DatesSetArg`, `EventContentArg`, `EventMountArg`) | Les mêmes noms, importés de `@dzcalendar/compat-fullcalendar`. |
| `Draggable` de `@fullcalendar/interaction` | `Draggable` de `@dzcalendar/compat-fullcalendar`. |
| Plugins `@fullcalendar/daygrid`, `timegrid`, `interaction`, `icalendar`, `resource`, `resource-timegrid`, `resource-daygrid`, `scrollgrid`, `adaptive` | Retirés : intégrés. |
| `@fullcalendar/rrule` | `import '@dzcalendar/core/recurrence'` |
| `@fullcalendar/list` | `import '@dzcalendar/dom/list'` |
| `@fullcalendar/multimonth` | `import '@dzcalendar/dom/multimonth'` |
| `@fullcalendar/timeline`, `@fullcalendar/resource-timeline` | `import '@dzcalendar/pro'` |
| `plugins: [...]` et `locales: [...]` dans les options | Les entrées qui étaient des imports retirés sont enlevées ; la propriété aussi quand elle devient vide. |
| `@fullcalendar/core/locales/ar` (aussi `es`, `de`) | `import '@dzcalendar/dom/locales/ar'` (et ainsi de suite) ; `locale: arLocale` devient `locale: 'ar'`. L'anglais et le français sont intégrés : leur import est simplement retiré. |
| `@fullcalendar/core/locales-all` | Les imports arabe, espagnol et allemand, avec une note ; autres langues : `defineLocale`. |
| Angular `FullCalendarModule` (dans `imports: [...]`) | `DZ_CALENDAR, DzFullCalendar`, importés de `@dzcalendar/angular` et `@dzcalendar/angular/fullcalendar`. |
| `<full-calendar [options]="o">…</full-calendar>` | `<dz-calendar [dzFullCalendar]="o">…</dz-calendar>` ; les entrées `deepChangeDetection` et `customRenderingMetaMap` sont retirées, avec une note. |

Les instances de calendrier sont retrouvées en suivant `new Calendar(...)` : un `const`, un champ de classe, ou `this.x = new Calendar(...)`.

#### Marqué pour une personne

Un appel dont la forme change, ou qui n'a pas de traduction directe, est laissé tel quel avec un commentaire au-dessus de son instruction :

```text
// dz-migrate: gotoDate() — see https://plinthworks.github.io/dzcalendar/getting-started/migrating-from-fullcalendar/
calendar.gotoDate('2026-10-21');
```

Les appels marqués ainsi sont les méthodes appelées sur une instance de calendrier connue autres que celles traduites ci-dessus et `run`, `undo`, `redo`, `update`, `navigate`, `refetch` : par exemple `select(start, end)` (ici `select({ start, end, allDay })`), `gotoDate(d)` (`update({ date: Temporal.PlainDate.from(d) })`), `addEvent(e)` (`run({ type: 'event.create', event })`), `getEventById`, `getEvents` (`kernel.store.snapshot`), `setOption(k, v)` (`update({ … })`), `on` / `off` (utilisez les callbacks). Le [guide de migration](https://plinthworks.github.io/dzcalendar/fr/getting-started/migrating-from-fullcalendar/) donne les équivalents.

D'autres notes sont rapportées sans commentaire dans le code :

| Note | Sens |
|---|---|
| `<module>: <nom> has no equivalent (dropped)` | Un import nommé d'un plugin sans équivalent (par exemple un objet plugin) ; retiré. |
| `@fullcalendar/core: <nom> has no equivalent` | Un import nommé du cœur autre que `Calendar` et les types ci-dessus ; laissé. |
| `<module>: import * as X — not migrated (import the names instead)` | Un import d'espace de noms ne peut pas être démêlé sans risque ; le fichier le garde. |
| `@fullcalendar/angular: <nom> — use <dz-calendar>'s CalendarController (inject it, or #cal then cal.controller)` | Un export d'Angular autre que `FullCalendarModule` (par exemple une classe de composant). |
| `<module>: not migrated — by hand, with @dzcalendar/react or @dzcalendar/vue (<guide>)` | Tout autre import `@fullcalendar/*`, comme les enveloppes React ou Vue : laissé, à passer à la main à `@dzcalendar/react` ou `@dzcalendar/vue` (la note donne le lien du guide de migration). |
| `<full-calendar> <entrée>: nothing to do (dropped)` | Une entrée Angular sans équivalent. |

### API

```text
migrateSource(text: string, fileName?: string): Promise<Edited>     // un fichier TypeScript ou JavaScript ; ses gabarits Angular en ligne aussi
migrateTemplate(text: string, url?: string): Promise<Edited>        // un gabarit Angular (.html)

interface Edited {
  readonly text: string;               // le texte réécrit (le même quand rien n'a changé)
  readonly notes: readonly string[];   // ce qui demande une personne, ou a été retiré
  readonly changed: boolean;
}
```

`fileName` (`file.ts` par défaut) décide de la façon d'analyser un fichier (le JavaScript est permis). Un texte sans `@fullcalendar/` (ou sans `full-calendar` pour un gabarit) revient tel quel, avec `changed: false`. Les deux fonctions sont ce que la commande exécute.

```ts
import { migrateSource, migrateTemplate } from '@dzcalendar/migrate';

const source = await migrateSource(
  `import { Calendar } from '@fullcalendar/core';\nconst calendar = new Calendar(document.body, { initialView: 'dayGridMonth' });\ncalendar.render();\ncalendar.next();\n`,
  'main.ts',
);
console.log(source.changed, source.notes.length);
console.log(source.text);

const template = await migrateTemplate('<full-calendar [options]="opts"></full-calendar>');
// <dz-calendar [dzFullCalendar]="opts"></dz-calendar>
console.log(template.text);
```

### Recettes

#### Migrer un dossier, relire, puis le reste

```bash
npx dz-migrate src/agenda          # le rapport seul
npx dz-migrate src/agenda --write  # réécrit ce dossier
grep -rn "dz-migrate:" src         # ce qui demande encore une personne
npx dz-migrate src --write         # le reste ; les fichiers déjà réécrits sont laissés tels quels
```

#### Le lancer en CI comme vérification

Sans `--write` la commande ne fait que rapporter ; un fichier qui ne s'analyse pas la fait sortir avec 1. Les fichiers qui changeraient encore, non : le code de sortie reste 0, lisez la ligne de résumé pour voir ce qui reste.

```bash
npx dz-migrate src
```

#### Après la réécriture

1. Changez les paquets (voir Démarrage rapide).
2. Lisez une fois les `problems` que renvoie `createFromFullCalendar` : chaque supposition (`zone-guessed`) et chaque option sans équivalent (`compat-unsupported`). Donnez le fuseau en troisième argument (`{ timeZone: 'Europe/Paris' }`) si vos options n'en nomment aucun.
3. Cherchez les commentaires `// dz-migrate:` et terminez ces appels à la main.

### Documentation

- [Migrer depuis FullCalendar](https://plinthworks.github.io/dzcalendar/fr/getting-started/migrating-from-fullcalendar/)
- [Installation](https://plinthworks.github.io/dzcalendar/fr/getting-started/installation/)
- [Angular](https://plinthworks.github.io/dzcalendar/fr/getting-started/angular/), [React](https://plinthworks.github.io/dzcalendar/fr/getting-started/react/), [Vue](https://plinthworks.github.io/dzcalendar/fr/getting-started/vue/), [vanilla](https://plinthworks.github.io/dzcalendar/fr/getting-started/vanilla/)

### Licence

MIT
