/**
 * `import '@dzcalendar/dom/locales/ar'`: the calendar's words in Arabic, for
 * every `ar` locale (the calendar turns right to left from the locale itself).
 * Times, offsets and key names inside a sentence are isolated (FSI … PDI) so
 * they keep their own direction; counts follow Arabic's six plural forms.
 */
import { defineLocale } from '@dzcalendar/dom';
import type { DzMessages } from '@dzcalendar/dom';

/** The words for one locale of the language: numbers as that locale writes them (\`ar-SA\` Arabic-Indic, \`-u-nu-latn\` Latin). */
export function messagesAr(locale = 'ar'): DzMessages {
const nf = new Intl.NumberFormat(locale);
const plural = new Intl.PluralRules(locale);
const n = (x: number) => nf.format(x);
/** A left-to-right fragment (a time, an offset, a key) kept whole inside right-to-left text. */
const iso = (s: string) => (s ? `⁨${s}⁩` : s);

/** "N events", by Arabic's plural forms. */
function events(c: number): string {
  switch (plural.select(c)) {
    case 'zero':
      return 'لا أحداث';
    case 'one':
      return 'حدث واحد';
    case 'two':
      return 'حدثان';
    case 'few':
      return `${n(c)} أحداث`;
    case 'many':
      return `${n(c)} حدثًا`;
    default:
      return `${n(c)} حدث`;
  }
}

/** "N more events". */
function more(c: number): string {
  switch (plural.select(c)) {
    case 'one':
      return 'حدث آخر';
    case 'two':
      return 'حدثان آخران';
    case 'few':
      return `${n(c)} أحداث أخرى`;
    case 'many':
      return `${n(c)} حدثًا آخر`;
    default:
      return `${n(c)} حدث آخر`;
  }
}

return {
  today: 'اليوم',
  previous: 'السابق',
  next: 'التالي',
  allDay: 'طوال اليوم',
  ongoing: 'جارٍ',
  dayDoesNotExist: 'هذا اليوم غير موجود في هذه المنطقة الزمنية',
  gapBand: ({ from, to }) => `الفترة ${iso(`${from}–${to}`)} غير موجودة`,
  repeatBand: ({ from, to }) => `الفترة ${iso(`${from}–${to}`)} تتكرر مرتين`,
  secondPassMark: '*',
  realDuration: ({ duration }) => `${duration} فعليًا`,
  eventLabel: ({ title, time }) => `${title}، ${iso(time)}`,
  untitled: '(بلا عنوان)',
  now: 'الآن',
  moreLink: ({ count }) => `+${n(count)} أخرى`,
  moreLabel: ({ count, date }) => `${more(count)}، ${date}`,
  closePopover: 'إغلاق',
  views: { dayGridMonth: 'شهر', dayGridWeek: 'أسبوع', dayGridDay: 'يوم', timeGridWeek: 'أسبوع', timeGridDay: 'يوم', listDay: 'قائمة', listWeek: 'قائمة', listMonth: 'قائمة', listYear: 'قائمة', multiMonthYear: 'سنة', resourceTimeGridDay: 'يوم', resourceTimeGridWeek: 'أسبوع', resourceDayGridDay: 'يوم', resourceDayGridWeek: 'أسبوع', resourceDayGridMonth: 'شهر', timelineDay: 'يوم', timelineWeek: 'أسبوع', timelineMonth: 'شهر', timelineYear: 'سنة', resourceTimelineDay: 'يوم', resourceTimelineWeek: 'أسبوع', resourceTimelineMonth: 'شهر', resourceTimelineYear: 'سنة' },
  newEventAt: ({ time }) => `حدث جديد في ${iso(time)}`,
  newEventOn: ({ date }) => `حدث جديد طوال اليوم في ${date}`,
  dayLabel: ({ date, count }) => (count === 0 ? date : `${date}، ${events(count)}`),
  viewSwitcher: 'العرض',
  goToDay: 'الانتقال إلى هذا اليوم',
  openEvent: 'فتح',
  deleteEvent: 'حذف',
  dropRefused: 'غير مسموح هنا',
  dropRefusedFor: ({ reasons }) => `غير مسموح هنا: ${reasons}`,
  commandRefused: 'تم رفض الإجراء',
  eventMoved: ({ title, time }) => (time ? `تم نقل «${title}» إلى ${iso(time)}` : `تم نقل «${title}»`),
  eventReceived: ({ title, when }) => `تمت إضافة «${title}»: ${iso(when)}`,
  pickedUp: ({ title }) => `تم أخذ «${title}». مفتاح Tab للوصول إلى تقويم، والأسهم لاختيار المكان، وEnter لوضعه، وEscape للإلغاء.`,
  eventResized: ({ title, time }) => (time ? `ينتهي «${title}» الآن في ${iso(time)}` : `تم تغيير مدة «${title}»`),
  movedIntoGap: ({ time }) => `هذا الوقت غير موجود في ذلك اليوم؛ تم النقل إلى ${iso(time)}`,
  changeWhich: 'ما الأحداث التي تريد تغييرها؟',
  whichReading: ({ time }) => `أي ${iso(time)}؟`,
  reading: ({ time, offset, first }) => `${iso(time)} ${first ? 'الأولى' : 'الثانية'} (${iso(offset)})`,
  scopeThis: 'هذا الحدث',
  scopeFollowing: 'هذا الحدث والأحداث التالية',
  scopeAll: 'كل الأحداث',
  skippedHour: 'هذه الساعة غير موجودة اليوم؛ يبدأ الحدث عند نهايتها',
  actions: 'إجراءات',
  eventResizedStart: ({ title, time }) => (time ? `يبدأ «${title}» الآن في ${iso(time)}` : `تم تغيير مدة «${title}»`),
  cursorSlot: ({ date, time }) => `${date}، ${iso(time)}`,
  cursorAllDay: ({ date }) => `${date}، طوال اليوم`,
  freeSlot: ({ time }) => `موعد متاح، ${iso(time)}`,
  seatsLeft: ({ count }) => (count === 1 ? 'مقعد واحد' : count === 2 ? 'مقعدان' : count <= 10 ? `${n(count)} مقاعد` : `${n(count)} مقعدًا`),
  ofResource: ({ resource, place }) => `${resource}، ${place}`,
  timeSlots: 'الفترات الزمنية',
  range: ({ from, to }) => `من ${iso(from)} إلى ${iso(to)}`,
  selected: ({ span }) => `تم التحديد: ${span}`,
  selectionCleared: 'تم إلغاء التحديد',
  violation: (code) =>
    ({ constraint: 'خارج الساعات المسموح بها', overlap: 'يتداخل مع حدث آخر', allow: 'رفضه التطبيق', 'valid-range': 'خارج التواريخ المعروضة', 'not-editable': 'لا يمكن تغييره' })[code],
  noFurther: 'لا يمكن التقدم أكثر',
  notEditable: 'لا يمكن تغيير هذا الحدث',
  cannotMove: 'لا يمكن نقل هذا الحدث',
  cannotResize: 'لا يمكن تغيير هذه المدة هنا',
  grabbed: ({ title }) => `تم التقاط «${title}».`,
  grabHelp: `الأسهم لنقله، و${iso('Page Up')} و${iso('Page Down')} بأسبوع، و${iso('Shift')} مع الأسهم لتغيير نهايته، و${iso('Enter')} لوضعه، و${iso('Escape')} للإلغاء.`,
  grabHelpResize: `الأسهم لتغيير نهايته، و${iso('Enter')} لوضعه، و${iso('Escape')} للإلغاء.`,
  grabHelpStart: `${iso('Alt')} و${iso('Shift')} مع الأسهم لتغيير بدايته.`,
  grabCancelled: 'تم إلغاء النقل',
  eventDeleted: ({ title, undo }) => (undo ? `تم حذف «${title}». ${iso(undo)} للتراجع.` : `تم حذف «${title}».`),
  saveFailed: ({ title, reverted }) => `تعذّر حفظ «${title}». ${reverted ? 'أُعيد إلى ما كان عليه.' : 'جارٍ إعادة التحميل.'}`,
  loadFailed: 'تعذّر تحميل بعض الأحداث.',
  noEvents: 'لا توجد أحداث لعرضها',
  noResources: 'لا توجد موارد لعرضها',
  unassigned: 'غير مُسنَد',
  resource: 'المورد',
  weekShort: ({ week }) => `أ${n(week)}`,
  weekLabel: ({ week }) => `الأسبوع ${n(week)}`,
  goToMonth: 'الانتقال إلى هذا الشهر',
  becomesAllDay: 'يصبح حدثًا طوال اليوم',
  becomesTimed: ({ length }) => `يصبح حدثًا مدته ${length}`,
  deleteWhich: 'ما الأحداث التي تريد حذفها؟',
  undone: 'تم التراجع',
  redone: 'تمت الإعادة',
  moveEvent: 'نقل…',
  resizeEvent: 'تغيير المدة…',
  problem: (p) => {
    switch (p.code) {
      case 'host-no-height':
        return p.height === 0
          ? `ارتفاع التقويم ${iso('0 px')}: العنصر الحاضن بلا ارتفاع (عنصر سطري، مثل ${iso('<dz-calendar>')} دون ${iso('display: block')}؟)`
          : `ارتفاع التقويم ${iso(`${p.height} px`)} ولا شيء فيه يُمرَّر: ارتفاعه يأتي من محتواه — أعطِ العنصر الحاضن ارتفاعًا (${iso('--dz-height: 100%')} تعني كامل ارتفاع الحاضن، ويلزمه ارتفاع خاص به)`;
      case 'zone-from-browser':
        return `لم يُحدَّد ${iso('timeZone')}: تُستعمل منطقة المتصفح (${iso(p.zone)}) — مرِّر ${iso('timeZone')} (أو ${iso('Temporal.Now.timeZoneId()')} لمنطقة المتصفح عن قصد)`;
      case 'too-many-occurrences':
        return `السلسلة ${iso(p.series)}: أكثر من ${n(p.limit)} تكرار في الفترة المعروضة — تُرسَم الأولى منها فقط`;
      case 'events-not-drawn':
        return p.reason === 'all-day'
          ? `${events(p.count)} طوال اليوم في ${iso(p.view)}: ${iso('allDaySlot')} قيمته ${iso('false')}، فلا تُرسَم (تبقى الخلفيات ملوِّنةً أعمدتها)`
          : `${events(p.count)} في ${iso(p.view)} خارج الساعات المعروضة كليًّا (${iso('slotMin–slotMax')}): لا تُرسَم`;
    }
  },
};
}

export const AR: DzMessages = messagesAr();
defineLocale('ar', messagesAr);
