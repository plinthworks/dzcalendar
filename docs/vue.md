# DzCalendar in Vue — `@dzcalendar/vue`, `@dzcalendar/pro-vue`

Vue 3.4 and 3.5.

## Install

```sh
npm install @dzcalendar/core @dzcalendar/dom @dzcalendar/theme @dzcalendar/vue
```

```ts
import '@dzcalendar/theme/dzcalendar.css';
import { DzCalendarPlugin } from '@dzcalendar/vue';
createApp(App).use(DzCalendarPlugin, { defaults: { timeZone: 'Asia/Riyadh', locale: 'ar-SA' } }).mount('#app');
```


> Repeating events (`rrule`): `import '@dzcalendar/core/recurrence'` once in the application (docs/getting-started.md, "Worth knowing").

## A calendar

```vue
<script setup lang="ts">
import { ref, shallowRef } from 'vue';
import type { EventInput, PlainDate, Selection } from '@dzcalendar/core';
import { DzCalendar, createCalendarController } from '@dzcalendar/vue';

const cal = createCalendarController();
const view = ref('timeGridWeek');
const date = shallowRef<PlainDate>();
const selection = shallowRef<Selection | null>(null);
const events: EventInput[] = [{ id: 'a', title: 'Consultation', start: '2026-10-21T09:00[Asia/Riyadh]', duration: { minutes: 30 } }];
</script>

<template>
  <header>
    <button @click="cal.prev()">‹</button> <h2>{{ cal.title.value }}</h2> <button @click="cal.next()">›</button>
    <button :disabled="!cal.canUndo.value" @click="cal.undo()">Undo</button>
  </header>
  <DzCalendar v-model:view="view" v-model:date="date" v-model:selection="selection"
    :controller="cal" :events="events" editable :initial="{ firstDay: 7 }"
    @event-click="(i) => console.log(i.event.id)">
    <template #event-content="{ event, ctx }"><b>{{ event.title }}</b> {{ ctx.timeText }}</template>
  </DzCalendar>
</template>
```

- **Props** for the common options, `options` for everything else `update()`
  takes, `initial` for what is read once (`firstDay`, `rules`, `now`…).
  Arrays and objects are compared by their contents; sources by identity
  (keep their specs stable). Give a new array to change events
  (`events.value = [...events.value, e]`): a `push` on the same array is not
  seen. `initial` is read once; a prop that goes back to `undefined` leaves
  the calendar's value as it was.
- **`v-model:view`, `v-model:date`, `v-model:selection`** follow the
  calendar; a view or date bound without its `update:` handler wins (the
  calendar goes back to it); events: `@date-click`, `@event-click`, `@event-open`,
  `@create-request`, `@selected`, `@slot-click`, `@source-notice`,
  `@problems`, `@resource-problems`, `@error` (a value the calendar refused;
  the other changes are applied, the bindings get the real view back; not
  listened to, it goes to `app.config.errorHandler`, else the console).
- **`#event-content`**: the application's components, teleported into each
  event — its provides, store, router and i18n reach them. A background
  event (a closed day) comes with `ctx.background`: render something for a
  label at the top of its column, nothing (an empty `v-if`) for a tint.
- **`#day-header="{ day }"`**: each day's head (`day.date`, `day.resource`,
  `day.lengthMinutes`, `day.text`) — a mark, a count, a button.
- **A slot for every element with a content**, each given `{ ctx }` (its
  element's context, docs/behaviors/render-hooks.md): `#day-cell`,
  `#slot-label`, `#all-day-label`, `#more-link`, `#now-indicator`,
  `#week-number`, `#no-events`, `#list-day-header`, `#month-header`,
  `#resource`, `#resource-group-header`, `#resource-area-header`.
- **`:hooks="{ dayCell: { class: … } }"`**: classes and mounts for any
  element (the holders too), merged with the slots: the slot gives the
  content, `hooks` the rest.
- **`#header-item-<name>="{ ctx }"`**: your place in the header, named in
  `headerToolbar` (`:options="{ headerToolbar: { end: 'filter timeGridWeek' } }"`
  → `#header-item-filter`); `customButtons` for plain buttons.
- **`@event-change`**: what a person changed (a drag, a resize, the
  keyboard, the menu, the editor) — persist it, `change.revert()` if the
  server refuses (exactly that change; false when the event changed again).
- **The controller**: `createCalendarController()` beside the calendar, or
  `injectCalendarController()` in a component inside it (an event's
  content). Refs: `title`, `view`,
  `date`, `range`, `canUndo`, `canRedo`, `loading`, `problems`, `instance`;
  methods `prev`, `next`, `today`, `goTo`, `changeView`, `dispatch`, `undo`,
  `redo`, `refetch`.
- `class`, `style`, `id` and other attributes go on the calendar's element.
- **Server rendering**: importing the packages touches no `document` or
  `window`; the calendar is made in the browser only (`onMounted`).
- `@event-open`, `@create-request`, `@slot-click` change what the calendar
  offers: passed only while listened to.

- **`@dropped`, `@event-receive`, `@event-leave`** with `makeDraggable` from `@dzcalendar/dom/drag` (in `onMounted`, its clean-up in `onBeforeUnmount`) and `:options="{ droppable: true }"` (`docs/behaviors/external-drag.md`).

## The Pro

```ts
import '@dzcalendar/pro';                     // the timeline views
import { useDzExport, useEventEditor } from '@dzcalendar/pro-vue';

const cal = createCalendarController();
useEventEditor(cal, { onClosed: (outcome) => console.log(outcome) });
const exports = useDzExport(cal);   // exports.download('pdf', 'agenda.pdf')
```

The editor takes "Open" and "New event here" through the controller
(`cal.takeOver(…)`), over `@event-open` and `@create-request`, until its
component goes. Another `:controller` given later takes the calendar over
(the events' content keeps injecting the first). The editor and the exports
are fetched on first use. Nothing throws: a
result's `problems` say what went wrong.

## Notes

- `onProblem` (React) / `@problem` (Vue): something the calendar could not
  do as asked, found while drawing (`events-not-drawn`, `host-no-height`);
  without a listener, the console says it once per code.

- A content hook (or template, slot) now also receives **background
  events**, in a time grid's columns, with `ctx.background`: return nothing
  for them to keep a plain tint. The all-day row's and the month's
  backgrounds stay tints.
- An event is given with `extendedProps` (an input); read back — in
  `eventChange`, `eventClick`, a template — it is a `CalEvent`, whose own data
  is `props` (`change.after.props.patientId`).
- The day-header hook covers the week, day and month views (a month's
  column: the first date of that weekday), not a list's day headings.
- The change output says a person's change — a gesture, the keyboard, the
  menu, the editor, and their undo / redo (`cause`). A command your code runs
  with `{ validate: true }` counts as a person's (that is what it means:
  checked as a gesture is); without it, it is not said.
- A context-menu hook that returns `null` or `[]` means "no calendar menu
  here": the browser's own menu opens. An application that opens its own menu
  from the hook calls `preventDefault()` on the `contextmenu` event itself
  (the calendar cannot know it did).

