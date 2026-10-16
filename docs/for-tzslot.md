# Remarques de DzCalendar pour tzslot (2026-10-16)

DzCalendar dépend de `@tzslot/core ^2.1.0` (npm). Les points ci-dessous viennent
de ses phases 0 à 2. Chacun a été vérifié par exécution, sauf mention contraire.
Rien n'a été modifié dans le dépôt tzslot.

## À corriger, par ordre d'importance

### 1. La version npm 2.1.0 n'embarque pas `temporal-polyfill/full`
- Dans `node_modules/@tzslot/core/temporal.js:18`, la version publiée fait `import … from 'temporal-polyfill'`.
- La source du dépôt (`packages/core/src/temporal.ts:29`) dit pourtant `'temporal-polyfill/full'`.
- **Effet.** Pour un utilisateur npm, les calendriers non ISO échouent : `[u-ca=buddhist]`, `islamic-umalqura`, `hebrew` donnent « Unknown calendar …; might need temporal-polyfill/full ». Les grilles hégiriennes ne marchent donc que dans le dépôt, pas chez les utilisateurs.
- **À faire.** Une release (2.2.0) qui embarque `/full`, puis un test sur le paquet emballé (`pack:local`) qui parse `2026-05-01[u-ca=islamic-umalqura]`.
- Autre trace de changements non publiés : `inMonth` est exporté par `src/index.ts`, mais pas par le `index.d.ts` de la 2.1.0.

### 2. Les mesures de performance et de mémoire se font sur du code non minifié
- Le polyfill colle à **chaque** objet Temporal une chaîne de débogage `_str_` (`attachDebugString`, `chunks/apiHelpers.js:35`). Il le fait tant que `noop.name === 'noop'`, c'est-à-dire tant que le code n'est pas minifié. La chaîne est calculée avec `toLocaleString('fullwide')`, ce qui est lent.
- Mesuré dans DzCalendar : sur du code non minifié, elle représentait environ la moitié du temps CPU et un tiers de la mémoire par objet. Une fois minifié, le `_str_` disparaît (vérifié avec `Object.getOwnPropertyNames`).
- **À faire.** Revoir `test:memory` (« 650 octets par créneau ») et `perf.test.ts`, qui mesurent un coût qu'aucun utilisateur ne paie. DzCalendar mesure sur un bundle minifié par esbuild : voir `scripts/bench.mjs` et `perf/bench-entry.ts`.

### 3. `toEqual` ne compare pas les objets Temporal
- L'état des objets est rangé dans des slots internes. Résultat : `expect({x: Instant.from('2026…')}).toEqual({x: Instant.from('2027…')})` **passe**, alors que les deux instants diffèrent.
- **À faire.** Repérer dans les tests tzslot les `toEqual` / `toStrictEqual` qui comparent des objets ou des tableaux contenant des valeurs Temporal, et comparer plutôt `.toString()`. **Non vérifié :** un premier grep n'a rien trouvé d'évident, mais je n'ai pas fait de revue complète.

## Candidats à remonter dans `@tzslot/core` (temps pur, pas de sémantique de calendrier)

Ils existent déjà dans `dzcalendar/packages/core/src/zone.ts` avec leur signature définitive, et sont testés contre les règles IANA (Paris, Chicago, Lord Howe, São Paulo 2018, Havane 2023, Apia 2011, Kolkata, Dublin, Paris 1911).

- **`dayInfo(date, zone)` et `dayInfos(from, count, zone)`.** Ils donnent le début et la fin réels du jour, sa longueur (23 h, 25 h, 23 h 30, 0 pour Apia le 30/12/2011) et ses transitions.
  - Règle retenue : une transition appartient au jour dont l'intervalle `[start, end)` la contient.
  - `dayInfos` n'interroge le fuseau qu'une seule fois pour toute la plage.
- **`transitionsBetween(from, to, zone)`.** Il appelle `getTimeZoneTransition('next')`, qui existe dans le polyfill 1.0.6 et dans le natif ; pas besoin de bisection.
  - Piège : `at.toZonedDateTimeISO(offset)` **plante** avec un offset historique à secondes (Paris 1911, `+00:09:21`), car ce n'est pas un nom de zone valide. Il faut passer par UTC plus `offsetNanoseconds`.
- **`resolveWall(date, time, zone, policy)`.** Les politiques sont `compatible`, `earlier`, `later`, `reject` et `{preferOffset}`.
  - Il renvoie aussi un instant dans un trou, ce que `resolveWallTime` ne fait pas.
  - `offsetMatched` signale quand l'offset demandé ne correspond à aucune lecture.
  - Les offsets sont comparés en nanosecondes : `+01`, `+0100` et `+01:00` sont égaux.
- **`isQuietDay(date, zone)`.** Il dit qu'aucune transition ne tombe entre le jour d'avant et le jour d'après, avec un cache par zone et par numéro de jour. Une heure ne peut être sautée ou répétée que près d'une transition. Vérifié contre toutes les transitions de 1840 à 2040 dans 15 zones.
- **Coût.** `resolveWallTime` coûte environ 7 µs (non minifié). Deux lectures (`earlier` puis `later`) suffisent à classer un cas : si elles donnent le même instant, l'heure est normale ; sinon, si la lecture `earlier` retombe sur l'heure murale demandée, l'heure est répétée ; sinon, c'est un trou. Voir `placeWall` dans `dzcalendar/packages/core/src/event/parse-temporal.ts`.

## Informations utiles pour les pickers

- **`Intl.DateTimeFormat#format`** lève une exception sur `PlainDate` et `ZonedDateTime` avec le polyfill, qui ne patche pas `Intl`. Ce qui fonctionne : `zdt.toLocaleString(...)`, ou `format(epochMs)` avec l'option `timeZone`.
- **`formatRange` accepte des nombres** (millisecondes d'époque). Il donne « 15–21 mars 2026 » et « 15.–21. März 2026 » sans aucun `Date`, ce qui est utile pour afficher une plage. Limite : il n'écrit qu'un seul offset pour toute la plage. Une plage de 01:30 (`+02:00`) à 02:30 (`+01:00`) s'affiche donc « UTC+1 ». Pour les heures qui traversent un changement d'heure, il faut formater chaque bout séparément.
- **V8 ne fournit pas `minimalDays`** dans `Intl.Locale#getWeekInfo()`, seulement `firstDay` et `weekend`. DzCalendar utilise un repli : la table CLDR des régions à 4 jours (`format/week.ts`). C'est à reprendre si tzslot affiche un jour des numéros de semaine.
- **`Intl.Locale#getTextInfo()` et le getter `textInfo` existent tous les deux** (Node 24). Le repli « méthode ou getter » reste pertinent pour les autres moteurs.
