// Node has no Temporal of its own: the polyfill loaded before any suite, as an application awaits `loadTemporal()`
// (owner, 18i — packages/dom/test/ready.test.ts checks the calendar before it).
import { loadTemporal } from '@tzslot/core/lazy';

await loadTemporal();
