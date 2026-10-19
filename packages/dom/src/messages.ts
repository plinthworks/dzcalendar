/**
 * Every word the calendar adds. Month and weekday names are not here: `Intl`
 * knows them in every language through the `locale` option. One bundle,
 * handed over once, as in tzslot.
 */
export interface DzMessages {
  readonly today: string;
  readonly previous: string;
  readonly next: string;
  readonly allDay: string;
  /** The column of a day the zone skipped entirely (Apia, 30 December 2011). */
  readonly dayDoesNotExist: string;
  /** Across a band of wall times that never happen: "02:00–03:00 does not exist". */
  gapBand(parts: { from: string; to: string }): string;
  /** Across a band of wall times that happen twice. */
  repeatBand(parts: { from: string; to: string }): string;
  /**
   * The mark after a time read on the second pass of a repeated hour — the
   * same convention as tzslot's menus ("02:30*").
   */
  readonly secondPassMark: string;
  /** An event whose drawn height is not its real length: "2 h real". */
  realDuration(parts: { duration: string }): string;
  /** A screen reader's name for an event. */
  eventLabel(parts: { title: string; time: string }): string;
  readonly untitled: string;
  readonly now: string;
  /** The link standing for what a crowded day cannot show: "+3 more". */
  moreLink(parts: { count: number }): string;
  /** Its spoken name: "3 more events, Wednesday 21 October". */
  moreLabel(parts: { count: number; date: string }): string;
  readonly closePopover: string;
  /** The view switcher's buttons. */
  readonly views: Readonly<Record<string, string>>;
  /** Context menu entries. */
  newEventAt(parts: { time: string }): string;
  newEventOn(parts: { date: string }): string;
  /** A month cell's spoken name: "Wednesday 21 October 2026, 3 events". */
  dayLabel(parts: { date: string; count: number }): string;
  /** The view switcher's accessible name. */
  readonly viewSwitcher: string;
  readonly goToDay: string;
  readonly openEvent: string;
  readonly deleteEvent: string;
  /** Said when a drop is refused (a constraint, an overlap, not editable). */
  readonly dropRefused: string;
  eventMoved(parts: { title: string; time: string }): string;
  eventResized(parts: { title: string; time: string }): string;
  /** A drop snapped into a skipped hour, moved on to the next that exists. */
  movedIntoGap(parts: { time: string }): string;
  /** The menu asking how far a change to an occurrence reaches. */
  readonly changeWhich: string;
  /** The menu asking which of the two readings of a repeated wall time. */
  whichReading(parts: { time: string }): string;
  reading(parts: { time: string; offset: string; first: boolean }): string;
  readonly scopeThis: string;
  readonly scopeFollowing: string;
  readonly scopeAll: string;
  /** Under "New event at 03:00" when the click was in an hour that does not exist. */
  readonly skippedHour: string;
  /** The context menu's accessible name. */
  readonly actions: string;
  /** A resize from the start, said after it. */
  eventResizedStart(parts: { title: string; time: string }): string;
  /** The keyboard cursor's name on a slot: "Tuesday 20 October, 09:30". */
  cursorSlot(parts: { date: string; time: string }): string;
  /** On the all-day row of a time grid. */
  cursorAllDay(parts: { date: string }): string;
  /** A bookable slot (availableSlots), its time range: what its button and the keyboard's cursor say. */
  freeSlot(parts: { time: string }): string;
  /** In a resource view, whose column or cell: "Dr Ali, Wednesday 21 October". */
  ofResource(parts: { resource: string; place: string }): string;
  /** The time grid's cursor before it has a place: what it is. */
  readonly timeSlots: string;
  /** From one moment or day to another. */
  range(parts: { from: string; to: string }): string;
  /** Said as Shift+arrows grow a selection. */
  selected(parts: { span: string }): string;
  /** Why a place is refused, from a rule's code. */
  violation(code: 'constraint' | 'overlap' | 'allow' | 'valid-range' | 'not-editable'): string;
  /** A step that cannot go anywhere (the end of the hours, a refused place). */
  readonly noFurther: string;
  readonly notEditable: string;
  readonly cannotMove: string;
  readonly cannotResize: string;
  /** Grab mode: held, and the keys that work. */
  grabbed(parts: { title: string }): string;
  readonly grabHelp: string;
  readonly grabHelpResize: string;
  /** Added when the start can be pulled too (`eventResizableFromStart`). */
  readonly grabHelpStart: string;
  readonly grabCancelled: string;
  /** `undo`: the key that undoes it here ("⌘Z", "Ctrl+Z"), empty when the calendar's undo keys are off. */
  eventDeleted(parts: { title: string; undo: string }): string;
  /** A source refused to save an edit: put back (`reverted`), or fetched again. */
  saveFailed(parts: { title: string; reverted: boolean }): string;
  /** A source could not be fetched (after its retries). */
  readonly loadFailed: string;
  /** A list view with nothing in its period. */
  readonly noEvents: string;
  /** A resource view without any resource (none given, or not loaded yet). */
  readonly noResources: string;
  /** The column (or timeline row) of events on no known resource (`showUnassigned`). */
  readonly unassigned: string;
  /** The head of a timeline's resource column, when the application names none. */
  readonly resource: string;
  /** A week number, short (in a cell) and spoken. */
  weekShort(parts: { week: number }): string;
  weekLabel(parts: { week: number }): string;
  /** A month of a multi-month view: its title is a button to that month. */
  readonly goToMonth: string;
  /** Grab mode: a timed event put on the all-day row, a day event put in the hours (with the length it gets). */
  readonly becomesAllDay: string;
  becomesTimed(parts: { length: string }): string;
  /** The menu asking how far a delete of an occurrence reaches. */
  readonly deleteWhich: string;
  readonly undone: string;
  readonly redone: string;
  /** Context menu: grab mode by another way in. */
  readonly moveEvent: string;
  readonly resizeEvent: string;
}

