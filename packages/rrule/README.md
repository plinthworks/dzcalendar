# @dzcalendar/rrule

RFC 5545 recurrence rules on Temporal: wall-clock days across clock changes, elapsed-time hours. No event model.

**English** · [Français](#français)

## What it is

`@dzcalendar/rrule` reads, writes, expands and edits RFC 5545 `RRULE`s (plus `EXDATE` and `RDATE`) on Temporal values. A daily or slower rule keeps its wall time across a clock change (09:00 stays 09:00 when the clocks move); an hourly or finer rule steps in elapsed time. It has no event model: dates and moments in, dates and moments out. It is the engine behind `@dzcalendar/core`'s repeating events, and usable alone.

## Install

```bash
npm install @dzcalendar/rrule @tzslot/core
```

`@tzslot/core` (`^2.3.0`) is a dependency: Temporal comes from its `/lazy` entry (native where the platform has it, a polyfill loaded on demand otherwise). Your own code should take Temporal from there too, so the whole application shares one set of classes.

## Quick start

```ts
import { Temporal, loadTemporal } from '@tzslot/core/lazy';
import { expandZoned, parseRRule } from '@dzcalendar/rrule';

// Native Temporal: instant. Otherwise this fetches the polyfill once.
await loadTemporal();

const parsed = parseRRule('FREQ=DAILY');
if (!parsed.ok) throw new Error(parsed.problem.detail);

// Every day at 09:00 in Paris, across the end of summer time (Sunday 25 October 2026).
const start = Temporal.ZonedDateTime.from('2026-10-24T09:00:00+02:00[Europe/Paris]');
const { starts, problems } = expandZoned(
  start,
  { rules: [parsed.rule], exdates: [], rdates: [] },
  { from: Temporal.Instant.from('2026-10-24T00:00:00Z'), to: Temporal.Instant.from('2026-10-27T00:00:00Z') },
);

console.log(problems.length); // 0
console.log(starts.map((z) => z.toString()));
// [
//   '2026-10-24T09:00:00+02:00[Europe/Paris]',
//   '2026-10-25T09:00:00+01:00[Europe/Paris]', // still 09:00 on the wall
//   '2026-10-26T09:00:00+01:00[Europe/Paris]',
// ]
```

An hourly rule, by contrast, counts elapsed hours, so the repeated hour of the autumn change is visited twice:

```ts
import { Temporal, loadTemporal } from '@tzslot/core/lazy';
import { iterateZoned, parseRRule } from '@dzcalendar/rrule';

await loadTemporal();

const parsed = parseRRule('FREQ=HOURLY;COUNT=5');
if (!parsed.ok) throw new Error(parsed.problem.detail);

const start = Temporal.ZonedDateTime.from('2026-10-25T00:00:00+02:00[Europe/Paris]');
console.log([...iterateZoned(start, parsed.rule)].map((z) => z.toString()));
// 00:00+02:00, 01:00+02:00, 02:00+02:00, 02:00+01:00, 03:00+01:00
```

## API

Everything is exported from the single entry `@dzcalendar/rrule`.

### Reading and writing a rule

| Export | What it does |
| --- | --- |
| `parseRRule(text): ParseRRule` | Reads `FREQ=WEEKLY;BYDAY=MO,WE;COUNT=10`, with or without a leading `RRULE:`. Never throws: the result is `{ ok: true, rule }` or `{ ok: false, problem }`, the problem naming the part at fault. |
| `serializeRRule(rule): string` | The rule back as text, parts in a fixed order, so equal rules print equal. |

`parseRRule` rejects: an empty rule, a part that is not `NAME=VALUE`, a part given twice, an unknown `FREQ`, out-of-range values, `COUNT` together with `UNTIL`, `BYWEEKNO` without `FREQ=YEARLY`, `BYYEARDAY` with a daily, weekly or monthly rule, `BYMONTHDAY` with a weekly rule, `BYDAY` ordinals (`2TU`, `-1FR`) outside monthly and yearly rules, and unsupported parts (`RSCALE`, `SKIP`, ...). `UNTIL` is a date (`20261231`) or a UTC date-time (`20261231T235959Z`).

### Expanding

| Export | What it does |
| --- | --- |
| `expandZoned(start, set, window, limit?)` | The starts of a timed series inside a window: its rules merged in order, plus `rdates`, minus `exdates`. Returns an `ExpandResult` of `ZonedDateTime`. `limit` defaults to 10 000. |
| `expandDates(start, set, window, limit?)` | The same for an all-day series: `PlainDate` in, `PlainDate` out. |
| `lastStart(start, set)` | The last start a series can have, or `null` when it never ends. What the store indexes a series by. A `COUNT` too large to walk (over 50 000) counts as endless. |
| `firstStart(start, set)` | The first start: the start itself, or an earlier `RDATE`. |
| `iterateZoned(start, rule, from?, state?)` | Generator over one timed rule's occurrences in order, as `ZonedDateTime` in the start's zone. `from` is a hint: earlier occurrences are counted, not built. `state.cut` is set when the generator gave up on its step budget. |
| `iterateDates(start, rule, fromDay?)` | Generator over one all-day rule's dates. Times in the rule are ignored. |

An `EXDATE` instant removes that moment; an `EXDATE` date removes every occurrence on that date in the series' zone. An `RDATE` date on a timed series takes the start's time of day. Window `to` is exclusive; occurrences starting before `from` are skipped (the caller widens the window by the event's duration to catch overlaps).

### Editing a series

| Export | What it does |
| --- | --- |
| `rebaseRule(rule, oldStart, newStart)` | The rule that repeats the same way around a moved occurrence: "the second Tuesday" moved to the third Thursday becomes "the third Thursday". `COUNT` and `UNTIL` are untouched. |
| `splitRule(rule, start, cut)` | Cuts a rule at the occurrence starting at `cut`: `{ before, after }`. `COUNT` is shared; `UNTIL` bounds the first part. Either side is `null` when empty. |
| `countBefore(rule, start, cut)` | `{ count, last }`: how many starts come strictly before `cut`, and the last of them. |
| `explicitRule(rule, dtstart)` | `{ rule, added }`: the rule with what it took from `DTSTART` written out, `added` listing the parts. |
| `implicitRule(rule, dtstart, added)` | Takes back what `explicitRule` wrote, where the new start would imply the same. |
| `iterateUnion(start, set)` | Every start of a set, rules merged, `RDATE`s included, `EXDATE`s not removed, each once, in order. |
| `indexOfStart(start, set, at, budget?)` | Position of `at` in the set (0 = first), or `-1`. Walks at most `budget` (50 000) starts. |
| `nthStart(start, set, n)` | The n-th start (0 = first), or `null`. |

### Types

```text
RRule        { freq, interval, count?, until?, bySecond?, byMinute?, byHour?, byDay?,
               byMonthDay?, byYearDay?, byWeekNo?, byMonth?, bySetPos?, wkst }
RRuleSet     { rules: RRule[], exdates: (Instant | PlainDate)[], rdates: (ZonedDateTime | PlainDate)[] }
ByDay        { weekday: Weekday, n?: number }     // n = 2 is "the second", -1 "the last"
Frequency    'YEARLY' | 'MONTHLY' | 'WEEKLY' | 'DAILY' | 'HOURLY' | 'MINUTELY' | 'SECONDLY'
Weekday      1 (Monday) ... 7 (Sunday)
ParseRRule   { ok: true, rule: RRule } | { ok: false, problem: RRuleProblem }
ExpandWindow { from: Instant | PlainDate, to: Instant | PlainDate }   // to is exclusive
ExpandResult<T> { starts: T[], problems: RRuleProblem[] }
ImplicitPart 'byDay' | 'byMonthDay' | 'byMonth' | 'byHour' | 'byMinute' | 'bySecond'
RRuleProblem { code: RRuleProblemCode, detail: string }
```

`interval` defaults to 1 and `wkst` to 1 (Monday). `until` keeps the kind of value it was given: a date for all-day series, an instant otherwise.

## Problems

Bad input never throws; it becomes a problem with a `code` and a `detail`.

| Code | Where | Meaning |
| --- | --- | --- |
| `invalid-rrule` | `parseRRule` | The text is not a rule this package reads; `detail` names the part. |
| `too-many-occurrences` | `expandZoned`, `expandDates` | `limit` cut the list short, or (timed series) the rule needs too many steps to reach the window. |

## Notes on Temporal

Temporal comes only from `@tzslot/core/lazy`. Where the platform has no native Temporal, call `await loadTemporal()` once before using this package (nothing here reads Temporal at import time). Compare Temporal values with `.toString()`, not with `toEqual`.

## Documentation

- [Recurrence guide](https://plinthworks.github.io/dzcalendar/guides/recurrence/)
- [Time zones guide](https://plinthworks.github.io/dzcalendar/guides/time-zones/)
- [Documentation home](https://plinthworks.github.io/dzcalendar/)

## License

MIT

---

## Français

Règles de récurrence RFC 5545 sur Temporal : jours à l'heure murale à travers les changements d'heure, heures en temps écoulé. Pas de modèle d'événement.

**[English](#dzcalendarrrule)** · Français

### Présentation

`@dzcalendar/rrule` lit, écrit, développe et édite les `RRULE` RFC 5545 (avec `EXDATE` et `RDATE`) sur des valeurs Temporal. Une règle quotidienne ou plus lente garde son heure murale à travers un changement d'heure (09:00 reste 09:00 quand les horloges bougent) ; une règle à l'heure (`HOURLY`) ou plus fine avance en temps écoulé. Il n'a pas de modèle d'événement : des dates et des instants en entrée, des dates et des instants en sortie. C'est le moteur des événements récurrents de `@dzcalendar/core`, et il s'utilise seul.

### Installation

```bash
npm install @dzcalendar/rrule @tzslot/core
```

`@tzslot/core` (`^2.3.0`) est une dépendance : Temporal vient de son entrée `/lazy` (natif quand la plateforme l'a, sinon un polyfill chargé à la demande). Prenez Temporal au même endroit dans votre code, pour que toute l'application partage un seul jeu de classes.

### Démarrage rapide

```ts
import { Temporal, loadTemporal } from '@tzslot/core/lazy';
import { expandZoned, parseRRule } from '@dzcalendar/rrule';

// Temporal natif : instantané. Sinon, charge le polyfill une fois.
await loadTemporal();

const parsed = parseRRule('FREQ=DAILY');
if (!parsed.ok) throw new Error(parsed.problem.detail);

// Chaque jour à 09:00 à Paris, à la fin de l'heure d'été (dimanche 25 octobre 2026).
const start = Temporal.ZonedDateTime.from('2026-10-24T09:00:00+02:00[Europe/Paris]');
const { starts, problems } = expandZoned(
  start,
  { rules: [parsed.rule], exdates: [], rdates: [] },
  { from: Temporal.Instant.from('2026-10-24T00:00:00Z'), to: Temporal.Instant.from('2026-10-27T00:00:00Z') },
);

console.log(problems.length); // 0
console.log(starts.map((z) => z.toString()));
// [
//   '2026-10-24T09:00:00+02:00[Europe/Paris]',
//   '2026-10-25T09:00:00+01:00[Europe/Paris]', // toujours 09:00 au mur
//   '2026-10-26T09:00:00+01:00[Europe/Paris]',
// ]
```

Une règle à l'heure (`HOURLY`), au contraire, compte des heures écoulées : l'heure répétée du changement d'automne est donc visitée deux fois :

```ts
import { Temporal, loadTemporal } from '@tzslot/core/lazy';
import { iterateZoned, parseRRule } from '@dzcalendar/rrule';

await loadTemporal();

const parsed = parseRRule('FREQ=HOURLY;COUNT=5');
if (!parsed.ok) throw new Error(parsed.problem.detail);

const start = Temporal.ZonedDateTime.from('2026-10-25T00:00:00+02:00[Europe/Paris]');
console.log([...iterateZoned(start, parsed.rule)].map((z) => z.toString()));
// 00:00+02:00, 01:00+02:00, 02:00+02:00, 02:00+01:00, 03:00+01:00
```

### API

Tout est exporté par l'entrée unique `@dzcalendar/rrule`.

#### Lire et écrire une règle

| Export | Rôle |
| --- | --- |
| `parseRRule(text): ParseRRule` | Lit `FREQ=WEEKLY;BYDAY=MO,WE;COUNT=10`, avec ou sans `RRULE:` en tête. Ne lève jamais : le résultat est `{ ok: true, rule }` ou `{ ok: false, problem }`, le problème nommant la partie fautive. |
| `serializeRRule(rule): string` | La règle en texte, parties dans un ordre fixe : deux règles égales s'impriment pareil. |

`parseRRule` refuse : une règle vide, une partie qui n'est pas `NOM=VALEUR`, une partie donnée deux fois, un `FREQ` inconnu, des valeurs hors bornes, `COUNT` avec `UNTIL`, `BYWEEKNO` sans `FREQ=YEARLY`, `BYYEARDAY` avec une règle quotidienne, hebdomadaire ou mensuelle, `BYMONTHDAY` avec une règle hebdomadaire, des rangs de `BYDAY` (`2TU`, `-1FR`) hors règles mensuelles et annuelles, et les parties non prises en charge (`RSCALE`, `SKIP`, ...). `UNTIL` est une date (`20261231`) ou une date-heure UTC (`20261231T235959Z`).

#### Développer

| Export | Rôle |
| --- | --- |
| `expandZoned(start, set, window, limit?)` | Les débuts d'une série horaire dans une fenêtre : ses règles fusionnées dans l'ordre, plus les `rdates`, moins les `exdates`. Renvoie un `ExpandResult` de `ZonedDateTime`. `limit` vaut 10 000 par défaut. |
| `expandDates(start, set, window, limit?)` | La même chose pour une série sur la journée : `PlainDate` en entrée, `PlainDate` en sortie. |
| `lastStart(start, set)` | Le dernier début possible d'une série, ou `null` si elle ne finit jamais. C'est ce par quoi le store indexe une série. Un `COUNT` trop grand pour être parcouru (plus de 50 000) compte comme sans fin. |
| `firstStart(start, set)` | Le premier début : le début lui-même, ou un `RDATE` antérieur. |
| `iterateZoned(start, rule, from?, state?)` | Générateur des occurrences d'une règle de série horaire, dans l'ordre, en `ZonedDateTime` dans le fuseau du début. `from` est un indice : les occurrences antérieures sont comptées, pas construites. `state.cut` est mis quand le générateur a abandonné faute de pas. |
| `iterateDates(start, rule, fromDay?)` | Générateur des dates d'une règle sur la journée. Les heures de la règle sont ignorées. |

Un `EXDATE` instant retire ce moment ; un `EXDATE` date retire toute occurrence de cette date dans le fuseau de la série. Un `RDATE` date sur une série horaire prend l'heure du début. Le `to` de la fenêtre est exclu ; les occurrences qui commencent avant `from` sont ignorées (à l'appelant d'élargir la fenêtre de la durée de l'événement pour attraper les chevauchements).

#### Éditer une série

| Export | Rôle |
| --- | --- |
| `rebaseRule(rule, oldStart, newStart)` | La règle qui se répète de la même façon autour d'une occurrence déplacée : « le deuxième mardi » déplacé au troisième jeudi devient « le troisième jeudi ». `COUNT` et `UNTIL` ne sont pas touchés. |
| `splitRule(rule, start, cut)` | Coupe une règle à l'occurrence qui commence à `cut` : `{ before, after }`. `COUNT` est partagé ; `UNTIL` borne la première partie. Un côté vaut `null` s'il est vide. |
| `countBefore(rule, start, cut)` | `{ count, last }` : combien de débuts précèdent strictement `cut`, et le dernier d'entre eux. |
| `explicitRule(rule, dtstart)` | `{ rule, added }` : la règle avec ce qu'elle tenait de `DTSTART` écrit en toutes lettres, `added` listant les parties. |
| `implicitRule(rule, dtstart, added)` | Reprend ce que `explicitRule` a écrit, là où le nouveau début l'impliquerait aussi. |
| `iterateUnion(start, set)` | Tous les débuts d'un ensemble, règles fusionnées, `RDATE` inclus, `EXDATE` non retirés, chacun une fois, dans l'ordre. |
| `indexOfStart(start, set, at, budget?)` | Position de `at` dans l'ensemble (0 = premier), ou `-1`. Parcourt au plus `budget` (50 000) débuts. |
| `nthStart(start, set, n)` | Le n-ième début (0 = premier), ou `null`. |

#### Types

```text
RRule        { freq, interval, count?, until?, bySecond?, byMinute?, byHour?, byDay?,
               byMonthDay?, byYearDay?, byWeekNo?, byMonth?, bySetPos?, wkst }
RRuleSet     { rules: RRule[], exdates: (Instant | PlainDate)[], rdates: (ZonedDateTime | PlainDate)[] }
ByDay        { weekday: Weekday, n?: number }     // n = 2 : « le deuxième », -1 : « le dernier »
Frequency    'YEARLY' | 'MONTHLY' | 'WEEKLY' | 'DAILY' | 'HOURLY' | 'MINUTELY' | 'SECONDLY'
Weekday      1 (lundi) ... 7 (dimanche)
ParseRRule   { ok: true, rule: RRule } | { ok: false, problem: RRuleProblem }
ExpandWindow { from: Instant | PlainDate, to: Instant | PlainDate }   // to est exclu
ExpandResult<T> { starts: T[], problems: RRuleProblem[] }
ImplicitPart 'byDay' | 'byMonthDay' | 'byMonth' | 'byHour' | 'byMinute' | 'bySecond'
RRuleProblem { code: RRuleProblemCode, detail: string }
```

`interval` vaut 1 par défaut et `wkst` 1 (lundi). `until` garde le genre de valeur reçu : une date pour une série sur la journée, un instant sinon.

### Problèmes

Une mauvaise entrée ne lève jamais : elle devient un problème avec un `code` et un `detail`.

| Code | Où | Sens |
| --- | --- | --- |
| `invalid-rrule` | `parseRRule` | Le texte n'est pas une règle que ce paquet lit ; `detail` nomme la partie. |
| `too-many-occurrences` | `expandZoned`, `expandDates` | `limit` a coupé la liste, ou (série horaire) la règle demande trop de pas pour atteindre la fenêtre. |

### Notes sur Temporal

Temporal vient uniquement de `@tzslot/core/lazy`. Là où la plateforme n'a pas de Temporal natif, appelez `await loadTemporal()` une fois avant d'utiliser ce paquet (rien ici ne lit Temporal à l'import). Comparez les valeurs Temporal avec `.toString()`, pas avec `toEqual`.

### Documentation

- [Guide de la récurrence](https://plinthworks.github.io/dzcalendar/fr/guides/recurrence/)
- [Guide des fuseaux horaires](https://plinthworks.github.io/dzcalendar/fr/guides/time-zones/)
- [Accueil de la documentation](https://plinthworks.github.io/dzcalendar/fr/)

### Licence

MIT
