# @dzcalendar/ical

iCalendar (RFC 5545) for DzCalendar: parse and write VEVENTs with their real time zones, and an iCal event source.

**English** · [Français](#français)

## What it is

`@dzcalendar/ical` reads `.ics` text into DzCalendar event inputs and writes them back, without losing the zone each event lives in. IANA `TZID`s are kept as they are, Windows names ("Romance Standard Time") go through CLDR's table, and a custom `VTIMEZONE` is matched to the IANA zone with the same clock changes. Writing emits a `VTIMEZONE` built from the zones' real transitions. `icalSource` plugs a feed into the calendar as an event source. Importing the package also loads the recurrence engine (`@dzcalendar/core/recurrence`), since a calendar file's `RRULE`s are repeating events.

## Install

```bash
npm install @dzcalendar/ical @dzcalendar/core @dzcalendar/rrule
```

`@dzcalendar/core` and `@dzcalendar/rrule` are dependencies (pinned to the same version); Temporal comes from `@tzslot/core/lazy` through the core. In a calendar, pair it with `@dzcalendar/dom` (its `sources` option takes `icalSource`).

## Quick start

```ts
import { loadTemporal } from '@dzcalendar/core';
import { parseICal, serializeICal } from '@dzcalendar/ical';

// Native Temporal: instant. Otherwise this fetches the polyfill once.
await loadTemporal();

const text = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'BEGIN:VEVENT',
  'UID:standup@example.org',
  'DTSTART;TZID=Europe/Paris:20261021T090000',
  'DTEND;TZID=Europe/Paris:20261021T093000',
  'RRULE:FREQ=DAILY;COUNT=3',
  'SUMMARY:Stand-up',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

const { events, problems, calendar } = parseICal(text);
console.log(problems.length); // 0
console.log(calendar); // {}  (the file names no calendar, zone or PRODID)
console.log(events[0]);
// {
//   start: '2026-10-21T09:00:00[Europe/Paris]',
//   id: 'standup@example.org',
//   end: '2026-10-21T09:30:00[Europe/Paris]',
//   title: 'Stand-up',
//   rrule: 'FREQ=DAILY;COUNT=3',
// }  Paris keeps its own zone: 09:00 is 09:00 there, summer time or not.

// And back to text: CRLF lines, folded at 75 octets, with a VTIMEZONE for Europe/Paris.
const out = serializeICal(events, { name: 'Team', stamp: '2026-10-17T00:00:00Z' });
console.log(out.includes('DTSTART;TZID=Europe/Paris:20261021T090000')); // true
```

As an event source:

```ts
import { icalSource } from '@dzcalendar/ical';

// webcal:// and webcals:// links are fetched over HTTPS.
export const team = icalSource('team', { url: 'https://example.org/team.ics', defaultZone: 'Europe/Paris' });
// Or a file the person chose.
export const imported = (fileContents: string) => icalSource('imported', { text: fileContents });
```

## API

Everything is exported from the single entry `@dzcalendar/ical`.

### `parseICal(text, options?): ParsedICal`

Parses an iCalendar text into event inputs. Never throws on data: what is wrong is in `problems`, and an event whose start cannot be read is left out. Only `VEVENT`s are read. Several `VCALENDAR`s in one text (concatenated feeds) are read as one; the first names it.

| Option | Meaning |
| --- | --- |
| `defaultZone` | Where floating times (no `TZID`, no `Z`) are read when the file names no zone. The file's own `X-WR-TIMEZONE` wins. With neither, a floating time stays floating. |

The result is `{ events, problems, calendar }`:

- `events: EventInput[]` (from `@dzcalendar/core`): `start`, `end` or `duration` (no end and no duration is one day for a date, an instant for a time, RFC 5545 §3.6.1), `id` (the `UID`), `title`, `allDay` (a date value), `rrule` (a string, or an array when several), `exdate`, `rdate`, `status`, `busy` (`false` for `TRANSP:TRANSPARENT`), `url`, and `extendedProps` with `description`, `location`, `categories` and `organizer` (`{ name?, email? }`). A changed occurrence (`RECURRENCE-ID`) becomes an override with `seriesId` (the `UID`), `recurrenceId` and the id `UID@recurrence-id`.
- `problems: Problem[]` (see below).
- `calendar: ICalCalendar`: `{ name?, zone?, prodId? }` from `X-WR-CALNAME`, `X-WR-TIMEZONE` and `PRODID`.

Times: a `TZID` is an IANA zone (also with a prefix, a Mozilla path, or a Windows name), or a `VTIMEZONE` matched to the IANA zone with the same offsets over the years the file uses. A `Z` time is UTC (or read in the calendar's zone when there is one: the file's `X-WR-TIMEZONE`, else `defaultZone`), and UTC times of a repeating event stay UTC, as RFC 5545 repeats them. A date is an all-day event.

### `serializeICal(inputs, options?): string`

Writes `EventInput`s as an iCalendar text: CRLF lines, folded at 75 octets. Series keep their rules, `EXDATE`s and `RDATE`s; an override (`seriesId` + `recurrenceId`) is written under its series' `UID` with a `RECURRENCE-ID`. An all-day input given with times is written as dates. Inputs whose start cannot be read are skipped.

| Option | Meaning |
| --- | --- |
| `prodId` | `PRODID`. Default `-//DzCalendar//EN`. |
| `name` | `X-WR-CALNAME`. |
| `stamp` | `DTSTAMP` of every event, an `Instant` or its string. Default: now. Give one for a reproducible output. |
| `vtimezone` | A `VTIMEZONE` for each zone used (RFC 5545 asks for one; Outlook needs it). Default `true`. Written from the zone's real transitions; for an open series the zone's rules are written a few years ahead. |

### `icalSource(id, options): EventSourceSpec`

An iCalendar feed as an event source for the calendar's `sources` option: fetched whole (iCal has no ranges), once, and again on `refetch()`; read by `parseICal`; what reading it found wrong comes with the events.

| Option | Meaning |
| --- | --- |
| `url` | Fetched with `fetchImpl` (default: the global `fetch`). `webcal://` and `webcals://` become `https://`. A non-OK answer is an error (`HTTP 404`). |
| `text` | The text itself, or a function giving it (sync or async), instead of a URL. |
| `fetchImpl` | A `FetchLike`: `(url, { signal?, headers? }) => Promise<{ ok, status, text() }>`. |
| `headers` | Request headers. |
| `defaults` | `Partial<EventInput>` laid under every event. |
| `defaultZone` | As for `parseICal`. |
| `save` | Called with a `SaveRequest` when the person edits an event of this source. |
| `staleAfter` | Fetched again when shown after this long (a `Duration`, as `jsonSource`'s). |
| `retry` | `{ attempts, backoffMs }`: a failed fetch tried again, the wait doubling each time. No default: tried once. |

Without `text` or a usable `url` and `fetch`, the fetch fails with an error.

### `windowsZone(name): string | undefined`

The IANA zone for a Windows zone name, case-insensitive (`'romance standard time'` is `'Europe/Paris'`), or `undefined`.

### Types

```text
ParseICalOptions   { defaultZone?: string }
ParsedICal         { events: EventInput[], problems: Problem[], calendar: ICalCalendar }
ICalCalendar       { name?: string, zone?: string, prodId?: string }
SerializeICalOptions { prodId?, name?, stamp?: Instant | string, vtimezone?: boolean }
ICalSourceOptions  { url?, text?, fetchImpl?, headers?, defaults?, defaultZone?, save?, staleAfter?, retry? }
FetchLike          (url, init?) => Promise<{ ok: boolean, status: number, text(): Promise<string> }>
```

## Problems

Reading never throws; everything doubtful is a `Problem` (`{ code, severity, path, detail? }`, from `@dzcalendar/core`) whose `path` says where (`line 12`, `VEVENT[0].DTSTART`).

| Code | Severity | Meaning |
| --- | --- | --- |
| `ical-syntax` | error | A line, a `BEGIN`/`END` pair or a date that cannot be read; a `DTSTART` that is missing (the event is left out). |
| `ical-unsupported` | warning | Not supported, said once: `VTODO`, `VJOURNAL` and `EXRULE` are left out; a period in `RDATE` (`RDATE;VALUE=PERIOD`) keeps only its start; `RECURRENCE-ID;RANGE=THISANDFUTURE` changes that one occurrence only. |
| `unknown-zone` | warning | A `TZID` that is neither an IANA zone, a Windows name, nor a usable `VTIMEZONE`. |
| `zone-guessed` | warning | A custom `VTIMEZONE` was matched to an IANA zone with the same offsets; `detail` says `TZID → zone`. |
| `zone-fixed-offset` | warning | No IANA zone matched: each time takes the offset the `VTIMEZONE` gives it, as a fixed offset (right for every start, though a series repeats at that one offset). |

## Notes on Temporal

Temporal comes from `@dzcalendar/core`, which takes it from `@tzslot/core/lazy`. Where the platform has no native Temporal, `await loadTemporal()` (exported by `@dzcalendar/core`) before parsing or writing; in a calendar, `await calendar.ready`. Nothing here reads Temporal at import time. Compare Temporal values with `.toString()`.

## Documentation

- [Event sources guide](https://plinthworks.github.io/dzcalendar/guides/event-sources/)
- [Recurrence guide](https://plinthworks.github.io/dzcalendar/guides/recurrence/)
- [Time zones guide](https://plinthworks.github.io/dzcalendar/guides/time-zones/)
- [`sources` option](https://plinthworks.github.io/dzcalendar/options/sources/)
- [Documentation home](https://plinthworks.github.io/dzcalendar/)

## License

MIT

---

## Français

iCalendar (RFC 5545) pour DzCalendar : lire et écrire des VEVENT avec leurs vrais fuseaux horaires, et une source d'événements iCal.

**[English](#dzcalendarical)** · Français

### Présentation

`@dzcalendar/ical` lit du texte `.ics` en entrées d'événements DzCalendar et les réécrit, sans perdre le fuseau où vit chaque événement. Les `TZID` IANA sont gardés tels quels, les noms Windows (« Romance Standard Time ») passent par la table du CLDR, et un `VTIMEZONE` personnalisé est rapproché du fuseau IANA qui a les mêmes changements d'heure. L'écriture émet un `VTIMEZONE` construit à partir des vraies transitions des fuseaux. `icalSource` branche un flux sur le calendrier comme source d'événements. Importer le paquet charge aussi le moteur de récurrence (`@dzcalendar/core/recurrence`), puisque les `RRULE` d'un fichier de calendrier sont des événements récurrents.

### Installation

```bash
npm install @dzcalendar/ical @dzcalendar/core @dzcalendar/rrule
```

`@dzcalendar/core` et `@dzcalendar/rrule` sont des dépendances (à la même version) ; Temporal vient de `@tzslot/core/lazy` via le cœur. Dans un calendrier, associez-le à `@dzcalendar/dom` (son option `sources` accepte `icalSource`).

### Démarrage rapide

```ts
import { loadTemporal } from '@dzcalendar/core';
import { parseICal, serializeICal } from '@dzcalendar/ical';

// Temporal natif : instantané. Sinon, charge le polyfill une fois.
await loadTemporal();

const text = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'BEGIN:VEVENT',
  'UID:standup@example.org',
  'DTSTART;TZID=Europe/Paris:20261021T090000',
  'DTEND;TZID=Europe/Paris:20261021T093000',
  'RRULE:FREQ=DAILY;COUNT=3',
  'SUMMARY:Stand-up',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

const { events, problems, calendar } = parseICal(text);
console.log(problems.length); // 0
console.log(calendar); // {}  (le fichier ne nomme ni calendrier, ni fuseau, ni PRODID)
console.log(events[0]);
// {
//   start: '2026-10-21T09:00:00[Europe/Paris]',
//   id: 'standup@example.org',
//   end: '2026-10-21T09:30:00[Europe/Paris]',
//   title: 'Stand-up',
//   rrule: 'FREQ=DAILY;COUNT=3',
// }  Paris garde son fuseau : 09:00 reste 09:00 là-bas, heure d'été ou non.

// Et retour en texte : lignes CRLF, repliées à 75 octets, avec un VTIMEZONE pour Europe/Paris.
const out = serializeICal(events, { name: 'Équipe', stamp: '2026-10-17T00:00:00Z' });
console.log(out.includes('DTSTART;TZID=Europe/Paris:20261021T090000')); // true
```

Comme source d'événements :

```ts
import { icalSource } from '@dzcalendar/ical';

// Les liens webcal:// et webcals:// sont récupérés en HTTPS.
export const team = icalSource('team', { url: 'https://example.org/team.ics', defaultZone: 'Europe/Paris' });
// Ou un fichier choisi par la personne.
export const imported = (fileContents: string) => icalSource('imported', { text: fileContents });
```

### API

Tout est exporté par l'entrée unique `@dzcalendar/ical`.

#### `parseICal(text, options?): ParsedICal`

Lit un texte iCalendar en entrées d'événements. Ne lève jamais sur des données : ce qui cloche est dans `problems`, et un événement dont le début est illisible est écarté. Seuls les `VEVENT` sont lus. Plusieurs `VCALENDAR` dans un même texte (flux concaténés) sont lus comme un seul ; le premier le nomme.

| Option | Sens |
| --- | --- |
| `defaultZone` | Où lire les heures flottantes (ni `TZID`, ni `Z`) quand le fichier ne nomme aucun fuseau. Le `X-WR-TIMEZONE` du fichier l'emporte. Sans l'un ni l'autre, une heure flottante reste flottante. |

Le résultat est `{ events, problems, calendar }` :

- `events: EventInput[]` (de `@dzcalendar/core`) : `start`, `end` ou `duration` (sans fin ni durée : un jour pour une date, un instant pour une heure, RFC 5545 §3.6.1), `id` (le `UID`), `title`, `allDay` (une valeur date), `rrule` (une chaîne, ou un tableau s'il y en a plusieurs), `exdate`, `rdate`, `status`, `busy` (`false` pour `TRANSP:TRANSPARENT`), `url`, et `extendedProps` avec `description`, `location`, `categories` et `organizer` (`{ name?, email? }`). Une occurrence modifiée (`RECURRENCE-ID`) devient une exception avec `seriesId` (le `UID`), `recurrenceId` et l'id `UID@recurrence-id`.
- `problems: Problem[]` (voir plus bas).
- `calendar: ICalCalendar` : `{ name?, zone?, prodId? }` d'après `X-WR-CALNAME`, `X-WR-TIMEZONE` et `PRODID`.

Heures : un `TZID` est un fuseau IANA (avec un préfixe, un chemin Mozilla ou un nom Windows aussi), ou un `VTIMEZONE` rapproché du fuseau IANA aux mêmes décalages sur les années que le fichier utilise. Une heure en `Z` est en UTC (ou lue dans le fuseau du calendrier quand il y en a un : le `X-WR-TIMEZONE` du fichier, sinon `defaultZone`), et les heures UTC d'un événement récurrent restent en UTC, comme RFC 5545 les répète. Une date est un événement sur la journée.

#### `serializeICal(inputs, options?): string`

Écrit des `EventInput` en texte iCalendar : lignes CRLF, repliées à 75 octets. Les séries gardent leurs règles, `EXDATE` et `RDATE` ; une exception (`seriesId` + `recurrenceId`) est écrite sous le `UID` de sa série avec un `RECURRENCE-ID`. Une entrée sur la journée donnée avec des heures est écrite en dates. Les entrées dont le début est illisible sont ignorées.

| Option | Sens |
| --- | --- |
| `prodId` | `PRODID`. Par défaut `-//DzCalendar//EN`. |
| `name` | `X-WR-CALNAME`. |
| `stamp` | `DTSTAMP` de chaque événement, un `Instant` ou sa chaîne. Par défaut : maintenant. Donnez-en un pour une sortie reproductible. |
| `vtimezone` | Un `VTIMEZONE` pour chaque fuseau utilisé (RFC 5545 en demande un ; Outlook en a besoin). Par défaut `true`. Écrit à partir des vraies transitions du fuseau ; pour une série ouverte, les règles du fuseau sont écrites quelques années à l'avance. |

#### `icalSource(id, options): EventSourceSpec`

Un flux iCalendar comme source d'événements pour l'option `sources` du calendrier : récupéré en entier (iCal n'a pas de plages), une fois, et de nouveau sur `refetch()` ; lu par `parseICal` ; ce que la lecture a trouvé de travers accompagne les événements.

| Option | Sens |
| --- | --- |
| `url` | Récupérée avec `fetchImpl` (par défaut le `fetch` global). `webcal://` et `webcals://` deviennent `https://`. Une réponse non OK est une erreur (`HTTP 404`). |
| `text` | Le texte lui-même, ou une fonction qui le donne (synchrone ou asynchrone), à la place d'une URL. |
| `fetchImpl` | Un `FetchLike` : `(url, { signal?, headers? }) => Promise<{ ok, status, text() }>`. |
| `headers` | En-têtes de la requête. |
| `defaults` | `Partial<EventInput>` posé sous chaque événement. |
| `defaultZone` | Comme pour `parseICal`. |
| `save` | Appelée avec une `SaveRequest` quand la personne modifie un événement de cette source. |
| `staleAfter` | Récupérée de nouveau quand elle est affichée après ce délai (une `Duration`, comme pour `jsonSource`). |
| `retry` | `{ attempts, backoffMs }` : une récupération échouée est retentée, l'attente doublant à chaque fois. Pas de valeur par défaut : un seul essai. |

Sans `text` ni `url` et `fetch` utilisables, la récupération échoue avec une erreur.

#### `windowsZone(name): string | undefined`

Le fuseau IANA d'un nom de fuseau Windows, sans tenir compte de la casse (`'romance standard time'` donne `'Europe/Paris'`), ou `undefined`.

#### Types

```text
ParseICalOptions   { defaultZone?: string }
ParsedICal         { events: EventInput[], problems: Problem[], calendar: ICalCalendar }
ICalCalendar       { name?: string, zone?: string, prodId?: string }
SerializeICalOptions { prodId?, name?, stamp?: Instant | string, vtimezone?: boolean }
ICalSourceOptions  { url?, text?, fetchImpl?, headers?, defaults?, defaultZone?, save?, staleAfter?, retry? }
FetchLike          (url, init?) => Promise<{ ok: boolean, status: number, text(): Promise<string> }>
```

### Problèmes

La lecture ne lève jamais ; tout ce qui est douteux est un `Problem` (`{ code, severity, path, detail? }`, de `@dzcalendar/core`) dont le `path` dit où (`line 12`, `VEVENT[0].DTSTART`).

| Code | Gravité | Sens |
| --- | --- | --- |
| `ical-syntax` | erreur | Une ligne, une paire `BEGIN`/`END` ou une date illisible ; un `DTSTART` manquant (l'événement est écarté). |
| `ical-unsupported` | avertissement | Non pris en charge, dit une fois : `VTODO`, `VJOURNAL` et `EXRULE` sont laissés de côté ; une période dans `RDATE` (`RDATE;VALUE=PERIOD`) ne garde que son début ; `RECURRENCE-ID;RANGE=THISANDFUTURE` ne modifie que cette occurrence. |
| `unknown-zone` | avertissement | Un `TZID` qui n'est ni un fuseau IANA, ni un nom Windows, ni un `VTIMEZONE` utilisable. |
| `zone-guessed` | avertissement | Un `VTIMEZONE` personnalisé a été rapproché d'un fuseau IANA aux mêmes décalages ; `detail` dit `TZID → zone`. |
| `zone-fixed-offset` | avertissement | Aucun fuseau IANA ne correspond : chaque heure prend le décalage que lui donne le `VTIMEZONE`, en décalage fixe (juste pour chaque début, mais une série se répète à ce seul décalage). |

### Notes sur Temporal

Temporal vient de `@dzcalendar/core`, qui le prend à `@tzslot/core/lazy`. Là où la plateforme n'a pas de Temporal natif, faites `await loadTemporal()` (exporté par `@dzcalendar/core`) avant de lire ou d'écrire ; dans un calendrier, `await calendar.ready`. Rien ici ne lit Temporal à l'import. Comparez les valeurs Temporal avec `.toString()`.

### Documentation

- [Guide des sources d'événements](https://plinthworks.github.io/dzcalendar/fr/guides/event-sources/)
- [Guide de la récurrence](https://plinthworks.github.io/dzcalendar/fr/guides/recurrence/)
- [Guide des fuseaux horaires](https://plinthworks.github.io/dzcalendar/fr/guides/time-zones/)
- [Option `sources`](https://plinthworks.github.io/dzcalendar/fr/options/sources/)
- [Accueil de la documentation](https://plinthworks.github.io/dzcalendar/fr/)

### Licence

MIT
