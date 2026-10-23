# DzCalendar : architecture complète

> Livrable destiné à `/Users/nadou/Dev/dzcalendar/ARCHITECTURE.md`.
> Rédigé après lecture intégrale de `DzCalendar face à FullCalendar.md` et de tzslot : `CLAUDE.md`, `ROADMAP.md`, `package.json`, `vitest.config.ts`, `scripts/build.mjs`, `core/src/{temporal,slots,grid,range,shift,interop,index}.ts`, `dom/src/time-slots.ts`, `angular/src/calendar.ts`, `theme/tzslot.scss`, `core/test/perf.test.ts`.
> Aucune ligne de FullCalendar n'a été lue. Seule sa documentation publique (comportement observable) sert de référence.
> Ce que je n'ai pas vérifié est marqué **[À VÉRIFIER]**. Ce sont soit des API du polyfill Temporal, soit des fichiers de tzslot non lus.

## Décisions validées par le propriétaire (2026-10-16)

Elles priment sur le reste du document quand il dit autre chose.

| Sujet | Décision |
|---|---|
| Lien avec tzslot | `@tzslot/core ^2.1.0` en dépendance npm, pas de copie. |
| Modèle d'événement | `ZonedDateTime` avec une zone par événement ; journées entières en `PlainDate` (fin exclusive). |
| Périmètre | Tout ce que fait FullCalendar, Premium compris. |
| Axe DST en timeGrid (K.1) | **Option C** : axe mural + transition visible ; `elapsed` en option ; `elapsed` seul en timeline. |
| Gratuit / Pro (K.5, K.9) | **Tout en MIT pour l'instant.** Le paquet `@dzcalendar/pro` reste une frontière de code (plugins via `registerView`), sans licence FSL ni clé tant que le modèle économique n'est pas décidé. |
| From scratch (K.11) | **`CLEANROOM.md` adopté** : seul le comportement observable / la doc publique de FullCalendar est consulté ; chaque comportement imité est décrit dans `docs/behaviors/*.md` avec nos mots. |
| Polyfill (K.2) | ~~Import statique conservé, comme dans tzslot.~~ **Révisé le 2026-10-23 (Phase 18i)** : le polyfill n'est chargé que là où Temporal manque (import dynamique, `calendar.ready`). |
| Premier jour de semaine des règles (2026-10-16) | Une règle **sans `WKST`** se lit avec le lundi (RFC 5545), partout, quelle que soit la locale : la même règle donne les mêmes dates que Google, Outlook ou le serveur. Une série **créée dans DzCalendar** (commandes, interface) reçoit `WKST` = premier jour de la locale, **écrit explicitement** dans la règle. L'affichage (grilles, numéros de semaine) suit la locale. |
| Menu contextuel (2026-10-16) | **Toutes les actions accessibles par un menu contextuel** sur la cellule et sur l'événement (clic droit, appui long tactile, touche Menu / Maj+F10). Voir D.3 bis et `docs/behaviors/context-menu.md`. |

Restent ouvertes : K.3, K.4, K.7, K.10, K.12–K.16 (K.8 tranché en Phase 9, K.5 et K.6 en Phase 15).

### Ajustements après la Phase 0 (spikes et revues, détail dans ROADMAP.md)

Ils priment sur les sections citées.
- **B.3** — `getTimeZoneTransition` existe (polyfill 1.0.6 et natif) : pas de repli par bisection. `DayKind` gagne `'skipped'` (jour de longueur 0, Apia 2011-12-30). Une transition appartient au seul jour dont `[start, end)` la contient (le jour qui *commence* dessus, São Paulo/Havane). `lengthMinutes` et `deltaMinutes` ne sont pas arrondis (offsets historiques à secondes). `ResolvedWall.offsetMatched`.
- **B.4/B.5** — Modèle en calendrier ISO, toujours. `TimedEvent.zoneGuessed`. `revision` attribuée par le store (Phase 1), 0 à la normalisation. Id déterministe pour un événement de source sans id (Phase 1). Code `invalid-event` ; `null` = absent ; aucune exception sur données, exception sur `ctx` invalide.
- **B.10–B.12, C.3** — En mode `wall`, un événement est coupé à chaque transition `repeat` ; un jour `skipped` donne une colonne repliée « ce jour n'existe pas », sans segment ; un jour qui commence à 01:00 montre une bande `gap` 00:00–01:00.
- **B.17, K.4** — `Intl.DateTimeFormat#format` lève sur les objets Temporal sous le polyfill : formatage par `toLocaleString` ou `format(epochMs)` + `timeZone` ; calendrier d'affichage via l'extension de locale (`-u-ca-`). Formatage d'un `PlainDate` à vérifier en Phase 2.
- **D.8** — `Intl.Locale#getTextInfo()` et le getter `textInfo` existent ; repli méthode-ou-getter conservé.
- **I/J** — Theme, playground, `vite.config.ts`, `size-budget.json` passent en Phase 3.
- **Dépendance** — `@tzslot/core` 2.1.0 publié importe le polyfill de base, pas `/full` : calendriers non ISO indisponibles jusqu'à une release de tzslot qui le corrige.

### Ajustements après la Phase 1 (revue d'architecte, détail dans ROADMAP.md)

- **B.4/B.6 — `revision`** : attribuée par le store, égale à la version du snapshot qui écrit l'événement. Strictement croissante, donc un couple (id, revision) ne désigne jamais deux contenus (ni après un undo, ni après éviction puis re-livraison). Le store stampe lui-même dans `apply` et `replaceSourceChunk` (sauf causes `undo`/`redo`, qui restaurent les objets tels quels) et renvoie `StoreChange.applied` : les mutations effectives, que l'historique enregistre.
- **B.6** — `StoreSnapshot` est une classe construite sur un état nommé ; `bySource` devient `owners` + `chunks`. `StoreChange` gagne `problems` et `applied` ; `seriesTouched` arrive en Phase 5. `EventInstance.origin` porte déjà l'union complète. `ViewWindow` n'est construit que par `viewWindow()` (type marqué). `queryInstances` ne segmente pas.
- **B.6/D.7 — dirty** : `dirtySpans`/`dirtyDays` désignent des conteneurs ; la vue étend à la colonne (cluster de layout) en timeGrid et à la semaine en dayGrid. Un changement de zone d'affichage n'est pas un `StoreChange` : redessin complet. Une série (Phase 5) se signale par `seriesTouched`, jamais par un span infini.
- **`eventEquals`** compare `props` structurellement (valeurs JSON), identité pour le reste ; un test de dérive échoue si un champ de `CalEvent` est oublié.
- **B.7** — ids : espace global, `duplicate-id` entre sources ; id déterministe sur hash 53 bits (cyrb53) + rang dans le lot ; normaliser un lot avant de le partitionner en chunks (Phase 9). `FetchRequest.window` vaut `null` pour une source non découpée. Le serveur fait autorité : un refetch écrase une édition ou une suppression locale.
- **B.14** — `createHistory(store, ctx, opts)` avec `run` et `destroy`. `event.update` n'est pas un move : un nouveau `start` (ou `duration`) sans `end` garde la durée de l'événement (temps écoulé, ou jours) ; une heure sans zone est lue dans la zone de l'événement. La clé `mergeKey` doit identifier le geste ; une entrée fusionnée est compactée (un `before`, un `after` par id). L'historique écoute le store : un changement d'autrui purge aussitôt les entrées concernées et appelle `onDropped`.
- **G.2/G.3** — le bench minifié (`npm run bench`) remplace `test:perf`/`test:memory`. Lignes ajoutées : `replaceSourceChunk 10k`, `refetch 10k identical`. Restent à ajouter : requête W (10 000 dans une semaine) avant la Phase 4, garde « jour DST ≤ 3× un jour ordinaire », fuite sur 5 000 requêtes.

### Ajustements après la Phase 2 (revue d'architecte, détail dans ROADMAP.md)

