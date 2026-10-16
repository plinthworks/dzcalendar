import { avlDelete, avlSet, avlSize } from './avl.js';
import type { AvlNode, AvlOps } from './avl.js';

/**
 * Persistent half-open intervals `[s, e)` on numbers, each tagged with an id.
 * Ordered by `(s, id)`, so two entries with the same start never collide.
 *
 * Callers index a zero-length span as `[t, t + 1)` — a milestone must still be
 * found by a window that contains its instant.
 */
interface IKey {
  readonly s: number;
  readonly id: string;
}

const ops: AvlOps<IKey, number> = {
  compare: (a, b) => a.s - b.s || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  end: (_k, e) => e,
};

export class PersistentIntervalTree {
  private constructor(private readonly root: AvlNode<IKey, number> | null) {}

  static readonly EMPTY = new PersistentIntervalTree(null);

  get size(): number {
    return avlSize(this.root);
  }

  insert(s: number, e: number, id: string): PersistentIntervalTree {
    return new PersistentIntervalTree(avlSet(ops, this.root, { s, id }, e));
  }

  /** `s` must be the start it was inserted with: it is half of the key. */
  remove(s: number, id: string): PersistentIntervalTree {
    const root = avlDelete(ops, this.root, { s, id });
    return root === this.root ? this : new PersistentIntervalTree(root);
  }

  /**
   * Every entry with `s < qe && e > qs`, in start order. O(log n + k): a
   * subtree whose largest end is ≤ qs is skipped, and so is everything to the
   * right of a node that starts at or after qe.
   */
  overlapping(qs: number, qe: number, visit: (id: string, s: number, e: number) => void): void {
    const walk = (n: AvlNode<IKey, number> | null): void => {
      if (!n || n.max <= qs) return;
      walk(n.l);
      if (n.k.s < qe) {
        if (n.v > qs) visit(n.k.id, n.k.s, n.v);
        walk(n.r);
      }
    };
    walk(this.root);
  }
}