export const EN: DzMessages = {
  today: 'Today',
  previous: 'Previous',
  next: 'Next',
  allDay: 'All day',
  dayDoesNotExist: 'This day does not exist in this time zone',
  gapBand: ({ from, to }) => `${from}–${to} does not exist`,
  repeatBand: ({ from, to }) => `${from}–${to} happens twice`,
  secondPassMark: '*',
  realDuration: ({ duration }) => `${duration} real`,
  eventLabel: ({ title, time }) => `${title}, ${time}`,
  untitled: '(no title)',
  now: 'Now',
  moreLink: ({ count }) => `+${count} more`,
  moreLabel: ({ count, date }) => `${count} more ${count === 1 ? 'event' : 'events'}, ${date}`,
  closePopover: 'Close',
  views: { dayGridMonth: 'Month', dayGridWeek: 'Week', dayGridDay: 'Day', timeGridWeek: 'Week', timeGridDay: 'Day', listDay: 'List', listWeek: 'List', listMonth: 'List', listYear: 'List', multiMonthYear: 'Year', resourceTimeGridDay: 'Day', resourceTimeGridWeek: 'Week', resourceDayGridDay: 'Day', resourceDayGridWeek: 'Week', resourceDayGridMonth: 'Month', timelineDay: 'Day', timelineWeek: 'Week', timelineMonth: 'Month', timelineYear: 'Year', resourceTimelineDay: 'Day', resourceTimelineWeek: 'Week', resourceTimelineMonth: 'Month', resourceTimelineYear: 'Year' },
  newEventAt: ({ time }) => `New event at ${time}`,
  newEventOn: ({ date }) => `New all-day event on ${date}`,
  dayLabel: ({ date, count }) => (count === 0 ? date : `${date}, ${count} ${count === 1 ? 'event' : 'events'}`),
  viewSwitcher: 'View',
  goToDay: 'Go to this day',
  openEvent: 'Open',
  deleteEvent: 'Delete',
  dropRefused: 'Not allowed here',
  eventMoved: ({ title, time }) => (time ? `${title} moved to ${time}` : `${title} moved`),
  eventResized: ({ title, time }) => (time ? `${title} now ends at ${time}` : `${title} resized`),
  movedIntoGap: ({ time }) => `That time does not exist today; moved to ${time}`,
  changeWhich: 'Change which events?',
  whichReading: ({ time }) => `Which ${time}?`,
  reading: ({ time, offset, first }) => `${first ? 'First' : 'Second'} ${time} (${offset})`,
  scopeThis: 'This event',
  scopeFollowing: 'This and following events',
  scopeAll: 'All events',
  skippedHour: 'This hour does not exist today; the event starts when it ends',
  actions: 'Actions',
  eventResizedStart: ({ title, time }) => (time ? `${title} now starts at ${time}` : `${title} resized`),
  cursorSlot: ({ date, time }) => `${date}, ${time}`,
  cursorAllDay: ({ date }) => `${date}, all day`,
  freeSlot: ({ time }) => `Free slot, ${time}`,
  ofResource: ({ resource, place }) => `${resource}, ${place}`,
  timeSlots: 'Time slots',
  range: ({ from, to }) => `${from} to ${to}`,
  selected: ({ span }) => `Selected: ${span}`,
  violation: (code) =>
    ({ constraint: 'outside the allowed hours', overlap: 'overlaps another event', allow: 'refused by the application', 'valid-range': 'outside the dates shown', 'not-editable': 'cannot be changed' })[code],
  noFurther: 'Cannot go further',
  notEditable: 'This event cannot be changed',
  cannotMove: 'This event cannot be moved',
  cannotResize: 'This length cannot be changed here',
  grabbed: ({ title }) => `${title} grabbed.`,
  grabHelp: 'Arrows move it, Page Up and Page Down by a week, Shift with arrows changes its end, Enter puts it down, Escape cancels.',
  grabHelpResize: 'Arrows change its end, Enter puts it down, Escape cancels.',
  grabHelpStart: 'Alt and Shift with arrows change its start.',
  grabCancelled: 'Move cancelled',
  eventDeleted: ({ title, undo }) => (undo ? `${title} deleted. ${undo} to undo.` : `${title} deleted.`),
  saveFailed: ({ title, reverted }) => `${title} could not be saved. ${reverted ? 'It is back as it was.' : 'Reloading.'}`,
  loadFailed: 'Some events could not be loaded.',
  noEvents: 'No events to show',
  noResources: 'No resources to show',
  unassigned: 'Unassigned',
  resource: 'Resource',
  weekShort: ({ week }) => `W${week}`,
  weekLabel: ({ week }) => `Week ${week}`,
  goToMonth: 'Go to this month',
  becomesAllDay: 'It becomes an all-day event',
  becomesTimed: ({ length }) => `It becomes a timed event of ${length}`,
  deleteWhich: 'Delete which events?',
  undone: 'Undone',
  redone: 'Redone',
  moveEvent: 'Move…',
  resizeEvent: 'Change duration…',
};

