/**
 * The words of an option's facts table (<OptionFacts>), in each language. The
 * facts themselves come from the types (scripts/gen-options.mjs); a default
 * the code cannot write as a literal is a token here.
 */
export interface FactWords {
  type: string;
  default: string;
  live: string;
  source: string;
  none: string;
  yes: string;
  no: string;
  nextView: string;
  as: (key: string) => string;
  tokens: Record<string, string>;
}

export const FACTS: Record<'en' | 'fr', FactWords> = {
  en: {
    type: 'Type',
    default: 'Default',
    live: 'Live update (`update()`)',
    source: 'Declared in',
    none: 'not set',
    yes: 'Yes',
    no: 'No — at creation only',
    nextView: 'Yes — the next time a time grid or a timeline is shown after another kind of view',
    as: (key) => `Yes, as \`${key}\`: \`update({ ${key}: … })\``,
    tokens: {
      browserZone: "the browser's time zone — said once (`zone-from-browser`)",
      pageLanguage: "the page's language (`<html lang>`), else `'en'`",
      localeWeek: "the locale's first day of the week",
      localeWords: "the locale's words",
      localeCalendar: "the locale's calendar",
      today: 'today, in `timeZone`',
      firstView: "`'timeGridWeek'` — or, with `@dzcalendar/dom/base`, the first view whose renderer is imported",
      renderedViews: 'month, week and day — the views whose renderer is imported',
      defaultHeader: "`{ start: 'prev,next today', center: 'title', end: headerViews }`",
      lanesPerView: "`null` in a month (every event), `'auto'` in a year",
      titlePerView: "the month, a week's days, a day in full",
      builtInMotion: 'the built-in motion (Web Animations, reduced when the system asks)',
      builtInMenu: 'the built-in entries',
      scopeMenu: 'a "this / following / all" menu where the event was dropped',
      slotPerSpan: '30 minutes for a day, 60 up to a week, days beyond',
    },
  },
  fr: {
    type: 'Type',
    default: 'Par défaut',
    live: 'Modifiable en direct (`update()`)',
    source: 'Déclaré dans',
    none: 'non défini',
    yes: 'Oui',
    no: 'Non — à la création seulement',
    nextView: "Oui — la prochaine fois qu'une grille horaire ou une timeline s'affiche après un autre genre de vue",
    as: (key) => `Oui, sous le nom \`${key}\` : \`update({ ${key}: … })\``,
    tokens: {
      browserZone: 'le fuseau du navigateur — signalé une fois (`zone-from-browser`)',
      pageLanguage: "la langue de la page (`<html lang>`), sinon `'en'`",
      localeWeek: 'le premier jour de la semaine de la locale',
      localeWords: 'les mots de la locale',
      localeCalendar: 'le calendrier de la locale',
      today: "aujourd'hui, dans `timeZone`",
      firstView: "`'timeGridWeek'` — ou, avec `@dzcalendar/dom/base`, la première vue dont le rendu est importé",
      renderedViews: 'mois, semaine et jour — les vues dont le rendu est importé',
      defaultHeader: "`{ start: 'prev,next today', center: 'title', end: headerViews }`",
      lanesPerView: "`null` dans un mois (tous les événements), `'auto'` dans une année",
      titlePerView: "le mois, les jours d'une semaine, un jour en entier",
      builtInMotion: "le mouvement intégré (Web Animations, réduit quand le système le demande)",
      builtInMenu: 'les entrées intégrées',
      scopeMenu: "un menu « cet événement / les suivants / tous » là où l'événement a été déposé",
      slotPerSpan: "30 minutes pour un jour, 60 jusqu'à une semaine, des jours au-delà",
    },
  },
};
