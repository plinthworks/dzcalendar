# @dzcalendar/slots

Bookable slots for DzCalendar: weekly hours and exceptions in the provider's zone, minus what is busy, with buffers, notice, horizon and a daily cap. Pure, browser and Node.

**English** · [Français](#français)

## What it is

`@dzcalendar/slots` answers one question: when can this provider be booked? You describe the provider's opening hours in the provider's own time zone (weekly windows, dated exceptions, RFC 5545 rules), give it what is already busy, and it cuts the free time into slots. The engine never reads a clock and never throws; the page and the server run the same query and get the same answer, so a server can refuse a booking the page would not have offered (`checkSlot`).

## Install

```bash
npm install @dzcalendar/slots @dzcalendar/core @dzcalendar/rrule
```

`@dzcalendar/core` and `@dzcalendar/rrule` are dependencies (pinned to the same version). Temporal comes from `@dzcalendar/core`, itself fed by `@tzslot/core/lazy`.

## Quick start

```ts
import { loadTemporal } from '@dzcalendar/core';
import { checkSlot, findSlots } from '@dzcalendar/slots';
import type { Weekday } from '@dzcalendar/core';

// Native Temporal: instant. Otherwise this fetches the polyfill once.
await loadTemporal();

const Riyadh = 'Asia/Riyadh';
// Wednesdays 08:00-12:00 in Riyadh (UTC+03:00), 30-minute slots, one booking already at 09:00.
const rules = {
  availability: { timeZone: Riyadh, weekly: [{ days: [3] as Weekday[], from: '08:00', to: '12:00' }] },
  duration: 30,
  busy: [{ start: '2026-10-21T09:00+03:00[Asia/Riyadh]', end: '2026-10-21T09:30+03:00[Asia/Riyadh]' }],
};

// The page: the slots of Wednesday 21 October 2026.
const { slots, problems } = findSlots({ ...rules, from: '2026-10-21T00:00+03:00[Asia/Riyadh]', to: '2026-10-22T00:00+03:00[Asia/Riyadh]' });
console.log(problems.length); // 0
console.log(slots.map((s) => s.start.toPlainTime().toString({ smallestUnit: 'minute' })));
// ['08:00', '08:30', '09:30', '10:00', '10:30', '11:00', '11:30']  (09:00 is taken)

// A client in Paris (UTC+02:00 on that day) sees the first slot at 07:00.
console.log(slots[0]!.start.withTimeZone('Europe/Paris').toString());
// '2026-10-21T07:00:00+02:00[Europe/Paris]'

// The server, before saving: the same rules, no range needed.
console.log(checkSlot(rules, slots[0]!.start).ok); // true
console.log(checkSlot(rules, '2026-10-21T09:00+03:00[Asia/Riyadh]')); // { ok: false, reason: 'busy' }
```

## API

Everything is exported from the single entry `@dzcalendar/slots`.

### Functions

| Export | What it does |
| --- | --- |
| `findSlots(query: SlotQuery): { slots: Slot[]; problems: Problem[] }` | The bookable slots between `from` and `to`: the openings of the provider's week, rules and exceptions, cut into slots of `duration`, minus what is busy (with buffers), too soon (`minNotice`), too far (`maxAdvanceDays`) or on a full date (`maxPerDay`). Never throws; bad input is in `problems`. At most 10 000 slots, and 200 000 starts examined: past that it stops with a `too-many-occurrences` warning. |
| `checkSlot(query: CheckQuery, start: Moment): SlotCheck` | Whether `start` is one of the slots `findSlots` would offer. What a server asks before saving a booking. Without `from`/`to` the range is the slot itself. |
| `openSpans(availability, from, to, problems): MsSpan[]` | The provider's open time for windows opening on dates `from` (inclusive) to `to` (exclusive), as sorted, merged epoch-millisecond spans `{ s, e }`. An exception replaces every window opening on its date. Problems are pushed onto the array you pass. |
| `busyFromEvents(events, zone): Busy[]` | Turns calendar events (`CalEvent` or store `EventInstance`, from `@dzcalendar/core`) into busy time: those with `busy` (default unless cancelled). A timed event is a booking; an all-day one is a `block` of its whole dates in `zone`. |
| `readMoment(value): Instant \| null` | Reads a `Moment` (an `Instant`, a `ZonedDateTime` or an ISO string) as an `Instant`, or `null` when it cannot be read. (Exported under this name; it is the engine's own reader.) |

### The query

`SlotQuery` (and `CheckQuery`, the same with `from` and `to` optional):

| Field | Meaning |
| --- | --- |
| `availability` | `Availability`, see below. |
| `from`, `to` | `Moment`. The slots wanted start at or after `from` and end at or before `to`. |
| `duration` | Minutes of real (elapsed) time, from 1 to 525 600. |
| `step` | Minutes between two slot starts, counted from each opening. Default: the duration. |
| `bufferBefore`, `bufferAfter` | Minutes kept free before and after each appointment. A booking keeps its own buffers, so two appointments are `bufferAfter + bufferBefore` apart. |
| `minNotice` | No slot starting sooner than this many minutes after `now`. |
| `maxAdvanceDays` | No slot starting later than this many days after `now` (a whole number). |
| `now` | A `Moment`. Required by `minNotice` and `maxAdvanceDays`: the engine never reads a clock. |
| `maxPerDay` | At most this many bookings starting on one of the provider's dates; a full date offers nothing. |
| `busy` | `Busy[]`, see below. |

### Availability

```text
Availability  { timeZone: ZoneId, weekly?: WeeklyWindow[], exceptions?: DateException[], rules?: RuleWindow[] }
Window        { from: WallTime, to: WallTime }      // wall times of the provider's zone; an end at or before the start crosses midnight; '24:00' as an end is the next midnight
WeeklyWindow  Window & { days: Weekday[] }          // ISO weekdays, 1 Monday ... 7 Sunday
DateException { date: PlainDate | string, closed?: boolean, windows?: Window[] }   // replaces every window that starts on that date, weekly and rules alike
RuleWindow    Window & { rrule: string, start: PlainDate | string, exdates?: (PlainDate | string)[] }   // an RFC 5545 rule, e.g. 'FREQ=MONTHLY;BYDAY=1SA', from its first date `start`
WallTime      PlainTime | string                    // '08:30'
Moment        Instant | ZonedDateTime | string      // '2026-10-21T08:00Z' or '...[Asia/Riyadh]'
Busy          { start: Moment, end: Moment, kind?: 'booking' | 'block' }
```

A `booking` (the default) is an appointment: it gets the same buffers as a new slot and counts toward the daily cap. A `block` (leave, a meeting in another agenda) only takes its time. Wall times are resolved in the provider's zone, so a window across a clock change has its real length: a start in a skipped hour opens when the hour ends, and a closing time the clocks skip closes when they jump. Slots are counted in elapsed minutes from each opening's start (an opening open for days on end uses a fixed grid, multiples of the step since the epoch).

### Results

```text
Slot       { start: ZonedDateTime, end: ZonedDateTime }     // in the provider's zone; .withTimeZone(client) shows it in another
SlotCheck  { ok: true, slot: Slot } | { ok: false, reason: SlotRefusal, problems?: Problem[] }
SlotRefusal 'invalid-query' | 'closed' | 'misaligned' | 'busy' | 'notice' | 'advance' | 'daily-cap' | 'out-of-range'
```

| Refusal | Meaning |
| --- | --- |
| `invalid-query` | The query or the start cannot be read; `problems` says why. |
| `out-of-range` | The slot is not within `from`..`to`. |
| `closed` | No opening holds the whole slot. |
| `misaligned` | The start is off the opening's grid (not a multiple of `step` from its start). |
| `busy` | It touches busy time, buffers included. |
| `notice` | Sooner than `minNotice`. |
| `advance` | Later than `maxAdvanceDays`. |
| `daily-cap` | The date already holds `maxPerDay` bookings. |

## Problems

Bad input never throws; it becomes a `Problem` (`{ code, severity, path, detail? }`, from `@dzcalendar/core`).

| Code | Severity | Meaning |
| --- | --- | --- |
| `invalid-slot-query` | error | The query is unreadable: a bad `duration`, `step`, buffer, `minNotice`, `maxAdvanceDays`, `maxPerDay`, `from`, `to`, `now`, or a `busy` that is not an array; `minNotice` or `maxAdvanceDays` without `now`. As a warning: an unreadable `busy` entry (skipped). |
| `unknown-zone` | error | `availability.timeZone` is not a known zone (path `availability.timeZone`). |
| `invalid-availability` | warning | A window, date or `days` list that cannot be read (skipped); `path` points at it, e.g. `availability.weekly[0]`. |
| `invalid-rrule` | warning | A rule's `rrule` text cannot be read. |
| `too-many-occurrences` | warning | A rule expanded past its limit, or the slot search hit its cap: narrow the range. |

## Notes on Temporal

Temporal comes from `@dzcalendar/core` (which takes it from `@tzslot/core/lazy`). Where the platform has no native Temporal, `await loadTemporal()` (exported by `@dzcalendar/core`) before the first query. Slots are `ZonedDateTime` in the provider's zone; compare them with `.toString()`.

## Documentation

- [Available slots option](https://plinthworks.github.io/dzcalendar/options/available-slots/)
- [Time zones guide](https://plinthworks.github.io/dzcalendar/guides/time-zones/)
- [Recurrence guide](https://plinthworks.github.io/dzcalendar/guides/recurrence/)
- [Documentation home](https://plinthworks.github.io/dzcalendar/)

## License

MIT

---

## Français

Créneaux réservables pour DzCalendar : horaires hebdomadaires et exceptions dans le fuseau du prestataire, moins ce qui est occupé, avec marges, préavis, horizon et plafond quotidien. Pur, navigateur et Node.

**[English](#dzcalendarslots)** · Français

### Présentation

`@dzcalendar/slots` répond à une seule question : quand ce prestataire est-il réservable ? Vous décrivez ses horaires d'ouverture dans son propre fuseau (fenêtres hebdomadaires, exceptions datées, règles RFC 5545), vous donnez ce qui est déjà occupé, et il découpe le temps libre en créneaux. Le moteur ne lit jamais l'horloge et ne lève jamais d'exception ; la page et le serveur exécutent la même requête et obtiennent la même réponse, si bien qu'un serveur peut refuser une réservation que la page n'aurait pas proposée (`checkSlot`).

### Installation

```bash
npm install @dzcalendar/slots @dzcalendar/core @dzcalendar/rrule
```

`@dzcalendar/core` et `@dzcalendar/rrule` sont des dépendances (à la même version). Temporal vient de `@dzcalendar/core`, lui-même alimenté par `@tzslot/core/lazy`.

### Démarrage rapide

```ts
import { loadTemporal } from '@dzcalendar/core';
import { checkSlot, findSlots } from '@dzcalendar/slots';
import type { Weekday } from '@dzcalendar/core';

// Temporal natif : instantané. Sinon, charge le polyfill une fois.
await loadTemporal();

const Riyadh = 'Asia/Riyadh';
// Les mercredis de 08:00 à 12:00 à Riyad (UTC+03:00), créneaux de 30 minutes, une réservation déjà prise à 09:00.
const rules = {
  availability: { timeZone: Riyadh, weekly: [{ days: [3] as Weekday[], from: '08:00', to: '12:00' }] },
  duration: 30,
  busy: [{ start: '2026-10-21T09:00+03:00[Asia/Riyadh]', end: '2026-10-21T09:30+03:00[Asia/Riyadh]' }],
};

// La page : les créneaux du mercredi 21 octobre 2026.
const { slots, problems } = findSlots({ ...rules, from: '2026-10-21T00:00+03:00[Asia/Riyadh]', to: '2026-10-22T00:00+03:00[Asia/Riyadh]' });
console.log(problems.length); // 0
console.log(slots.map((s) => s.start.toPlainTime().toString({ smallestUnit: 'minute' })));
// ['08:00', '08:30', '09:30', '10:00', '10:30', '11:00', '11:30']  (09:00 est pris)

// Un client à Paris (UTC+02:00 ce jour-là) voit le premier créneau à 07:00.
console.log(slots[0]!.start.withTimeZone('Europe/Paris').toString());
// '2026-10-21T07:00:00+02:00[Europe/Paris]'

// Le serveur, avant d'enregistrer : mêmes règles, pas besoin de plage.
console.log(checkSlot(rules, slots[0]!.start).ok); // true
console.log(checkSlot(rules, '2026-10-21T09:00+03:00[Asia/Riyadh]')); // { ok: false, reason: 'busy' }
```

### API

Tout est exporté par l'entrée unique `@dzcalendar/slots`.

#### Fonctions

| Export | Rôle |
| --- | --- |
| `findSlots(query: SlotQuery): { slots: Slot[]; problems: Problem[] }` | Les créneaux réservables entre `from` et `to` : les ouvertures de la semaine du prestataire, ses règles et exceptions, découpées en créneaux de `duration`, moins ce qui est occupé (marges comprises), trop proche (`minNotice`), trop lointain (`maxAdvanceDays`) ou un jour complet (`maxPerDay`). Ne lève jamais ; une mauvaise entrée se retrouve dans `problems`. Au plus 10 000 créneaux et 200 000 débuts examinés : au-delà, elle s'arrête avec un avertissement `too-many-occurrences`. |
| `checkSlot(query: CheckQuery, start: Moment): SlotCheck` | Dit si `start` est l'un des créneaux que `findSlots` proposerait. Ce qu'un serveur demande avant d'enregistrer une réservation. Sans `from`/`to`, la plage est le créneau lui-même. |
| `openSpans(availability, from, to, problems): MsSpan[]` | Le temps ouvert du prestataire pour les fenêtres qui s'ouvrent aux dates `from` (incluse) à `to` (exclue), en intervalles `{ s, e }` triés et fusionnés, en millisecondes d'époque. Une exception remplace toutes les fenêtres qui s'ouvrent à sa date. Les problèmes sont ajoutés au tableau que vous passez. |
| `busyFromEvents(events, zone): Busy[]` | Transforme des événements du calendrier (`CalEvent` ou `EventInstance` du store, de `@dzcalendar/core`) en temps occupé : ceux qui ont `busy` (par défaut, sauf annulés). Un événement horaire est une réservation ; un événement sur la journée est un `block` sur toutes ses dates dans `zone`. |
| `readMoment(value): Instant \| null` | Lit un `Moment` (un `Instant`, un `ZonedDateTime` ou une chaîne ISO) comme `Instant`, ou `null` s'il est illisible. (Exporté sous ce nom ; c'est le lecteur du moteur.) |

#### La requête

`SlotQuery` (et `CheckQuery`, identique avec `from` et `to` facultatifs) :

| Champ | Sens |
| --- | --- |
| `availability` | `Availability`, voir plus bas. |
| `from`, `to` | `Moment`. Les créneaux voulus commencent à `from` ou après et finissent à `to` ou avant. |
| `duration` | Minutes de temps réel (écoulé), de 1 à 525 600. |
| `step` | Minutes entre deux débuts de créneaux, comptées depuis chaque ouverture. Par défaut : la durée. |
| `bufferBefore`, `bufferAfter` | Minutes laissées libres avant et après chaque rendez-vous. Une réservation garde ses propres marges : deux rendez-vous sont distants de `bufferAfter + bufferBefore`. |
| `minNotice` | Aucun créneau ne commence moins de ce nombre de minutes après `now`. |
| `maxAdvanceDays` | Aucun créneau ne commence plus de ce nombre de jours après `now` (un entier). |
| `now` | Un `Moment`. Requis par `minNotice` et `maxAdvanceDays` : le moteur ne lit jamais l'horloge. |
| `maxPerDay` | Au plus ce nombre de réservations commençant à une date du prestataire ; une date pleine n'offre rien. |
| `busy` | `Busy[]`, voir plus bas. |

#### Disponibilités

```text
Availability  { timeZone: ZoneId, weekly?: WeeklyWindow[], exceptions?: DateException[], rules?: RuleWindow[] }
Window        { from: WallTime, to: WallTime }      // heures murales du fuseau du prestataire ; une fin égale ou antérieure au début passe minuit ; '24:00' en fin est minuit suivant
WeeklyWindow  Window & { days: Weekday[] }          // jours ISO, 1 lundi ... 7 dimanche
DateException { date: PlainDate | string, closed?: boolean, windows?: Window[] }   // remplace toutes les fenêtres qui commencent à cette date, hebdomadaires et règles
RuleWindow    Window & { rrule: string, start: PlainDate | string, exdates?: (PlainDate | string)[] }   // une règle RFC 5545, p. ex. 'FREQ=MONTHLY;BYDAY=1SA', à partir de sa première date `start`
WallTime      PlainTime | string                    // '08:30'
Moment        Instant | ZonedDateTime | string      // '2026-10-21T08:00Z' ou '...[Asia/Riyadh]'
Busy          { start: Moment, end: Moment, kind?: 'booking' | 'block' }
```

Une `booking` (par défaut) est un rendez-vous : elle reçoit les mêmes marges qu'un nouveau créneau et compte dans le plafond quotidien. Un `block` (congé, réunion dans un autre agenda) ne fait que prendre son temps. Les heures murales sont résolues dans le fuseau du prestataire : une fenêtre qui traverse un changement d'heure garde sa vraie durée ; un début dans une heure sautée s'ouvre quand l'heure se termine, et une heure de fermeture que les horloges sautent ferme au moment du saut. Les créneaux se comptent en minutes écoulées depuis le début de chaque ouverture (une ouverture de plusieurs jours d'affilée utilise une grille fixe, les multiples du pas depuis l'époque).

#### Résultats

```text
Slot       { start: ZonedDateTime, end: ZonedDateTime }     // dans le fuseau du prestataire ; .withTimeZone(client) l'affiche dans un autre
SlotCheck  { ok: true, slot: Slot } | { ok: false, reason: SlotRefusal, problems?: Problem[] }
SlotRefusal 'invalid-query' | 'closed' | 'misaligned' | 'busy' | 'notice' | 'advance' | 'daily-cap' | 'out-of-range'
```

| Refus | Sens |
| --- | --- |
| `invalid-query` | La requête ou le début est illisible ; `problems` dit pourquoi. |
| `out-of-range` | Le créneau n'est pas compris entre `from` et `to`. |
| `closed` | Aucune ouverture ne contient tout le créneau. |
| `misaligned` | Le début est hors de la grille de l'ouverture (pas un multiple de `step` depuis son début). |
| `busy` | Il touche du temps occupé, marges comprises. |
| `notice` | Plus proche que `minNotice`. |
| `advance` | Plus lointain que `maxAdvanceDays`. |
| `daily-cap` | La date contient déjà `maxPerDay` réservations. |

### Problèmes

Une mauvaise entrée ne lève jamais : elle devient un `Problem` (`{ code, severity, path, detail? }`, de `@dzcalendar/core`).

| Code | Gravité | Sens |
| --- | --- | --- |
| `invalid-slot-query` | erreur | La requête est illisible : `duration`, `step`, marge, `minNotice`, `maxAdvanceDays`, `maxPerDay`, `from`, `to` ou `now` invalide, ou un `busy` qui n'est pas un tableau ; `minNotice` ou `maxAdvanceDays` sans `now`. En avertissement : une entrée `busy` illisible (ignorée). |
| `unknown-zone` | erreur | `availability.timeZone` n'est pas un fuseau connu (chemin `availability.timeZone`). |
| `invalid-availability` | avertissement | Une fenêtre, une date ou une liste `days` illisible (ignorée) ; `path` la désigne, p. ex. `availability.weekly[0]`. |
| `invalid-rrule` | avertissement | Le texte `rrule` d'une règle est illisible. |
| `too-many-occurrences` | avertissement | Une règle a été développée au-delà de sa limite, ou la recherche a atteint son plafond : réduisez la plage. |

### Notes sur Temporal

Temporal vient de `@dzcalendar/core` (qui le prend à `@tzslot/core/lazy`). Là où la plateforme n'a pas de Temporal natif, faites `await loadTemporal()` (exporté par `@dzcalendar/core`) avant la première requête. Les créneaux sont des `ZonedDateTime` dans le fuseau du prestataire ; comparez-les avec `.toString()`.

### Documentation

- [Option des créneaux disponibles](https://plinthworks.github.io/dzcalendar/fr/options/available-slots/)
- [Guide des fuseaux horaires](https://plinthworks.github.io/dzcalendar/fr/guides/time-zones/)
- [Guide de la récurrence](https://plinthworks.github.io/dzcalendar/fr/guides/recurrence/)
- [Accueil de la documentation](https://plinthworks.github.io/dzcalendar/fr/)

### Licence

MIT