export const FR: DzMessages = {
  today: "Aujourd'hui",
  previous: 'Précédent',
  next: 'Suivant',
  allDay: 'Journée',
  dayDoesNotExist: "Ce jour n'existe pas dans ce fuseau",
  gapBand: ({ from, to }) => `${from}–${to} n'existe pas`,
  repeatBand: ({ from, to }) => `${from}–${to} a lieu deux fois`,
  secondPassMark: '*',
  realDuration: ({ duration }) => `${duration} réelles`,
  eventLabel: ({ title, time }) => `${title}, ${time}`,
  untitled: '(sans titre)',
  now: 'Maintenant',
  moreLink: ({ count }) => `+${count} autre${count > 1 ? 's' : ''}`,
  moreLabel: ({ count, date }) => `${count} autre${count > 1 ? 's' : ''} événement${count > 1 ? 's' : ''}, ${date}`,
  closePopover: 'Fermer',
  views: { dayGridMonth: 'Mois', dayGridWeek: 'Semaine', dayGridDay: 'Jour', timeGridWeek: 'Semaine', timeGridDay: 'Jour', listDay: 'Liste', listWeek: 'Liste', listMonth: 'Liste', listYear: 'Liste', multiMonthYear: 'Année', resourceTimeGridDay: 'Jour', resourceTimeGridWeek: 'Semaine', resourceDayGridDay: 'Jour', resourceDayGridWeek: 'Semaine', resourceDayGridMonth: 'Mois', timelineDay: 'Jour', timelineWeek: 'Semaine', timelineMonth: 'Mois', timelineYear: 'Année', resourceTimelineDay: 'Jour', resourceTimelineWeek: 'Semaine', resourceTimelineMonth: 'Mois', resourceTimelineYear: 'Année' },
  newEventAt: ({ time }) => `Nouvel événement à ${time}`,
  newEventOn: ({ date }) => `Nouvel événement le ${date}`,
  dayLabel: ({ date, count }) => (count === 0 ? date : `${date}, ${count} événement${count > 1 ? 's' : ''}`),
  viewSwitcher: 'Vue',
  goToDay: 'Aller à ce jour',
  openEvent: 'Ouvrir',
  deleteEvent: 'Supprimer',
  dropRefused: 'Impossible ici',
  eventMoved: ({ title, time }) => (time ? `« ${title} » déplacé à ${time}` : `« ${title} » déplacé`),
  eventResized: ({ title, time }) => (time ? `« ${title} » finit maintenant à ${time}` : `« ${title} » redimensionné`),
  movedIntoGap: ({ time }) => `Cette heure n’existe pas ce jour-là : déplacé à ${time}`,
  changeWhich: 'Modifier quels événements ?',
  whichReading: ({ time }) => `Quel ${time} ?`,
  reading: ({ time, offset, first }) => `${first ? 'Premier' : 'Second'} ${time} (${offset})`,
  scopeThis: 'Cet événement',
  scopeFollowing: 'Cet événement et les suivants',
  scopeAll: 'Tous les événements',
  skippedHour: "Cette heure n'existe pas aujourd'hui ; l'événement commence à sa fin",
  actions: 'Actions',
  eventResizedStart: ({ title, time }) => (time ? `« ${title} » commence maintenant à ${time}` : `« ${title} » redimensionné`),
  cursorSlot: ({ date, time }) => `${date}, ${time}`,
  cursorAllDay: ({ date }) => `${date}, journée`,
  freeSlot: ({ time }) => `Créneau libre, ${time}`,
  ofResource: ({ resource, place }) => `${resource}, ${place}`,
  timeSlots: 'Créneaux horaires',
  range: ({ from, to }) => `${from} à ${to}`,
  selected: ({ span }) => `Sélection : ${span}`,
  violation: (code) =>
    ({ constraint: 'en dehors des heures permises', overlap: 'chevauche un autre événement', allow: "refusé par l'application", 'valid-range': 'en dehors des dates affichables', 'not-editable': 'non modifiable' })[code],
  noFurther: 'Impossible d’aller plus loin',
  notEditable: 'Cet événement ne peut pas être modifié',
  cannotMove: 'Cet événement ne peut pas être déplacé',
  cannotResize: 'Cette durée ne peut pas être changée ici',
  grabbed: ({ title }) => `« ${title} » saisi.`,
  grabHelp: 'Flèches pour le déplacer, Page précédente et suivante d’une semaine, Maj et flèches pour sa fin, Entrée pour le poser, Échap pour annuler.',
  grabHelpResize: 'Flèches pour sa fin, Entrée pour le poser, Échap pour annuler.',
  grabHelpStart: 'Alt, Maj et flèches pour son début.',
  grabCancelled: 'Déplacement annulé',
  eventDeleted: ({ title, undo }) => (undo ? `« ${title} » supprimé. ${undo} pour annuler.` : `« ${title} » supprimé.`),
  saveFailed: ({ title, reverted }) => `« ${title} » n’a pas pu être enregistré. ${reverted ? 'Il est revenu comme avant.' : 'Rechargement.'}`,
  loadFailed: 'Des événements n’ont pas pu être chargés.',
  noEvents: 'Aucun événement à afficher',
  noResources: 'Aucune ressource à afficher',
  unassigned: 'Non assigné',
  resource: 'Ressource',
  weekShort: ({ week }) => `S${week}`,
  weekLabel: ({ week }) => `Semaine ${week}`,
  goToMonth: 'Aller à ce mois',
  becomesAllDay: 'Il devient un événement sur la journée',
  becomesTimed: ({ length }) => `Il devient un événement horaire de ${length}`,
  deleteWhich: 'Supprimer quels événements ?',
  undone: 'Annulé',
  redone: 'Rétabli',
  moveEvent: 'Déplacer…',
  resizeEvent: 'Changer la durée…',
};

