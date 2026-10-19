/** The exports' words: column heads, statuses, page notes. */
export interface ExportMessages {
  readonly sheet: string;
  readonly title: string;
  readonly start: string;
  readonly end: string;
  readonly zone: string;
  readonly endZone: string;
  readonly shownStart: string;
  readonly shownEnd: string;
  readonly minutes: string;
  readonly allDay: string;
  readonly resources: string;
  readonly status: string;
  readonly yes: string;
  readonly no: string;
  statusOf(status: string): string;
  /** A page's foot: "2 / 5". */
  page(p: { readonly n: number; readonly of: number }): string;
  /** A view with nothing to show. */
  readonly empty: string;
}

const status = (m: Record<string, string>) => (s: string) => m[s] ?? s;

export const EXPORT_EN: ExportMessages = {
  sheet: 'Events',
  title: 'Title',
  start: 'Start',
  end: 'End',
  zone: 'Time zone',
  endZone: 'End time zone',
  shownStart: 'Start (shown zone)',
  shownEnd: 'End (shown zone)',
  minutes: 'Minutes',
  allDay: 'All day',
  resources: 'Resources',
  status: 'Status',
  yes: 'Yes',
  no: 'No',
  statusOf: status({ confirmed: 'Confirmed', tentative: 'Tentative', cancelled: 'Cancelled' }),
  page: ({ n, of }) => `${n} / ${of}`,
  empty: 'No events',
};

export const EXPORT_FR: ExportMessages = {
  sheet: 'Événements',
  title: 'Titre',
  start: 'Début',
  end: 'Fin',
  zone: 'Fuseau horaire',
  endZone: 'Fuseau de fin',
  shownStart: 'Début (fuseau affiché)',
  shownEnd: 'Fin (fuseau affiché)',
  minutes: 'Minutes',
  allDay: 'Journée entière',
  resources: 'Ressources',
  status: 'Statut',
  yes: 'Oui',
  no: 'Non',
  statusOf: status({ confirmed: 'Confirmé', tentative: 'Provisoire', cancelled: 'Annulé' }),
  page: ({ n, of }) => `${n} / ${of}`,
  empty: 'Aucun événement',
};

export const EXPORT_AR: ExportMessages = {
  sheet: 'الأحداث',
  title: 'العنوان',
  start: 'البداية',
  end: 'النهاية',
  zone: 'المنطقة الزمنية',
  endZone: 'منطقة النهاية',
  shownStart: 'البداية (المنطقة المعروضة)',
  shownEnd: 'النهاية (المنطقة المعروضة)',
  minutes: 'الدقائق',
  allDay: 'طوال اليوم',
  resources: 'الموارد',
  status: 'الحالة',
  yes: 'نعم',
  no: 'لا',
  statusOf: status({ confirmed: 'مؤكد', tentative: 'مبدئي', cancelled: 'ملغى' }),
  page: ({ n, of }) => `${n} / ${of}`,
  empty: 'لا توجد أحداث',
};

export const EXPORT_ES: ExportMessages = {
  sheet: 'Eventos',
  title: 'Título',
  start: 'Inicio',
  end: 'Fin',
  zone: 'Zona horaria',
  endZone: 'Zona horaria final',
  shownStart: 'Inicio (zona mostrada)',
  shownEnd: 'Fin (zona mostrada)',
  minutes: 'Minutos',
  allDay: 'Todo el día',
  resources: 'Recursos',
  status: 'Estado',
  yes: 'Sí',
  no: 'No',
  statusOf: status({ confirmed: 'Confirmado', tentative: 'Provisional', cancelled: 'Cancelado' }),
  page: ({ n, of }) => `${n} / ${of}`,
  empty: 'No hay eventos',
};

export const EXPORT_DE: ExportMessages = {
  sheet: 'Termine',
  title: 'Titel',
  start: 'Beginn',
  end: 'Ende',
  zone: 'Zeitzone',
  endZone: 'Zeitzone am Ende',
  shownStart: 'Beginn (angezeigte Zone)',
  shownEnd: 'Ende (angezeigte Zone)',
  minutes: 'Minuten',
  allDay: 'Ganztägig',
  resources: 'Ressourcen',
  status: 'Status',
  yes: 'Ja',
  no: 'Nein',
  statusOf: status({ confirmed: 'Bestätigt', tentative: 'Vorläufig', cancelled: 'Abgesagt' }),
  page: ({ n, of }) => `${n} / ${of}`,
  empty: 'Keine Termine',
};

const LOCALES = new Map<string, ExportMessages>([
  ['en', EXPORT_EN],
  ['fr', EXPORT_FR],
  ['ar', EXPORT_AR],
  ['es', EXPORT_ES],
  ['de', EXPORT_DE],
]);

/** Adds (or replaces) a language: `defineExportLocale('it', { … })`. */
export function defineExportLocale(lang: string, m: ExportMessages): void {
  LOCALES.set(lang.toLowerCase(), m);
}

/** The words for a locale ("fr-CA" → French), English otherwise. */
export function exportMessagesFor(locale: string): ExportMessages {
  const lang = locale.toLowerCase().split(/[-_]/)[0]!;
  return LOCALES.get(locale.toLowerCase()) ?? LOCALES.get(lang) ?? EXPORT_EN;
}
