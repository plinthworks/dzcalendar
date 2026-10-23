# Demande de DzCalendar à tzslot — charger le polyfill Temporal seulement s'il manque

**De :** DzCalendar (Phase 18i, le poids). **Décision du propriétaire (2026-10-23) :**
le polyfill Temporal n'est chargé que là où Temporal manque (révision de K.2,
« import statique conservé »).

## Le constat

`packages/core/src/temporal.ts` importe `temporal-polyfill/full` de façon
statique : ≈ 20 ko gzip embarqués pour tous les visiteurs, alors que Chrome,
Firefox et Edge ont Temporal en natif (Safari l'aura en 27.2). DzCalendar pèse
138,5 ko dans le benchmark public, contre 94,9 ko pour FullCalendar 7 — ce
polyfill est le premier poste à retirer.

DzCalendar prend Temporal **uniquement** de `@tzslot/core` (une seule copie du
polyfill, un seul jeu de classes pour une app qui utilise les deux
bibliothèques) : le changement doit donc venir de tzslot.

## Ce que DzCalendar demande

1. **Une entrée sans polyfill statique**, par exemple `@tzslot/core/lazy`
   (mêmes exports que `.`), où :
   - `Temporal` est une liaison vivante (`export let Temporal`), le natif s'il
     existe ;
   - `loadTemporal(): Promise<void>` — résolue tout de suite si Temporal est
     natif, sinon `import('temporal-polyfill/full')` puis assigne `Temporal` ;
     idempotente (le même `Promise` à chaque appel) ;
   - `usingPolyfill` reflète l'état après chargement.
   - Utiliser `Temporal` avant `loadTemporal()` sur un navigateur sans natif
     doit échouer clairement (une erreur qui dit « appelez loadTemporal() »),
     jamais en silence.
2. **L'entrée par défaut `.` inchangée** (import statique) : les autres
   utilisateurs de tzslot ne voient aucune différence.
3. **Les types** identiques dans les deux entrées (les alias `PlainDate`,
   `ZonedDateTime`… restent ceux du polyfill, comme aujourd'hui).
4. Si possible, **`loadTemporal` exporté aussi par l'entrée `.`** (résolue tout
   de suite), pour qu'un code écrit pour `/lazy` marche sur les deux.

## Ce que DzCalendar fera de son côté

- Importer `@tzslot/core/lazy` partout ; ré-exporter `loadTemporal` depuis
  `@dzcalendar/core` ; `provideDzCalendar` (Angular) l'attend avant le premier
  rendu ; les docs React/Vue/JS disent `await loadTemporal()` au démarrage.
- Mesurer avant/après (taille gzip et premier rendu, minifié) et publier les
  chiffres dans le benchmark public.

## Contraintes

- Mesurer, ne pas estimer (tzslot l'a déjà appris : voir le commentaire de
  `temporal.ts`).
- Pas de repli sur `Date`.
- Tests : natif présent, natif absent (le polyfill chargé une seule fois),
  appel avant chargement (erreur claire).

Réponse attendue : le nom de l'entrée, la version / le commit, et toute
contrainte que DzCalendar doit connaître.
