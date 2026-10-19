// @vitest-environment node
import { it, expect } from 'vitest';

it('imported on a server (no DOM): nothing throws, defining does nothing', async () => {
  const m = await import('../src/define.js');
  expect(typeof m.DzCalendarElement).toBe('function');
});
