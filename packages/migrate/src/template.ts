/**
 * An Angular template: `<full-calendar [options]="x">` → `<dz-calendar
 * [dzFullCalendar]="x">`. The template is read with Angular's own compiler
 * when the application has it (its elements and their places), else by
 * pattern.
 */
export interface Edited {
  readonly text: string;
  readonly notes: readonly string[];
  readonly changed: boolean;
}

interface Node {
  name?: string;
  startSourceSpan?: { start: { offset: number }; end: { offset: number } };
  endSourceSpan?: { start: { offset: number }; end: { offset: number } } | null;
  children?: Node[];
}

let parse: ((text: string, url: string) => { nodes: Node[] }) | null | undefined;

/** Angular's compiler, if the application has it. */
async function compiler(): Promise<typeof parse> {
  if (parse !== undefined) return parse;
  try {
    const m = (await import('@angular/compiler' as string)) as { parseTemplate: (t: string, u: string, o?: object) => { nodes: Node[] } };
    parse = (t, u) => m.parseTemplate(t, u, { preserveWhitespaces: true });
  } catch {
    parse = null;
  }
  return parse;
}

/** The start tag rewritten: the name, `[options]` → `[dzFullCalendar]`, the inputs that have no equivalent dropped (said). */
function startTag(tag: string, notes: string[]): string {
  let t = tag.replace(/^<full-calendar\b/, '<dz-calendar').replace(/\[options\]\s*=/, '[dzFullCalendar]=');
  for (const name of ['deepChangeDetection', 'customRenderingMetaMap']) {
    const re = new RegExp(`\\s+\\[?${name}\\]?\\s*=\\s*"[^"]*"`);
    if (re.test(t)) {
      t = t.replace(re, '');
      notes.push(`<full-calendar> ${name}: nothing to do (dropped)`);
    }
  }
  return t;
}

export async function migrateTemplate(text: string, url = 'template.html'): Promise<Edited> {
  if (!text.includes('full-calendar')) return { text, notes: [], changed: false };
  const notes: string[] = [];
  const edits: { from: number; to: number; text: string }[] = [];
  const p = await compiler();
  if (p) {
    const walk = (nodes: Node[]) => {
      for (const n of nodes) {
        if (n.name === 'full-calendar' && n.startSourceSpan) {
          const s = n.startSourceSpan;
          edits.push({ from: s.start.offset, to: s.end.offset, text: startTag(text.slice(s.start.offset, s.end.offset), notes) });
          const e = n.endSourceSpan;
          if (e && e.start.offset !== s.start.offset) edits.push({ from: e.start.offset, to: e.end.offset, text: '</dz-calendar>' });
        }
        if (n.children) walk(n.children);
      }
    };
    walk(p(text, url).nodes);
  } else {
    for (const m of text.matchAll(/<full-calendar\b[^>]*>/g)) edits.push({ from: m.index!, to: m.index! + m[0].length, text: startTag(m[0], notes) });
    for (const m of text.matchAll(/<\/full-calendar\s*>/g)) edits.push({ from: m.index!, to: m.index! + m[0].length, text: '</dz-calendar>' });
  }
  let out = text;
  for (const e of edits.sort((a, b) => b.from - a.from)) out = out.slice(0, e.from) + e.text + out.slice(e.to);
  return { text: out, notes, changed: out !== text };
}
