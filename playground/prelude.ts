// Imported first by every page: Temporal there before any other module of the page reads it — at once in a browser
// that has its own, after its polyfill on Safari (18i). A top-level await holds the modules imported after this one.
import { loadTemporal } from '@dzcalendar/core';

await loadTemporal();
