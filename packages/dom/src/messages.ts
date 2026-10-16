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
  views: { dayGridMonth: 'Month', dayGridWeek: 'Week', dayGridDay: 'Day', timeGridWeek: 'Week', timeGridDay: 'Day' },
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
  views: { dayGridMonth: 'Mois', dayGridWeek: 'Semaine', dayGridDay: 'Jour', timeGridWeek: 'Semaine', timeGridDay: 'Jour' },
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
  becomesAllDay: 'Il devient un événement sur la journée',
  becomesTimed: ({ length }) => `Il devient un événement horaire de ${length}`,
  deleteWhich: 'Supprimer quels événements ?',
  undone: 'Annulé',
  redone: 'Rétabli',
  moveEvent: 'Déplacer…',
  resizeEvent: 'Changer la durée…',
};
