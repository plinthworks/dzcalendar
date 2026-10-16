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
  /** Under "New event at 03:00" when the click was in an hour that does not exist. */
  readonly skippedHour: string;
  /** The context menu's accessible name. */
  readonly actions: string;
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
  skippedHour: 'This hour does not exist today; the event starts when it ends',
  actions: 'Actions',
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
  skippedHour: "Cette heure n'existe pas aujourd'hui ; l'événement commence à sa fin",
  actions: 'Actions',
};
