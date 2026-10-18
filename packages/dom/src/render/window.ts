import { PrefixSums } from '@dzcalendar/core';
import type { Scope } from './scope.js';

/**
 * Rows of varying height, windowed: each row's height estimated, then
 * corrected once measured; which rows meet the scroller's view (and a margin);
 * the scroll correction that keeps the row at the top in place when heights
 * above it change. Shared by the views that mount only what is on screen.
 */
export class RowWindow {
  private sizes: number[] = [];
  private sums = new PrefixSums([]);
  /** Measured heights by row key: kept across renders and windows. */
  private readonly measured = new Map<string, number>();
  private keys: readonly string[] = [];

  /** New rows; a row measured before keeps its height. */
  reset(keys: readonly string[], estimate: (i: number) => number): void {
    // Rows of another period are forgotten: the map does not grow with every period visited.
    if (this.measured.size > 4 * keys.length + 1000) {
      const live = new Set(keys);
      for (const k of this.measured.keys()) if (!live.has(k)) this.measured.delete(k);
    }
    this.keys = keys;
    this.sizes = keys.map((k, i) => this.measured.get(k) ?? estimate(i));
    this.sums = new PrefixSums(this.sizes);
  }

  get count(): number {
    return this.sizes.length;
  }

  offsetOf(i: number): number {
    return this.sums.offsetOf(i);
  }

  /** The row covering `offset`. */
  rowAt(offset: number): number {
    return this.sums.indexAt(offset);
  }

  sizeOf(i: number): number {
    return this.sizes[i] ?? 0;
  }

  /** The rows meeting `[top − margin, top + view + margin)`, `to` exclusive. Margin: a view's height, at least 200 px. */
  visible(top: number, view: number, margin = Math.max(view, 200)): { from: number; to: number } {
    if (this.sizes.length === 0) return { from: 0, to: 0 };
    return { from: this.sums.indexAt(Math.max(0, top - margin)), to: Math.min(this.sizes.length, this.sums.indexAt(top + view + margin) + 1) };
  }

  /**
   * Takes measured heights (`[row, px]`). Returns the new scroll top that keeps
   * the row at `top` where it was, or null when nothing changed.
   */
  measure(found: readonly (readonly [number, number])[], top: number): number | null {
    const anchor = this.sums.indexAt(top);
    const before = this.sums.offsetOf(anchor);
    let changed = false;
    for (const [r, size] of found) {
      const key = this.keys[r];
      if (key === undefined || size <= 0) continue;
      this.measured.set(key, size);
      if (Math.abs(this.sizes[r]! - size) > 0.5) {
        this.sizes[r] = size;
        this.sums.set(r, size);
        changed = true;
      }
    }
    return changed ? top + this.sums.offsetOf(anchor) - before : null;
  }
}

/**
 * Calls `fn` at most once a frame while `el` scrolls and `active()` holds:
 * the window follows the scroll without running for every scroll event.
 */
export function onScrollFrame(scope: Scope, el: HTMLElement, active: () => boolean, fn: () => void): void {
  const win = el.ownerDocument.defaultView;
  let pending = 0;
  scope.on(
    el,
    'scroll',
    () => {
      if (pending || !win || !active()) return;
      pending = win.requestAnimationFrame(() => {
        pending = 0;
        fn();
      });
    },
    { passive: true },
  );
  scope.add(() => {
    if (pending) win?.cancelAnimationFrame(pending);
  });
}
