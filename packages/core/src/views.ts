/**
 * `@dzcalendar/core/views`: the models of the views paid for only when used —
 * the list (and what `defineView` draws from) and the multi-month year. Pure,
 * like the rest of the core; the DOM's matching entries register them.
 */
export { buildMultiMonthModel, updateMultiMonthModel } from './views/multimonth.js';
export type { MultiMonthModel } from './views/multimonth.js';
export { buildListModel } from './views/list.js';
export type { ListModel, ListDay, ListEntry, ListOptions } from './views/list.js';
