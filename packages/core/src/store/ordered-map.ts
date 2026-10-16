import { avlDelete, avlEntries, avlGet, avlSet, avlSize } from './avl.js';
import type { AvlNode, AvlOps } from './avl.js';

/**
 * An immutable sorted map. `set` and `delete` return a new map sharing all
 * but O(log n) nodes with the old one, which stays exactly as it was.
 */
export class PersistentOrderedMap<K, V> {
  private constructor(
    private readonly ops: AvlOps<K, V>,
    private readonly root: AvlNode<K, V> | null,
  ) {}

  static empty<K, V>(compare: (a: K, b: K) => number): PersistentOrderedMap<K, V> {
    return new PersistentOrderedMap<K, V>({ compare, end: () => 0 }, null);
  }

  /** Code-unit order: what every id and key in the store is compared by. */
  static emptyStrings<V>(): PersistentOrderedMap<string, V> {
    return PersistentOrderedMap.empty<string, V>((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  }

  get size(): number {
    return avlSize(this.root);
  }

  get(k: K): V | undefined {
    return avlGet(this.ops, this.root, k);
  }

  has(k: K): boolean {
    return avlGet(this.ops, this.root, k) !== undefined;
  }

  set(k: K, v: V): PersistentOrderedMap<K, V> {
    return new PersistentOrderedMap(this.ops, avlSet(this.ops, this.root, k, v));
  }

  delete(k: K): PersistentOrderedMap<K, V> {
    const root = avlDelete(this.ops, this.root, k);
    return root === this.root ? this : new PersistentOrderedMap(this.ops, root);
  }

  entries(): IterableIterator<[K, V]> {
    return avlEntries(this.root);
  }

  *values(): IterableIterator<V> {
    for (const [, v] of avlEntries(this.root)) yield v;
  }
}
