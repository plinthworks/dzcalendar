import './prelude';
import '../packages/theme/dzcalendar.css';
import '@dzcalendar/pro';
import { createApp, defineComponent, h, inject, provide, ref, shallowRef } from 'vue';
import type { Ref } from 'vue';
import { Temporal } from '@dzcalendar/core';
import type { EventInput, PlainDate, Selection } from '@dzcalendar/core';
import { DzCalendar, createCalendarController } from '@dzcalendar/vue';
import { useDzExport, useEventEditor } from '@dzcalendar/pro-vue';

const events: EventInput[] = [
  { id: 'a', title: 'Consultation', start: '2026-10-21T09:00[Europe/Paris]', duration: { minutes: 45 } },
  { id: 'b', title: 'Appel Chicago', start: '2026-10-22T10:00[America/Chicago]', duration: { hours: 1 } },
  { id: 's', title: 'Garde', start: '2026-10-24T22:00[Europe/Paris]', duration: { hours: 8 } },
];

// The application's own provide: it reaches the events' content (teleports).
const Badge = defineComponent({
  props: { title: { type: String, required: true } },
  setup(props) {
    const room = inject<Ref<string>>('room')!;
    return () => h('span', { class: 'badge' }, [props.title, ' ', h('small', `· ${room.value}`)]);
  },
});

const App = defineComponent({
  setup() {
    const cal = createCalendarController();
    const room = ref('Cabinet A');
    provide('room', room);
    const log = ref('');
    const view = ref('timeGridWeek');
    const date = shallowRef<PlainDate>(Temporal.PlainDate.from('2026-10-21'));
    useEventEditor(cal, { onClosed: (o) => (log.value = `éditeur : ${o}`) });
    const exports = useDzExport(cal);
    return () => [
      h('h1', 'DzCalendar dans Vue'),
      h('p', "En-tête maison piloté par le contrôleur ; le contenu des événements est un composant de l'application (slot téléporté) qui lit son provide ; v-model:view et v-model:date ; la semaine du passage à l'heure d'hiver."),
      h('div', { class: 'bar' }, [
        h('button', { onClick: cal.prev, id: 'prev' }, '‹'),
        h('button', { onClick: cal.today }, "Aujourd'hui"),
        h('button', { onClick: cal.next, id: 'next' }, '›'),
        h('strong', { id: 'title' }, cal.title.value),
        h('button', { onClick: cal.undo, disabled: !cal.canUndo.value, id: 'undo' }, 'Annuler'),
        h('button', { onClick: () => (room.value = room.value === 'Cabinet A' ? 'Cabinet B' : 'Cabinet A'), id: 'room' }, 'Changer de salle'),
        h('button', { onClick: () => void exports.download('ics', 'agenda.ics').then((p) => (log.value = `ics : ${p.length} problème(s)`)) }, 'ICS'),
        h('span', { id: 'view' }, `${view.value} ${String(date.value)}`),
      ]),
      h('p', { id: 'log', role: 'status' }, log.value),
      h(
        DzCalendar,
        {
          class: 'calendar',
          controller: cal,
          view: view.value,
          'onUpdate:view': (v: string) => (view.value = v),
          date: date.value,
          'onUpdate:date': (d: PlainDate) => (date.value = d),
          timeZone: 'Europe/Paris',
          locale: 'fr-FR',
          editable: true,
          selectable: true,
          events,
          onEventClick: (i: { event: { title: string } }) => (log.value = `clic : ${i.event.title}`),
          'onUpdate:selection': (s: Selection | null) => (log.value = s ? `sélection : ${String(s.start)} → ${String(s.end)}` : 'sélection : aucune'),
        },
        { 'event-content': ({ event }: { event: { title: string } }) => [h(Badge, { title: event.title })] },
      ),
    ];
  },
});

createApp(App).mount('#root');
