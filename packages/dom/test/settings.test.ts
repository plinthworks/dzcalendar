import { describe, it, expect } from 'vitest';
import { createSettings } from '../src/settings.js';

describe('live settings', () => {
  it('checks before applying, reports a change only when a value differs', () => {
    const open = () => {};
    const s = createSettings({ editable: false, onEventOpen: open, snapMinutes: 15 });
    expect(s.apply({ editable: false, onEventOpen: open })).toBe(false);
    expect(s.apply({ editable: true })).toBe(true);
    expect(() => s.apply({ snapMinutes: 0, editable: false })).toThrow(RangeError);
    // Nothing of a refused update was applied.
    expect([s.current.editable, s.current.snapMinutes]).toEqual([true, 15]);
    expect(() => createSettings({ snapMinutes: 7.5 })).toThrow(RangeError);
  });
});