/**
 * Languages by BCP 47 tag, lowercase: `ar`, `es`, `de-ch`. English and French
 * are built in; `import '@dzcalendar/dom/locales/ar'` (or `es`, `de`) adds one,
 * and `defineLocale` any other — a new language, or a region's own wording.
 */
const LOCALES = new Map<string, DzMessages | ((locale: string) => DzMessages)>([
  ['en', EN],
  ['fr', FR],
]);

/** The words for a language (`'pt'`) or a language in a region (`'pt-br'`). The later definition wins. */
export function defineLocale(code: string, messages: DzMessages | ((locale: string) => DzMessages)): void {
  LOCALES.set(code.toLowerCase(), messages);
  MADE.clear();
}
/** Words made by a locale's function, per full locale (with its -u- keywords: digits follow them). */
const MADE = new Map<string, DzMessages>();

/**
 * The words for a locale: its exact tag (`ar-SA`), then its language (`ar`),
 * else English. Unicode extensions (`-u-ca-…`) are ignored.
 */
export function messagesForLocale(locale: string): DzMessages {
  const tag = locale.toLowerCase().split('-u-')[0]!.replace(/_/g, '-');
  const parts = tag.split('-');
  for (let n = parts.length; n > 0; n--) {
    const found = LOCALES.get(parts.slice(0, n).join('-'));
    if (typeof found === 'function') {
      let made = MADE.get(locale);
      if (!made) {
        // The tag as Intl reads it ('es_MX' → 'es-MX'); one it refuses falls back to the language.
        const norm = locale.replace(/_/g, '-');
        let tagged = parts[0]!;
        try {
          tagged = new Intl.Locale(norm).toString();
        } catch {
          /* the language alone */
        }
        MADE.set(locale, (made = found(tagged)));
      }
      return made;
    }
    if (found) return found;
  }
  return EN;
}
