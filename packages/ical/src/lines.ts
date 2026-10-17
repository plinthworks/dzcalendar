/**
 * The text layer of RFC 5545 (§3.1): folded lines, content lines with their
 * parameters, escaped text. Nothing here knows what a VEVENT is.
 */

export interface ContentLine {
  /** Upper case. */
  readonly name: string;
  /** Parameter names upper case; each value list as written (quotes removed). */
  readonly params: Readonly<Record<string, readonly string[]>>;
  readonly value: string;
  /** 1-based physical line where the content line starts. */
  readonly line: number;
}

/** Unfolds the text: a line starting with a space or a tab continues the previous one. CRLF or bare LF. */
export function unfold(text: string): { text: string; line: number }[] {
  const out: { text: string; line: number }[] = [];
  const physical = text.replace(/^﻿/, '').split(/\r\n|\n|\r/);
  physical.forEach((l, i) => {
    if ((l.startsWith(' ') || l.startsWith('\t')) && out.length > 0) {
      const last = out[out.length - 1]!;
      last.text += l.slice(1);
    } else if (l.length > 0) {
      out.push({ text: l, line: i + 1 });
    }
  });
  return out;
}

/** `NAME;P=a,"b,c";Q=x:value` → its parts, or null when there is no colon after the name and parameters. */
export function parseLine(text: string, line: number): ContentLine | null {
  const nameEnd = text.search(/[;:]/);
  if (nameEnd <= 0) return null;
  const name = text.slice(0, nameEnd).toUpperCase();
  const params: Record<string, string[]> = {};
  let i = nameEnd;
  while (text[i] === ';') {
    const eq = text.indexOf('=', i);
    if (eq < 0) return null;
    const key = text.slice(i + 1, eq).toUpperCase();
    const values: string[] = [];
    i = eq + 1;
    for (;;) {
      if (text[i] === '"') {
        const close = text.indexOf('"', i + 1);
        if (close < 0) return null;
        values.push(text.slice(i + 1, close));
        i = close + 1;
      } else {
        let j = i;
        while (j < text.length && text[j] !== ',' && text[j] !== ';' && text[j] !== ':') j++;
        values.push(text.slice(i, j));
        i = j;
      }
      if (text[i] !== ',') break;
      i++;
    }
    params[key] = values;
  }
  if (text[i] !== ':') return null;
  return { name, params, value: text.slice(i + 1), line };
}

/** TEXT values (§3.3.11): `\n` `\N` `\,` `\;` `\\`. */
export function unescapeText(v: string): string {
  return v.replace(/\\([\\;,nN])/g, (_, c: string) => (c === 'n' || c === 'N' ? '\n' : c));
}

export function escapeText(v: string): string {
  return v.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\r\n|\n|\r/g, '\\n');
}

/** A list value split on its unescaped commas, each item unescaped. */
export function splitText(v: string): string[] {
  const out: string[] = [];
  let cur = '';
  for (let i = 0; i < v.length; i++) {
    const c = v[i]!;
    if (c === '\\' && i + 1 < v.length) {
      cur += c + v[++i];
    } else if (c === ',') {
      out.push(unescapeText(cur));
      cur = '';
    } else cur += c;
  }
  out.push(unescapeText(cur));
  return out;
}

/** A parameter value, quoted when it holds a character that would end it. */
export const paramValue = (v: string): string => (/[:;,]/.test(v) ? `"${v.replace(/"/g, "'")}"` : v);

const utf8Length = (cp: number) => (cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4);

/** Folds a content line at 75 octets of UTF-8, never inside a character, with CRLF. */
export function fold(line: string): string {
  let out = '';
  let width = 0;
  for (const ch of line) {
    const n = utf8Length(ch.codePointAt(0)!);
    if (width + n > 75) {
      out += '\r\n ';
      width = 1;
    }
    out += ch;
    width += n;
  }
  return out + '\r\n';
}
