/** `import '@dzcalendar/dom/locales/es'`: the calendar's words in Spanish, for every `es` locale. */
import { defineLocale } from '@dzcalendar/dom';
import type { DzMessages } from '@dzcalendar/dom';

/** The words for one locale of the language: numbers as that locale writes them (\`ar-SA\` Arabic-Indic, \`-u-nu-latn\` Latin). */
export function messagesEs(locale = 'es'): DzMessages {
const nf = new Intl.NumberFormat(locale);
const n = (x: number) => nf.format(x);
const events = (c: number) => `${n(c)} ${c === 1 ? 'evento' : 'eventos'}`;

return {
  today: 'Hoy',
  previous: 'Anterior',
  next: 'Siguiente',
  allDay: 'Todo el día',
  dayDoesNotExist: 'Este día no existe en esta zona horaria',
  gapBand: ({ from, to }) => `${from}–${to} no existe`,
  repeatBand: ({ from, to }) => `${from}–${to} ocurre dos veces`,
  secondPassMark: '*',
  realDuration: ({ duration }) => `${duration} reales`,
  eventLabel: ({ title, time }) => `${title}, ${time}`,
  untitled: '(sin título)',
  now: 'Ahora',
  moreLink: ({ count }) => `+${n(count)} más`,
  moreLabel: ({ count, date }) => `${count === 1 ? '1 evento más' : `${n(count)} eventos más`}, ${date}`,
  closePopover: 'Cerrar',
  views: { dayGridMonth: 'Mes', dayGridWeek: 'Semana', dayGridDay: 'Día', timeGridWeek: 'Semana', timeGridDay: 'Día', listDay: 'Lista', listWeek: 'Lista', listMonth: 'Lista', listYear: 'Lista', multiMonthYear: 'Año', resourceTimeGridDay: 'Día', resourceTimeGridWeek: 'Semana', resourceDayGridDay: 'Día', resourceDayGridWeek: 'Semana', resourceDayGridMonth: 'Mes', timelineDay: 'Día', timelineWeek: 'Semana', timelineMonth: 'Mes', timelineYear: 'Año', resourceTimelineDay: 'Día', resourceTimelineWeek: 'Semana', resourceTimelineMonth: 'Mes', resourceTimelineYear: 'Año' },
  newEventAt: ({ time }) => `Nuevo evento a las ${time}`,
  newEventOn: ({ date }) => `Nuevo evento de todo el día el ${date}`,
  dayLabel: ({ date, count }) => (count === 0 ? date : `${date}, ${events(count)}`),
  viewSwitcher: 'Vista',
  goToDay: 'Ir a este día',
  openEvent: 'Abrir',
  deleteEvent: 'Eliminar',
  dropRefused: 'No se permite aquí',
  dropRefusedFor: ({ reasons }) => `No se permite aquí: ${reasons}`,
  commandRefused: 'Acción rechazada',
  eventMoved: ({ title, time }) => (time ? `«${title}» movido a ${time}` : `«${title}» movido`),
  eventReceived: ({ title, when }) => `«${title}» colocado: ${when}`,
  pickedUp: ({ title }) => `«${title}» tomado. Tab hasta un calendario, las flechas para elegir el lugar, Intro para dejarlo, Escape para cancelar.`,
  eventResized: ({ title, time }) => (time ? `Nuevo final de «${title}»: ${time}` : `Duración de «${title}» cambiada`),
  movedIntoGap: ({ time }) => `Esa hora no existe ese día; se movió a ${time}`,
  changeWhich: '¿Qué eventos quieres cambiar?',
  whichReading: ({ time }) => `¿Cuál de las ${time}?`,
  reading: ({ time, offset, first }) => `${time} (${first ? 'primera' : 'segunda'} vez, ${offset})`,
  scopeThis: 'Este evento',
  scopeFollowing: 'Este evento y los siguientes',
  scopeAll: 'Todos los eventos',
  skippedHour: 'Esta hora no existe hoy; el evento empieza cuando termina',
  actions: 'Acciones',
  eventResizedStart: ({ title, time }) => (time ? `Nuevo inicio de «${title}»: ${time}` : `Duración de «${title}» cambiada`),
  cursorSlot: ({ date, time }) => `${date}, ${time}`,
  cursorAllDay: ({ date }) => `${date}, todo el día`,
  freeSlot: ({ time }) => `Hueco libre, ${time}`,
  seatsLeft: ({ count }) => (count === 1 ? '1 plaza' : `${n(count)} plazas`),
  ofResource: ({ resource, place }) => `${resource}, ${place}`,
  timeSlots: 'Franjas horarias',
  range: ({ from, to }) => `${from} a ${to}`,
  selected: ({ span }) => `Seleccionado: ${span}`,
  selectionCleared: 'Selección borrada',
  violation: (code) =>
    ({ constraint: 'fuera del horario permitido', overlap: 'se superpone con otro evento', allow: 'rechazado por la aplicación', 'valid-range': 'fuera de las fechas mostradas', 'not-editable': 'no se puede modificar' })[code],
  noFurther: 'No se puede avanzar más',
  notEditable: 'Este evento no se puede modificar',
  cannotMove: 'Este evento no se puede mover',
  cannotResize: 'Esta duración no se puede cambiar aquí',
  grabbed: ({ title }) => `«${title}» listo para mover.`,
  grabHelp: 'Las flechas lo mueven, Re Pág y Av Pág una semana, Mayús con flechas cambia su final, Intro lo coloca, Esc cancela.',
  grabHelpResize: 'Las flechas cambian su final, Intro lo coloca, Esc cancela.',
  grabHelpStart: 'Alt y Mayús con flechas cambian su inicio.',
  grabCancelled: 'Movimiento cancelado',
  eventDeleted: ({ title, undo }) => (undo ? `«${title}» eliminado. ${undo} para deshacer.` : `«${title}» eliminado.`),
  saveFailed: ({ title, reverted }) => `No se pudo guardar «${title}». ${reverted ? 'Ha vuelto a su estado anterior.' : 'Recargando.'}`,
  loadFailed: 'No se pudieron cargar algunos eventos.',
  noEvents: 'No hay eventos para mostrar',
  noResources: 'No hay recursos para mostrar',
  unassigned: 'Sin asignar',
  resource: 'Recurso',
  weekShort: ({ week }) => `S${n(week)}`,
  weekLabel: ({ week }) => `Semana ${n(week)}`,
  goToMonth: 'Ir a este mes',
  becomesAllDay: 'Pasa a ser un evento de todo el día',
  becomesTimed: ({ length }) => `Pasa a ser un evento con hora de ${length}`,
  deleteWhich: '¿Qué eventos quieres eliminar?',
  undone: 'Deshecho',
  redone: 'Rehecho',
  moveEvent: 'Mover…',
  resizeEvent: 'Cambiar duración…',
  problem: (p) => {
    switch (p.code) {
      case 'host-no-height':
        return p.height === 0
          ? 'el calendario mide 0 px de alto: su anfitrión no tiene altura (¿un elemento en línea, como un <dz-calendar> sin display: block?)'
          : `el calendario mide ${n(p.height)} px de alto y nada en él se desplaza: su altura viene de su contenido — dé una altura a su anfitrión (--dz-height: 100% es el 100 % de la altura del anfitrión, que necesita una propia)`;
      case 'zone-from-browser':
        return `no se indicó timeZone: se usa la del navegador (${p.zone}) — pase timeZone (Temporal.Now.timeZoneId() para la del navegador, a propósito)`;
      case 'too-many-occurrences':
        return `serie ${p.series}: más de ${n(p.limit)} repeticiones en el periodo mostrado — solo se dibujan las primeras`;
      case 'events-not-drawn':
        return p.reason === 'all-day'
          ? `${n(p.count)} evento(s) de todo el día en ${p.view}: allDaySlot es false, no se dibujan (los fondos siguen coloreando sus columnas)`
          : `${n(p.count)} evento(s) en ${p.view} completamente fuera de las horas mostradas (slotMin–slotMax): no se dibujan`;
    }
  },
};
}

export const ES: DzMessages = messagesEs();
defineLocale('es', messagesEs);
