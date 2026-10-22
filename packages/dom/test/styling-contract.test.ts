import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// @ts-expect-error -- a plain script, no types
import { inventory } from '../../../scripts/css-contract.mjs';

// The styling contract (docs/styling.md): what the code uses and what the page lists are the same.
// Tests run from the repository's root (vitest's projects).
const root = process.cwd();
const doc = readFileSync(join(root, 'docs/styling.md'), 'utf8');
const listed = (re: RegExp) => new Set([...doc.matchAll(re)].map((m) => m[1]!));
const found = inventory(root) as { classes: Map<string, Set<string>>; tokens: Map<string, Set<string>>; data: Map<string, Set<string>> };

describe('the styling contract', () => {
  it('every part the calendar uses is in docs/styling.md, and every part there is used', () => {
    const inDoc = listed(/`\.(dz-[a-z0-9_*-]+)`/g);
    const inCode = new Set(found.classes.keys());
    expect({ missing: [...inCode].filter((k) => !inDoc.has(k)).sort(), stale: [...inDoc].filter((k) => !inCode.has(k)).sort() }).toEqual({ missing: [], stale: [] });
  });

  it('every token is in docs/styling.md, and every token there is used', () => {
    const inDoc = listed(/`(--dz-[a-z0-9*-]+)`/g);
    const inCode = new Set(found.tokens.keys());
    expect({ missing: [...inCode].filter((k) => !inDoc.has(k)).sort(), stale: [...inDoc].filter((k) => !inCode.has(k)).sort() }).toEqual({ missing: [], stale: [] });
  });

  it('every data-* attribute the calendar writes or reads is in docs/styling.md (a state, or internal), and every one there is used', () => {
    const inDoc = listed(/`data-([a-z0-9-]+)/g);
    const inCode = new Set(found.data.keys());
    expect({ missing: [...inCode].filter((k) => !inDoc.has(k)).sort(), stale: [...inDoc].filter((k) => !inCode.has(k)).sort() }).toEqual({ missing: [], stale: [] });
  });
});
