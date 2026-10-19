/**
 * The editor's words. Scope ("this event / following / all"), refusals and
 * "untitled" come from the calendar's own messages (`@dzcalendar/dom`);
 * these are the form's. English and French built in; Arabic, Spanish and
 * German too (the editor is one entry: its words are few).
 */
export interface EditorMessages {
  readonly newEvent: string;
  readonly editEvent: string;
  readonly title: string;
  readonly when: string;
  readonly timeZone: string;
  readonly resources: string;
  readonly colour: string;
  readonly colours: Readonly<Record<'none' | 'blue' | 'green' | 'red' | 'amber' | 'violet' | 'slate', string>>;
  readonly repeat: string;
  readonly repeatNone: string;
  /** The repeat's own field (the group is "Repeats"). */
  readonly frequency: string;
  /** The monthly choices' group. */
  readonly monthlyOn: string;
  /** The option of a rule the form cannot show. */
  readonly customLabel: string;
  /** What to fix before saving. */
  readonly needDate: string;
  readonly needUntil: string;
  readonly untilBeforeStart: string;
  readonly needWeekday: string;
  readonly needNumber: string;
  /** A problem code (`invalid-rrule`…), in words. */
  problem(code: string): string;
  readonly freq: Readonly<Record<'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY', string>>;
  /** "every" before the interval, and its unit after it. */
  readonly every: string;
  units(parts: { freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'; n: number }): string;
  readonly onDays: string;
  monthlyDay(parts: { day: string }): string;
  monthlyNth(parts: { n: number; weekday: string }): string;
  monthlyLast(parts: { weekday: string }): string;
  readonly ends: string;
  readonly never: string;
  readonly onDate: string;
  readonly after: string;
  occurrences(parts: { n: number }): string;
  custom(parts: { rule: string }): string;
  readonly applyTo: string;
  readonly save: string;
  readonly cancel: string;
  readonly remove: string;
  readonly saved: string;
  readonly removed: string;
  refused(parts: { why: string }): string;
}

const ordinalFr = (n: number) => (n === 1 ? '1er' : `${n}e`);
const ordinalEn = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;

export const EDITOR_EN: EditorMessages = {
  newEvent: 'New event',
  editEvent: 'Edit event',
  title: 'Title',
  when: 'When',
  timeZone: 'Time zone',
  resources: 'Resources',
  colour: 'Colour',
  colours: { none: 'Default', blue: 'Blue', green: 'Green', red: 'Red', amber: 'Amber', violet: 'Violet', slate: 'Slate' },
  repeat: 'Repeats',
  repeatNone: 'Does not repeat',
  frequency: 'How often',
  monthlyOn: 'Which day',
  customLabel: 'Custom rule',
  needDate: 'Give a start and an end',
  needUntil: 'Give the last date',
  untilBeforeStart: 'The last date is before the first',
  needWeekday: 'Pick at least one day',
  needNumber: 'Give a whole number, 1 or more',
  problem: (code) => (code === 'invalid-rrule' ? 'the repeat rule cannot be read' : code === 'duplicate-id' ? 'this event already exists' : 'the event cannot be read'),
  freq: { DAILY: 'Daily', WEEKLY: 'Weekly', MONTHLY: 'Monthly', YEARLY: 'Yearly' },
  every: 'Every',
  units: ({ freq, n }) => ({ DAILY: 'day', WEEKLY: 'week', MONTHLY: 'month', YEARLY: 'year' })[freq] + (n === 1 ? '' : 's'),
  onDays: 'On',
  monthlyDay: ({ day }) => `On day ${day}`,
  monthlyNth: ({ n, weekday }) => `On the ${ordinalEn(n)} ${weekday}`,
  monthlyLast: ({ weekday }) => `On the last ${weekday}`,
  ends: 'Ends',
  never: 'Never',
  onDate: 'On',
  after: 'After',
  occurrences: ({ n }) => (n === 1 ? 'time' : 'times'),
  custom: ({ rule }) => `Custom rule: ${rule}. It is kept as it is unless you pick another one.`,
  applyTo: 'Apply to',
  save: 'Save',
  cancel: 'Cancel',
  remove: 'Delete',
  saved: 'Event saved',
  removed: 'Event deleted',
  refused: ({ why }) => `Not saved: ${why}`,
};

export const EDITOR_FR: EditorMessages = {
  newEvent: 'Nouvel événement',
  editEvent: "Modifier l'événement",
  title: 'Titre',
  when: 'Quand',
  timeZone: 'Fuseau horaire',
  resources: 'Ressources',
  colour: 'Couleur',
  colours: { none: 'Par défaut', blue: 'Bleu', green: 'Vert', red: 'Rouge', amber: 'Ambre', violet: 'Violet', slate: 'Ardoise' },
  repeat: 'Répétition',
  repeatNone: 'Ne se répète pas',
  frequency: 'Fréquence',
  monthlyOn: 'Quel jour',
  customLabel: 'Règle personnalisée',
  needDate: 'Indiquez un début et une fin',
  needUntil: 'Indiquez la dernière date',
  untilBeforeStart: 'La dernière date est avant la première',
  needWeekday: 'Choisissez au moins un jour',
  needNumber: 'Indiquez un nombre entier, 1 ou plus',
  problem: (code) => (code === 'invalid-rrule' ? 'la règle de répétition est illisible' : code === 'duplicate-id' ? 'cet événement existe déjà' : "l'événement est illisible"),
  freq: { DAILY: 'Tous les jours', WEEKLY: 'Toutes les semaines', MONTHLY: 'Tous les mois', YEARLY: 'Tous les ans' },
  every: 'Tous les',
  units: ({ freq, n }) => (freq === 'DAILY' ? (n === 1 ? 'jour' : 'jours') : freq === 'WEEKLY' ? (n === 1 ? 'semaine' : 'semaines') : freq === 'MONTHLY' ? 'mois' : n === 1 ? 'an' : 'ans'),
  onDays: 'Les',
  monthlyDay: ({ day }) => `Le ${day}`,
  monthlyNth: ({ n, weekday }) => `Le ${ordinalFr(n)} ${weekday}`,
  monthlyLast: ({ weekday }) => `Le dernier ${weekday}`,
  ends: 'Fin',
  never: 'Jamais',
  onDate: 'Le',
  after: 'Après',
  occurrences: ({ n }) => (n === 1 ? 'fois' : 'fois'),
  custom: ({ rule }) => `Règle personnalisée : ${rule}. Elle est gardée telle quelle si vous n'en choisissez pas une autre.`,
  applyTo: 'Appliquer à',
  save: 'Enregistrer',
  cancel: 'Annuler',
  remove: 'Supprimer',
  saved: 'Événement enregistré',
  removed: 'Événement supprimé',
  refused: ({ why }) => `Non enregistré : ${why}`,
};

export const EDITOR_AR: EditorMessages = {
  newEvent: 'حدث جديد',
  editEvent: 'تعديل الحدث',
  title: 'العنوان',
  when: 'الموعد',
  timeZone: 'المنطقة الزمنية',
  resources: 'الموارد',
  colour: 'اللون',
  colours: { none: 'افتراضي', blue: 'أزرق', green: 'أخضر', red: 'أحمر', amber: 'كهرماني', violet: 'بنفسجي', slate: 'رمادي' },
  repeat: 'التكرار',
  repeatNone: 'لا يتكرر',
  frequency: 'معدل التكرار',
  monthlyOn: 'أي يوم',
  customLabel: 'قاعدة مخصصة',
  needDate: 'حدد بداية ونهاية',
  needUntil: 'حدد آخر تاريخ',
  untilBeforeStart: 'آخر تاريخ قبل أول تاريخ',
  needWeekday: 'اختر يومًا واحدًا على الأقل',
  needNumber: 'أدخل عددًا صحيحًا، 1 أو أكثر',
  problem: (code) => (code === 'invalid-rrule' ? 'قاعدة التكرار غير مقروءة' : code === 'duplicate-id' ? 'هذا الحدث موجود بالفعل' : 'الحدث غير مقروء'),
  freq: { DAILY: 'يوميًا', WEEKLY: 'أسبوعيًا', MONTHLY: 'شهريًا', YEARLY: 'سنويًا' },
  every: 'كل',
  units: ({ freq, n }) => (freq === 'DAILY' ? (n <= 2 || n > 10 ? 'يوم' : 'أيام') : freq === 'WEEKLY' ? (n <= 2 || n > 10 ? 'أسبوع' : 'أسابيع') : freq === 'MONTHLY' ? (n <= 2 || n > 10 ? 'شهر' : 'أشهر') : n <= 2 || n > 10 ? 'سنة' : 'سنوات'),
  onDays: 'في',
  monthlyDay: ({ day }) => `في اليوم ${day}`,
  monthlyNth: ({ n, weekday }) => `في ${weekday} رقم ${n}`,
  monthlyLast: ({ weekday }) => `في آخر ${weekday}`,
  ends: 'ينتهي',
  never: 'أبدًا',
  onDate: 'في',
  after: 'بعد',
  occurrences: () => 'مرات',
  custom: ({ rule }) => `قاعدة مخصصة: ${rule}. تبقى كما هي ما لم تختر غيرها.`,
  applyTo: 'تطبيق على',
  save: 'حفظ',
  cancel: 'إلغاء',
  remove: 'حذف',
  saved: 'تم حفظ الحدث',
  removed: 'تم حذف الحدث',
  refused: ({ why }) => `لم يتم الحفظ: ${why}`,
};

export const EDITOR_ES: EditorMessages = {
  newEvent: 'Nuevo evento',
  editEvent: 'Editar evento',
  title: 'Título',
  when: 'Cuándo',
  timeZone: 'Zona horaria',
  resources: 'Recursos',
  colour: 'Color',
  colours: { none: 'Predeterminado', blue: 'Azul', green: 'Verde', red: 'Rojo', amber: 'Ámbar', violet: 'Violeta', slate: 'Pizarra' },
  repeat: 'Repetición',
  repeatNone: 'No se repite',
  frequency: 'Frecuencia',
  monthlyOn: 'Qué día',
  customLabel: 'Regla personalizada',
  needDate: 'Indica un inicio y un final',
  needUntil: 'Indica la última fecha',
  untilBeforeStart: 'La última fecha es anterior a la primera',
  needWeekday: 'Elige al menos un día',
  needNumber: 'Indica un número entero, 1 o más',
  problem: (code) => (code === 'invalid-rrule' ? 'la regla de repetición no se puede leer' : code === 'duplicate-id' ? 'este evento ya existe' : 'el evento no se puede leer'),
  freq: { DAILY: 'Cada día', WEEKLY: 'Cada semana', MONTHLY: 'Cada mes', YEARLY: 'Cada año' },
  every: 'Cada',
  units: ({ freq, n }) => ({ DAILY: 'día', WEEKLY: 'semana', MONTHLY: 'mes', YEARLY: 'año' })[freq] + (n === 1 ? '' : freq === 'MONTHLY' ? 'es' : 's'),
  onDays: 'Los',
  monthlyDay: ({ day }) => `El día ${day}`,
  monthlyNth: ({ n, weekday }) => `El ${n}.º ${weekday}`,
  monthlyLast: ({ weekday }) => `El último ${weekday}`,
  ends: 'Termina',
  never: 'Nunca',
  onDate: 'El',
  after: 'Después de',
  occurrences: ({ n }) => (n === 1 ? 'vez' : 'veces'),
  custom: ({ rule }) => `Regla personalizada: ${rule}. Se mantiene tal cual si no eliges otra.`,
  applyTo: 'Aplicar a',
  save: 'Guardar',
  cancel: 'Cancelar',
  remove: 'Eliminar',
  saved: 'Evento guardado',
  removed: 'Evento eliminado',
  refused: ({ why }) => `No guardado: ${why}`,
};

export const EDITOR_DE: EditorMessages = {
  newEvent: 'Neuer Termin',
  editEvent: 'Termin bearbeiten',
  title: 'Titel',
  when: 'Wann',
  timeZone: 'Zeitzone',
  resources: 'Ressourcen',
  colour: 'Farbe',
  colours: { none: 'Standard', blue: 'Blau', green: 'Grün', red: 'Rot', amber: 'Bernstein', violet: 'Violett', slate: 'Schiefer' },
  repeat: 'Wiederholung',
  repeatNone: 'Keine Wiederholung',
  frequency: 'Wie oft',
  monthlyOn: 'Welcher Tag',
  customLabel: 'Eigene Regel',
  needDate: 'Geben Sie Beginn und Ende an',
  needUntil: 'Geben Sie das letzte Datum an',
  untilBeforeStart: 'Das letzte Datum liegt vor dem ersten',
  needWeekday: 'Wählen Sie mindestens einen Tag',
  needNumber: 'Geben Sie eine ganze Zahl ab 1 an',
  problem: (code) => (code === 'invalid-rrule' ? 'die Wiederholungsregel ist nicht lesbar' : code === 'duplicate-id' ? 'dieser Termin existiert bereits' : 'der Termin ist nicht lesbar'),
  freq: { DAILY: 'Täglich', WEEKLY: 'Wöchentlich', MONTHLY: 'Monatlich', YEARLY: 'Jährlich' },
  every: 'Alle',
  units: ({ freq, n }) => (freq === 'DAILY' ? (n === 1 ? 'Tag' : 'Tage') : freq === 'WEEKLY' ? (n === 1 ? 'Woche' : 'Wochen') : freq === 'MONTHLY' ? (n === 1 ? 'Monat' : 'Monate') : n === 1 ? 'Jahr' : 'Jahre'),
  onDays: 'Am',
  monthlyDay: ({ day }) => `Am ${day}.`,
  monthlyNth: ({ n, weekday }) => `Am ${n}. ${weekday}`,
  monthlyLast: ({ weekday }) => `Am letzten ${weekday}`,
  ends: 'Endet',
  never: 'Nie',
  onDate: 'Am',
  after: 'Nach',
  occurrences: ({ n }) => (n === 1 ? 'Mal' : 'Malen'),
  custom: ({ rule }) => `Eigene Regel: ${rule}. Sie bleibt erhalten, solange Sie keine andere wählen.`,
  applyTo: 'Anwenden auf',
  save: 'Speichern',
  cancel: 'Abbrechen',
  remove: 'Löschen',
  saved: 'Termin gespeichert',
  removed: 'Termin gelöscht',
  refused: ({ why }) => `Nicht gespeichert: ${why}`,
};

const OWN = new Map<string, EditorMessages>([
  ['en', EDITOR_EN],
  ['fr', EDITOR_FR],
  ['ar', EDITOR_AR],
  ['es', EDITOR_ES],
  ['de', EDITOR_DE],
]);

/** The editor's words in another language (complete set). */
export function defineEditorLocale(language: string, messages: EditorMessages): void {
  OWN.set(language.toLowerCase(), messages);
}

/** The editor's words for a locale: its language's, else English. */
export function editorMessagesFor(locale: string): EditorMessages {
  const parts = locale.toLowerCase().split('-u-')[0]!.replace(/_/g, '-').split('-');
  for (let n = parts.length; n > 0; n--) {
    const hit = OWN.get(parts.slice(0, n).join('-'));
    if (hit) return hit;
  }
  return EDITOR_EN;
}
