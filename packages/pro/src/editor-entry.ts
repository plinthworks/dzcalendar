/**
 * `@dzcalendar/pro/editor`: the event and recurrence editor — a modal dialog
 * (owner's decision), the usual recurrences, a rule beyond them kept as it
 * is. `cal.update(editorHandlers(cal))` sends "Open" and "New event here" to it.
 */
// The editor writes recurrences: their entry comes with it.
import '@dzcalendar/core/recurrence';
export { openEventEditor, editorHandlers } from './editor/dialog.js';
export type { EditorOptions, EditorOutcome, EditorTarget } from './editor/dialog.js';
export { readRepeat, writeRepeat, nthOf } from './editor/recurrence.js';
export type { RepeatForm, RepeatFreq, RepeatEnd } from './editor/recurrence.js';
export { editorMessagesFor, defineEditorLocale, EDITOR_EN, EDITOR_FR, EDITOR_AR, EDITOR_ES, EDITOR_DE } from './editor/messages.js';
export type { EditorMessages } from './editor/messages.js';
export { EDITOR_CSS } from './editor/styles.js';
