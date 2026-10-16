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
};
