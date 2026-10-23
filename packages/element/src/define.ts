/** `import '@dzcalendar/element/define'`: `<dz-calendar>` defined, for the whole page. */
import { defineDzCalendar } from './index.js';
// The element is the calendar with nothing to assemble: repeating events work as they come (owner, 18i: nothing breaks).
import '@dzcalendar/core/recurrence';

defineDzCalendar();

export { DzCalendarElement, defineDzCalendar } from './index.js';