- **B.11 / C.3** — `ColumnAxis` expose `start`/`end` (le temps couvert) et `toEndPosition` : une fin posée sur l'instant d'un retour d'heure se place à 03:00 de la première passe, pas à 02:00 de la seconde ; une fin à minuit à 24:00. `fromPosition` dans un trou suit `compatible` (02:30 → 03:30) ; un *drop* dans un trou se calera sur `band.to` (03:00) — couche d'interaction, Phase 7. **`slotMax` ≤ 24 h** : au-delà, refusé (RangeError) tant que la segmentation coupe au minuit réel. Pas de cache LRU : le modèle réutilisera les colonnes inchangées (Phase 3). Ticks `elapsed` en minutes écoulées depuis l'origine (Lord Howe : graduations à :30) — à revoir avec le DOM.
- **B.10** — `Segment` gagne `dayCount` et `part`, perd `resourceId` (porté par l'instance) ; un segment hors de `[axis.start, axis.end)` n'est pas dessiné, un segment tronqué par l'axe perd son arrondi de ce côté. `multiDayTimed` reporté (Phase 4).
- **B.12** — `overflow` vit dans `rows.ts`, `PrefixSums` dans `virtual.ts`. `computeOverflow` exige `maxLanes` entier ≥ 1 (1 : un jour débordant ne montre que « +N »).
- **B.16** — `NavContext` = `{firstDay, today}` ; une vue d'un jour saute les jours masqués dans le sens du déplacement. `validRange` et `showNonCurrentDates` : Phase 4. `duration` n'est lu qu'hors alignement `month`.
- **B.17** — `formatRangeTitle` **utilise** `Intl.DateTimeFormat#formatRange` avec des millisecondes (pas de `Date`) ; titres seulement — Intl n'écrit qu'un offset pour la plage. `monthNames` sans `calendar` (le calendrier passe par la locale `-u-ca-`). `weekRulesFor` : `minimalDays` par table CLDR quand le moteur l'omet (V8).
- **B.18 / J Phase 3** — **un kernel minimal entre en Phase 3** : état (date, vue, zone, règles de semaine), `navigate`, `setView`, `setTimeZone`, `viewModel()`, `title()`, `subscribe`, `now()` injectable, et `store` injectable (quatre kernels sur un même store pour `dst.html`). Pas de commandes, historique ni sources avant leur phase.
- **Phase 3, modèle** — clé de segment par date ISO (`id|YYYY-MM-DD|part`), `TimeGridColumn.key`, colonnes inchangées réutilisées par identité, `updateTimeGridModel(prev, snap, change)` guidé par `dirtySpans`, lectures d'offset (`first`/`second` passe) et durée réelle sur `PlacedTimed` les jours de transition, gouttière de graduations, `locateNow(model, now)`.
- **Processus** — fiches `docs/behaviors/*.md` (« +N », `dayCount`, `fixedWeekCount`, hauteur minimale, numéros de semaine) à écrire avant la Phase 4.

### Ajustements après la Phase 3 (revues, détail dans ROADMAP.md)

- **Décisions du propriétaire** : CSS propre de la même famille que tzslot (palette `--tz-*` partagée, mêmes valeurs) ; `slotMax` ≤ 24 h ; GSAP en adaptateur optionnel dès la Phase 3.
- **D.10** — interface livrée `MotionAdapter { viewChange, eventsEnter, destroy }` ; complétée en 17a (voir « Ajustements après la Phase 17a »).
- **B.18** — kernel réel : `store`/`now` injectables, `events`, `timeGrid`/`dayGrid`, `getViewSpec`, `setLocale`, `refreshToday` (pas de timer dans le core), abonnés isolés. À venir (étape 4.0) : `setOptions`, `setEvents`, `batch`, `cause`, registre de familles.
- **D.1** — `KeyedList` (clé + signature) ; colonnes réutilisées par identité ; les tailles se lisent avec repli et ne sont jamais déclarées sur `.dz-cal` ; `scrollbar-gutter: stable`. Étape 4.0 : signatures à deux niveaux, `FrameScheduler`, `Scope`, `Ticker`, `ViewHost`.
- **D.6** — colonne `group`, événement et barre `button` ; l'étiquette parlée dit les offsets (pas « * »), la durée réelle, le fuseau de l'événement s'il diffère. Curseur virtuel et région live : Phase 8.
- **D.7** — `update()` : no-op sur valeurs identiques, un seul dessin, vue non dessinable refusée avant mutation. `update({events})` passera par `replaceSourceChunk` (étape 4.0).
- **D.8** — `dir` déduit de la locale (méthode ou getter `textInfo`), heures en LTR.
- **C.3** — lectures d'offset portées par l'événement (pas le morceau) ; une fin n'est « seconde passe » que *dans* la seconde passe ; graduations alignées sur l'horloge murale (gouttière et mode `elapsed`). Graduations propres à la colonne de transition en mode `elapsed` : à faire.
- **F** — classes et jetons réels : `dz-tg__*`, `dz-ev`, `dz-band--gap|repeat`, `--dz-minute`, `--dz-now`, `--dz-gap-stripe`, `--dz-repeat-bg`, `--dz-event-accent`, `--dz-tone-*`. Pas de `:where()` ; `light-dark()` seul ; `contrast.css` de tzslot agit déjà via `--tz-*`. Un thème ne redéclare pas ce que tzslot possède (rayon). À trancher avant la v1 : renommer selon F, ou F selon le code.
- **J** — étape 4.0 ajoutée en tête de la Phase 4 (liste dans ROADMAP.md).

### Ajustements après la Phase 17b (détail dans ROADMAP.md)

- **D.10 (dom)** : `eventsEnter(nodes, { cause, from? })` (`MotionEnter` : commande, annulation, rétablissement ; la sélection d'origine) ; `eventsLeave(copies, info)` → `Promise` (copies faites **avant** le dessin, des seuls événements touchés — `removed`, `updated`, `seriesChanged` —, dans une couche `.dz-leave`, sans ids ni clé ; `EVENT_NODE` les exclut) et `wantsLeave()` ; `seatsChange` ; `scroll(el, to)` + `ViewCtx.easeScroll` et `scrollEased` (boîte à outils) ; `overlayOpen(el, origine)`, `overlayClose` ; `dragStart(ghosts, kind)` ; `CalendarInstance.motion`. « Aujourd'hui » depuis une autre date fait défiler vers maintenant (comportement du calendrier, amorti s'il y a du mouvement).
- **motion-gsap** : effets `drag`, `leave`, `enter`, `overlay`, `seats`, `scroll`, `rows` ; `plugins` (InertiaPlugin pour un dépôt lancé, ScrollToPlugin pour le défilement) ; préréglages + `tilt`, `leave`.
- **Éditeur** : s'ouvre depuis l'événement ou la sélection, se referme vers lui (fond `inert` pendant la fermeture).
- **Décision du propriétaire (après revue)** : budgets à la mesure + 3 % (dom 44,9 ko, motion-gsap 5,4 ko) ; pas de découpage de motion-gsap tant qu'il reste sous ~6 ko.
- **Non fait, consigné** : la liste ne dissout pas (ses entrées ne sont pas des nœuds d'événement de grille) ; les rangées qui se replient disparaissent sans copie ; le focus après une création depuis une sélection (antérieur à la 17b).

### Ajustements après la Phase 17a (détail dans ROADMAP.md)

- **D.10 (dom)** : `MotionAdapter` gagne `beforeChange(change)` (l'ancien écran encore dessiné) et `afterChange(état, change, body)` (renvoie `true` s'il a animé le changement : `viewChange`/`eventsEnter` ne sont alors pas appelés), `titleChange`, `nowTick` ; `MotionChange { causes, direction, from, to, days, root, rtl }`, `MotionSide { view, family, date, zone, title, days }`. Plusieurs changements avant un même dessin n'en font qu'un (le premier « from », toutes les causes, le dernier « to »). Par défaut `WAAPI_MOTION` (glissement, entrées, surcouches ; coupé sous mouvement réduit et sans `Element.animate`) ; `NO_MOTION` pour rien. Les copies d'impression ont `NO_MOTION`.
- **motion-gsap** : préréglages `SOBER` (défaut) et `EXPRESSIVE` (`MotionPreset`, chaque valeur réglable) ; effets `zone`, `dst`, `now`, `morph`, `odometer`, `today`, `depth` (chacun désactivable) ; `opacity` seulement (jamais `visibility` : le focus reste) ; `matchMedia` suivi dès le premier usage et après un `destroy` (un adaptateur peut servir plusieurs calendriers) ; un `destroy` termine les animations en cours.
- **Décisions du propriétaire (après revue)** : budgets à la mesure + 3 % (dom 43,4 ko, motion-gsap 3,6 ko) ; « aujourd'hui » de loin = un long glissement rapide puis un arrêt amorti, sans faire défiler les périodes intermédiaires ; **plugins de la 17b fournis par l'application** (`createGsapMotion({ plugins: { InertiaPlugin, ScrollToPlugin } })`), l'effet se faisant plus simplement sans eux.

### Ajustements après la Phase 18i-1 — poids : entrées (détail dans ROADMAP.md)

- **Décisions du propriétaire** : la récurrence devient une entrée (`@dzcalendar/core/recurrence` ; sans elle, `recurrence-not-loaded`) ; `@dzcalendar/dom/base` sans vue, `/timegrid` et `/daygrid` en entrées, `@dzcalendar/dom` inchangé. Le benchmark public construit depuis les dists.
- **C (core)** : `recurrence/engine.ts` (registre, imports de types seulement), appels internes par `needRecurrence()` / `recurrenceEngine()` ; code de problème `recurrence-not-loaded`.

### Ajustements après la Phase 18k — retours de production Sehhaty (détail dans ROADMAP.md)

- **Décisions du propriétaire** : un fond « journée » lave toujours ses colonnes horaires ; le `true` d'un événement gagne sur le défaut du calendrier (`perms.own = { start, duration }`, `data-editable`) ; `onProblem` pour les problèmes vus au dessin (console une fois par code sans lui) ; un mois montre tous les événements par défaut, une année « +N ».
- **C (core)** : `timeGrid.labelMinutes` (`ticks(step, labelMinutes)`), `assertTimeGrid`, `TimeGridColumn.outside`, `setOptions(…, { silent })`.

### Ajustements après la Phase 18h — premier rendu (détail dans ROADMAP.md)

- **Décisions du propriétaire** : au-delà de 2 000 événements, la période affichée d'abord, le reste en tâche de fond ; transparent (toute lecture complète termine d'abord le chargement).
- **C (core)** : `source/deferred.ts` (partition par semaine, chargement à la demande d'une période), `kernel.store` devient une façade, `kernel.whenLoaded()`, `ModelFamily.rangeOnly` et l'événement `store` `offscreen`.
- **Décision du propriétaire** : budget core à la mesure + 3 % (45,7 ko).

### Ajustements après la Phase 18g-4 — WCAG 2.2 AA (détail dans ROADMAP.md)

- **Décisions du propriétaire** : l'unique arrêt de tabulation de la grille horaire repose dans les heures visibles (sur maintenant si on le voit) ; la hauteur d'un événement est sa durée (exception « essentielle » de 2.5.8), toute autre cible ≥ 24 px (`--dz-target-min`).
- **D (dom)** : curseur au repos dans une boîte collante (grille horaire et timeline) ; « +N » garde son nombre quand il est étroit (`.dz-more__rest`) ; `selectionCleared` dans les messages ; un menu clavier ne se ferme que si son ancre a bougé.
- **Décision du propriétaire** : budgets à la mesure + 3 % (dom/list 5,4 ko, pro 15,5 ko).

### Ajustements après la Phase 18g-3 — passe visuelle (détail dans ROADMAP.md)

- **Décisions du propriétaire** : en-tête par défaut de FullCalendar (flèches groupées et « aujourd'hui », titre centré, vues) ; événements teintés avec liseré, texte dans le ton (45 % avec le thème, AA vérifié) ; hors service gris pâle, hachures pâles, jours hors mois sans fond. **Chaque choix surchargeable** par l'application : variables `--dz-title-*`, `--dz-button-*`, `--dz-event-*`, `--dz-closed-image`, `--dz-outside-fg`, options `headerToolbar`, `eventStyle`.
- **D (dom)** : événement court sur une ligne par `@container dz-ev` (l'événement est un conteneur de taille).
- **Décision du propriétaire** : budgets à la mesure + 3 % (pro 15,0 ko, premier rendu `timeGridWeek:U` 33 ms).

### Ajustements après la Phase 18g-2 — sans décor et pont Tailwind (détail dans ROADMAP.md)

- **D (dom)** : `look: 'none'` — le CSS découpé déclaration par déclaration en structure et décor ; le décor gardé par `:where(:not([data-dz-look="none"] …))`, sans poids ; paresseux (seulement après un premier calendrier sans décor). Le CSS du thème est construit avec la même garde (`scripts/build-theme.mjs`). `@dzcalendar/theme/tailwind-theme.css` pour Tailwind 4.
- **Décision du propriétaire** : budgets à la mesure + 3 % (dom 54,8 ko, pro/editor 10,9 ko, premier rendu `timeGridWeek:U` 30 ms).

### Ajustements après la Phase 18g-1 — le contrat de style (détail dans ROADMAP.md)

- **D (dom)** : `docs/styling.md` est un contrat versionné (parties `.dz-*`, états `data-*`, jetons `--dz-*`, internes) ; un test le tient contre le code (`scripts/css-contract.mjs`). Les états sont aussi des attributs à côté des classes (`dayStates`, `applyEventLook(el, ev, now)`).

### Ajustements après la Phase 18f-4 — glisser depuis la page et entre calendriers (détail dans ROADMAP.md)

- **D (dom)** : chaque surface de vue est une cible de dépôt de sa page (registre par document) ; `makeDraggable` dans l'entrée `@dzcalendar/dom/drag` ; un dépôt est une commande `event.create` validée comme un geste, dite à `onEventReceive` seulement ; entre deux calendriers, créé là-bas puis retiré ici, ou rien du tout, avec un `revert()` pour les deux. **B (noyau)** : `Placement.external`, `kernel.run({ external })` pour la règle `allow` ; `toInput` exporté.
- **Compat** : leur `Draggable`, `drop`, `eventReceive`, `eventLeave` ; `dz-migrate` réécrit l'import.
- **Décisions du propriétaire** : `makeDraggable` dans une entrée à part ; budgets à la mesure + 3 % (dom 52,9 ko, dom/drag 2,1 ko, locales ar 2,4 ko et de 2,0 ko, compat-fullcalendar 11,3 ko) ; l'alerte axe d'une journée vide reportée à la passe CSS/a11y.

### Ajustements après la Phase 18f-3 — formats et vues personnalisées (détail dans ROADMAP.md)

- **D (dom)** : `formats` (options `Intl` ou une fonction par endroit) ; ce qui est lu garde les mots complets. **B (noyau)** : `titleFormat` / `setTitleFormat` ; `ViewSpec.visibleRange` (période fixe, la navigation ne la déplace pas) ; `views` accepte des réglages complétés et vérifiés à la création ; `setView` et `setOptions` atomiques.
- **Compat** : formats, vues personnalisées et leurs durées traduits.
- **Décision du propriétaire** : budgets à la mesure + 3 % (core 43,0 ko, compat-fullcalendar 10,6 ko).

### Ajustements après la Phase 18f-2 — modèles partout (détail dans ROADMAP.md)

- **Frameworks** : un constructeur commun (`@dzcalendar/dom/toolkit`, `templateHooks`) ; chaque framework ne dit que « ai-je un modèle pour cet élément », ses `hooks` et ses portails. Les crochets sont refaits élément par élément, seulement quand sa part de la forme change. React `render<Élément>`, Vue `#<élément>` (`{ ctx }`), Angular `dz<Élément>` (`let-ctx`) ; les classes et montages par `hooks`, fusionné.
- **D (dom)** : `headerItems`, des places de l'application dans l'en-tête, nommées dans `headerToolbar`. Le contenu d'un élément dessiné à nouveau (le numéro d'une case) est gardé par l'élément stable.
- **Décisions du propriétaire** : une place d'en-tête par nom ; les classes par `hooks` (pas d'entrée par élément). Budgets à la mesure + 3 % (react 3,8 ko, vue 4,0 ko, dom/templates 1,0 ko).

### Ajustements après la Phase 18f-1b — en-tête (détail dans ROADMAP.md)

- **D (dom)** : `headerToolbar` (`start`, `center`, `end` ou `false`) et `customButtons` (`text`, `hint`, `icon`, `click(event, el)`, `active`), vivants par `update()` ; un bouton n'est redessiné que si son apparence change (les fermetures d'un framework sont prises sans redessiner, le focus reste). L'en-tête par défaut inchangé (puis, en 18g-3, celui de FullCalendar : flèches groupées et « aujourd'hui », titre centré, vues). Un en-tête étroit passe sur plusieurs lignes.
- **Compat** : `headerToolbar` traduit entier, `customButtons` avec lui.
- **Décision du propriétaire** : budgets à la mesure + 3 % (dom 49,0 ko, compat-fullcalendar 9,6 ko).

### Ajustements après la Phase 18f-1 — crochets de rendu partout (détail dans ROADMAP.md)

- **D (dom)** : `hooks.<élément>` prend quatre membres (`class`, `content`, `didMount`, `willUnmount`) pour 20 éléments (fiche `docs/behaviors/render-hooks.md`) ; un seul mécanisme (`render/hooks.ts`), celui des événements compris. Les conteneurs (colonne de jour, lignes, vue, panneau « +N ») prennent classes et montages, jamais de contenu. `didMount` attend que le dessin soit dans la page ; de nouvelles fonctions par `update` démontent puis remontent. Exportés à la Pro par `@dzcalendar/dom/toolkit`.
- **Compat** : les 17 familles de crochets FullCalendar traduites par une table.
- **Décision du propriétaire** : boutons de l'en-tête comme FullCalendar plus un gabarit (18f-1b) ; le look de l'en-tête attend la passe CSS. Budgets à la mesure + 3 % (pro 14,5 ko, dom/list 5,0 ko).

### Ajustements après la Phase 18e — retours de Sehhaty (détail dans ROADMAP.md)

- **D (dom)** : crochet `hooks.dayHeader` (contenu, montage, démontage ; date, ressource, longueur du jour, mots du calendrier), gabarits Angular `dzDayHeader`, React `renderDayHeader`, Vue `#day-header`. Les fonds reçoivent le crochet de contenu dans les colonnes horaires (`ctx.background`, étiquette collante). `allDaySlot`, `displayEventTime`, `eventStyle: 'tinted' | 'solid'` (texte `--dz-on-tone`, AA vérifié par test pour chaque ton), `--dz-event-radius`, `dayMaxLanes: null` (les semaines grandissent). Échelle par défaut 1,2 px la minute (densités 0,8 / 1,2 / 1,6). Toutes les options lues à la création deviennent vivantes (`firstDay`, `rules`, `nowIndicator`, `scrollTime`, `dayMaxLanes`, `eventMaxStack`).
- **B (noyau)** : un fond « journée entière » lave aussi sa colonne horaire. `setFirstDay`, `setRules`. Les événements `store` portent la commande et `validated` (une commande validée est celle d'une personne). `history.revert(applied)` reprend exactement une transaction (refusé pour une entrée fusionnée ou une transaction).
- **Sortie `onEventChange`** (dom) et `(eventChange)` / `onEventChange` / `@event-change` : le changement d'une personne (geste, clavier, menu, éditeur, annuler/rétablir), avec `revert()`. La compat ne signale plus que les changements d'une personne ; le fuseau de l'application l'emporte quand les options FullCalendar n'en donnent pas.

### Ajustements après la Phase 18d (détail dans ROADMAP.md)

- **B.14** : `commands.schema.json` généré par le compilateur TypeScript (`scripts/gen-schema.mjs`, sans générateur tiers), vérifié contre les types et contre `run()` ; livré dans `@dzcalendar/core`. `llms.txt` / `llms-full.txt` générés depuis `docs/`.
- **Commandes** : un `scope` inconnu est refusé (`invalid-edit`) ; une clé d'occurrence se lit sans offset, en instant ou en `série@début` ; `EventPatch` accepte `null` (efface `end`, `groupId`, `tone`, `url`).
- **Benchmark public** (`bench-public/`, `npm run bench:public`) contre FullCalendar 6.1 et 7.1, en boîte noire (CLEANROOM.md) : devant sur le travail par opération et la mémoire ; derrière la v7 sur le premier rendu (80 % = indexation de tous les événements à la création) et la taille — les deux chantiers suivants.

### Ajustements après la Phase 18c (détail dans ROADMAP.md)

- **React** `@dzcalendar/react` (18, 19) et **Vue** `@dzcalendar/vue` (3.4, 3.5), au niveau d'Angular : options en props (comparées par contenu ; Temporal par ce qu'ils impriment), `initial` pour ce qui est lu à la création, vue/date/sélection contrôlées (la prop gagne) ou libres, contenu des événements par les composants de l'application (portails React rendus avant l'affichage ; Teleport Vue), contrôleur (`useCalendarController`/`useCalendarState`, `createCalendarController`/`injectCalendarController`), défauts et mouvement par fournisseur ou plugin. Type du composant Vue écrit à la main (génériques différents entre 3.4 et 3.5).
- **Pro** : `pro-react`, `pro-vue` (`useEventEditor` via `controller.takeOver`, `useDzExport`) ; `downloadExport` neutre dans `@dzcalendar/pro/export`.
- **G** : `npm run size` échoue pour un paquet mesuré sans budget. **Décision du propriétaire** : budgets à la mesure + 3 % (react 3,4 ko, vue 3,55 ko, pro-react 0,76 ko, pro-vue 0,7 ko).

### Ajustements après la Phase 18b (détail dans ROADMAP.md)

- **Deux paquets** : `@dzcalendar/compat-fullcalendar` traduit à l'exécution les options d'une application FullCalendar (`createFromFullCalendar`, `applyFullCalendar`, `fromFullCalendar`) ; `@dzcalendar/migrate` (`dz-migrate`, ts-morph, outil seulement) réécrit le code. Le codemod écrit `createFromFullCalendar(el, options).calendar` plutôt que `createCalendar` avec des options renommées : les options restent celles de l'application, traduites et dites à l'exécution.
- **Angular** : entrée secondaire `@dzcalendar/angular/fullcalendar` (`DzFullCalendar`, `[dzFullCalendar]`), le paquet compat en pair optionnel.
- **Rien ne lève** : une option refusée par le calendrier est trouvée clé par clé et dite (`invalid-option`) ; une vue non dessinable est dite avec son import ; code `compat-unsupported`. Les problèmes sont écrits une fois dans la console (`warn: false`).
- **C (sources)** : une source remplacée sous le même id oublie ce qu'elle avait chargé pour les dates non affichées. **D (dom)** : `hasRenderer(family)`.
- **Décision du propriétaire (après revue)** : budget à la mesure + 3 % (compat-fullcalendar 8,7 ko).

### Ajustements après la Phase 18a (détail dans ROADMAP.md)

- **Angular** : `provideDzMotion` (un adaptateur par calendrier) ; `ng add @dzcalendar/angular` (schéma CommonJS dans `dist/schematics`, versions par paquet, idempotent) ; `DzExport` dans `pro-angular` (`@dzcalendar/angular` en pair).
- **Web Component** `@dzcalendar/element` : page ou shadow root (`shadow`), attributs vivants, propriétés, événements `dz-*` composés, rappels « qui offrent » (ouvrir, créer, créneaux) seulement si écoutés ; code de problème `invalid-option` (détails courts).
- **D (dom)** : `activeIn` / `targetOf` pour le focus et les cibles dans un shadow root ; la sonde de mesure placée physiquement.
- **Décision du propriétaire (après revue)** : budgets à la mesure + 3 % (pro-angular 1,5 ko, element 3,0 ko).

### Décisions de la Phase 18 (2026-10-19, en cours)

- **Découpage** : 18a compléments Angular + Web Component ; 18b traducteur FullCalendar + codemod (analyseur de code en dépendance de l'outil seul) ; 18c React, Vue, `llms.txt`, `commands.schema.json`, benchmark public.
- **Benchmark** contre FullCalendar en boîte noire (installé dans `bench-public/` seulement, API publique, code jamais lu ni copié).

### Décisions de la Phase 17 (2026-10-19, en cours)

- **Effets GSAP** : fuseaux et DST (glissement des événements au changement de fuseau, heure répétée qui se déplie, « maintenant » vivant), navigation (morphing mois → jour, titre en odomètre, retour à aujourd'hui, profondeur), événements (glisser physique, dépôt, suppression/annulation, création, vague), surcouches et timeline (ouverture depuis l'origine, accordéon des rangées, défilement amorti, compteur de places).
- **Préréglages** « sobre » (défaut) et « expressif », tout réglable ; **base WAAPI** dans `dom` sans GSAP (< 1 ko) ; **plugins** InertiaPlugin, ScrollToPlugin fournis par l'application (décision après 17a ; Flip reste importé par l'adaptateur) ; `prefers-reduced-motion` coupe tout.
- **Découpage** : 17a fondations + fuseaux/DST + navigation ; 17b événements + surcouches + timeline.

### Ajustements après la Phase 16b (détail dans ROADMAP.md)

- **Décisions du propriétaire (après revue)** : budgets à la mesure + 3 % (`pro/export` 12,3 ko, `pro/print` 4,4 ko, core 41,5 ko, ical 8,1 ko — les deux derniers dépassaient déjà depuis la 16a) ; papier toujours clair (impression et PDF/PNG) ; une colonne « Fuseau de fin » (11 colonnes : la fin d'un vol dans son fuseau).
- **B.18 (kernel)** : `stateAt(type, date)` et `modelAt(type, date, over?)` — une autre vue ou date, telle qu'elle serait affichée (jours masqués compris), sans toucher à l'écran ; `over` pose `timeGrid`/`dayGrid`/`timeline` sur les options en vigueur. Vues cherchées en propre (`Object.hasOwn` : `toString` n'est pas une vue).
- **B.7 (sources)** : `sources.hold(start, end)` charge et garde une période à côté de celle affichée ; `ready` donne les morceaux non chargés (`source:chunk`), signalés en avertissement par les exports.
- **D (dom)** : `CalendarInstance.getOptions()` — les options en vigueur (données puis mises à jour), d'où se fait une copie (impression). Avec un `kernel` externe, ses options propres n'y sont pas.
- **Problème** : `invalid-export` (détails courts : `view:toString`, `to:not-after-from`, `cut:60`, `clipped:2`, `sources:…`).
- **Pro** : `@dzcalendar/pro/export` (`exportPDF`, `exportPNG`, `exportXLSX`, `exportCSV`, `exportICS`, `download` ; dessin pur `paintSheets` → `Pen.ops`, `drawSheet` sur canvas ; `toXLSX`, `toCSV`, `zip`, `pdfFromJpegs`) ; `@dzcalendar/pro/print` (`printPages` : copies du calendrier par période, store partagé, `@page` en longueurs, une impression par document).
- **Non fait, consigné** : pagination des colonnes d'une vue ressource en grille (beaucoup de ressources tiennent serrées sur une feuille) ; ressources repliées comptées dans le découpage ; plusieurs PNG = plusieurs téléchargements (le `zip` existe) ; limite de 1 048 576 lignes XLSX ; une seule feuille de PDF par image.

### Décisions de la Phase 16b (2026-10-19)

- **PDF en images** : chaque page dessinée sur un canvas (le navigateur met en forme l'arabe), images assemblées dans un PDF écrit par nous ; texte non sélectionnable accepté.
- **Impression paginée par le navigateur** : `printPages({ paper, orientation, range })`, pages A4/Letter réelles dans le DOM, en-têtes répétés, puis `window.print()`.
- **Vues** : PDF et PNG dessinent toutes les vues depuis leur modèle, timeline comprise.
- **XLSX/CSV** : une ligne par occurrence ; heures dans le fuseau de l'événement (avec le fuseau) et dans le fuseau d'affichage, durée réelle ; vraies dates Excel.

### Ajustements après la Phase 16a (détail dans ROADMAP.md)

- **Décisions du propriétaire (après revue)** : budgets à la mesure + 3 % (`pro/editor` 10,6 ko, `pro/slots` 1,74 ko, éditeur avec tzslot 37,5 ko) ; `@tzslot/core ^2.2.0` partout (core, rrule : un seul Temporal avec l'éditeur, `TZSLOT_RANGE`).
- **B.16 (commandes)** : `series.rule { id, rrule: string | string[] | null }` (règle refusée si illisible ou horaire sur une série journée ; WKST de la série gardé ; `null` arrête la série : sa première occurrence devient l'événement, les occurrences déplacées deviennent autonomes) ; `event.repeat { id, rrule }` (un événement devient série, même id, tous ses champs et sa source) ; avec `rules` (une personne), `event.create`, `event.repeat` et `series.rule` vérifient les règles sur les occurrences (un an, 500 au plus) ; une règle sans occurrence est un avertissement `invalid-rrule`.
- **D (dom)** : `CalendarInstance.onDestroy(fn)` ; `AvailableSlot.seats` dessiné « 10:00 · 2 places » et dit (message `seatsLeft`).
- **Pro** : `@dzcalendar/pro/editor` (dialogue modal sur `createDateTimeRange` de `@tzslot/dom`, dépendance pair optionnelle ; récurrence comparée en formulaire ; un éditeur par calendrier) ; `@dzcalendar/pro/slots` (places : `capacity`, `seats`, refus `full`, `seatedBusyFromEvents`, `resourceSeats`) ; `@dzcalendar/pro-angular` (`dzEventEditor`, `editorClosed`, éditeur chargé à la demande).
- **Non fait, consigné** : « cet événement et les suivants » avec une autre règle ; rotas et contraintes avancées de capacité ; les mots de tzslot en espagnol et allemand (amont).

### Décisions de la Phase 16 (2026-10-19)

- **Découpage** : 16a = éditeur d'événement et de récurrence, capacité des créneaux, `pro-angular` ; 16b = impression paginée et exports PDF/PNG/XLSX/ICS.
- **Exports sans dépendance** : XLSX (zip de XML) et ICS écrits par nous ; PNG et PDF dessinés depuis le modèle de la vue (canvas pour le PNG, PDF vectoriel simple) ; chargés à la demande depuis une sous-entrée.
- **Éditeur** : dialogue modal accessible ; récurrence usuelle (tous les N jours/semaines/mois/ans, jours de la semaine, « 2e mardi », fin jamais / à une date / après N) ; une règle plus complexe est affichée et conservée telle quelle ; l'application peut le remplacer.
- **Capacité** : places simples (`capacity` par requête ou par ressource, `seats` par réservation, motif de refus `full`) ; pas de rotas.

### Ajustements après la Phase 15b (détail dans ROADMAP.md)

- **Paquet** : `@dzcalendar/pro` = `model-entry.ts` (axe, modèle, famille, vues ; pur, sous-entrée `@dzcalendar/pro/model`) + `timeline/view.ts` + `styles.ts` (`TIMELINE_CSS`). L'import enregistre la famille `timeline` et ses huit vues : registre `registerViewSpec` dans core (les noyaux créés après les connaissent). 13,7 ko (budget 14,1, mesure + 3 %).
- **C.3 réalisé** : axe toujours `elapsed` (position = temps réel ; jours de 23/24/25 h à leur largeur), créneaux coupés à l'heure murale (`resolveWall` les jours de changement) ; une graduation répétée est vue « 02:00* » et dite « 02:00 (+01:00) » (texte masqué + `title`), conformément à D.6 ; un créneau horaire peut couvrir 90 min à Lord Howe (largeur vraie). Suite de conformité `timeline-axis` (11 cas : Paris, Lord Howe, São Paulo 2018, La Havane, Dublin, Kolkata, Apia 2011).
- **B.15** : pas de `Hit` `time` : la timeline donne des `slot` (instant) ou des `day` (échelle en jours) ; `stepHit` lit les `slots` d'un `day` comme des jours ; `KeyContext.grid` = `'timeline'` (←/→ le temps, ↑/↓ intention `across` : la ressource voisine ; sur un événement, ↑/↓ = l'événement voisin) ; `InteractionContext.keepAllDay` (pas de rangée « journée ») : un événement journée reste journée, déplacé par jours ; « Non assigné » (`UNASSIGNED`, sentinelle `\u0000…`) : y déposer retire la ressource saisie, en sortir attribue ; il n'atteint jamais l'application (`DateClick`, `Selection`, hooks).
- **B.18** : `ModelOptions.timeline` (`slot`, `maxLanes`, `fillLanes` ; `assertTimeline` refuse une valeur illisible), `showUnassigned`, `collapsedResources`, `collapsedGroups` (l'état de l'arbre vit dans le kernel) ; `update()` les accepte ; `onResourceToggle` rapporte l'état ; `RowState.collapsed`. Modèle : lignes `resource | group | all`, hauteur fixe + « +N » (décision), ombrage par (heures, zone) mémorisé, corps de lignes réutilisés d'un pli à l'autre (même instantané, même échelle).
- **D** : `InteractionSurface.family` `'timeline'`, `hitAt`/`boxesFor(…, scrollX)`, `insets()`, `KeyboardSurface.hitGrid()` ; `EVENT_NODE`/`BACKGROUND_NODE` partagés ; défilement horizontal suivi, autoscroll horizontal, navigation de bord seulement au bout du défilement (900 ms, comme le mois) ; `CalendarOptions.viewOptions` (options d'une famille de plugin : `viewOptions.timeline.areaColumns`) ; `treegrid` (`aria-level` décalé sous un groupe, `aria-rowindex`, `aria-colcount`/`aria-colindex`), deux arrêts de tabulation (têtes de lignes, curseur) + un pour les séparateurs de colonnes (↑/↓ entre eux), largeur 40–480 px par champ ; jour sauté : `dayDoesNotExist`.
- **G.2** : 500 × 10 000, premier rendu 19 ms réparti sur l'année / 38 ms tout dans la semaine (≤ 80), défilement ≤ 1,1 ms de script par frame, plus longue frame ≤ 25 ms ; rien n'est monté avant la mesure de l'échelle.
- **Non fait, consigné** : constructeur de lignes fenêtré (le modèle construit toutes les lignes, réutilisées d'un pli à l'autre) ; vérification de chevauchement indexée par ressource pendant un glisser ; `didMount`/`willUnmount` et clic de ressource ; Maj+↑/↓ entre lignes ; bancs mois/année avec heures d'ouverture et glisser.

### Ajustements après la Phase 15a (détail dans ROADMAP.md)

- **Décisions du propriétaire (15a)** : vue ressource sans ressource → message « Aucune ressource » (`noResources`) ; événements sans ressource ou sur une ressource inconnue → absents des vues ressource (colonne « non assigné » à rediscuter avec la timeline) ; clavier : ←/→ restent dans les jours d'une ressource, **Alt+←/→** passent à la ressource voisine au même jour et à la même heure (curseur et événement tenu) — nouvelle intention `across` dans `intentFor` ; budgets relevés (mesure + 3 %) : core 39,4 ko, dom 41,7 ko, locales/ar 2,2 ko, premier rendu `timeGridWeek:U` 27 ms (25–27 déjà mesurés à la Phase 14).
- **B.9 réalisé autrement** : `ResourceInput` (`title` facultatif, champs libres par signature d'index au lieu de `group`, `eventConstraint`, `eventOverlap`) ; forme vérifiée et figée `Resource` (`input` gardé, `fieldOf` lit ressource → entrée → `extendedProps`, propres seulement) ; `ResourceNode.resource` est une `Resource` ; `ResourceTree.order` (profondeur d'abord) ; `buildResourceTree(unknown, { orderBy: ResourceOrder })` (champs `'-title'`, `'unit,title'` ou fonction ; une fonction qui lève → ordre d'entrée + avertissement) ; `flattenRows(tree, RowState, filter)` avec lignes `{kind:'resource', resource…}` / `{kind:'group', value, count, expanded}` ; `columnResources(tree, groupBy)` (ressources + têtes de groupes). Problèmes : `invalid-resource`, `resource-cycle` ajoutés ; `duplicate-id`, `unknown-resource`, `unknown-zone` réutilisés ; détails sans phrase.
- **B.13** : `RulesContext.resources` ; chaque ressource de la proposition vérifie son `eventConstraint` (sinon celle du calendrier) contre ses heures (sinon celles du calendrier) **dans sa zone** ; `eventOverlap` d'une ressource tranche pour les événements qu'elle partage (`false` refuse, `true` permet) ; deux événements sans ressource commune ne se rencontrent pas, un événement sans ressource rencontre tous les autres ; une ressource inconnue de l'arbre suit les règles du calendrier. Détail de `constraint` = id de la ressource.
- **B.15** : `proposeMove` remplace la ressource saisie par celle visée et garde les autres (A+C glissé de A vers B → B+C) ; `grabStep(…, resourceId)` ; `DateClick` et la cible du menu portent `resourceId`. Pas encore de `Hit` `time` (timeline, 15b).
- **B.16/B.18** : `ViewSpec.resources` : les vues ressource sont les familles `timeGrid` et `dayGrid` (`resourceTimeGridDay/Week`, `resourceDayGridDay/Week/Month`), pas de nouvelles familles ; colonnes ressources d'abord (pas de dates au-dessus). Kernel : option `resources`, `setResources` (cause `'resources'`, hors historique : ce n'est pas la commande `resource.set` de B.14, reportée), `getResources`, `getResourceProblems`, `resourceOrder`, `resourceGroupField` (dans `ModelOptions`) ; **`ModelFamily.build` reçoit `resources` et `columns`** (changement de l'API `registerModelFamily`). Modèles : `TimeGridColumn.resource`, clés `date|id`, segments et barres suffixés `|id`, `AllDayBar.column`, `allDay.background: AllDayBar[]`, `resourceHeads`/`groupHeads`, `locateNow(...).columns` ; `DayGridWeek.resources` parallèle à `dates` (une rangée = les semaines de toutes les ressources), `firstColumn` compte les cellules ; `AvailableSlot.resourceId`. Tous les nœuds de l'arbre sont des colonnes, parents compris ; le groupement s'applique aux racines.
- **D** : têtes `render/resource-heads.ts` (`.dz-tg__resource`/`.dz-dg__resource`, groupes, `aria-hidden` : chaque colonne ou cellule dit « Ressource, date », message `ofResource`) ; trait de 2 px au début des jours d'une ressource ; ghosts limités aux ressources de la proposition ; ligne de l'heure dans chaque colonne du jour ; `hooks.resource.content` (`ResourceContentCtx`) ; `onResourceProblems` ; Angular `[resources]`, `(resourceProblems)`. Les ressources remplacées pendant une saisie clavier la relâchent ; un curseur dont la colonne disparaît repart de sa place d'accueil.
- **Pour 15b, relevé par l'architecte** : l'état des lignes (dépliées, groupes fermés) n'a pas encore de place dans le kernel ; le modèle construit toutes les colonnes et utilise des indices positionnels (`r × n + jour`) — la timeline aura besoin d'un constructeur de ligne par ressource fenêtré ; la vérification de chevauchement parcourt toute la fenêtre (à indexer par ressource sous 500 × 10 000) ; les hooks de ressource n'ont que `content`. Les créneaux restent des instants : la zone d'une ressource n'est pas passée à `findSlots`.

### Décisions de la Phase 15 (2026-10-18, en cours)

- **Découpage** : 15a = modèle de ressources + vues ressource en colonnes (timeGrid/dayGrid par ressource) ; 15b = timeline ± ressources + virtualisation 2D. Revues et commit par sous-phase.
- **K.6 tranché** : toutes les colonnes dans la zone du calendrier ; la zone d'une ressource sert à ses business hours (calculées dans sa zone) et aux créneaux.
- **Interactions complètes dès 15a** : glisser entre ressources, redimensionner, sélectionner sur une ressource, menu, clavier, règles (dont `eventConstraint`/`eventOverlap` de la ressource), annulation.
- **Zone des ressources (15b)** : arbre, groupes par champ, plusieurs colonnes de champs à largeur réglable.
- **K.5 tranché** : les colonnes de ressources (resource-timeGrid, resource-dayGrid) sont dans core et dom, à côté des grilles qu'elles étendent ; `@dzcalendar/pro` naît en 15b avec la timeline.
- **K.9** : toujours tout en MIT, pas de `license.ts`.
- **15b (2026-10-19)** : huit vues timeline (jour, semaine, mois, année, avec et sans ressources) ; graduations par défaut jour 30 min, semaine 1 h (défilement horizontal, jours au-dessus des heures), mois et année 1 jour, réglables ; rangées de **hauteur fixe avec « +N »** au-delà de N niveaux ; rangée « Non assigné » en option (`showUnassigned`, désactivée par défaut), aussi pour les vues en colonnes.

### Ajustements après la Phase 14 (détail dans ROADMAP.md)

- **Décisions du propriétaire** : disponibilités = plages hebdomadaires dans le fuseau du prestataire + exceptions datées + règles RRULE pour les cas rares ; occupé = intervalles de toute source + événements du calendrier (`busy`), connecteurs Google/Graph/CalDAV plus tard ; **capacité en Pro** (Phase 16, retirée des critères de la Phase 14) ; au clic, le calendrier remonte le créneau (`onSlotClick`), l'application réserve et son serveur revérifie (`checkSlot`) — rien de créé de façon optimiste.
- **Paquet** : `slots/src/{types,availability,engine,busy,problem,index}` — `candidates` et `constraints` réunis dans `engine.ts`, `convert-zone` abandonné (`slot.start.withTimeZone(client)` suffit). API : `findSlots(query) → {slots, problems}`, `checkSlot(query, start) → {ok, slot} | {ok:false, reason, problems?}` (plage facultative), `openSpans`, `busyFromEvents`. Problèmes `invalid-availability`, `invalid-slot-query` ajoutés au core ; `too-many-occurrences` réutilisé pour le plafond (10 000 créneaux, 200 000 départs).
- **Sémantique** : pas en minutes réelles depuis le début de chaque ouverture (une ouverture sans fin : multiples du pas depuis l'epoch ; recherche des ouvertures une semaine en arrière) — la plage ne déplace jamais la grille ; une plage appartient à sa date d'ouverture, une exception remplace les plages qui s'ouvrent ce jour-là ; ouverture `compatible`, fermeture dans une heure sautée = au saut ; un `booking` reçoit les battements et compte dans `maxPerDay` (date du prestataire), un `block` non ; `maxAdvanceDays` = `now` + N jours à la même heure murale ; ordre des refus de `checkSlot` : invalid-query, out-of-range, closed, misaligned, notice, advance, daily-cap, busy.
- **B.13/D.1** — option de modèle `availableSlots` (comparée par identité) → `TimeGridColumn.slots: PlacedSlot[]` (coupés à l'axe, dédoublonnés, un créneau recouvert dessiné jusqu'au départ suivant) ; `slotInstant`. DOM : boutons `.dz-slot` dans `.dz-tg__slots` (entre fond et événements), jetons `--dz-slot-*`, hors de l'ordre de tabulation ; sans `onSlotClick` ils sont désactivés et un appui agit comme sur du temps vide. Mois et liste n'affichent pas de créneaux.
- **D.6** — le curseur clavier annonce « Créneau libre, … » et Entrée réserve ; message `freeSlot` (5 langues). Angular : `[availableSlots]`, `(slotClick)`.
- **G** — budget `slots` 5 ko (3,0 mesurés) ; `slots 30 days at 15 min` 25 ms (6,8 mesurés, minifié). Conformance : suite `slots` (55 cas). La commande sérialisable `find-slots` attend `commands.schema.json` (Phase 18).

### Ajustements après la Phase 13 (détail dans ROADMAP.md)

- **Décisions du propriétaire** : un outil pour tout projet (pas seulement Sehhaty) : CSS de base surchargeable sans effort, mots aussi ; familles `standard`, `slate`, `night`, `pastel`, `frost`, `solar`, `contrast` en clair et sombre, `defineTheme` ; densités ; arabe, espagnol, allemand en imports ; affichage hégirien. Après revue : **la page d'abord** (un `--tz-*` de la page bat la famille) ; plancher **iOS/Safari 15.4** (pas de `light-dark()`) ; **`cssLayers: false`** et `tailwind3.css` pour les remises à zéro hors couche (Tailwind 3, Bootstrap) ; arabe livré tel quel ; budget dom relevé à la mesure + 3 % (38,3 ko), validé par le propriétaire.
- **F** — couches `dzcalendar.base` puis `dzcalendar.theme` ; feuilles en couches ajoutées en fin (après les couches d'un framework), sans couches en tête. Couleur = `--dz-x`, sinon `--dzc-x` résolu sur `.dz-cal` (`--tz-x` de la page, sinon `--dzp-x` de la famille, sinon couleur système). Familles par valeurs simples commutées par `scheme`, `[data-theme]`, `prefers-color-scheme` ; repli `@supports not` pour `color-mix()`. Remplace « `light-dark()` seul » de la Phase 4. `contrast.css` remplacé par la famille `contrast`.
- **D.7/D.8** — options `theme`, `scheme`, `density`, `displayCalendar`, `secondaryCalendar`, `cssLayers` (création) ; locale et calendriers validés ensemble avant toute mutation ; un `update()` sans rapport ne remet pas une locale changée ailleurs (kernel partagé suivi). `messages` est un `Partial`, gardé au changement de langue ; `defineLocale` accepte une fonction de la locale complète (chiffres de la locale).
- **B.18** — `titleFor` des alignements mois/année nomme tous les mois du calendrier affiché (`formatRangeTitle`).
- **I** — `@dzcalendar/theme` : `dzcalendar.css`, `unlayered.css`, `tailwind.css` (v4), `tailwind3.css` ; `docs/theming.md`, `docs/i18n.md` ; `playground/themes.html`, `playground/resets.html` (vraies remises à zéro Tailwind 3, Bootstrap 5.3, Tailwind 4 vérifiées dans Chrome).

### Ajustements après la Phase 12 (détail dans ROADMAP.md)

- **Décisions du propriétaire** : dans le mois, les boutons d'accessibilité d'un jour sont ceux des barres dessinées, tous une fois le jour ouvert (Entrée) ; virtualisation au-delà d'un seuil (`virtualizeAbove`, 500 par défaut) ; « +N » automatique en grille horaire (`eventMaxStack`) ; l'impression montre tout (plafonds levés) ; recyclage des nœuds (`render/pool.ts`) ; budgets à la mesure + 3 % (core 36, dom 35,1, dom/list 4,8 ko).
- **B.10/B.11** — `TimeGridOptions.maxStack` et `TimeGridColumn.more` (`MoreTimed`) ; chemin rapide des positions d'un jour sans changement d'heure ; `CalendarKernel.getOptions()`.
- **D.1/D.2** — `ViewController.relayout?()` (redimensionnement) ; `visibleWindow()` reporté (le contrat des vues custom de D.2 attendra une vue qui en a besoin) ; `KeyedList` retire ce qui part avant de placer le reste et a un crochet `released` ; boîte à outils : `RowWindow`, `onScrollFrame`, `NodePool`. Les mesures passent par le `FrameScheduler`.
- **D.6** — un mois endormi est `aria-hidden` (une grille sans lignes) ; une liste fenêtrée porte `aria-setsize`/`aria-posinset`.
- **D.9** — `preparePrint()` monte tout, lève les plafonds « +N », restaure le défilement ; `autoPrint`.
- **G.2/G.3** — `scripts/perf-browser.mjs` (`npm run perf:browser`) sur le playground minifié, budgets dans `perf/browser-budgets.json` (premier rendu, nœuds, mise à jour d'un événement et nombre de layouts).

### Ajustements après la Phase 11 (détail dans ROADMAP.md)

- **Décisions du propriétaire** : Angular **100 % signaux, 19 et plus** (`peerDependencies` `^19 || ^20 || ^21 || ^22`, chaque version vérifiée par `npm run test:package`) ; composants simples à brancher (`imports: [DZ_CALENDAR]`, aucun fournisseur requis).
- **E** — entrées `sources` (pas `eventSources`) et sortie `selected` (pas `select` : un `select` natif remonterait) ; pas de `resources` ni d'`eventChange` (le `save` des sources, Phase 9) ; `[options]` = clés d'`update()` moins les rappels que le composant transforme en sorties ; options de création par `provideDzCalendar` (jetons `DZ_CALENDAR_DEFAULTS`). Seul `dzEventContent` existe ; ses vues sont dans le conteneur du composant (une vue par nœud d'événement, nœuds déplacés comme un portail). `NgZone` injecté (Noop en zoneless) : tout appel au calendrier hors zone, les sorties dedans. Une valeur refusée par `update()` est signalée à l'`ErrorHandler` sans bloquer les autres. `messages.ts`, `shapes.ts`, `defaults.ts` séparés : non nécessaires.
- **D.7** — `update()` accepte `timeGrid` et `headerViews` ; `LiveSettings.onUnselect` ; le hook `content(ctx, el)` reçoit le nœud.
- **I/J** — playground : `angular.html` à côté de `index.html` (qui reste en JavaScript pur pour les vérifications Chrome) ; `pack:local`, `test:package`.

### Ajustements après la Phase 10 (détail dans ROADMAP.md)

- **Décisions du propriétaire** : vues payées à l'import — `@dzcalendar/dom/list`, `@dzcalendar/dom/multimonth`, `@dzcalendar/dom/custom` (`defineView`), modèles dans `@dzcalendar/core/views`, boîte à outils des familles de vues dans `@dzcalendar/dom/toolkit` (API de plugin : `registerView`, `KeyedList`, `h`, `fillEvent`, `timeLabels`, `attachMenuTriggers`, `createDayGridView`…) ; multi-mois « comme le mois » ; les jours masqués propres à une vue l'emportent sur ceux du calendrier ; six semaines par mois en multi-mois ; budgets dom/list 3,5 ko, core/views 1,5 ko, dom/multimonth 3 ko, dom/custom 1,5 ko.
- **B.16** — `ViewFamily` accepte toute chaîne (une vue `defineView` a pour famille son type ; noms des familles intégrées refusés). `ViewRange.months` (multi-mois : une grille par mois ; la plage va du début de la première grille à la fin de la dernière, ce que les sources chargent). Un alignement `month` hors grille de mois dure `duration`. `hiddenDays` du calendrier (`ModelOptions.hiddenDays`, `weekends: false` côté DOM) : spec effective mise en cache par identité ; jours ISO 1–7 validés. `registerModelFamily` / `ModelFamily` publics.
- **D.1** — `createDayGridView(ctx, { months: true })` dessine des sections de mois (un seul arrêt de tabulation, une seule surface) ; `ViewCtx.weekNumbers`, `ViewCtx.injectStyles`. `visibleWindow()` reporté à la Phase 12 (virtualisation), en membre optionnel.
- **D.6** — numéros de semaine : bouton dans la première cellule de chaque ligne (nommé « Semaine N »), coin de la grille horaire ; liste : une `section` + `h3` par jour, `ul`/`li`, un seul arrêt de tabulation (clavier linéaire, différent des grilles à dessein).
- **G.1** — `--lanes` au moins 1 (`repeat(0, …)` est du CSS invalide : la mesure lisait une seule ligne) ; la mesure des lignes se décide sur la vue montée au moment de la lecture.

### Ajustements après la Phase 9 (détail dans ROADMAP.md)

- **Décisions du propriétaire** : écriture vers le serveur par un `save` optionnel par source (optimiste, retour en arrière annoncé en cas de refus, modification protégée d'un rechargement tant que l'envoi est en cours ; sans `save`, le serveur fait autorité) ; K.8 tranché : table Windows → IANA (CLDR), puis le fuseau IANA dont les règles concordent (avertissement `zone-guessed`), sinon le décalage que donnent les règles du VTIMEZONE à chaque heure (`zone-fixed-offset`) ; budgets core 33 ko, ical 7,5 ko.
- **B.7** — un chunk est fait de dates entières, demandées sur `datesWindow` (UTC+14 → UTC−12) : changer de zone ne recharge rien. `FetchRequest.window` vaut `null` pour une source non découpée. Une réponse peut porter ses problèmes (`SourceResult`). `onLoading`/`onSourceError` deviennent un seul `onSource(notice)` (`loading`, `error`, `problems`, `save-error`, `saved`) et un `KernelEvent` `source`. `fnSource(id, fn, { chunk, … })`, `jsonSource` gagne `params` et des noms de paramètres annulables. `recurrence: 'server'` abandonné (un serveur qui envoie des occurrences envoie des événements). Fichiers : `source/{source,manager,chunks,json-source,export,array-source}`. `store.replaceSourceChunks` applique plusieurs chunks en une transaction. L'id `events` est réservé à l'option du même nom.
- **B.5/B.8** — `EventInput.seriesId` + `recurrenceId` : un override en entrée, relié à sa série dans le même lot. `sourceOf` : ce qu'une édition crée sur une série de source (override, queue coupée) appartient à cette source pour `save` et pour la livraison suivante (adopté sous son id).
- **D.7** — `update({ sources })` : liste complète, specs comparées par identité ; `refetch()` ; `aria-busy` pendant un chargement ; les `messages` de l'application se posent sur ceux de la locale.
- **Paquet `@dzcalendar/ical`** — `parseICal`, `serializeICal`, `icalSource`, `windowsZone` ; dépend de core (et rrule par core), sans `Date` ni DOM (test de pureté).

### Ajustements après la Phase 8 (détail dans ROADMAP.md)

- **B.15** — `intentFor(key, { mode: 'cursor'|'event'|'grab', rtl, grid: 'time'|'day' })` ; en plus : `stepHit` (un jour garde l'heure murale et le passage ; dans un trou, le premier instant après ; un créneau avance en temps écoulé, donc les deux passages d'une heure répétée sont visités), `eventHit`, `grabStep(ctx, grid, held, op, fit)` (eventHit → stepHit → `fit` de la vue → `proposeMove`/`proposeResize`), `heldEvent`. Parité clavier/souris testée sur des séquences.
- **D.1** — `InteractionSurface.keys?: KeyboardSurface` (sans `keys`, pas de clavier) et `focusTarget` ; `attachInteractions` rend `Interactions { refresh, grab, select }` ; état partagé `InteractionShared` (`busy`, `holding`, la sélection affichée).
- **D.3** — touches livrées : Maj+flèches = fin, Alt+Maj+flèches = début (si `eventResizableFromStart`), PageUp/PageDown = ±7 jours, Tab lâche ; ↑ depuis le premier créneau = ligne « journée », ↓ depuis elle = les heures (horaire ↔ journée, annoncé) ; un événement horaire dans le mois ne fait que bouger. Un appui sur le temps du calendrier pendant la saisie y pose l'événement (« Déplacer… » puis un clic : alternative à un seul pointeur, WCAG 2.5.7). La sélection reste affichée (calque des fantômes), poignées de 24 px au tactile, `instance.select()`. Un `click` nu (lecteur d'écran) vaut Entrée.
- **D.6, grille horaire** — curseur = nœud focalisable `dz-cursor` placé par `grid-column` dans la grille qui défile, remplacé à chaque pas (le changement de focus est ce que les lecteurs d'écran disent sûrement) ; `aria-activedescendant` abandonné. En-têtes de jour `aria-hidden` (pas de `columnheader` sans `row`) ; chaque groupe de colonne porte la date et sa vraie durée quand elle n'est pas de 24 h.
- **D.6, mois** — barres et « +N » sont `aria-hidden` (dessinés, pas lus) : axe-core refuse des boutons enfants d'une `row`, même avec `aria-owns`. Chaque `gridcell` contient un bouton masqué (`dz-dg__item`) par événement du jour, ceux derrière « +N » compris ; un seul arrêt de tabulation (focus itinérant) ; l'anneau de focus est reporté sur la barre ou le « +N » (`dz-focus`). Coût : un nœud par événement-jour.
- **D.3 bis** — « Déplacer… » et « Changer la durée… » (`ActionContext.onGrab`, `canResize`) ; Maj+F10 sur le curseur ouvre le menu de ce créneau précis.
- **D.7** — `ScopeRequest` devient une union avec `{ kind: 'delete' }` ; réglage vivant `keyboardUndo` ; Ctrl/Cmd+Z seulement si `editable`. Entrée sur un événement = `onEventClick` (sinon `onEventOpen`). Au clavier, Entrée/Espace sur un créneau sélectionne aussi ce créneau quand `selectable` (le clavier n'a pas de glisser).
- **G.1** — budgets relevés par le propriétaire : core 30 ko, dom 30 ko (mesurés 29,6 et 29,2) ; le CSS structurel est livré minifié (`scripts/css-literal.mjs`).
- **J** — les fichiers `a11y/*` sont intégrés (`interact/keyboard.ts`, région live dans `calendar.ts`). axe-core 4.13.0 dans `npm run test:browser` (WCAG 2.0–2.2 A/AA et bonnes pratiques) ; seule exception admise : `target-size` sur un événement (exception « essentielle » de 2.5.8). ACR : `site/a11y-conformance.md`.


### Ajustements après la Phase 7 (détail dans ROADMAP.md)

- **B.15** — `Hit` = `{kind:'slot', date, instant}` (la vue lit l'axe) ou `{kind:'day', date, allDayRow?}` ; `Proposal` étend `Placement` (l'entrée de `validateProposal`) avec `allDay`, `valid`, `violations`, `ambiguity`, `skipped`. `commandFor(instance, proposal, scope)`. Le snap se fait sur l'horloge murale de la zone d'affichage ; la lecture d'une heure répétée suit le passage sous le pointeur.
- **D.1 / D.3** — `ViewController.surface?: InteractionSurface { root, scroller, family, measure(origin), hitAt(geo, x, y, scrollY), boxesFor(geo, span, scrollY), instanceOf(node) }` au lieu de `hitTest` ; un seul hôte (`interact/host.ts`) pour souris, stylet et tactile. Poignées de redimensionnement dessinées en CSS (`data-resize-end/start`), trouvées par position au `pointerdown`.
- **D.10** — `MotionAdapter` garde `viewChange`/`eventsEnter` et ajoute `dragStart`, `dropRejected`, `captureLayout`/`animateLayout` (Flip), `dropSettle`, `overlayOpen`.
- **D.3** — `surface.accepts(target)` : seules les zones de temps prennent les gestes. Un `Hit` de créneau peut porter `gap` (pointeur dans une heure sautée → premier instant après). `Proposal.ambiguity.edge`. Le dépôt passe par `interact/commit.ts` (`commitProposal`), partagé avec le clavier (Phase 8).

### Ajustements après la Phase 6 (détail dans ROADMAP.md)

- **B.8** — `Series` garde `base` (CalEvent de la première occurrence) au lieu de `template`/`dtstart`/`duration` ; `splitFrom` ajouté. Édition : `editOccurrence(snap, ref, patch, scope, ctx, path, problems, opts)` (problèmes en sortie, pas de `Result`). « all » et « following » éditent l'occurrence telle que la série la produit (pas son override). Les clés (overrides, EXDATE, UNTIL) suivent la **position** de l'occurrence dans la série (la 4ᵉ reste la 4ᵉ) ; la règle est recalée depuis l'occurrence éditée après avoir rendu explicite ce qu'elle tirait de DTSTART ; une coupe « following » qui casserait la phase d'un INTERVAL est refusée (`invalid-edit`). Les règles (`validateProposal`) ne s'appliquent qu'aux gestes : `kernel.run(cmd, { validate: true })`. Passage journée entière ↔ horaire d'une série entière : `invalid-edit`.
- **B.8** — une source qui redonne une série supprime les overrides et les parties scindées localement (la source fait autorité, comme pour les événements).
- **B.6** — `StoreChange.seriesChanged` (toute série modifiée) et `seriesTouched` (seulement celles qui imposent de tout reconstruire) ; un changement d'overrides ou d'EXDATE ne marque que la plage de l'occurrence.
- **B.13** — `validateProposal(snap, proposal, rules)` ; `ConstraintSpec` = `'businessHours' | {groupId} | {spans}` ; `RulesContext { displayZone, businessHours?, constraint?, overlap?, allow?, validRange? }` ; `Violation.code` sans `resource-locked` (Phase 10).
- **B.14** — `Reach { scope?, key? }` sur update/move/resize/delete ; `id` peut être l'id de série, une clé d'instance d'occurrence ou l'id d'un override ; `series.delete` en plus de B.14 ; `resource.set` : Phase 10. `CommandResult` en échec porte `violations`. `CommandContext { normalize, weekStart?, rules? }`. `createHistory` accepte un contexte en fonction (relu à chaque commande).
- **B.18** — `kernel.run(cmd)`, `kernel.history`, `KernelOptions.rules` et `historyLimit`.
- **D.3 bis / D.7** — sous-menus rendus (clavier, ARIA) ; `settings.ts` pour les options vivantes ; `editable`, `onCommandRefused`, `run/undo/redo` sur l'instance DOM.

### Ajustements après la Phase 5 (détail dans ROADMAP.md)

- **B.8** — `@dzcalendar/rrule` est une dépendance du core (compté à part dans les budgets). Itération en numéros de jour civils ; DAILY et plus lent en heure murale (`compatible`), sub-journalier en temps écoulé ; règle stérile arrêtée après un cycle grégorien de 400 ans ; saut jusqu'à la fenêtre (les occurrences antérieures sont comptées, pas construites).
- **B.8** — `Series { id, revision, base, set, overrides, sourceId }` : `base` est la première occurrence (durée = `lengthOf(base)`, jours muraux + reste écoulé). `RecurrenceKey` = chaîne complète du début d'origine, décalage compris. Clé d'instance `escape(seriesId)@key` (ids échappés `%`, `|`, `@`).
- **B.3/B.4** — store : `series`, `seriesIdx` (fin infinie = `MAX_SAFE_INTEGER`), `Mutation` `{ kind: 'series' }`, `StoreChange.seriesTouched` ; `queryInstances` expand dans la fenêtre élargie de la durée ; occurrences matérialisées une fois par objet série (WeakMap). Les modèles reconstruisent tout quand `seriesTouched` n'est pas vide.
- **B.6** — `Normalized` = `{ kind: 'event' } | { kind: 'series' }`, accesseur `itemEvent`. Codes `invalid-rrule`, `invalid-exdate`, `invalid-rdate`.
- **H** — suite `rrule-expand` : attentes calculées par python-dateutil (implémentation indépendante, script hors livraison), plus des cas écrits à la main.
- **B.8** — WEEKLY + BYSETPOS suit la RFC 5545 (l'ensemble est toute la semaine WKST) ; rrule.js (plugin de FullCalendar) et dateutil commencent la première semaine à DTSTART. Écart assumé, épinglé par un cas écrit à la main.

### Ajustements après la Phase 4 (revues, détail dans ROADMAP.md)

- **D.1** — contrat réel : `ViewController { element, body, render(model, state), tick, scrollTo?, destroy }`, enregistré par `registerView(family, factory)` ; chaque vue reçoit un `ViewCtx` dérivé avec son propre `Scope`. `KeyedList` (signatures position/contenu) remplace `reconcile()`. `FrameScheduler` (lecture puis écriture) sert à mesurer ; coalescence des dessins en Phase 7. À ajouter (optionnels) : `hitTest`, `focusFor`, `nodeFor`. Fichiers à plat : `host.ts`, `menu.ts`, `popover.ts`, `toolbar.ts`.
- **D.3 bis** — `ActionItem { id, label, enabled, reason?, shortcut?, icon?, children?, command?, run? }` ; `actionsFor(target, ctx)` sans snapshot ; `ContextMenuCtx = { target, state }` ; `onCreateRequest(CreateRequest)` avec `allDay` ; moment calé sur `snapMinutes`. Sous-menus rendus : Phases 5–6.
- **D.4** — popover : repli JS seul (pas d'ancrage CSS) ; contenu rendu par `render/event.ts` (hooks), fermé à tout changement du calendrier.
- **D.5** — hooks livrés : `event.content` (texte si chaîne), `didMount` (+ cleanup), `willUnmount` ; erreurs d'un hook rapportées, défaut dessiné. `didUpdate`, `isSelected`, `isMirror`, hooks `day`/`moreLink`/`nowIndicator` : Phases 7–8.
- **D.6** — dette : dans le mois, les barres sont filles de la `row`, pas d'une cellule ; arrêts de tabulation multiples. Réglé avec le focus itinérant (Phase 8).
- **D.7** — `CalendarUpdate` : messages, locale, timeZone, view, date, motion, events, hooks, businessHours ; tout est validé avant de toucher au kernel ; valeurs égales sans effet (comparaison superficielle des hooks et messages). `settings.ts` avant la Phase 6.
- **B.13** — `businessIntervals(from, to, input, zone)` ; règles validées à la configuration (`assertBusinessHours`, RangeError). `validateProposal` : Phase 6.
- **B.18** — kernel : registre `registerModelFamily`, `setOptions` (no-op si égal), `setEvents`, `batch`, `refreshToday`, `getViewSpec`, causes et direction ; `DayGridModel` porte `maxLanes` et `options` ; mise à jour fine du mois (`updateDayGridModel`, semaines intactes réutilisées).
- **F** — nouvelles classes et jetons : `.dz-dg__*`, `.dz-bar--timed`, `.dz-more`, `.dz-pop*`, `.dz-menu*`, `.dz-off`, `.dz-probe` ; `--dz-day-head`, `--dz-week-min`, `--dz-off-bg`, `--dz-outside-bg`.
- **G.1** — mesuré : dom 13,7 ko gzip (CSS de structure inclus), core 19,3 ko sans polyfill (80 % du budget avant la récurrence : sous-entrées à envisager).
- **J Phase 4** — atteints : « +N » exact (jsdom et Chrome), popover au clavier, business hours à travers un changement d'heure (cœur), mise à jour fine sans relancer le contenu des voisins, ≤ 1 layout par modification (Chrome, CDP).

---

## 0. Ce que tzslot fait déjà, et que DzCalendar reprend à l'identique

| Convention tzslot | Référence | Conséquence pour DzCalendar |
|---|---|---|
| Une seule porte d'entrée pour Temporal : `Temporal` natif sinon polyfill `/full`, jamais de fallback `Date`. | `core/src/temporal.ts:29-55` | Tout import Temporal passe par `@tzslot/core`, ré-exporté par `@dzcalendar/core/temporal.ts`. Un test de pureté interdit `Date` et le global `Temporal`. |
| Le polyfill est un import statique (~19,7 ko gzip). | `temporal.ts:16-19`, `CLAUDE.md` | Il compte dans nos budgets. Voir G et K. |
| `resolve` → `{exists, ambiguous, offsets, instants}`, calculé par deux lectures `earlier`/`later`. | `slots.ts:106-145` | Réutilisé tel quel (`resolveWallTime`). C'est la primitive de l'axe horaire et du drop sur l'heure répétée. |
| `getDaySlots` marche la journée en heure murale, pas en `+24h`. 0,40 ms/jour. | `slots.ts:156-198`, `ROADMAP.md` | Génère les graduations de l'axe et les candidats du moteur de créneaux. |
| `getMonthGrid` fait toujours 6×7 `PlainDate` ISO. `firstDayFor(locale)` interroge `Intl.Locale.getWeekInfo`. `getWeekdayOrder`. | `grid.ts:31,101,115` | Base de dayGrid mois et des en-têtes. |
| `getRangeInfo` donne la durée écoulée contre la durée murale (`crossesTransition`). | `range.ts:54-87` | Badge « durée réelle » sur un événement qui traverse un changement d'heure. |
| `shiftInstant` passe par la zone. `shiftDayRange` recalcule la fin d'un mois entier. | `shift.ts:76,104` | Navigation par mois et déplacements d'événements. |
| `interop.ts` (`toInstant`, `toPlainDate`) accepte `Date`. | `interop.ts` | **Jamais dans l'API publique de DzCalendar.** Seulement dans `@dzcalendar/compat-fullcalendar` (migration). |
| Widgets `create…(host, options)` renvoyant `{update, clear, destroy}`, boutons gardés dans une `Map` par clé (`time-slots.ts:124`), CSS injecté une fois et `injectStyles:false` pour la CSP. | `dom/src/*` | Même forme pour `createCalendar`. Rendu keyed, pas de VDOM. |
| Wrapper Angular : le widget est créé à la construction, et `effect(() => { const s = this.settings(); untracked(() => widget.update(s)); })`. | `angular/src/calendar.ts:150-168` | Règle des appels widget en `untracked`, reprise partout. |
| L'état d'interface doit survivre à `update({value})`. | `CLAUDE.md` | Contrat central de `update()` (D.7). |
| `tsconfig` du core : `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, ES2022. | `core/tsconfig.json` | Identique, avec `lib` sans DOM pour les paquets purs. |
| Build : `scripts/build.mjs` (tsc par paquet, ng-packagr pour Angular, manifeste de `dist/` réécrit, garde-fou « pas de `src/` dans le manifeste »). | `scripts/build.mjs` | Copié et étendu. |
| Vitest + jsdom + plugin Angular, `test:ci` en 1 worker, `test:memory` avec `--expose-gc`. | `vitest.config.ts`, `package.json` | Même chose, avec des « projects » node/jsdom. |
| Thème : SCSS source → CSS compilé, un test échoue si le CSS dérive, `light-dark()`, variantes `tailwind.css` et `tailwind3.css`. | `theme/*` | Même mécanique. |

### Ce qui manque dans `@tzslot/core` : upstream ou local

Règle de partage : **tout fait de fuseau horaire (temps pur) va upstream. Toute sémantique de calendrier (événement, série, layout) reste dans DzCalendar.** Pour ne pas dépendre du calendrier de release de tzslot, tout est d'abord écrit localement dans `@dzcalendar/core/zone.ts` avec la signature finale. On migre ensuite vers upstream sans casser l'API.

| Manque | Décision | Détail |
|---|---|---|
| `dayInfo(date, zone)` : début et fin d'instant du jour, longueur (23h, 24h, 25h, 23h30, 24h30), liste des transitions du jour. | **Upstream** (tzslot 2.2), local d'abord | Utile aussi aux pickers : « ce jour dure 23 h ». |
| `getTransitions(from, to, zone)` : transitions dans un intervalle. | **Upstream**, local d'abord | Marqueurs DST sur la timeline. |
| `getWeekInfo(locale)` : `firstDay`, `weekend`, `minimalDays`. tzslot n'a que `firstDayFor`. | **Upstream** | Même source `Intl.Locale.getWeekInfo`, avec le même repli getter/méthode que `grid.ts:92-112`. |
| Types `PlainYearMonth`, `PlainMonthDay`, `ZoneId`. | **Local** | `type PlainYearMonth = ReturnType<typeof Temporal.PlainYearMonth.from>`. Trivial. |
| Résolution d'une heure murale avec politique : `compatible`/`earlier`/`later`/`reject`, y compris l'instant d'un trou. `resolve` renvoie `instants: []` dans un trou. | **Local** `zone.ts: resolveWall(date, time, zone, policy)`, construit sur `resolveWallTime` et `toZonedDateTime({disambiguation})` | Besoin propre aux séries et au drop. |
| Grille à nombre de semaines variable (`fixedWeekCount:false`). | **Local** | Prendre `getMonthGrid` et retirer les dernières lignes sans jour du mois (`inMonth`). |
| Numéro de semaine selon la locale (`minimalDays`, `firstDay`). | **Local** | `PlainDate.weekOfYear` ne couvre que l'ISO. |
| Moteur d'intervalles libres/occupés. | **Local** (`@dzcalendar/slots`) | Pas du domaine « picker ». |

---

## A. Vue d'ensemble

### A.1 Couches et paquets


```
                          ┌──────────────────────────────────────────────────────────┐
  Apps / frameworks       │ Angular 18–21      Vanilla JS       (plus tard: React,    │
                          │ @dzcalendar/angular                  Vue, Web Component)  │
                          └───────────────┬──────────────────────────────────────────┘
                                          │ wrappers fins, signals, untracked
  Rendu            ┌──────────────────────▼───────────────────────┐  ┌───────────────┐
  (DOM, light DOM) │ @dzcalendar/dom                              │  │ @dzcalendar/  │
                   │  createCalendar · views (dayGrid,timeGrid,   │◄─┤ theme (CSS    │
                   │  list,multiMonth) · interactions · a11y ·    │  │ vars, SCSS)   │
                   │  popover · render hooks · motion adapter     │  └───────────────┘
                   └───────┬───────────────────────┬──────────────┘
          plugins de vues  │                       │ importe
   ┌───────────────────────▼─────────┐             │            ┌───────────────────────┐
   │ @dzcalendar/pro   (FSL)         │             │            │ @dzcalendar/motion-   │
   │  timeline · resource views ·    │             │            │ gsap (adaptateur,     │
   │  virtualisation 2D · print ·    │             │            │ optionnel)            │
   │  export · éditeur · slots pro   │             │            └───────────────────────┘
   └───────────────┬─────────────────┘             │
                   │                               │
  Modèle & moteurs ▼   (aucun DOM, aucun framework, aucun Date)
   ┌─────────────────────────────────────────────────────────────────────────────────┐
   │ @dzcalendar/core                                                                │
   │  kernel · store persistant+index · sources · séries/édition · ressources ·      │
   │  projection/segmentation · axe horaire · layout · virtualisation (maths) ·      │
   │  règles (businessHours, contraintes) · commandes+historique · interaction pure  │
   │  · navigation · formatage Intl                                                  │
   └──────┬───────────────────────────┬───────────────────────────┬──────────────────┘
          │                           │                           │
   ┌──────▼──────────┐   ┌────────────▼────────┐   ┌──────────────▼───────────┐
   │ @dzcalendar/    │   │ @dzcalendar/ical    │   │ @dzcalendar/slots        │
   │ rrule           │   │ (parse/serialize)   │   │ (moteur de créneaux)     │
   └──────┬──────────┘   └──────────┬──────────┘   └──────────────┬───────────┘
          └──────────────────────────┴─────────────────────────────┘
                                     │
                         ┌───────────▼─────────────┐
                         │ @tzslot/core ^2.1.0     │  Temporal (natif|polyfill),
                         │ (npm, pas de copie)     │  resolveWallTime, getDaySlots,
                         └─────────────────────────┘  getMonthGrid, firstDayFor…

   Transverse : @dzcalendar/conformance (fixtures JSON + schémas + runner), lu par TS, Swift, Kotlin.
```

### A.2 Liste des paquets à terme

| Paquet | Contenu | Licence | Phase |
|---|---|---|---|
| `@dzcalendar/core` | Tout le modèle et les moteurs purs | MIT | 0–… |
| `@dzcalendar/rrule` | RRULE/EXDATE/RDATE sur Temporal, sans modèle d'événement | MIT | 5 |
| `@dzcalendar/ical` | Parse/sérialise iCalendar, source iCal | MIT | 9 |
| `@dzcalendar/slots` | Moteur de créneaux de base (fenêtre, durée, buffers, préavis, busy) | MIT | 14 |
| `@dzcalendar/dom` | Vues dayGrid, timeGrid, list, multiMonth, vues custom, interactions, a11y | MIT | 3– |
| `@dzcalendar/angular` | Composant, `CalendarController`, templates | MIT | 11 |
| `@dzcalendar/theme` | SCSS → CSS, tokens, Tailwind 3 et 4, `contrast.css` | MIT | 0 (minimal) |
| `@dzcalendar/motion-gsap` | Adaptateur GSAP optionnel (Flip, transitions de vues) | MIT, peer `gsap` | 17 |
| `@dzcalendar/conformance` | `cases/**/*.json`, schémas JSON, runner TS | MIT | 1 |
| `@dzcalendar/pro` | timeline ±ressources, zone des ressources de la timeline (arbre, groupes, colonnes de champs), virtualisation 2D étendue, impression paginée, export PDF/PNG/XLSX/ICS, éditeur d'événement et de récurrence, slots avancés | MIT pour l'instant (décision du propriétaire ; FSL envisagée, K.9) | 15–16 |
| `@dzcalendar/pro-angular` | Wrappers Angular du Pro (`dzEventEditor`) | MIT pour l'instant (décision du propriétaire, K.9) | 16 |
| `@dzcalendar/compat-fullcalendar` | Traducteur d'options FC → DzCalendar, codemod | MIT | 18 |
| `@dzcalendar/element`, `react`, `vue` | Web Component, adaptateurs | MIT | 18 |
| `DzCalendarKit` (Swift), `dz-calendar-kotlin` | Ports du core pilotés par la conformité, UI SwiftUI/Compose | à décider | 19+ |

**Gratuit contre Pro.** Reste gratuit, tout ce que FullCalendar MIT fait, plus les failles comblées :
- les vues dayGrid, timeGrid, list, multiMonth et custom ;
- drag, resize, sélection, clavier, undo/redo, popover, business hours, now indicator ;
- les sources (tableau, fonction, JSON, iCal) ;
- la récurrence et l'édition « cette / suivantes / toutes » au niveau modèle ;
- la virtualisation de toutes les vues non-ressource ;
- le modèle de ressources (types, arbre, `resourceId` sur les événements), parce que les événements le portent ;
- slots de base, Angular, a11y.

Pro : timeline, zone des ressources de la timeline (les vues ressource en colonnes sont gratuites, K.5), virtualisation 2D à grande échelle, impression paginée, export, éditeur prêt à l'emploi, slots avancés (capacité, rotas, contraintes).

Rien ne dépend du Pro dans les paquets MIT. Le Pro s'enregistre comme plugin de vues via `registerView` (D.1). La clé de licence est vérifiée hors ligne (signature Ed25519), sans appel réseau (question K.9).

### A.3 Flux de données de bout en bout

```
 EventSource (array|fn|json|ical)           commandes UI / API / clavier
        │ fetch(window, signal)                          │
        ▼                                                ▼
 SourceManager ── ChunkCache ──► normalizeMany ──►  CommandExecutor ──► History (inverses)
        │            (Problem[] jamais d'exception)      │ valide (constraints/overlap/allow)
        └────────────────────────────┬───────────────────┘
                                     ▼
                      EventStore (snapshot persistant, index d'intervalles)
                                     │ StoreChange {added,updated,removed,dirtySpans}
        ┌────────────────────────────┴─────────────────────────────┐
        │                                                          │
   queryInstances(ViewWindow)                              subscribe() → DOM : invalide
   événements + séries expansées (RRULE) + overrides      seulement les conteneurs dirty
        ▼
   Projection : instants → jours de la zone d'affichage (DayInfo 23h/24h/25h)
        ▼  Segment[] (par jour, par colonne de ressource)
   Layout pur : layoutColumn (timeGrid) | packLanes+overflow (dayGrid/timeline) | PrefixSums (virtual)
        ▼  Placement[] en FRACTIONS/unités d'axe (aucun pixel mesuré)
   ViewModel (sérialisable, testé par la conformité)
        ▼
 @dzcalendar/dom : FrameScheduler  [lecture] → [calcul] → [écriture]
        Reconciler keyed (segmentKey) → ne touche que les nœuds dont (rect, revision) changent
        ▼
   Interaction : pointer events / clavier → Hit → DragSession (pur) → Proposal → preview
        ▼ commit
   Command (sérialisable) ──► CommandExecutor ──► store      (boucle fermée)
```

---

## B. `@dzcalendar/core` module par module

Contraintes de paquet :
- `lib: ["ES2023"]`, sans DOM. Les types DOM sont donc une erreur de compilation. Le core déclare lui-même `interface AbortSignalLike { readonly aborted: boolean; addEventListener(...): void; … }`.
- `types: []`, tsconfig strict comme tzslot.
- Zéro `Date` : un test (`test/purity.test.ts`) fait un grep des sources et échoue sur `\bDate\b`, `Date.now`, `globalThis.Temporal`, `from 'temporal-polyfill`.
- Les tests du core tournent en environnement `node`, pas jsdom, pour détecter toute fuite DOM.
- Invariants numériques : les index internes utilisent `epochMilliseconds` (nombre). Les sous-millisecondes sont tronquées à l'indexation mais conservées dans les objets Temporal. Documenté.

### B.1 `temporal.ts`

```ts
export { Temporal, usingPolyfill } from '@tzslot/core';
export type { PlainDate, PlainTime, PlainDateTime, ZonedDateTime, Instant, Duration, DurationLike, Weekday } from '@tzslot/core';
export type PlainYearMonth = ReturnType<typeof Temporal.PlainYearMonth.from>;
export type ZoneId = string;            // identifiant IANA, jamais un offset
export type EpochMs = number;
```

### B.2 `intervals.ts` : algèbre d'intervalles `[start, end)`

```ts
export interface Interval { readonly start: Instant; readonly end: Instant }
export interface MsSpan { readonly s: EpochMs; readonly e: EpochMs }
export function normalizeIntervals(xs: readonly MsSpan[]): MsSpan[];        // tri + fusion O(n log n)
export function unionSpans(a: readonly MsSpan[], b: readonly MsSpan[]): MsSpan[];           // sweep O(a+b)
export function intersectSpans(a: readonly MsSpan[], b: readonly MsSpan[]): MsSpan[];       // O(a+b)
export function subtractSpans(a: readonly MsSpan[], b: readonly MsSpan[]): MsSpan[];        // O(a+b)
export function spansToIntervals(xs: readonly MsSpan[]): Interval[];
```
Invariants : entrée triée disjointe → sortie triée disjointe. Un intervalle vide est supprimé. Sert aux business hours, aux contraintes et au moteur de créneaux.

### B.3 `zone.ts` : faits de fuseau (candidats upstream)

```ts
export type DayKind = 'normal' | 'short' | 'long' | 'irregular';   // 23h, 25h, autre (Lord Howe 23h30/24h30, Apia: jour sauté)
export interface Transition {
  readonly at: Instant;
  readonly offsetBefore: string; readonly offsetAfter: string;
  readonly deltaMinutes: number;                 // +60 (avance), -60 (retour), +30 (Lord Howe)…
  readonly wallBefore: PlainDateTime;            // l'heure murale juste avant
  readonly wallAfter: PlainDateTime;             // juste après
  readonly kind: 'gap' | 'repeat';               // delta>0 : heure inexistante ; delta<0 : heure répétée
}
export interface DayInfo {
  readonly date: PlainDate; readonly zone: ZoneId;
  readonly start: Instant;       // début du jour réel (gère « minuit n'existe pas » : São Paulo/Havane historiques)
  readonly end: Instant;         // début du jour suivant
  readonly lengthMinutes: number;
  readonly kind: DayKind;
  readonly transitions: readonly Transition[];
}
export function dayInfo(date: PlainDate, zone: ZoneId): DayInfo;
export function dayInfos(from: PlainDate, count: number, zone: ZoneId): DayInfo[];    // O(count), réutilise end→start du suivant
export function transitionsBetween(from: Instant, to: Instant, zone: ZoneId): Transition[];
export function resolveWall(date: PlainDate, time: PlainTime, zone: ZoneId,
  policy: 'compatible' | 'earlier' | 'later' | 'reject' | { preferOffset: string }): {
    instant: Instant | null; exists: boolean; ambiguous: boolean; other: Instant | null };
```
Algorithme `dayInfo` : `start = date.toZonedDateTime({timeZone})` (début de jour au sens Temporal), `end = date.add({days:1})` idem. Les transitions sont énumérées par `ZonedDateTime.getTimeZoneTransition('next')` jusqu'à `end` **[À VÉRIFIER : présence dans `temporal-polyfill/full` 1.0.5]**. Repli : comparaison des offsets en `start`/`end`, puis bisection sur les instants (≈ 30 itérations de `offsetNanoseconds`, au plus 2 transitions par jour). Un test compare les deux méthodes.

`resolveWall` s'appuie sur `resolveWallTime` (`exists`, `ambiguous`, `instants`) pour classer le cas. Dans un trou, `instant` = `toZonedDateTime({disambiguation:'compatible'})` (avance), `exists=false`.

### B.4 `event/types.ts` : le modèle d'événement

```ts
export type EventId = string; export type SeriesId = string; export type ResourceId = string;
export type RecurrenceKey = string;     // ZonedDateTime.toString() (offset + [zone]) ou PlainDate.toString()

export type TemporalInput = ZonedDateTime | PlainDate | PlainDateTime | Instant | string;

export interface EventInput {
  id?: string; groupId?: string; title?: string;
  start: TemporalInput; end?: TemporalInput; duration?: DurationLike; allDay?: boolean;
  timeZone?: ZoneId;                       // zone de l'événement quand start n'en porte pas
  resourceId?: ResourceId; resourceIds?: readonly ResourceId[];
  rrule?: string | RRuleObject; exdate?: readonly TemporalInput[]; rdate?: readonly TemporalInput[];
  display?: 'auto' | 'block' | 'list-item' | 'background' | 'inverse-background' | 'none';
  status?: 'confirmed' | 'tentative' | 'cancelled'; busy?: boolean;   // busy : alimente le moteur de slots
  editable?: boolean; startEditable?: boolean; durationEditable?: boolean; resourceEditable?: boolean;
  constraint?: ConstraintSpec; overlap?: boolean | OverlapFn; allow?: AllowFn;
  classNames?: readonly string[]; tone?: string;   // nom de token (--dz-tone-<tone>), pas une couleur codée en dur
  url?: string; extendedProps?: Readonly<Record<string, unknown>>;
}

interface EventCommon {
  readonly id: EventId; readonly groupId?: string; readonly title: string;
  readonly resourceIds: readonly ResourceId[];
  readonly display: NonNullable<EventInput['display']>;
  readonly status: 'confirmed' | 'tentative' | 'cancelled'; readonly busy: boolean;
  readonly perms: { start: boolean; duration: boolean; resource: boolean };
  readonly constraint?: ConstraintSpec; readonly overlap?: boolean | OverlapFn; readonly allow?: AllowFn;
  readonly classNames: readonly string[]; readonly tone?: string; readonly url?: string;
  readonly props: Readonly<Record<string, unknown>>;
  readonly sourceId?: string;
  readonly ref?: { readonly seriesId: SeriesId; readonly key: RecurrenceKey };   // occurrence/override d'une série
  readonly revision: number;              // +1 à chaque modification : invalide les render hooks
}
export interface TimedEvent extends EventCommon { readonly allDay: false; readonly start: ZonedDateTime; readonly end: ZonedDateTime }
export interface AllDayEvent extends EventCommon { readonly allDay: true;  readonly start: PlainDate;     readonly end: PlainDate }  // fin EXCLUSIVE
export type CalEvent = TimedEvent | AllDayEvent;
```
Invariants :
- `start` et `end` d'un événement horaire sont des `ZonedDateTime` **qui peuvent avoir des zones différentes** (vol Paris→Tokyo). La « zone de l'événement » est celle de `start`. `end ≥ start` en instants.
- Un événement journée entière n'a **aucune zone** : il est « flottant ». Il occupe les mêmes dates calendaires pour tous les observateurs. `end > start` (au moins 1 jour).
- Un événement horaire de durée nulle est valide (jalon). Le layout lui donne une hauteur visuelle minimale.

### B.5 `event/normalize.ts` : entrées → modèle, avec rapport

```ts
export type ProblemCode =
  | 'missing-start' | 'invalid-start' | 'invalid-end' | 'invalid-duration' | 'end-before-start'
  | 'unknown-zone' | 'zone-defaulted' | 'offset-only' | 'offset-mismatch'
  | 'wall-time-skipped' | 'wall-time-ambiguous'
  | 'date-object-rejected' | 'foreign-temporal'
  | 'allday-with-time' | 'allday-zone-ignored'
  | 'duplicate-id' | 'invalid-rrule' | 'invalid-exdate' | 'unknown-resource' | 'too-many-occurrences';
export interface Problem {
  readonly code: ProblemCode; readonly severity: 'error' | 'warning';
  readonly path: string;                   // 'events[12].start'
  readonly sourceId?: string; readonly detail?: string;   // code + détail brut ; les phrases viennent des messages du DOM (i18n)
}
export interface NormalizeContext {
  readonly displayZone: ZoneId; readonly defaultEventZone?: ZoneId;
  readonly defaultTimedDuration: Duration;        // défaut PT1H
  readonly defaultAllDayDuration: Duration;       // défaut P1D
  readonly strictZones: boolean;                  // true : un instant/heure murale sans zone = erreur
  readonly newId: () => string;                   // injectable pour les tests
  readonly knownResources?: ReadonlySet<ResourceId>;
}
export type Normalized = { kind: 'event'; event: CalEvent } | { kind: 'series'; series: Series };
export type NormalizeResult =
  | { ok: true; value: Normalized; problems: readonly Problem[] }
  | { ok: false; problems: readonly Problem[] };
export function normalizeEvent(input: EventInput, ctx: NormalizeContext, path?: string): NormalizeResult;
export function normalizeMany(inputs: Iterable<EventInput>, ctx: NormalizeContext, sourceId?: string):
  { items: Normalized[]; report: NormalizationReport };
export interface NormalizationReport { readonly accepted: number; readonly rejected: number; readonly problems: readonly Problem[] }
```
Règles de lecture, décidées :

| Entrée | Résultat |
|---|---|
| `ZonedDateTime` ou chaîne `2026-03-29T09:00[Europe/Paris]` (avec ou sans offset) | Horaire dans cette zone. Un offset incohérent avec les règles → recalculé depuis la zone, avec `offset-mismatch` (`offset:'prefer'`). |
| `PlainDate` ou chaîne `2026-03-29` | Journée entière. Avec `allDay:false` et une zone connue : minuit de cette zone. |
| Chaîne `…Z` / `…+02:00` sans crochet, ou `Instant` | Zone = `timeZone` ?? `defaultEventZone`, sinon zone d'affichage avec `offset-only` (warning). En `strictZones` : erreur. |
| `PlainDateTime` ou chaîne sans offset | Heure murale dans `timeZone` ?? `defaultEventZone` ?? affichage (`zone-defaulted`). Heure inexistante → `compatible` + `wall-time-skipped`. Heure ambiguë → `earlier` + `wall-time-ambiguous`. |
| Un `Date` | **Rejeté** : `date-object-rejected`, avec un `detail` indiquant `Temporal.Instant.fromEpochMilliseconds(d.getTime())` (conversion volontaire par l'appelant). |
| Objet Temporal d'une autre copie du polyfill (`instanceof` faux, `Symbol.toStringTag` correct) | Ré-analysé via `.toString()`, avec `foreign-temporal` (warning). |
| `end` absent | `start + duration` si fournie, sinon la durée par défaut. Une durée peut contenir des jours : elle est appliquée avec `ZonedDateTime.add` (jours en heure murale, heures en temps écoulé). |

Le rapport s'expose via `onProblems(report)` et `calendar.getProblems()`. Rien n'est jeté en silence.

### B.6 `store/` : store immuable indexé

**Choix : arbre AVL persistant (copie de chemin), augmenté de `maxEnd`.** Une mise à jour coûte O(log n). Chaque snapshot est immuable et partage la structure avec le précédent. L'undo et l'optimistic revert sont gratuits, et les snapshots restent cohérents pendant qu'un rendu asynchrone les lit.

```
store/ordered-map.ts   PersistentOrderedMap<K, V>   get/set/delete O(log n), iteration ordonnée
store/interval-tree.ts PersistentIntervalTree<K>    insert/remove O(log n)
                       overlapping(s, e, visit)     O(log n + k)   (élague par maxEnd, arrête quand start ≥ e)
store/store.ts         EventStore, StoreSnapshot
store/changes.ts       StoreChange, Mutation, invert()
store/query.ts         queryInstances
```

Index maintenus par snapshot :
1. `events : PersistentOrderedMap<EventId, CalEvent>`.
2. `timedIdx : IntervalTree` sur les spans horaires `[start.epochMs, end.epochMs]`. Une durée nulle est indexée comme `[t, t+1]`.
3. `dayIdx : IntervalTree` pour les journées entières, en numéros de jour d'époque `[epochDay(start), epochDay(end))`. C'est indépendant de toute zone.
4. `byResource : PersistentOrderedMap<ResourceId, {timed, day}>` : un arbre par ressource, pour qu'une ligne de timeline interroge seulement ses événements.
5. `series : PersistentOrderedMap<SeriesId, Series>` et `seriesIdx : IntervalTree` sur `[dtstart, lastOccurrenceEnd | +∞]`.
6. `bySource : Map<sourceId, Set<EventId>>` (pour remplacer un chunk de source).

```ts
export interface ViewWindow {
  readonly start: Instant; readonly end: Instant;               // fenêtre en instants (zone d'affichage appliquée)
  readonly startDate: PlainDate; readonly endDate: PlainDate;   // fenêtre en dates calendaires, fin exclusive
  readonly displayZone: ZoneId;
}
export interface EventInstance {
  readonly key: string;            // id, ou `${seriesId}@${recurrenceKey}`
  readonly event: CalEvent;        // occurrence matérialisée (identité stable entre deux requêtes)
  readonly origin: 'single' | 'occurrence' | 'override';
}
export interface StoreSnapshot {
  readonly version: number;
  getEvent(id: EventId): CalEvent | undefined;
  getSeries(id: SeriesId): Series | undefined;
  queryInstances(w: ViewWindow, opts?: { resourceId?: ResourceId; includeBackground?: boolean }): EventInstance[];
  readonly counts: { events: number; series: number };
}
export interface EventStore {
  readonly snapshot: StoreSnapshot;
  apply(mutations: readonly Mutation[], cause: StoreChange['cause']): StoreChange;   // une transaction = une notification
  replaceSourceChunk(sourceId: string, chunk: string, items: readonly Normalized[]): StoreChange;
  subscribe(fn: (c: StoreChange) => void): () => void;
}
export interface StoreChange {
  readonly version: number;
  readonly added: readonly EventId[]; readonly updated: readonly EventId[]; readonly removed: readonly EventId[];
  readonly seriesTouched: readonly SeriesId[];
  readonly dirtySpans: readonly MsSpan[];          // ancienne ET nouvelle position de chaque événement touché
  readonly dirtyDays: readonly { s: number; e: number }[];   // idem, jours flottants
  readonly cause: 'command' | 'source' | 'undo' | 'redo' | 'api';
}
export type Mutation =
  | { kind: 'event'; before?: CalEvent; after?: CalEvent }
  | { kind: 'series'; before?: Series; after?: Series };
export function invert(m: Mutation): Mutation;
```
`queryInstances` : (1) événements simples via `timedIdx`/`dayIdx` en O(log n + k) ; (2) séries candidates via `seriesIdx` puis `expandSeries` limité à la fenêtre ; (3) saute les clés d'occurrence qui ont un override ; (4) tri stable par `(start, -durée, titre, key)`. Les occurrences matérialisées sont cachées par `(seriesId, series.revision, key)` : même identité d'objet tant que la série ne change pas, donc pas de re-render inutile.

### B.7 `source/` : sources d'événements

```ts
export interface FetchRequest {
  readonly window: ViewWindow; readonly signal: AbortSignalLike; readonly sourceId: string;
}
export type SourceFetch = (req: FetchRequest) => Promise<readonly EventInput[]> | readonly EventInput[];
export interface ChunkPolicy { readonly unit: 'none' | 'week' | 'month' | 'year'; readonly prefetch: number }  // prefetch en chunks de part et d'autre
export interface EventSourceSpec {
  readonly id: string; readonly fetch: SourceFetch; readonly chunk: ChunkPolicy;
  readonly staleAfter?: Duration; readonly retry?: { attempts: number; backoffMs: number };
  readonly defaults?: Partial<EventInput>;        // tone, classNames, editable… hérités par les événements de la source
  readonly recurrence?: 'client' | 'server';      // 'server' : le serveur renvoie des occurrences, pas de RRULE à expandre
}
export const arraySource  = (id: string, events: readonly EventInput[]): EventSourceSpec;     // chunk 'none'
export const fnSource     = (id: string, fn: SourceFetch, chunk?: ChunkPolicy): EventSourceSpec;
export const jsonSource   = (id: string, o: { url: string; startParam?: string; endParam?: string; zoneParam?: string;
                              method?: 'GET' | 'POST'; headers?: Record<string, string>;
                              map?: (raw: unknown) => EventInput[]; fetchImpl?: typeof fetch }): EventSourceSpec;
// ical : voir @dzcalendar/ical (icalSource)
```
`SourceManager` (`source/manager.ts`) :
- **Découpe en chunks** alignés dans la zone d'affichage (mois civil, par exemple). `ChunkCache` : `Map<chunkKey, {status, fetchedAt, ids, abort}>`.
- **Fusionne** les chunks manquants contigus en **une seule requête** (moins d'appels réseau).
- **Annule** (via `AbortController`) les requêtes dont tous les chunks sont sortis de `fenêtre ∪ prefetch`.
- **Déduplique** les requêtes en vol. Concurrence maximale 4.
- **Génération** : `refetch(sourceId?)` incrémente une génération, et les réponses d'une génération périmée sont ignorées.
- **Application atomique** par `store.replaceSourceChunk` : `refCount: Map<EventId, Set<chunkKey>>` gère l'événement qui chevauche deux chunks. Il appartient aux deux, et disparaît quand les deux l'ont retiré.
- **Notifications** : `onLoading(boolean)`, `onSourceError({sourceId, chunk, error})`, avec retry exponentiel.

### B.8 `recurrence/` : séries et édition (avec `@dzcalendar/rrule`)

```ts
export interface Series {
  readonly id: SeriesId; readonly revision: number;
  readonly template: SeriesTemplate;                 // tout ce qui n'est pas temporel
  readonly allDay: boolean;
  readonly dtstart: ZonedDateTime | PlainDate;
  readonly duration: Duration;                       // durée « zonée » (P1DT2H) : jours en mural, heures en écoulé
  readonly set: RRuleSet;                            // rules, rdates, exdates (voir paquet rrule)
  readonly overrides: ReadonlyMap<RecurrenceKey, EventId>;   // événements détachés qui remplacent une occurrence
  readonly splitFrom?: { readonly seriesId: SeriesId; readonly at: RecurrenceKey };
}
export interface Occurrence { readonly seriesId: SeriesId; readonly key: RecurrenceKey; readonly start: ZonedDateTime | PlainDate; readonly end: ZonedDateTime | PlainDate }
export function expandSeries(s: Series, w: ViewWindow, o?: { limit?: number }): Occurrence[];
export function materialize(s: Series, occ: Occurrence): CalEvent;
```
**Sémantique de l'heure** (corrige les bugs DST/RRULE de FullCalendar, cf. #6729) :
- Un horaire quotidien ou plus lent (`DAILY`…`YEARLY`) est **mural** : le 9 h reste 9 h avant et après le changement d'heure.
- Les fréquences sub-journalières (`HOURLY`, `MINUTELY`, `SECONDLY`) avancent en **temps écoulé**.
- `dtstart` dans un trou donne l'heure suivante (`compatible`). Dans une heure répétée, c'est la première lecture (`earlier`), conformément à RFC 5545. Chaque occurrence ambiguë est signalée dans `Occurrence` (`ambiguous: true`).

`RecurrenceKey` = `ZonedDateTime.toString()` de l'occurrence *originale*, offset compris. Les deux « 02:30 » d'un jour de retour d'heure ont donc deux clés distinctes.

**Édition** (`recurrence/edit.ts`). Les fonctions sont pures : snapshot + intention → `Mutation[]`.

```ts
export type EditScope = 'this' | 'following' | 'all';
export interface OccurrenceRef { readonly seriesId: SeriesId; readonly key: RecurrenceKey }
export type EventPatch = Partial<Pick<CalEvent, 'title' | 'resourceIds' | 'status' | 'busy' | 'tone' | 'classNames'>> &
  { start?: ZonedDateTime | PlainDate; end?: ZonedDateTime | PlainDate; props?: Record<string, unknown> };
export function editOccurrence(snap: StoreSnapshot, ref: OccurrenceRef, patch: EventPatch, scope: EditScope,
  opts?: { overrides?: 'keep' | 'drop'; newId?: () => string }): Result<Mutation[], Violation[]>;
export function deleteOccurrence(snap: StoreSnapshot, ref: OccurrenceRef, scope: EditScope): Result<Mutation[], Violation[]>;
export function rebaseRule(rule: RRule, oldStart: ZonedDateTime | PlainDate, newStart: ZonedDateTime | PlainDate): RRule;
```
Algorithmes :
- **`this`** : crée un événement override `{ref:{seriesId,key}}` avec le patch, et l'enregistre dans `series.overrides`. L'expanseur saute cette clé. Comme l'override est un événement ordinaire de l'index, il est retrouvé à sa **nouvelle** position même s'il a été déplacé hors de la fenêtre d'origine. Une suppression de `this` ajoute un EXDATE (clé ISO complète).
- **`all`** : applique le patch au `template`. Un changement d'heure ou de jour modifie `dtstart` **en heure murale**, et `rebaseRule` recale la règle : `BYDAY` d'une règle hebdomadaire décalé du même nombre de jours, `BYMONTHDAY` remplacé pour une règle mensuelle, `n-ième jour de semaine` recalculé. Les overrides sont gardés par défaut, sauf ceux dont le champ touché entre en conflit avec le patch (`overrides:'drop'` les supprime).
- **`following`** : (a) si l'occurrence est la première, c'est `all`. (b) Sinon, la série d'origine est tronquée : `UNTIL` = début de l'occurrence **précédente** (inclusif), ou `COUNT` réduit au nombre d'occurrences déjà passées. (c) Une nouvelle série est créée avec `dtstart` = l'occurrence éditée (patch appliqué), `COUNT` restant ou `UNTIL` d'origine, et `splitFrom` renseigné. (d) EXDATE, RDATE et overrides postérieurs à la coupure migrent vers la nouvelle série. Choix d'export iCal : deux `UID` liés par `RELATED-TO;RELTYPE=PARENT`, sans `RANGE=THISANDFUTURE` (moins bien supporté).
- Un `EditScope` demandé sur un drag est fourni par un callback `chooseScope(info): Promise<EditScope | null>`. Par défaut `'this'`, et `null` annule.

### B.9 `resource/` : ressources (types et arbre, gratuits)

```ts
export interface ResourceInput {
  id: ResourceId; title: string; parentId?: ResourceId; order?: number;
  group?: string;                               // champ de groupement (resourceGroupField)
  timeZone?: ZoneId;                            // pour businessHours et slots de cette ressource
  businessHours?: BusinessHoursInput | boolean;
  eventConstraint?: ConstraintSpec; eventOverlap?: boolean;
  classNames?: readonly string[]; extendedProps?: Record<string, unknown>;
}
export interface ResourceNode { readonly resource: ResourceInput; readonly depth: number; readonly path: readonly ResourceId[];
  readonly parent: ResourceNode | null; readonly children: readonly ResourceNode[] }
export interface ResourceTree { readonly roots: readonly ResourceNode[]; readonly byId: ReadonlyMap<ResourceId, ResourceNode> }
export function buildResourceTree(inputs: readonly ResourceInput[], o?: { orderBy?: (a: ResourceInput, b: ResourceInput) => number }):
  { tree: ResourceTree; problems: Problem[] };    // cycles, orphelins, doublons → Problem, jamais d'exception
export type ResourceRow =
  | { kind: 'resource'; node: ResourceNode; depth: number; expanded: boolean | null; rowKey: string }
  | { kind: 'group'; label: string; groupKey: string; count: number; rowKey: string };
export function flattenRows(tree: ResourceTree, state: { expanded: ReadonlySet<ResourceId>; groups?: { field: string; collapsed: ReadonlySet<string> } },
  filter?: (r: ResourceInput) => boolean): ResourceRow[];     // O(n)
```
Dans l'arbre, la zone de ressource sert aux business hours et aux slots. L'affichage reste dans la zone du calendrier (K.6, tranché en Phase 15).

### B.10 `project/` : projection événement → vue

```ts
export interface Segment {
  readonly key: string;                 // `${instanceKey}|${dayIndex}|${part}` : clé du réconciliateur DOM
  readonly instance: EventInstance;
  readonly dayIndex: number;            // colonne/jour dans la vue (après hiddenDays)
  readonly resourceId?: ResourceId;
  readonly startsHere: boolean; readonly endsHere: boolean;       // coins arrondis, flèche de continuation
  readonly from: Instant | PlainDate; readonly to: Instant | PlainDate;   // tranche de ce jour
}
export function segmentTimed(ev: TimedEvent, days: readonly DayInfo[]): Segment[];
export function segmentAllDay(ev: AllDayEvent, view: DateIndex): Segment[];
export interface DateIndex { readonly dates: readonly PlainDate[]; colOf(date: PlainDate): number /* -1 si masqué */ }
export function splitByWeek(segs: readonly Segment[], weeks: readonly (readonly number[])[]): Segment[][];
```
`segmentTimed` : recherche binaire du premier `DayInfo` tel que `day.end > event.start`, puis itération tant que `day.start < event.end`. Complexité O(log D + jours couverts). Chaque tranche = `[max(start, day.start), min(end, day.end))`. Un événement qui finit **exactement** à `day.start` n'apparaît pas ce jour-là (fin exclusive). Un événement de durée nulle à `day.start` apparaît. Les `DayInfo` viennent de `dayInfos()` : la journée de 23 h, 25 h ou 23 h 30 est la vraie journée de la zone d'affichage.
`segmentAllDay` : indices par arithmétique `startDate.since(viewStart).days`, découpé aux jours masqués.
Un événement horaire multi-jours en dayGrid devient un segment par jour. Un événement journée entière en timeGrid va dans la rangée « all-day ». Option `multiDayTimed: 'split-columns' | 'all-day-row'`.

### B.11 `project/time-axis.ts` : axe horaire d'une colonne (décision C)

```ts
export type AxisMode = 'wall' | 'elapsed';
export interface AxisTick { readonly position: number; readonly label: PlainTime; readonly instant: Instant | null;
  readonly note?: 'second-pass' | 'first-pass' | 'skipped'; readonly major: boolean }
export interface AxisBand { readonly kind: 'gap' | 'repeat'; readonly from: number; readonly to: number; readonly transition: Transition }
export interface ColumnAxis {
  readonly mode: AxisMode; readonly day: DayInfo;
  readonly length: number;                         // en minutes d'axe
  readonly bands: readonly AxisBand[];             // à hachurer / marquer
  toPosition(i: Instant): number;                  // clampé [0, length]
  fromPosition(p: number, hint?: { prefer?: 'earlier' | 'later' | { offset: string } }):
    { instant: Instant; exists: boolean; ambiguous: boolean; alternative: Instant | null };
  ticks(stepMinutes: number): AxisTick[];
}
export function buildColumnAxis(date: PlainDate, zone: ZoneId,
  o: { mode: AxisMode; slotMin?: DurationLike; slotMax?: DurationLike /* jusqu'à P2D : « 30:00 » */ }): ColumnAxis;
```
Détails d'implémentation :
- Mode `wall` : `toPosition(i) = minutes murales depuis minuit` dans la zone. La graduation reprend `getDaySlots(date, zone, {stepMinutes, minTime, maxTime})` (`exists`, `ambiguous`). Cache LRU `(date, zone, step)`.
- Mode `elapsed` : `toPosition(i) = (i − day.start)/60000`. Les graduations marchent les heures murales et portent `second-pass` sur la deuxième lecture d'une heure répétée. Les heures inexistantes sont absentes.
- `slotMax` au-delà de 24 h est calculé en arithmétique murale sur `PlainDateTime`, puis résolu.

### B.12 `layout/` : algorithmes de placement

**`layout/column.ts` : chevauchements côte à côte (timeGrid)**

```ts
export interface ColItem { readonly key: string; readonly start: number; readonly end: number; readonly order: number }  // unités d'axe
export interface ColPlacement { readonly key: string; readonly lane: number; readonly lanes: number;
  readonly left: number; readonly width: number /* fractions 0..1 */; readonly z: number }
export function layoutColumn(items: readonly ColItem[], o: { minVisual: number; mode: 'side-by-side' | 'cascade'; indent?: number; maxLanes?: number }): ColPlacement[];
```
Algorithme **sweep + coloration d'intervalles gloutonne** : étendre chaque `end` à `max(end, start + minVisual)` pour que le layout corresponde à ce qui est dessiné ; trier par `(start, -end, order)` ; ouvrir/fermer des clusters (composantes connexes de chevauchement) en balayant `maxEnd` ; dans un cluster, affecter chaque élément à la première voie libre (`laneEnd ≤ start`) ; cette coloration est optimale (nombre de voies = clique maximale). Ensuite **expansion à droite** : un élément de voie `l` s'étend sur les voies `l+1…` tant qu'aucun élément de ces voies ne le chevauche (recherche binaire dans la liste triée de chaque voie). `width = span/lanes`, `left = lane/lanes`. Mode `cascade` : `left = depth*indent`, `width = 1 − left`, `z = ordre`. Complexité O(n log n), O(n·voies) au pire.
Important : en mode d'axe `wall`, le layout travaille sur les positions **murales**. Deux événements 02:30 de la première et de la seconde passe se chevauchent visuellement et se placent donc côte à côte. Voir C.

**`layout/rows.ts` : empilement en rangées (dayGrid, timeline)**

```ts
export interface RowItem { readonly key: string; readonly start: number; readonly end: number; readonly rank: readonly number[] }  // colonnes ou px
export function packLanes(items: readonly RowItem[], o?: { gap?: number }): { lanes: ReadonlyMap<string, number>; laneCount: number };
export interface OverflowResult { readonly pieces: readonly { key: string; lane: number; from: number; to: number }[];
  readonly hiddenPerDay: readonly number[]; readonly hiddenKeysPerDay: readonly (readonly string[])[] }
export function computeOverflow(lanes: ReadonlyMap<string, number>, items: readonly RowItem[], dayCount: number, maxLanes: number): OverflowResult;
```
- `packLanes` : tri par `(start, durée décroissante, rank)`, tas min des occupants `(end, lane)`, tas min des voies libres ; complexité O(n log n). Les journées entières passent avant les événements horaires ; `rank` porte l'ordre `eventOrder`.
- `computeOverflow` : pour chaque jour `d`, `hidden[d]` = éléments dont `lane ≥ maxLanes` qui couvrent `d`. Si `hidden[d] > 0`, la dernière voie visible est aussi masquée ce jour-là et sert au lien « +N ». Les barres sont ensuite découpées en `pieces` : plus grandes plages contiguës de jours où elles restent visibles. Complexité O(S·J), avec J ≤ 7 par semaine.

**`layout/virtual.ts` : mathématiques de fenêtre**

```ts
export class PrefixSums { constructor(sizes: ArrayLike<number>); readonly total: number;
  set(i: number, size: number): void; offsetOf(i: number): number; indexAt(offset: number): number }  // Fenwick : O(log n)
export interface VRange { readonly first: number; readonly last: number }   // inclusif
export function visibleRange(sums: PrefixSums | { uniform: number; count: number }, scroll: number, viewport: number, overscan: number): VRange;
export function visible2D(rows: PrefixSums, cols: PrefixSums, scrollTop: number, scrollLeft: number, vw: number, vh: number, overscan: number): { rows: VRange; cols: VRange };
```
Les tailles uniformes prennent un chemin arithmétique O(1). Les tailles variables servent aux lignes de timeline (hauteur = voies×hauteur de voie) et aux colonnes de jours à longueur variable en mode `elapsed`.

### B.13 `rules/` : business hours, contraintes, overlap

```ts
export interface BusinessHoursRule { daysOfWeek: readonly Weekday[]; start: PlainTime | string; end: PlainTime | string | '24:00'; timeZone?: ZoneId }
export type BusinessHoursInput = boolean | BusinessHoursRule | readonly BusinessHoursRule[];
export function businessIntervals(w: ViewWindow, input: BusinessHoursInput, zone: ZoneId): MsSpan[];
export type ConstraintSpec = 'businessHours' | { groupId: string } | { start: TemporalInput; end: TemporalInput } | { span: MsSpan[] };
export type OverlapFn = (still: CalEvent, moving: CalEvent) => boolean;
export type AllowFn = (proposal: Proposal) => boolean;
export interface Violation { readonly code: 'constraint' | 'overlap' | 'allow' | 'valid-range' | 'not-editable' | 'resource-locked'; readonly eventId: EventId; readonly detail?: string }
export function validateProposal(snap: StoreSnapshot, p: Proposal, rules: RulesContext): Violation[];
```
- **`businessIntervals`** : pour chaque jour de la fenêtre dans la zone de la règle, les heures murales sont résolues par `resolveWall` (`compatible`). Un `24:00` ou un horaire de nuit (`22:00`→`06:00`) produit un intervalle qui chevauche le jour suivant. Le résultat est une liste normalisée d'intervalles, donc la nuit de 23 h/25 h donne des intervalles de vraie durée. Cache par `(fenêtre, règle)`.
- **`validateProposal`** : contrainte = l'intervalle proposé ⊆ union de contrainte (`subtractSpans(proposal, constraint)` vide). Overlap = `snap.queryInstances` sur la fenêtre de la proposition (O(log n + k)), filtré par ressource, en excluant l'événement lui-même et les `display:'background'`. `allow` est appelée en dernier.

### B.14 `commands/` : commandes sérialisables, historique

```ts
export type Command =
  | { type: 'event.create'; event: EventInput }
  | { type: 'event.update'; id: EventId; patch: EventPatch }
  | { type: 'event.move'; id: EventId; start: TemporalInput; end?: TemporalInput; resourceIds?: readonly ResourceId[]; scope?: EditScope; key?: RecurrenceKey }
  | { type: 'event.resize'; id: EventId; edge: 'start' | 'end'; to: TemporalInput; scope?: EditScope; key?: RecurrenceKey }
  | { type: 'event.delete'; id: EventId; scope?: EditScope; key?: RecurrenceKey }
  | { type: 'series.split'; id: SeriesId; at: RecurrenceKey; patch?: EventPatch }
  | { type: 'resource.set'; resources: readonly ResourceInput[] }
  | { type: 'batch'; label?: string; commands: readonly Command[] };
export type CommandResult =
  | { ok: true; mutations: readonly Mutation[]; change: StoreChange }
  | { ok: false; violations: readonly Violation[]; problems: readonly Problem[] };
export function applyCommand(snap: StoreSnapshot, cmd: Command, ctx: CommandContext): { result: CommandResult; mutations: Mutation[] };
export interface History {
  readonly canUndo: boolean; readonly canRedo: boolean;
  undo(): boolean; redo(): boolean;
  transaction<T>(label: string, fn: () => T): T;       // regroupe en une entrée
  clear(): void;
}
export function createHistory(store: EventStore, o?: { limit?: number /* 200 */; mergeKey?: (c: Command) => string | null }): History;
```
Propriétés :
- **Les inverses sont des `Mutation`**, pas des commandes. L'undo ne dépend donc ni du serveur ni des règles de validation, et rejoue exactement l'état précédent (y compris la scission d'une série).
- Un drag continu produit une seule entrée grâce à `mergeKey`.
- Une action externe (source rafraîchie) ne passe pas par l'historique. Une entrée d'historique dont les événements ont disparu est ignorée, avec une alerte de cause `'undo'`.
- `scripts/gen-schema.mjs` génère `commands.schema.json` (JSON Schema) à partir de ces types, pour qu'un LLM de l'application hôte puisse les émettre.
- **Optimistic UI** : `eventChange` fournit `revert()`, qui applique les inverses de cette seule transaction si le serveur refuse.

### B.15 `selection.ts`, `interaction/`

```ts
export interface Selection { readonly start: ZonedDateTime | PlainDate; readonly end: ZonedDateTime | PlainDate; readonly allDay: boolean; readonly resourceId?: ResourceId }
export function normalizeSelection(a: Hit, b: Hit, o: { snap: Duration; allDayWhen: 'day-cell' | 'allday-row' }): Selection;

export type Hit =
  | { kind: 'slot'; dayIndex: number; date: PlainDate; position: number; resourceId?: ResourceId }   // timeGrid
  | { kind: 'day';  date: PlainDate; resourceId?: ResourceId }                                       // dayGrid, allday row
  | { kind: 'time'; instant: Instant; resourceId?: ResourceId };                                     // timeline
export interface Proposal { readonly event: CalEvent; readonly start: ZonedDateTime | PlainDate; readonly end: ZonedDateTime | PlainDate;
  readonly resourceIds: readonly ResourceId[]; readonly valid: boolean; readonly violations: readonly Violation[]; readonly ambiguity?: { chosen: Instant; alternative: Instant } }
export function proposeMove(ctx: InteractionContext, ev: CalEvent, grab: Hit, over: Hit): Proposal;
export function proposeResize(ctx: InteractionContext, ev: CalEvent, edge: 'start' | 'end', over: Hit): Proposal;
export function intentFor(key: KeyLike, ctx: { rtl: boolean; mode: 'cursor' | 'event' | 'grab' }): Intent | null;
```
- Les propositions sont **pures** : souris, tactile et clavier fournissent un `Hit`, et le même code produit la `Proposal`. C'est ce qui garantit la parité clavier/souris.
- **Déplacement** : le nouveau début est résolu avec `resolveWall` ; la **durée zonée** de l'événement est conservée (`add(duration)`). Pour une série, la durée est celle de la série. Une cible dans un trou donne l'instant suivant le trou (`exists:false` → avertissement visuel). Une cible dans une heure répétée garde la lecture d'origine si l'événement était déjà dans l'heure répétée, sinon `earlier` avec `ambiguity` renseigné (le DOM offre « 1ʳᵉ / 2ᵉ »).
- **Snap** : `snapDuration` en minutes murales (mode `wall`) ou écoulées (`elapsed`).

### B.16 `views/` : navigation et modèles de vue

```ts
export type ViewFamily = 'dayGrid' | 'timeGrid' | 'list' | 'multiMonth' | 'timeline' | 'custom';
export interface ViewSpec {
  readonly type: string; readonly family: ViewFamily;
  readonly duration: DurationLike;                       // { months: 1 }, { weeks: 1 }, { days: 3 }, { years: 1 }…
  readonly alignment: 'month' | 'week' | 'day' | 'year' | 'none';
  readonly dayCount?: number; readonly fixedWeekCount: boolean; readonly hiddenDays: readonly Weekday[];
  readonly dateIncrement?: DurationLike; readonly showNonCurrentDates: boolean; readonly validRange?: { start?: PlainDate; end?: PlainDate };
}
export interface ViewRange { readonly start: PlainDate; readonly end: PlainDate /* exclusive */;
  readonly activeStart: PlainDate; readonly activeEnd: PlainDate; readonly dates: readonly PlainDate[]; readonly weeks: readonly (readonly PlainDate[])[] }
export interface NavContext { readonly locale: string; readonly firstDay: Weekday; readonly today: PlainDate }
export function computeViewRange(anchor: PlainDate, spec: ViewSpec, ctx: NavContext): ViewRange;
export function navigate(anchor: PlainDate, spec: ViewSpec, dir: 'prev' | 'next' | 'today' | { to: PlainDate }, ctx: NavContext): PlainDate;
export const BUILTIN_VIEWS: Readonly<Record<string, ViewSpec>>;
```
- Pour un mois, `computeViewRange` appelle `getMonthGrid(year, month, firstDay)`. Si `fixedWeekCount:false`, il retire les dernières lignes qui n'ont aucun jour du mois (`inMonth`).
- Les en-têtes viennent de `getWeekdayOrder(firstDay)`. Le premier jour par défaut vient de `firstDayFor(locale)`.
- `navigate` passe par `shiftDayRange` pour le mois entier, et saute les `hiddenDays` pour le pas d'un jour.
- Vues intégrées : `dayGridMonth/Week/Day`, `timeGridWeek/Day`, `listDay/Week/Month/Year`, `multiMonthYear`. Vues personnalisées par composition : `{ type:'timeGridFourDay', family:'timeGrid', duration:{days:4} }`, ou famille `custom` avec un rendu fourni (D.1).
- Un modèle de vue par famille, chacun pur et sérialisable : `buildDayGridModel`, `buildTimeGridModel`, `buildListModel`, `buildMultiMonthModel` (et `buildTimelineModel` dans le Pro). Chaque modèle reçoit la `ViewRange`, le snapshot, la zone d'affichage, les options, et renvoie les segments positionnés plus les bandes (business hours, DST, now).

### B.17 `format/` : formatage et i18n via Intl, sans `Date`

```ts
export type Fmt = Intl.DateTimeFormatOptions;
export function formatTemporal(v: ZonedDateTime | PlainDate | PlainDateTime | PlainTime | PlainYearMonth, f: Fmt, locale: string): string;
export function formatToPartsTemporal(v: ..., f: Fmt, locale: string): Intl.DateTimeFormatPart[];
export function formatRangeTitle(a: ZonedDateTime | PlainDate, b: ZonedDateTime | PlainDate, f: Fmt, locale: string, o?: { separator?: string }): string;
export function weekNumber(d: PlainDate, o: { firstDay: Weekday; minimalDays: number }): number;
export function weekdayNames(locale: string, width: 'narrow' | 'short' | 'long', firstDay: Weekday): string[];
export function monthNames(locale: string, width: 'short' | 'long', calendar?: string): string[];
```
**Astuce sans `Date`** : `Intl.DateTimeFormat#formatToParts(number)` accepte un nombre (ms d'époque). Pour un `ZonedDateTime`, on crée un formateur `{timeZone: zdt.timeZoneId, calendar: zdt.calendarId}` et on passe `epochMilliseconds`. Pour un `PlainDate`, le formateur est en `UTC` et on passe `toZonedDateTime('UTC').epochMilliseconds`. **[À VÉRIFIER en spike de la phase 0 : comportement identique natif et polyfill, `timeZone` + `calendar` des formateurs]**.
- `formatRangeTitle` fusionne les `parts` des deux bouts : préfixe/suffixe communs (même mois et année → « 15–21 mars 2026 »). Il n'utilise pas `formatRange`, qui exige des `Date` ou des Temporal selon l'environnement.
- Les `Intl.DateTimeFormat` sont cachés dans une `Map` par `(locale, JSON(options))`.
- Les 79 locales de FullCalendar sont couvertes par Intl, sans tableau à maintenir. Seuls les **messages** (« aujourd'hui », « +N autres ») sont des dictionnaires : EN et FR livrés, les autres par contribution. Les pluriels viennent de `Intl.PluralRules`.

### B.18 `kernel.ts` : le noyau sans DOM

```ts
export interface KernelOptions { timeZone: ZoneId; locale: string; firstDay?: Weekday; initialDate?: PlainDate; initialView: string;
  views: Record<string, ViewSpec>; sources: readonly EventSourceSpec[]; events?: readonly EventInput[]; resources?: readonly ResourceInput[];
  businessHours?: BusinessHoursInput; rules?: RulesOptions; history?: { limit: number } | false; now?: () => Instant }  // 'now' injectable pour les tests
export interface CalendarKernel {
  readonly store: EventStore; readonly history: History; readonly sources: SourceManager;
  getState(): KernelState;                                     // date, vue, plage, sélection, chargement, problèmes
  dispatch(cmd: Command): CommandResult;
  setView(type: string, date?: PlainDate): void; navigate(dir: 'prev' | 'next' | 'today' | { to: PlainDate }): void;
  setTimeZone(zone: ZoneId): void; setSelection(s: Selection | null): void;
  viewModel(): ViewModel;                                      // appelle buildXxxModel pour la vue courante
  subscribe(fn: (e: KernelEvent) => void): () => void;
  destroy(): void;
}
export function createKernel(o: KernelOptions): CalendarKernel;
```
Le kernel est l'orchestrateur partagé par `dom`, par Angular (via `CalendarController`) et par les ports natifs. Il n'a pas de timer propre : `now()` est injecté, et la ligne « maintenant » est rafraîchie par le DOM.

---

## C. Décision clé : l'axe horaire en timeGrid les jours de changement d'heure

### C.1 Le problème

Dimanche 29 mars 2026 à Paris : 02:00 → 03:00. La journée dure 23 h, et l'heure 02:xx n'existe pas.
Dimanche 25 octobre 2026 : 03:00 → 02:00. La journée dure 25 h, et 02:xx arrive deux fois.
Le timeGrid est une grille où toutes les colonnes partagent les lignes horizontales. Il faut décider ce que signifie une ligne.

### C.2 Options

| | **Option A : axe mural partagé** | **Option B : axe en temps écoulé par colonne** | **Option C (recommandée) : axe mural partagé + marquage explicite de la transition** |
|---|---|---|---|
| Principe | Ligne = heure d'horloge. Une position = heure murale. | Chaque colonne est une règle de 23 h/24 h/25 h à échelle constante. | Comme A, avec marquage visuel et sémantique de la transition, et mode B disponible. |
| Alignement entre colonnes | Parfait | Rompu après la transition de la colonne concernée | Parfait |
| Attentes de l'utilisateur (Google, Outlook, Apple) | Oui | Non | Oui |
| Vérité des durées | Faux le jour de transition : un événement de 1 h dans un trou a l'air de durer 2 h, de 1 h dans une heure répétée a l'air de durer 2 h | Vrai | Faux visuellement, mais le **badge de durée réelle** (`getRangeInfo.crossesTransition`) et la bande hachurée l'expliquent |
| Heure répétée : deux événements à « 02:30 » | Se superposent sans explication | Chacun à sa place | Disposés côte à côte, étiquetés avec leur offset |
| Heure inexistante | Invisible | Absente | Bande hachurée « 02:00–03:00 n'existe pas » |
| Coût d'implémentation | Faible | Moyen (graduations par colonne) | Moyen |

### C.3 Recommandation : C par défaut, B sur demande, B seul pour la timeline

`axis: 'wall' | 'elapsed'` (défaut `'wall'`).

**Mode `wall` (par défaut), comportement exact :**
1. Toutes les colonnes partagent la graduation de gauche (`getDaySlots`).
2. **Trou (avance d'une heure)** : dans la colonne concernée, la bande 02:00–03:00 est dessinée hachurée et marquée `aria-label="02:00 à 03:00 n'existe pas ce jour"`. Une sélection ou un drop qui y tombe est repoussé à 03:00 (instant `compatible`), avec une annonce live. Un événement dont l'heure murale d'entrée est dans la bande est rendu à 03:00 avec le badge « décalé ».
3. **Heure répétée (retour d'une heure)** : la bande 02:00–03:00 est marquée « répétée » dans la colonne. Le **layout travaille sur les positions murales** : les événements des deux passes se chevauchent visuellement et sont donc placés côte à côte par `layoutColumn`. Chacun porte son offset (`02:30 +02:00` et `02:30* +01:00`, avec la convention d'étoile de tzslot, `slots.ts` / `CLAUDE.md`). Un événement à cheval entre les passes affiche sa durée réelle (« 2 h ») dans un badge.
4. **Drop dans l'heure répétée** : voir `Proposal.ambiguity` (B.15). Le DOM affiche un petit sélecteur « 1ʳᵉ fois / 2ᵉ fois ». Pour un événement déjà dans l'heure répétée, la lecture d'origine est conservée.
5. **Jour de 23 h 30 / 24 h 30 (Lord Howe)** : la bande de transition fait 30 minutes. Même mécanisme.

**Mode `elapsed` (option, pour rotas, paie, ops) :** chaque colonne est une règle de temps réel. La colonne de transition fait 23 h ou 25 h de haut à échelle constante. Les graduations de gauche sont celles de la première colonne normale. Les colonnes de transition (`day.kind !== 'normal'`) affichent leurs graduations *dans la colonne*, avec l'indicateur de seconde passe. Les lignes ne s'alignent plus après la transition. C'est assumé et documenté, car c'est le prix de la vérité des durées.

**Timeline : toujours `elapsed`.** L'axe est continu sur plusieurs jours. L'abscisse est une fonction des instants, linéaire par morceaux : `x(i) = cumul(i)`, avec un `PrefixSums` sur les largeurs de créneaux. Les créneaux sont définis en heure murale (par heure, par jour) et peuvent avoir des largeurs inégales (jour de 23 h, 25 h). Le trou n'a pas de graduation, et l'heure répétée porte deux graduations « 02:00 » dont la seconde est annotée. Un événement pose son bord gauche par `x(start)` et son bord droit par `x(end)`, donc sa longueur est toujours vraie.

### C.4 Pourquoi C par défaut
- Il correspond à ce que l'utilisateur attend de tout autre calendrier (alignement des lignes d'une semaine).
- Il rend **explicite** ce que FullCalendar cache : les durées affichées ne mentent plus sans que le calendrier le dise.
- Le mode `elapsed` reste une ligne de configuration, parce que `ColumnAxis` expose la même interface pour les deux modes (B.11), et que le layout n'en dépend pas.

À faire valider (K.1).

---

## D. `@dzcalendar/dom`

### D.1 Rendu sans framework

```
createCalendar(host, options) ─► CalendarInstance
   │
   ├─ kernel (core)
   ├─ ViewHost : monte / démonte un ViewController selon la vue courante
   │     interface ViewController { mount(root, kernel): void; render(frame: Frame): void; unmount(): void;
   │                                hitTest(x:number,y:number): Hit | null; focusFor(intent): void; scrollTo(…): void }
   │     registerView(family, factory)         // plugins : built-ins ET Pro, ET vues custom
   ├─ FrameScheduler : une boucle rAF avec 3 phases
   │     1. lecture (mesures batchées) → 2. calcul (core) → 3. écriture (DOM)
   ├─ Reconciler : keyed par segment.key
   ├─ InteractionHost : pointer + clavier + autoscroll
   ├─ A11y : ARIA, focus itinérant, région live
   ├─ Popover, RenderHooks, MotionAdapter
   └─ styles : injection unique (comme tzslot), `injectStyles:false` pour la CSP
```

**Pas de VDOM global.** Le modèle est le `ViewModel` du core (données pures). Le DOM est un cache : `Map<key, SegmentNode>`.

**Réconciliation par id (`render/reconciler.ts`)**

```ts
export interface SegmentNode { el: HTMLElement; sig: string /* hash (event.revision, titre, classes, état) */; rect: string /* "top,height,left,width" */ }
export function reconcile(parent: Element, prev: Map<string, SegmentNode>, next: readonly SegmentSpec[], hooks: RenderHooks): Map<string, SegmentNode>;
```
- Un segment est créé, retiré, ou mis à jour. Un nœud existant n'est jamais recréé : sinon le focus sous le pointeur serait perdu, comme tzslot l'a appris pour ses boutons (`time-slots.ts:123-124`).
- **Deux niveaux de changement** : (1) la position (`rect`) ne modifie que des variables CSS (`--dz-top`, `--dz-height`, `--dz-left`, `--dz-width`, `--dz-lane`), jamais le contenu ; (2) le contenu n'est ré-exécuté (`onEventUpdate`) que si `event.revision` a changé. Déplacer un événement ne relance donc pas le contenu des autres, ce qui règle le défaut #5594 de FullCalendar.
- **Mise à jour fine** : `StoreChange.dirtySpans` désigne les conteneurs touchés (semaines pour dayGrid, couples colonne-jour pour timeGrid, lignes pour timeline). Seuls ceux-là recalculent `layout*` et se réconcilient. Pour un événement modifié : au plus 2 conteneurs (ancien et nouveau emplacement).
- **Ordre d'insertion** : on n'appelle `insertBefore` que si l'ordre a changé, les nœuds déjà bien placés ne sont jamais déplacés.

**Layout par fractions** : les placements du core sont des fractions (`left`, `width` en %, `top`/`height` en unités d'axe × `--dz-slot-height`). Le rendu est donc `inset-inline-start: calc(var(--dz-left)*100%)`, `inset-block-start: calc(var(--dz-top) * var(--dz-minute-height))`. **Redimensionner le conteneur ne déclenche aucun recalcul de layout** pour timeGrid et la plupart du dayGrid. Seule la hauteur d'une cellule dayGrid avec `dayMaxEvents:'auto'` est mesurée, une fois par resize, via un `ResizeObserver` unique sur l'hôte, déclenché en rAF.

**Mesures batchées (`render/measure.ts`)**

```ts
export interface MeasureRequest<T> { read(): T; apply(v: T): void }
export class FrameScheduler { schedule<T>(r: MeasureRequest<T>): void; flush(): void }   // toutes les `read` d'abord, puis toutes les `apply`
```
Règle de code : **aucune lecture de géométrie dans un chemin d'écriture**. Une lecture ne se fait que dans `read()`. Le test de perf navigateur compte `LayoutCount` (G.3) et échoue au-delà d'1 layout par mise à jour. Le `ResizeObserver` n'observe que l'hôte ; nos écritures ne changent jamais sa taille (`contain: size layout` sur l'intérieur), d'où l'absence de boucle « ResizeObserver loop » (#8082).

### D.2 Virtualisation, toutes vues

Principe : **ne rendre que ce qui intersecte la fenêtre visible** (plus un overscan), sur les deux axes, avec les maths de `core/layout/virtual.ts`. Un pool de nœuds recyclés évite la création/destruction.

| Vue | Axe virtualisé | Détail |
|---|---|---|
| list | lignes (jours + événements) | `PrefixSums` sur les hauteurs de ligne ; hauteurs estimées puis corrigées par mesure unique (`read`) à l'apparition. |
| dayGrid mois | semaines si la vue est tall/scrollable ; sinon seulement les événements | Un mois a 6 lignes : le coût vient des événements. Un jour ne rend que `maxLanes` barres + « +N », donc le nombre de nœuds est borné par `cellules×voies`. |
| multiMonth | mois (lignes de la pile ou de la grille) | Un mois hors fenêtre n'est qu'un conteneur vide à hauteur connue. |
| timeGrid | colonnes de jours (si > N) et événements hors de la fenêtre verticale | La fenêtre verticale (heures) est petite (24 h) : on ne virtualise que si `slotMin..slotMax` est étendu. Les segments hors du viewport d'axe ne sont pas montés. |
| custom | selon la famille | Contrat : un `ViewController` fournit `visibleWindow()`. |
| timeline, vues ressource (Pro) | lignes ET colonnes (2D) | Réalisé en 15b par la vue elle-même (fenêtre de lignes par `PrefixSums`, fenêtre de temps en positions, par demi-écran), pas par `visible2D`. Un seul conteneur défilant : zone et en-têtes collants (`position: sticky`), donc synchronisés sans script. |

L'impression désactive la virtualisation (D.9).

### D.3 Interactions

**Pointer Events unifiés** (`interact/pointer.ts`) : `pointerdown/move/up/cancel` avec `setPointerCapture`. Un seul chemin pour souris, tactile et stylet.

- **Seuil de démarrage** : souris 4 px, stylet 4 px, tactile 8 px (`dragMinDistance`).
- **Pas d'appui long obligatoire** (faille de FullCalendar) :
  - Souris et stylet : le drag démarre au seuil, immédiatement.
  - Tactile : un tap **sélectionne** un événement (poignées de redimensionnement visibles, `aria-pressed`). Sur un événement sélectionné, le drag démarre immédiatement au doigt (`touch-action: none` posé *seulement* sur l'événement sélectionné et ses poignées). Un événement non sélectionné laisse défiler (`touch-action: pan-x pan-y`).
  - Création d'une sélection de plage au tactile : un tap pose un créneau d'une unité, avec deux poignées ajustables. Option `selectLongPress` (défaut 0, désactivé) pour ceux qui préfèrent le geste de FullCalendar.
- **Autoscroll** (dans `interact/host.ts`, 15b) : boucle rAF, à partir du bord des rangées (la zone collante exclue, `surface.insets`),  vitesse proportionnelle à la proximité du bord (zone de 40 px), sur le conteneur vertical du timeGrid et horizontal de la timeline.
- **Navigation par le bord** : tenir un événement près du bord gauche/droit d'un calendrier pendant 600 ms (`dragEdgeNavigate`) passe à la période suivante/précédente.
- **Hit-testing** (`interact/hit-test.ts`) : à la première `pointermove`, une phase `read` met en cache les rectangles de colonnes/lignes visibles ; chaque `move` suivant résout un `Hit` par arithmétique (division/recherche binaire), sans `elementFromPoint` ni lecture de layout pendant le geste.
- **Prévisualisation** : un événement « fantôme » (`ghost.ts`), positionné par variables CSS, et le surlignage de la cible. Les violations (`Proposal.valid:false`) donnent la classe `dz-event--invalid`.
- **Clavier complet** (`interact/keyboard.ts`, produit par `intentFor`) :
  - Dans la grille : flèches = déplacement du curseur (jour/créneau), `Home/End` = début/fin de semaine ou de journée, `PageUp/PageDown` = période précédente/suivante, `Shift+flèches` = étend la sélection, `Entrée/Espace` = dateClick ou valide la sélection.
  - Sur un événement (mode « event ») : `Entrée` = ouvrir ; `M` ou `Alt+Entrée` = **mode saisie** (grab) ; en mode grab, flèches = déplace d'un jour (←/→) ou d'un créneau (↑/↓), `Shift+↑/↓` = redimensionne la fin, `Alt+Shift+↑/↓` = redimensionne le début, `PageUp/PageDown` = ±1 semaine, `Entrée` = valide, `Échap` = annule. Chaque pas est annoncé en région live. Même `Proposal`, mêmes contraintes que la souris.
  - Suppression : `Suppr`. Annuler/rétablir : `Ctrl/Cmd+Z`, `Ctrl/Cmd+Maj+Z` (désactivable).
  - RTL : les flèches gauche/droite sont inversées (`intentFor(..., {rtl})`).

### D.3 bis Menu contextuel (décision du propriétaire)

Toute action est accessible par un menu contextuel sur la **cellule** (créneau, jour) et sur l'**événement** : c'est l'alternative au glisser exigée par WCAG 2.2 (SC 2.5.7), et la seule que l'étude de marché trouve chez un concurrent (MUI X).

**Cœur, pur (`core/actions/`)** :
```ts
export type ActionTarget =
  | { kind: 'slot'; instant: Instant; reading: { exists: boolean; ambiguous: boolean; alternative: Instant | null }; date: PlainDate; resourceId?: ResourceId }
  | { kind: 'day'; date: PlainDate; resourceId?: ResourceId }
  | { kind: 'event'; instance: EventInstance };
export interface ActionItem {
  readonly id: string;                       // 'event.create', 'event.delete', 'view.goToDay', ou celui de l'application
  readonly label: MessageKey | string;
  readonly command?: Command;                // les actions intégrées SONT des commandes (B.14) : validées, annulables
  readonly enabled: boolean; readonly reason?: Violation | ProblemCode;   // désactivée avec sa raison, pas cachée
  readonly shortcut?: string; readonly icon?: string;
  readonly children?: readonly ActionItem[]; // ex. « cette occurrence / les suivantes / toutes » (séries, Phase 6)
}
export function actionsFor(target: ActionTarget, snap: StoreSnapshot, ctx: ActionContext): ActionItem[];
```
- La cible d'un créneau vient de `ColumnAxis.fromPosition` : dans l'heure répétée, le menu propose **les deux lectures** (« 02:30 (+02:00) » / « 02:30 (+01:00) ») ; dans un trou, 03:00 avec la raison.
- Intégrées : créneau → « Nouvel événement ici » (`onCreateRequest` à l'application en Phase 4, commande directe dès que l'éditeur existe), « Coller », « Aller à ce jour » ; événement → « Ouvrir », « Dupliquer », « Déplacer… » (entre dans le mode grab du clavier, Phase 8), « Changer la durée… », « Supprimer » ; série → sous-menu de portée (Phase 6).

**DOM (`dom/menu/`)** : `role="menu"`/`menuitem`, flèches, Début/Fin, recherche par frappe, Échap restitue le focus, sous-menus ; `popover` natif **dans** `.dz-cal` (thème, `color-scheme`, `dir`), placé au pointeur ou ancré à l'élément focalisé, retourné pour rester visible. Déclencheurs : `contextmenu` (souris), appui long tactile de 500 ms annulé par tout défilement (ne bloque jamais le scroll), touche Menu et `Maj+F10` sur la cellule ou l'événement focalisé.

**Hook** : `contextMenu?: (ctx: ContextMenuCtx, defaults: readonly ActionItem[]) => readonly ActionItem[] | null` — garder, réordonner, ajouter des actions métier, ou `null` pour laisser le menu du navigateur. Les items sont des données rendues par le calendrier (thème, RTL, a11y sans effort pour l'application).

**Phasage** : coquille du menu + actions de lecture (aller au jour, actions de l'application, « Nouvel événement » par callback) en **Phase 4**, avec le popover « +N » dont il partage l'ancrage ; actions d'édition branchées sur les commandes en **Phase 6/7** ; « Déplacer… » au clavier en **Phase 8** (mode grab).

### D.4 Popover « +N »

`popover/popover.ts` : le lien « +N autres » ouvre un popover listant les segments cachés du jour. Il utilise l'attribut `popover` HTML et le **CSS anchor positioning** quand il est disponible (Baseline janv. 2026 d'après le doc d'analyse), avec un repli JS minimal (~1 ko : placement sous/au-dessus, retournement) sinon. Focus piégé et restitué, `Échap` ferme, les événements du popover sont des segments normaux (focusables, déplaçables au clavier).

### D.5 Hooks de contenu (render hooks)

```ts
export interface EventContentCtx { event: CalEvent; instance: EventInstance; segment: SegmentInfo; view: ViewInfo; isMirror: boolean; isDragging: boolean; isSelected: boolean; timeText: string; displayZone: ZoneId }
export interface Hooks<Ctx> {
  content?: (ctx: Ctx) => string | Node | { html: string } | null;     // le rendu par défaut est fourni
  didMount?: (arg: { el: HTMLElement; ctx: Ctx }) => void | (() => void);   // le retour est le cleanup
  didUpdate?: (arg: { el: HTMLElement; ctx: Ctx }) => void;
  willUnmount?: (arg: { el: HTMLElement; ctx: Ctx }) => void;
}
export interface CalendarHooks { event?: Hooks<EventContentCtx>; day?: Hooks<DayCtx>; resource?: Hooks<ResourceCtx>; slotLabel?: Hooks<SlotCtx>; moreLink?: Hooks<MoreCtx>; nowIndicator?: Hooks<NowCtx>; dayHeader?: Hooks<HeaderCtx> }
```
`didUpdate` n'est appelé que si `event.revision` ou l'état (`isSelected`…) change, jamais pour un simple déplacement du voisin. Un hook peut être appelé *après* le montage d'un segment recyclé par la virtualisation : le contrat garantit `willUnmount` avant recyclage.

### D.6 Accessibilité

| Vue | Rôles ARIA |
|---|---|
| dayGrid | `role="grid"` ; rangées `role="row"`, cellules `role="gridcell"` avec `aria-label` complet (« lundi 16 mars 2026, 3 événements ») ; événements `role="button"` dans la cellule, ancrés par `aria-describedby`. **Focus itinérant à deux niveaux** : un seul stop de tabulation (la cellule courante) ; `Entrée` sur une cellule non vide passe aux événements de la cellule ; `Échap` revient. |
| timeGrid | Corps focusable unique avec **curseur virtuel** (`aria-activedescendant` vers un élément « curseur » déplacé), parce que le nombre de créneaux (96×7) interdit un nœud par créneau. En-têtes de colonne `role="columnheader"`. Les événements sont de vrais boutons, atteignables au `Tab`. |
| list | `role="list"` d'événements, groupes par jour avec `role="group"` + titre de niveau `aria-level`. |
| timeline (Pro) | `role="treegrid"`, `aria-level/expanded` sur les lignes de ressources, `aria-rowindex/colindex` et `aria-rowcount/colcount` pour la virtualisation. |
| Heure de transition | Annotations `aria-label` des bandes (C.3) ; annonce live « 02:30 existe deux fois ». |

- **Région live** polie (`a11y/live-region.ts`) : `messages.announce.picked/moved/resized/invalid` avec les valeurs formatées par `Intl`.
- **WCAG 2.2** : alternative au glisser (SC 2.5.7) = mode grab + éditeur (Pro) ; cibles ≥ 24×24 px (variable `--dz-target-min`) ; focus non masqué (2.4.11) ; contrastes dans les tokens ; `forced-colors` via `contrast.css`.
- Chaque événement expose `aria-label` = `titre, heure début à heure fin (zone si différente), durée réelle si transition`.

### D.7 API impérative et contrat `update()`

```ts
export interface CalendarSettings { /* options */ }
export interface CalendarInstance {
  readonly kernel: CalendarKernel;
  update(patch: Partial<CalendarSettings>): void;
  getState(): CalendarState;                               // date, vue, plage, titre, sélection, canUndo/Redo, loading, problems
  dispatch(cmd: Command): CommandResult;
  prev(): void; next(): void; today(): void; goTo(d: PlainDate): void; changeView(type: string, d?: PlainDate): void;
  select(s: Selection | null): void; undo(): boolean; redo(): boolean;
  refetch(sourceId?: string): void; scrollToTime(t: PlainTime | string): void;
  preparePrint(): () => void; destroy(): void;
}
export function createCalendar(host: HTMLElement, options?: Partial<CalendarSettings> & { injectStyles?: boolean }): CalendarInstance;
```
**`update()` est conçu pour un framework qui rend la valeur à chaque changement** (leçon tzslot).
1. Chaque clé du patch est comparée à sa valeur précédente (`Object.is` pour les références, comparaison structurelle courte pour les Temporal : `equals`). Une clé inchangée est un no-op complet.
2. L'instance mémorise la **dernière valeur qu'elle a émise** pour `date`, `view` et `selection` (callbacks `onDateChange`, `onViewChange`, `onSelect`). Si `update({date})` reçoit exactement cette valeur, ce n'est pas une navigation : rien ne bouge. C'est la protection contre « le framework renvoie la valeur et réinitialise l'état entre deux clics ».
3. **L'état d'interface n'est jamais dans les options** et survit à tout `update()` : focus et curseur de grille, décalage de défilement, popover ouvert, sélection armée, geste en cours, ressources dépliées, poignées d'un événement sélectionné.
4. Un changement de `events` (référence) passe par `diffEvents(prev, next)` (O(n), identité puis égalité superficielle par `id`) et produit un `StoreChange` fin ; un changement de `timeZone` ou `locale` recalcule les projections sans perdre l'état ; un changement de `view` conserve la date.
5. Les tests de `update()` (H) rejouent la séquence « interaction, `update` avec la valeur renvoyée, interaction » pour chaque état listé.

### D.8 RTL

Propriétés CSS logiques partout (`inset-inline-start`, `margin-inline`, `padding-block`). `dir` pris de la locale (`Intl.Locale#getTextInfo()/textInfo` **[À VÉRIFIER]**) ou de l'option `direction`. Le `hit-test` inverse l'abscisse en RTL, `intentFor` inverse les flèches, la timeline RTL place le temps de droite à gauche.

### D.9 Impression

Feuille d'impression dans le thème : `@media print` (cellules à bordures nettes, couleurs forcées via `print-color-adjust: exact`, `break-inside: avoid` sur les événements). `preparePrint()` désactive la virtualisation, rend la fenêtre entière de façon synchrone et renvoie une fonction de restauration ; `beforeprint`/`afterprint` l'appellent automatiquement quand `autoPrint:true`. Le Pro ajoute la pagination de la timeline (découpe en colonnes de pages, en-têtes répétés).

### D.10 Animations : GSAP optionnel

```ts
export interface MotionAdapter {
  captureState(els: readonly Element[]): MotionSnapshot;                    // avant une mise à jour du DOM
  animateFrom(snap: MotionSnapshot, o: { duration: number; ease?: string }): void;   // après : FLIP
  viewTransition(o: { from: Element; to: Element; direction: 'prev' | 'next' | 'none' }, swap: () => void): Promise<void>;
  kill(): void;
}
```
- **Défaut sans dépendance** : transitions CSS et Web Animations (WAAPI) pour le FLIP d'un événement déplacé ; `document.startViewTransition` (View Transitions, same-document) pour le changement de vue quand l'API existe.
- **`@dzcalendar/motion-gsap`** : implémente `MotionAdapter` avec GSAP Flip (`Flip.getState` / `Flip.from`) et des timelines de transition de vue. Paquet MIT séparé, `gsap` en `peerDependency` optionnelle, **jamais importé par core ni par dom**. À vérifier : conditions de licence GSAP au moment de la publication (K.10).
- **`prefers-reduced-motion: reduce`** : `MotionAdapter` par défaut devient no-op ; l'adaptateur GSAP doit lire `matchMedia` et ne rien jouer (testé).

### D.11 Messages

`messages.ts` (EN, FR) comme tzslot : libellés du bouton « aujourd'hui », « +N autres » (pluriels `Intl.PluralRules`), annonces a11y, libellés de bande de transition. Injectables via `messages` (option) ; le DOM est le seul endroit où naissent des phrases (le core ne renvoie que des codes).

---

## E. `@dzcalendar/angular`

```
packages/angular/src/
  index.ts · calendar.ts · controller.ts · providers.ts · templates.ts · shapes.ts · defaults.ts · messages.ts
```

**Composant** (`<dz-calendar>`, standalone, `OnPush`), construit sur le même patron que `tz-calendar` (`angular/src/calendar.ts:150-168`) :

```ts
@Component({ selector: 'dz-calendar', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush, providers: [CalendarController], template: '' })
export class DzCalendar implements OnDestroy {
  // données
  readonly events        = input<readonly EventInput[]>([]);                 // diff par id côté DOM, pas de deepChangeDetection
  readonly eventSources  = input<readonly EventSourceSpec[]>([]);
  readonly resources     = input<readonly ResourceInput[]>([]);
  // état bidirectionnel
  readonly view          = model<string>('dayGridMonth');
  readonly date          = model<PlainDate | undefined>(undefined);
  readonly selection     = model<Selection | null>(null);
  // options
  readonly timeZone      = input<ZoneId | undefined>(undefined);
  readonly locale        = input<string | undefined>(undefined);
  readonly axis          = input<AxisMode>('wall');
  readonly editable      = input(false); readonly selectable = input(false);
  readonly businessHours = input<BusinessHoursInput | undefined>(undefined);
  readonly options       = input<Partial<CalendarSettings>>({});               // le reste
  // sorties
  readonly dateClick = output<DateClickInfo>(); readonly eventClick = output<EventClickInfo>();
  readonly select = output<Selection>(); readonly eventChange = output<EventChangeInfo>();   // contient revert()
  readonly rangeChange = output<ViewRange>(); readonly problems = output<NormalizationReport>();
  readonly commandApplied = output<CommandApplied>();
}
```
**Règles reprises de tzslot :**
- L'instance DOM est créée **à la construction** (les cellules existent dès que le composant existe), avec `untracked(this.settings)`.
- `effect(() => { const s = this.settings(); untracked(() => this.cal.update(s)); })`. L'appel au widget est toujours dans `untracked`, sinon un callback qui écrit un signal dans un effet provoque NG0600 en Angular 18 et crée une dépendance cachée.
- Les callbacks du DOM (`onDateChange`, …) écrivent les `model()` (`this.view.set(v)`) hors effet.
- `update()` protège contre le renvoi de la dernière valeur émise (D.7).
- `ngOnDestroy → cal.destroy()`.

**Zoneless et zone.js.** Aucun appel à `NgZone`. Le DOM tourne hors cycle de détection (rien n'y déclenche de rendu Angular). Sous zone.js, l'instance est créée via `NgZone.runOutsideAngular` (injection optionnelle) et seuls les `output` repassent par `run`. Sous zoneless, les écritures de signal (`model.set`, `signal.set` du contrôleur) planifient la détection.

**`CalendarController`** (injectable, fourni au niveau du composant, ou via `provideDzCalendar`) :

```ts
@Injectable()
export class CalendarController {
  readonly state = signal<CalendarState>(...);                   // brut
  readonly title = computed(() => this.state().title);
  readonly range = computed(() => this.state().range);
  readonly view = computed(() => this.state().view);
  readonly canUndo = computed(...); readonly canRedo = computed(...);
  readonly loading = computed(...); readonly problems = computed(...);
  dispatch(cmd: Command): CommandResult; undo(): boolean; redo(): boolean;
  prev(): void; next(): void; today(): void; goTo(d: PlainDate): void; changeView(v: string): void;
  readonly instance: Signal<CalendarInstance | null>;           // accès impératif
}
```
Il comble le manque FullCalendar (pas de CalendarController Angular). Un composant enfant ou un en-tête personnalisé fait `inject(CalendarController)` et lit `title()` en signal. Le contrôleur reçoit `onStateChange` du DOM et met à jour `state`.

**Templates pour les render hooks.**

```html
<dz-calendar [events]="events()" [(view)]="view">
  <ng-template dzEventContent let-event="event" let-ctx="ctx">
    <strong>{{ event.title }}</strong> <small>{{ ctx.timeText }}</small>
  </ng-template>
  <ng-template dzDayHeader let-date="date">…</ng-template>
  <ng-template dzResourceLabel let-res="resource">…</ng-template>
</dz-calendar>
```
`templates.ts` définit les directives `DzEventContent`, `DzDayHeader`, `DzResourceLabel`, `DzMoreLink`, `DzSlotLabel`. Le composant les lit via `contentChild`. Les hooks DOM `content/didMount/didUpdate/willUnmount` sont branchés ainsi :
- `didMount(el, ctx)` → `ViewContainerRef.createEmbeddedView(tpl, {$implicit: ctx, event, ctx})`, vue déplacée dans `el` ;
- `didUpdate` → mise à jour du contexte puis `viewRef.detectChanges()` **seulement pour cette vue** ;
- `willUnmount` → `viewRef.destroy()`.
Pas de `ApplicationRef.tick()` global. Compatible zoneless : la détection est explicite sur la vue embarquée.

**Fournisseurs** : `provideDzCalendar({ locale, timeZone, messages, defaults })`, calqué sur `provideTzslot` (`defaults.ts`, `messages.ts`). Peer dependencies : `@angular/core` `^19 || ^20 || ^21 || ^22` (Phase 11 : signaux seulement). Pas de `@angular/forms` requis (le calendrier n'est pas un champ de formulaire). Seul un éventuel sélecteur de créneau (slots) en serait un.

---

## F. `@dzcalendar/theme`

- `dzcalendar.scss` est la source ; `dzcalendar.css` est compilé (`npm run build:theme`) et un test échoue si les deux dérivent, exactement comme tzslot.
- **Palette** : paires `(clair, sombre)` converties en `light-dark()`. Variables `$bg`, `$bg-raised`, `$fg`, `$fg-muted`, `$border`, `$accent`, `$accent-fg`, `$danger`, `$warning`, plus des tons d'événement `$tones: (blue, green, amber, red, violet, slate…)` : un événement porte `tone: 'green'`, rendu par `--dz-tone-green-bg/-fg/-border`. Il n'y a **jamais de couleur dans le modèle** (pas de `backgroundColor` libre par défaut ; option `rawColors` qui injecte `--dz-event-bg` en ligne si on y tient).
- **Tokens** (préfixe `--dz-*`, publics et stables dès la v1) : `--dz-slot-height`, `--dz-minute-height`, `--dz-event-height`, `--dz-lane-height`, `--dz-day-min-height`, `--dz-gutter-width`, `--dz-radius`, `--dz-gap`, `--dz-font`, `--dz-target-min` (24 px), `--dz-now-color`, `--dz-gap-hatch` (hachures du trou DST), `--dz-repeat-tint`, etc.
- **Mode sombre** : double définition comme tzslot, pour la préférence système et pour `[data-theme="dark"|"light"]`.
- **Densité** : `[data-density="compact|comfortable|spacious"]` change `--dz-slot-height`, `--dz-lane-height`, `--dz-event-padding`. La virtualisation se recalcule via `--dz-lane-height` lu en `read`.
- **Contrat de sélecteurs** : classes BEM stables `dz-calendar`, `dz-event`, `dz-event--selected`, `dz-event--invalid`, `dz-col--dst-gap`, `dz-col--dst-repeat`, etc., et attributs `data-*` (`data-view`, `data-event-id`, `data-resource`). Le CSS de layout injecté par `dom/styles.ts` utilise `:where()` (spécificité nulle) : toute règle chargée après gagne, comme chez tzslot. Les parties sont aussi marquées `part=""` pour le futur Web Component.
- **Tailwind** : `tailwind.css` (v4, `@theme` qui projette les tokens `--dz-*` sur `--color-*`) et `tailwind3.css` (config v3), comme `packages/theme/tailwind.css` et `tailwind3.css`. Le playground inclut `tailwind.html`.
- **Impression** : bloc `@media print` ; **forced-colors** : `contrast.css`.
- Container queries : la bascule semaine → agenda se fait par `@container` sur l'hôte (`container-type: inline-size`), jamais par la largeur de fenêtre.

---

## G. Performance

### G.1 Budgets de taille (gzip, hors Temporal)

| Paquet | Budget | Remarque |
|---|---|---|
| `@dzcalendar/core` | ≤ 28 ko (24 avant la Phase 6) | `@tzslot/core` (≈ 20 ko, dont le polyfill statique ≈ 19,7 ko) s'ajoute. Rééquilibré avec dom le 2026-10-16 (décision du propriétaire) : l'édition de séries et la validation sont dans le core ; la somme des budgets ne change pas. |
| `@dzcalendar/rrule` | ≤ 7 ko | |
| `@dzcalendar/ical` | ≤ 7,5 ko | relevé par le propriétaire (Phase 9) |
| `@dzcalendar/slots` | ≤ 5 ko | |
| `@dzcalendar/dom` (dayGrid + timeGrid + list + multiMonth + interactions + a11y) | ≤ 26 ko (30 avant la Phase 6) | |
| `@dzcalendar/angular` | ≤ 6 ko | hors Angular |
| `@dzcalendar/theme` (CSS) | ≤ 8 ko | |
| `@dzcalendar/pro` (timeline + ressources) | ≤ 16 ko | export/éditeur/impression en sous-entrées chargées à la demande ; `pro/editor` 10,6 ko (36,4 ko mesurés avec le widget tzslot, budget 37,5), `pro/slots` 1,74 ko, `pro-angular` 0,8 ko (16a, mesure + 3 %) ; `pro/export` 12,3 ko, `pro/print` 4,4 ko (16b) |
| **Total gratuit utile** (core+rrule+dom+theme) | **≤ 66 ko + 20 ko tzslot = ≈ 86 ko** | À comparer à ~95 ko (FullCalendar « all ») rapportés dans le doc d'analyse |

`scripts/size.mjs` calcule le gzip de chaque `dist/` et le compare à `size-budget.json` ; la CI échoue au-delà de +5 %. Chaque module exporte `sideEffects:false` (comme `build.mjs`).

### G.2 Budgets temps (Chrome récent, machine de développement de milieu de gamme)

Jeux de données : **U** = 10 000 événements répartis sur 12 mois (~830/mois, ~190/semaine) ; **W** (pire cas) = 10 000 dans une même semaine/mois.

| Opération | Budget |
|---|---|
| Normaliser + indexer 10 000 événements | ≤ 70 ms |
| Mémoire du store | ≤ 1,2 ko / événement (mesure à la tzslot : « 650 octets par créneau ») |
| `queryInstances` sur une fenêtre d'un mois (U) | ≤ 2 ms |
| Premier rendu mois (U) | ≤ 50 ms |
| Premier rendu mois (W) | ≤ 120 ms ; nœuds DOM ≤ cellules × voies + « +N » |
| Premier rendu semaine (U) | ≤ 25 ms |
| Premier rendu semaine (W, virtualisé) | ≤ 150 ms |
| Timeline (Pro) : 500 ressources × 10 000 événements, premier rendu | ≤ 80 ms ; défilement : script ≤ 8 ms/frame |
| **Modifier un événement** (store → DOM) | calcul ≤ 2 ms, 1 frame, nœuds touchés = ceux des ≤ 2 conteneurs dirty, **0 appel de hook `content` sur les autres événements**, ≤ 1 layout forcé |
| **Supprimer 2 238 événements** (cas #4906) | ≤ 50 ms (cible : 20× mieux que le ~1,1 s rapporté) |
| `expandSeries` : quotidien sur 1 an | ≤ 5 ms ; hebdomadaire BYDAY sur 10 ans, avec COUNT | ≤ 15 ms (checkpoints) |
| `layoutColumn` 1 000 événements chevauchants | ≤ 5 ms |
| `dayInfos` 366 jours | ≤ 15 ms |

### G.3 Stratégie de mesure

- `test:perf` (vitest, node) : `packages/core/test/perf.test.ts` calqué sur `tzslot/core/test/perf.test.ts` (seuils larges pour éviter les faux positifs, imprime un rapport). Un test garantit que **le jour de changement d'heure ne coûte pas plus de 3× un jour ordinaire** (même garde que tzslot).
- `test:memory` : `NODE_OPTIONS=--expose-gc vitest run packages/core/test/memory.test.ts` : 10 000 événements, puis retrait, puis `gc()` ; octets retenus, et fuite sur 5 000 requêtes jetées.
- `test:browser` (`scripts/perf-browser.mjs`) : `playwright-core` avec `channel:'chrome'`, protocole CDP `Performance.getMetrics` : `LayoutCount`, `RecalcStyleCount`, `TaskDuration` ; `PerformanceObserver` sur `long-animation-frame`. Le test charge `playground/perf.html`, injecte U et W, et vérifie : durée de premier rendu, **`LayoutCount` ≤ 1 par mise à jour**, nombre de nœuds DOM, absence d'erreur « ResizeObserver loop ». Sortie JSON comparée à `perf/baseline.json` (tolérance +25 %).
- `check:size` : budgets de G.1.
- Tous ces scripts sont locaux et lancés par le propriétaire ; `test:ci` ne contient que les tests déterministes.

---

## H. Stratégie de test

| Niveau | Outil | Contenu |
|---|---|---|
| Unitaires core | vitest, env **node** | Règles IANA réelles (matrice ci-dessous). Aucun mock de temps : `now()` injecté. |
| Pureté | vitest | `purity.test.ts` : pas de `Date`, pas de global `Temporal`, pas d'import DOM ; compilation sans lib DOM. |
| DOM | vitest + jsdom | Comportement, clavier, focus, ARIA, `update()` qui préserve l'état, réconciliation, hooks, nombre d'appels. **Jamais la mise en page** (règle tzslot). |
| CSS | vitest (texte) | Là où jsdom ne voit pas une règle (wrap, min-width, hachures DST), on assert le **texte** de la CSS, comme tzslot. |
| Layout réel | `playwright-core`, Chrome système (`channel:'chrome'`) | Captures par **clip d'une capture pleine page** (piège documenté dans le `CLAUDE.md` de tzslot : les captures d'élément se font par coordonnées après défilement et peuvent montrer une autre zone), alignement des colonnes, hachures, popover, tactile émulé. |
| Angular | vitest + plugin Angular (templates compilés, pas simulés) | Signals, `model()`, zoneless (`provideZonelessChangeDetection`), templates. |
| Conformité | `@dzcalendar/conformance` | Voir ci-dessous. |
| Mutation légère | revue | Les cas FC issus des issues sont des tests nommés. |
| CI | `test:ci --maxWorkers=1` | Détecte l'état partagé entre fichiers (leçon tzslot : 55 fichiers cassés en un worker alors que 60 passaient). |

**Matrice de zones IANA** : `Europe/Paris` (29 mars et 25 oct. 2026), `America/Chicago` (8 mars et 1ᵉʳ nov. 2026), `Australia/Lord_Howe` (décalage de 30 min), `America/Sao_Paulo` et `America/Havana` (historique : minuit inexistant), `Pacific/Apia` (31 déc. 2011 : jour entier sauté), `Asia/Kolkata` (+5:30 sans DST), `Europe/Dublin` (DST « négatif » IANA), `Africa/Casablanca`, `Pacific/Kiritimati` (+14), `UTC`. Les expectations sont écrites **à la main depuis les règles publiques**, pas copiées de la sortie de l'implémentation ; les cas RRULE sont contre-vérifiés hors ligne contre un implémentation indépendante (python-dateutil) par `scripts/conformance-crosscheck.py` (outil de génération, non livré).

**Suite de conformité indépendante du langage (`conformance/`)**

```
conformance/
  README.md                      format et gouvernance
  schema/*.schema.json           un schéma par suite
  cases/
    zone-dayinfo/*.json          entrée {date, zone} → sortie DayInfo (strings)
    zone-resolve/*.json
    rrule-expand/*.json          {dtstart, rrule, window} → [instants ISO]
    series-edit/*.json           {series, ref, patch, scope} → {séries résultantes}
    segment/*.json
    layout-column/*.json         {items} → {placements}
    layout-rows/*.json
    time-axis/*.json
    navigation/*.json
    normalize/*.json             {input} → {event|problems}
    slots/*.json
    ical-parse/*.json
  runner/runner.test.ts          itère cases/**, charge l'adaptateur du paquet concerné
```
Format d'un cas :
```json
{ "id": "rrule-dst-weekly-paris-0900", "suite": "rrule-expand",
  "description": "Hebdomadaire 09:00 Paris reste à 09:00 mural à travers le passage à l'heure d'été",
  "refs": ["FC#6729"],
  "input":  { "dtstart": "2026-03-23T09:00:00+01:00[Europe/Paris]", "rrule": "FREQ=WEEKLY;COUNT=3",
              "window": { "start": "2026-03-01T00:00:00Z", "end": "2026-05-01T00:00:00Z" } },
  "expected": [ "2026-03-23T09:00:00+01:00[Europe/Paris]", "2026-03-30T09:00:00+02:00[Europe/Paris]", "2026-04-06T09:00:00+02:00[Europe/Paris]" ] }
```
Règles : toutes les valeurs sont des **chaînes ISO 8601 + IANA** (aucun format propre au langage) ; `tzdata` n'est exercé que sur des dates dont les règles sont figées (passé, ou règles politiquement stables) ; chaque cas cite l'issue FC qu'il couvre (`refs`) ; `scripts/conformance-gen.mjs` régénère les `expected` à partir de l'implémentation TS **uniquement après revue humaine** (diff obligatoire). Les ports Swift et Kotlin liront le même dossier.

**Tests à ne pas oublier** (chacun porte un `refs` quand il vient d'une issue) : #3887 et #5973 (durées au DST), #6729 (RRULE à la mauvaise heure), #6815 et #7680 (jour décalé selon l'offset), #6105 (exdate date seule), #7456 (iCal TZID), #7903 (segmentation en mode local), #5594 (hooks relancés), #4906 (suppression de masse), #8082 (boucle ResizeObserver).

---

## I. Arborescence complète de départ

```
dzcalendar/
├─ ARCHITECTURE.md · CLAUDE.md · ROADMAP.md · CHANGELOG.md · README.md · CLEANROOM.md · LICENSE
├─ package.json                  workspaces: ["packages/*"], scripts (voir ci-dessous)
├─ tsconfig.spec.json · vitest.config.ts · vite.config.ts
├─ size-budget.json · perf/baseline.json
├─ scripts/
│  ├─ build.mjs                  clone de tzslot (tsc par paquet, ng-packagr, manifestes dist, garde « pas de src/ »)
│  ├─ size.mjs · perf-browser.mjs · gen-schema.mjs · gen-llms.mjs · bench-public.mjs · conformance-gen.mjs
├─ conformance/                  (cf. H) ── publié comme @dzcalendar/conformance
├─ packages/
│  ├─ core/
│  │  ├─ package.json · tsconfig.json (lib ES2023, sans DOM) · tsconfig.build.json
│  │  ├─ src/
│  │  │  ├─ index.ts · temporal.ts · ids.ts · intervals.ts · zone.ts · kernel.ts · selection.ts
│  │  │  ├─ event/        types.ts · normalize.ts · problems.ts · parse-temporal.ts · defaults.ts
│  │  │  ├─ store/        ordered-map.ts · interval-tree.ts · store.ts · changes.ts · query.ts · diff.ts
│  │  │  ├─ source/       source.ts · manager.ts · chunk-cache.ts · array-source.ts · fn-source.ts · json-source.ts
│  │  │  ├─ recurrence/   series.ts · expand.ts · edit.ts · rebase-rule.ts · keys.ts
│  │  │  ├─ resource/     types.ts · tree.ts · rows.ts
│  │  │  ├─ project/      segment.ts · day-axis.ts · time-axis.ts · date-index.ts
│  │  │  ├─ layout/       column.ts · rows.ts · overflow.ts · prefix-sums.ts · virtual.ts
│  │  │  ├─ rules/        business-hours.ts · constraints.ts · overlap.ts · validate.ts
│  │  │  ├─ commands/     types.ts · apply.ts · history.ts · patch.ts (le schéma JSON est généré : scripts/gen-schema.mjs)
│  │  │  ├─ interaction/  hit.ts · propose-move.ts · propose-resize.ts · propose-select.ts · keymap.ts
│  │  │  ├─ views/        spec.ts · builtin.ts · range.ts · nav.ts · daygrid.ts · timegrid.ts · list.ts · multimonth.ts
│  │  │  └─ format/       intl.ts · range-title.ts · week.ts · names.ts
│  │  └─ test/            *.test.ts · purity.test.ts · perf.test.ts · memory.test.ts · fixtures/
│  ├─ rrule/
│  │  ├─ src/             index.ts · types.ts · parse.ts · serialize.ts · validate.ts · iterate.ts · expand-period.ts
│  │  │                   · bysetpos.ts · wall.ts · between.ts · matcher.ts · checkpoints.ts
│  │  └─ test/
│  ├─ ical/
│  │  ├─ src/             index.ts · lexer.ts · parse-vevent.ts · parse-vtimezone.ts · tzid-map.ts · serialize.ts · source.ts
│  │  └─ test/            fixtures/*.ics
│  ├─ slots/
│  │  ├─ src/             index.ts · types.ts · availability.ts · busy.ts · candidates.ts · constraints.ts · convert-zone.ts
│  │  └─ test/
│  ├─ dom/
│  │  ├─ package.json · tsconfig.json · tsconfig.build.json
│  │  ├─ src/
│  │  │  ├─ index.ts · calendar.ts · settings.ts · messages.ts · styles.ts · icons.ts · plugin.ts (registerView)
│  │  │  ├─ render/       reconciler.ts · scheduler.ts · measure.ts · pool.ts · hooks.ts · classnames.ts
│  │  │  ├─ views/        daygrid/{view.ts,week-row.ts,popover-link.ts} · timegrid/{view.ts,column.ts,gutter.ts,all-day.ts,now.ts,dst-bands.ts}
│  │  │  │                · list/view.ts · multimonth/view.ts · custom.ts
│  │  │  ├─ interact/     pointer.ts · hit-test.ts · drag.ts · resize.ts · select.ts · autoscroll.ts · edge-nav.ts · ghost.ts · touch.ts · keyboard.ts
│  │  │  ├─ a11y/         aria.ts · roving.ts · live-region.ts · announce.ts
│  │  │  ├─ popover/      popover.ts · anchor.ts
│  │  │  └─ motion/       adapter.ts · css.ts · view-transition.ts
│  │  └─ test/
│  ├─ angular/
│  │  ├─ package.json · ng-package.json · tsconfig.lib.json
│  │  ├─ src/             index.ts · calendar.ts · controller.ts · providers.ts · templates.ts · shapes.ts · defaults.ts · messages.ts
│  │  └─ test/            setup.ts · *.test.ts
│  ├─ theme/
│  │  ├─ package.json · dzcalendar.scss · dzcalendar.css (généré) · contrast.css · tailwind.css · tailwind3.css
│  ├─ motion-gsap/          src/index.ts · flip.ts · view-transition.ts
│  ├─ pro/                  (Phase 15+)  src/{index.ts, model-entry.ts, editor-entry.ts, slots-entry.ts, timeline/{axis,model,family,view,styles}.ts, editor/{dialog,recurrence,messages,styles}.ts, slots/capacity.ts, print/, export/}  (resource-views : dans core/dom, K.5 ; zone des ressources et fenêtrage 2D dans timeline/view.ts, 15b ; pas de license.ts, K.9)
│  └─ pro-angular/          (Phase 16a)  src/{index.ts, editor.ts} (directive dzEventEditor ; l'éditeur chargé à la première ouverture) · test/
├─ playground/
│  ├─ index.html (Angular) · vanilla.html · tailwind.html · dst.html (4 zones côte à côte) · perf.html · a11y.html
│  ├─ main.ts · vanilla.ts · tailwind.ts · demo.ts · dst.ts · perf.ts
│  └─ test/
└─ site/                    llms.txt, llms-full.txt, commands.schema.json, benchmark.json (générés ; la doc est dans docs/)
```

Scripts `package.json` (même forme que tzslot) : `test`, `test:ci`, `test:watch`, `test:memory`, `test:perf`, `test:browser`, `typecheck` (un `tsc` par paquet puis `tsconfig.spec.json`), `start` (vite, port **4600** pour ne pas entrer en conflit avec le 4500 de tzslot), `build`, `build:theme`, `check:size`, `pack:local`, `publish:dry`, `publish:next`, `docs:api`.
Dépendances : `@tzslot/core: ^2.1.0` en `dependencies` de core/rrule/ical/slots ; `peerDependencies` Angular `^18 … ^22` ; dev : les mêmes outils que tzslot (vitest 4, jsdom, `@analogjs/vite-plugin-angular`, ng-packagr, sass, playwright-core).
Un test de `build.mjs` vérifie qu'aucun `dist/package.json` ne pointe vers `src/`, et que `@tzslot/core` reste sur la plage `^2.1.0`.

**Config vitest** : même config que tzslot (`vitest.config.ts`) mais en `projects` : `core|rrule|ical|slots|conformance` en `environment:'node'`, `dom|angular|playground` en `jsdom` (avec le plugin Angular et `setupFiles` pour Angular).

---

## J. Séquence de construction en phases

Ordre : modèle de temps et store → projection/layout → **timeGrid d'abord** (c'est là que le DST se voit) → dayGrid → récurrence → interactions → reste.

### Phase 0 : scaffold, spikes, modèle
- **Livrables / fichiers** : monorepo (workspaces, tsconfig, vitest, build, theme minimal, playground), `CLAUDE.md` et `ROADMAP.md` (style tzslot), `CLEANROOM.md`. `core/{temporal,ids,intervals,zone,event/*}`.
- **Spikes obligatoires (1 jour chacun, résultats notés dans ROADMAP.md)** :
  1. `getTimeZoneTransition` dans `temporal-polyfill/full` (sinon bisection).
  2. `Intl.DateTimeFormat.formatToParts(number)` avec `timeZone` et `calendar`, natif contre polyfill.
  3. `Intl.Locale#getTextInfo`.
  4. Comportement du polyfill sur `PlainDate.toZonedDateTime({timeZone})` pour un minuit inexistant (São Paulo 2018, Havane).
- **Acceptation** : `npm test` vert ; `normalizeEvent` : 40 cas (chaque `ProblemCode`) ; `dayInfo` correct sur Paris/Chicago/Lord Howe/Apia/São Paulo ; `purity.test.ts` vert ; `typecheck` vert ; `npm run build` produit `dist/` de core.
- **Dépend de** : rien.

### Phase 1 : store, index, conformité
- **Livrables / fichiers** : `store/*`, `source/{source,array-source}`, `commands/{types,apply,history}` (create/update/delete), `conformance/` harnais + 20 premiers cas (`zone-dayinfo`, `zone-resolve`, `normalize`).
- **Acceptation** : 10 000 événements indexés ≤ 70 ms ; `queryInstances` sur 1 mois ≤ 2 ms ; l'arbre persistant : une mise à jour ne modifie pas l'ancien snapshot (test) ; undo/redo de 100 commandes revient à l'état initial octet pour octet (`toEqual` sur snapshots) ; `test:memory` : ≤ 1,2 ko/événement.
- **Dépend de** : P0.

### Phase 2 : projection, axe, layout (pur)
- **Livrables / fichiers** : `project/*`, `layout/{column,rows,overflow,prefix-sums,virtual}`, `views/{spec,range,nav,builtin,timegrid,daygrid}` (modèles), `format/*`.
- **Acceptation** : segmentation correcte sur journées de 23 h / 25 h / 23 h 30 (cas de conformité ; fin exclusive ; durée nulle) ; `layoutColumn` : nombre de voies = clique maximale sur 1 000 jeux aléatoires (propriété testée) ; `packLanes` sans chevauchement de voie (propriété) ; `computeOverflow` : somme visibles + cachés = total ; `navigate` : mois, semaine, jour, `hiddenDays`, `fixedWeekCount`.
- **Dépend de** : P1.

### Phase 3 : **timeGrid semaine/jour** (lecture seule) : première preuve DST visible
- **Livrables / fichiers** : `dom/{calendar,settings,styles,messages,render/*,views/timegrid/*}`, thème de base, `playground/dst.html` (Paris, Chicago, Lord Howe, Sydney côte à côte).
- **Acceptation** : la semaine du 25 oct. 2026 à Paris affiche dans la colonne de dimanche la bande « répétée », deux « 02:30 » côte à côte avec offsets ; la semaine du 29 mars 2026 affiche la bande hachurée ; mode `elapsed` : colonne de 25 h ; mesure Chrome (`test:browser`) : alignement des lignes entre colonnes ≤ 1 px ; aucune lecture de layout dans le chemin d'écriture.
- **Dépend de** : P2.

### Phase 4 : dayGrid mois/semaine/jour + popover « +N »
- **Livrables / fichiers** : `dom/views/daygrid/*`, `popover/*`, `now.ts` (indicateur « maintenant »), business hours en fond (timeGrid et dayGrid), `rules/business-hours`.
- **Acceptation** : `computeOverflow` appliqué en navigateur (« +N » exact) ; popover ouvert au clavier, focus restitué ; business hours à travers un changement d'heure (intervalle de vraie durée) ; mise à jour fine : modifier un événement ne ré-exécute pas `content` des autres (test jsdom par compteur) ; `LayoutCount ≤ 1` par mise à jour (navigateur).
- **Dépend de** : P3.
- **Ajout (décision du propriétaire)** : coquille du menu contextuel (`dom/menu/`, `core/actions/`) sur cellules et événements — clic droit, appui long tactile, touche Menu / Maj+F10 — avec les actions de lecture et celles de l'application ; « Nouvel événement ici » par callback, y compris les deux lectures d'une heure répétée.

### Phase 5 : récurrence (`@dzcalendar/rrule` puis séries dans core)
- **Livrables / fichiers** : `rrule/*` ; `core/recurrence/{series,expand,keys}` ; branchement `queryInstances`.
- **Acceptation** : 100 cas `rrule-expand` (tous les cas FC cités, FREQ/INTERVAL/BYDAY/BYMONTHDAY/BYSETPOS/BYWEEKNO/BYYEARDAY/WKST/COUNT/UNTIL, 29 févr., jours 31) contre dateutil ; DST : 09:00 mural conservé ; heure répétée = première lecture ; heure inexistante = `compatible` ; exdate date seule ; fréquences sub-journalières en temps écoulé ; 1 an quotidien ≤ 5 ms ; `expandSeries` avec `limit` signale `too-many-occurrences`.
- **Dépend de** : P1 (modèle), P2 (fenêtre).

### Phase 6 : commandes, undo/redo, édition de séries
- **Livrables / fichiers** : `commands/apply` complet ; `recurrence/{edit,rebase-rule}` ; `validateProposal`.
- **Acceptation** : `this` / `following` / `all` : 40 cas `series-edit` ; la scission respecte COUNT et UNTIL ; EXDATE/overrides migrent ; l'undo d'un `following` restaure les deux séries exactement ; override déplacé hors fenêtre toujours retrouvé.
- **Dépend de** : P5.

### Phase 7 : interactions souris/tactile/stylet
- **Livrables / fichiers** : `interact/{pointer,hit-test,drag,resize,select,ghost,autoscroll,edge-nav,touch}`, `core/interaction/*`, dateClick, select, eventClick.
- **Acceptation** : la même `Proposal` pour souris et pour le clavier simulé (test de parité) ; tactile : un tap sélectionne, un drag sur événement sélectionné démarre sans appui long (Playwright, tactile émulé) ; sur iOS, `touch-action` ne bloque pas le défilement d'une zone non sélectionnée (test manuel noté dans ROADMAP.md) ; drop dans une heure répétée → `ambiguity` + sélecteur ; drop dans un trou → 03:00 + annonce ; contraintes/overlap refusent avec `dz-event--invalid`.
- **Dépend de** : P4, P6.

### Phase 8 : clavier complet et accessibilité
- **Livrables / fichiers** : `interact/keyboard`, `a11y/*`, `core/interaction/keymap`.
- **Acceptation** : parcours clavier complet de chaque vue (test jsdom) ; mode grab : 100 % des opérations de drag faisables au clavier ; axe-core sans violation sur chaque vue (exécuté dans Chrome via playwright-core) ; ACR WCAG 2.2 AA rédigé en brouillon (`site/a11y-conformance.md`) ; RTL : flèches inversées (test).
- **Dépend de** : P7.

### Phase 9 : sources, iCal
- **Livrables / fichiers** : `core/source/{manager,chunks,json-source,export}` ; `ical/*` (livré, voir « Ajustements après la Phase 9 »).
- **Acceptation** : chunking mensuel ; deux chunks contigus manquants → une seule requête ; annulation vérifiée (`AbortSignal` abort appelée) ; réponse d'une génération périmée ignorée ; événement chevauchant deux chunks refcounté ; iCal : `TZID` IANA correct (#7456), RRULE + EXDATE + RECURRENCE-ID, `VTIMEZONE` personnalisé → Problem ou règle fixe ; aller-retour parse → serialize → parse identique sur 30 fixtures.
- **Dépend de** : P5, P1.

### Phase 10 : list, multiMonth, vues custom
- **Livrables / fichiers** : `dom/views/{list,multimonth,custom}`, `registerView` (livré, voir « Ajustements après la Phase 10 »).
- **Acceptation** : list jour→année ; multiMonth pile et grille ; `registerView('myView', …)` fonctionne avec une vue de test ; hiddenDays/weekends ; numéros de semaine selon la locale.
- **Dépend de** : P4.

### Phase 11 : Angular
- **Livrables / fichiers** : `packages/angular/*`, `playground/angular.html` (livré, voir « Ajustements après la Phase 11 »).
- **Acceptation** : composant sous `provideZonelessChangeDetection` ; `[(view)]`, `[(date)]` ; les `effect` utilisent `untracked` (test qui échoue sous Angular 18 si l'écriture de signal est dans un effet) ; `CalendarController` expose `title()`, `range()` en signaux ; templates `dzEventContent` : seul le gabarit du segment modifié exécute `detectChanges` (compteur) ; `update({date})` avec la dernière valeur émise est sans effet ; `ng build` sur une application Angular réelle installée depuis les tarballs de `pack:local` (règle tzslot).
- **Dépend de** : P4 minimum (idéalement P8).

### Phase 12 : virtualisation de toutes les vues
- **Livrables / fichiers** : `dom/render/pool.ts`, virtualisation de list, multiMonth, timeGrid (colonnes), dayGrid (événements), `preparePrint` (livré, voir « Ajustements après la Phase 12 »).
- **Acceptation** : budgets G.2 pour W ; nœuds DOM ≤ borne annoncée ; défilement stable ; `preparePrint()` rend tout puis restaure.
- **Dépend de** : P10.

### Phase 13 : thème complet, i18n, densité
- **Livrables / fichiers** : `theme/*` (tokens, tailwind, contrast, print), messages EN/FR, tests de dérive CSS (livré, voir « Ajustements après la Phase 13 »).
- **Acceptation** : le test de dérive SCSS/CSS passe ; capture Chrome en clair/sombre/densités ; `forced-colors` lisible.
- **Dépend de** : P4 (peut commencer plus tôt).

### Phase 14 : moteur de créneaux (`@dzcalendar/slots`)
- **Livrables / fichiers** : `slots/*`, vue « disponibilités » (créneaux en fond cliquables) dans dom.
- **Acceptation** : 40 cas `slots` ; cas Bubble reproduit en ≤ 10 lignes ; fuseau prestataire ≠ fuseau client, dont un créneau à cheval sur un changement d'heure ; buffer avant/après ; préavis ; plafond journalier ; ~~`capacity`~~ (Pro, décision du propriétaire) ; 30 jours à 15 min ≤ 25 ms. Livré : 55 cas, voir « Ajustements après la Phase 14 ».
- **Dépend de** : P5 (disponibilités récurrentes), P2.

### Phase 15 : Pro, ressources et timeline
- **Livrables / fichiers** : 15a `core/resource/*` + colonnes de ressources dans `core/views` et `dom/views` (K.5) ; 15b `pro/{model-entry,timeline/{axis,model,family,view,styles}}` (zone et fenêtrage 2D dans la vue).
- **Acceptation** : timeline avec et sans ressources ; arbre et groupes ; axe `elapsed` : colonnes de largeur 23/24/25 h exactes ; deux « 02:00 » étiquetés ; budget timeline G.2 (500×10 000) ; resource-timeGrid et resource-dayGrid ; accessibilité `treegrid`.
- **Dépend de** : P12, P7.

### Phase 16 : Pro, impression, export, éditeur
- **Livrables / fichiers** : `pro/{print,export,editor,slots-pro}`, `pro-angular`.
- **Acceptation** : l'éditeur propose « cette occurrence / suivantes / toutes » et appelle `editOccurrence` ; l'éditeur réutilise `@tzslot/dom` (`createDateTimeRange`) pour la saisie, avec l'heure répétée gérée ; export ICS = parse(serialize(x)) ; PDF/PNG sans bloquer l'UI > 100 ms.
- **Dépend de** : P6, P15.

### Phase 17 : animations
- **Livrables / fichiers** : `dom/motion/*`, `motion-gsap`.
- **Acceptation** : défaut CSS/WAAPI ; `prefers-reduced-motion` désactive tout ; l'adaptateur GSAP est exclu du bundle de `@dzcalendar/dom` (test de taille).
- **Dépend de** : P7.

### Phase 18 : écosystème
- **Livrables / fichiers** : `compat-fullcalendar` (traducteur d'options, codemod), `element` (Web Component), React/Vue, `llms.txt`, `commands.schema.json`, benchmark public.
- **Ajout du propriétaire (2026-10-19)** : compléments Angular — impression et exports depuis un service ou une directive, mouvement GSAP fourni une fois pour l'application (`provideDzCalendar({ motion })`), schéma `ng add @dzcalendar/angular`, exemples Angular dans la documentation.
- **Dépend de** : P11.

### Phase 19+ : natif
- Ports Swift et Kotlin de `core` et `rrule`, **pilotés par `@dzcalendar/conformance`**, puis UI SwiftUI / Compose.
- **Acceptation** : 100 % des cas de conformité verts dans chaque langage.
- **Dépend de** : P2 minimum pour la suite `layout`, P5 pour `rrule`. Peut démarrer dès que les suites sont stables.

**Dépendances en un coup d'œil**
`P0 → P1 → P2 → P3 → P4 → P7 → P8` ; `P1,P2 → P5 → P6 → P7` ; `P5 → P9` ; `P4 → P10 → P12 → P15 → P16` ; `P4 → P11` ; `P5 → P14` ; `P7 → P17`.

---

## K. Risques et questions ouvertes à valider avant de coder

**K.1 Axe horaire par défaut (section C).** Valider : mode `wall` par défaut avec bandes et côte à côte des deux passes, `elapsed` en option, `elapsed` obligatoire en timeline. C'est la décision la plus visible du produit.

**K.2 Polyfill statique.** tzslot a décidé de garder le polyfill en import statique (≈ 19,7 ko gzip pour `@tzslot/core`). Pour DzCalendar, avec un budget total à ≈ 86 ko, c'est ~23 %. Garder (cohérent avec tzslot) ou demander un chargement conditionnel upstream pour les navigateurs où Temporal est natif ? Le doc d'analyse chiffre la couverture native à ~70 % (Safari : aucune version stable en octobre 2026, la Technology Preview 249 d’août 2026 la première — tzslot, 2026-10-23).

**K.3 Périmètre upstream.** Valider l'envoi à `@tzslot/core` de `dayInfo`, `transitionsBetween`, `getWeekInfo`, et le calendrier : implémentation locale d'abord, migration en tzslot 2.2. Qui publie et quand ?

**K.4 `Intl` et Temporal.** Si le spike P0 montre que `formatToParts(number)` avec `timeZone`/`calendar` diffère entre natif et polyfill, il faut un adaptateur de formatage dédié, ce qui augmente la taille de `format/`.

**K.5 Pro : frontière.** *(Tranché le 2026-10-18 : colonnes de ressources gratuites, dans core et dom ; timeline en Pro.)* Faut-il que la **virtualisation 2D** et les **colonnes de ressources** soient Pro (comme dans le doc d'analyse), alors que le modèle de ressources est gratuit ? Le marché (MUI X) garde les ressources en MIT. Ce plan garde les types/arbre gratuits et la UI timeline/ressources en Pro ; à confirmer.

**K.6 Fuseau par ressource.** *(Tranché le 2026-10-18 : toutes les colonnes dans la zone du calendrier.)* La zone d'une ressource sert aux business hours et aux slots, mais l'affichage reste dans la zone du calendrier. Voulez-vous une colonne ressource affichée dans sa propre zone (utile pour des agendas de praticiens répartis sur plusieurs pays) ? C'est faisable avec un `ColumnAxis` par colonne, mais le Pro devrait alors gérer des colonnes à axes différents.

**K.7 Portée de RRULE.** `RSCALE` (autres calendriers), `BYEASTER`, `SKIP=…` : exclus de la v1 ? Hypothèse : oui. Les exceptions `EXRULE` (obsolète) : acceptées en lecture, jamais émises ?

**K.8 iCal : `VTIMEZONE` personnalisés** (non IANA, Windows). Hypothèse : table de correspondance Windows → IANA livrée ; un `VTIMEZONE` sans équivalent donne un `Problem` et un repli sur offset fixe, plutôt qu'une émulation de ses règles. À confirmer.

**K.9 Licence et clé Pro.** Vérification hors ligne par signature, sans appel réseau, filigrane non bloquant en l'absence de clé : à valider (le doc d'analyse propose la FSL pour le code Pro). Définir ce qui se passe pour les `SSR`/tests CI.

**K.10 GSAP.** Vérifier les conditions de licence actuelles de GSAP (y compris les plugins comme Flip) et de redistribution d'un adaptateur avant publication. Aucune dépendance côté core/dom dans tous les cas.

**K.11 Démarche « from scratch ».** Proposer un fichier `CLEANROOM.md` : seule la documentation publique de FullCalendar (comportement observable) est consultée ; le code source, les types internes et les tests de FullCalendar ne sont pas lus par les contributeurs ; chaque comportement imité est documenté dans une fiche `docs/behaviors/*.md` sans copie de texte. À valider avec le propriétaire (et à rendre obligatoire pour les contributeurs externes).

**K.12 Précision temporelle.** Les index utilisent des millisecondes. Si un utilisateur stocke des instants avec nanosecondes, l'ordre de deux événements dans la même milliseconde est décidé par `id`. À accepter.

**K.13 Éditeur de récurrence : `following` crée deux séries** (pas de `RANGE=THISANDFUTURE` à l'export). Compatibilité d'échange avec Google/Outlook à tester en phase 16.

**K.14 Natif : voie pragmatique** (ports Swift/Kotlin + conformité) contre la voie Rust/UniFFI. Le plan prépare la première. Décision à reporter, mais **la suite de conformité doit être publiée dès la Phase 1**, sinon le portage dérivera.

**K.15 Date-free et migration.** L'API refuse les `Date` (`date-object-rejected`). Les équipes qui migrent depuis FullCalendar ont des `Date` partout. Le paquet `compat-fullcalendar` (qui utilise `@tzslot/core/interop`) fait la conversion. Confirmer que c'est le bon compromis, et que `Date` n'apparaît **nulle part ailleurs**, y compris dans les types publics.

**K.16 Risques techniques principaux.**
- Charge : timeGrid en mode `wall` avec événements à cheval sur une transition demande un cas spécial dans `layoutColumn` (positions murales) à tester abondamment.
- iOS : `touch-action` dynamique par événement sélectionné doit être validé sur appareil réel.
- RRULE : la correction des combinaisons `BYSETPOS` × `BYWEEKNO` × `WKST` est coûteuse à valider, d'où le contre-contrôle par dateutil.
- Périmètre : FullCalendar complet + Premium + 6 failles est un chantier de plusieurs produits ; l'ordre des phases est conçu pour qu'on puisse s'arrêter à P8 avec un produit cohérent (timeGrid/dayGrid + interactions + a11y).
- `@tzslot/core` en `dependencies` : deux copies du polyfill dans une application casseraient `instanceof` ; `normalizeEvent` détecte et convertit les objets étrangers (`foreign-temporal`), et `build.mjs` vérifie la plage `^2.1.0`.
