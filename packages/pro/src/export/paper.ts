/** Paper sizes in points (1/72 inch), portrait. */
export const PAPER = { a4: { width: 595.28, height: 841.89 }, letter: { width: 612, height: 792 }, a3: { width: 841.89, height: 1190.55 } } as const;
export type Paper = keyof typeof PAPER;
export type Orientation = 'portrait' | 'landscape';

/** A sheet in CSS pixels (96 per inch). */
export function sheetSize(paper: Paper, orientation: Orientation): { width: number; height: number } {
  const p = PAPER[paper];
  const w = (p.width / 72) * 96;
  const h = (p.height / 72) * 96;
  return orientation === 'portrait' ? { width: w, height: h } : { width: h, height: w };
}
