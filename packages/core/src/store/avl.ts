/**
 * A persistent AVL tree: every update returns a new root and shares every
 * untouched node with the old one (path copying). An old root is never
 * modified, so a snapshot stays valid for as long as anyone holds it — undo,
 * an optimistic revert, a render reading while the store moves on.
 *
 * Each node carries `max`: the largest `end` in its subtree. A plain map sets
 * every `end` to 0 and pays nothing; the interval tree uses it to skip whole
 * subtrees that finish before a query starts.
 */
export interface AvlNode<K, V> {
  readonly k: K;
  readonly v: V;
  readonly l: AvlNode<K, V> | null;
  readonly r: AvlNode<K, V> | null;
  readonly h: number;
  readonly size: number;
  readonly max: number;
}

export interface AvlOps<K, V> {
  readonly compare: (a: K, b: K) => number;
  /** The end of the span this entry covers; 0 for a plain map. */
  readonly end: (k: K, v: V) => number;
}

type N<K, V> = AvlNode<K, V> | null;

const h = (n: N<unknown, unknown>) => (n ? n.h : 0);
const sz = (n: N<unknown, unknown>) => (n ? n.size : 0);
const mx = (n: N<unknown, unknown>) => (n ? n.max : -Infinity);

function node<K, V>(ops: AvlOps<K, V>, k: K, v: V, l: N<K, V>, r: N<K, V>): AvlNode<K, V> {
  return {
    k,
    v,
    l,
    r,
    h: Math.max(h(l), h(r)) + 1,
    size: sz(l) + sz(r) + 1,
    max: Math.max(ops.end(k, v), mx(l), mx(r)),
  };
}

function balance<K, V>(ops: AvlOps<K, V>, k: K, v: V, l: N<K, V>, r: N<K, V>): AvlNode<K, V> {
  const bf = h(l) - h(r);
  if (bf > 1) {
    const L = l!;
    if (h(L.l) >= h(L.r)) return node(ops, L.k, L.v, L.l, node(ops, k, v, L.r, r));
    const LR = L.r!;
    return node(ops, LR.k, LR.v, node(ops, L.k, L.v, L.l, LR.l), node(ops, k, v, LR.r, r));
  }
  if (bf < -1) {
    const R = r!;
    if (h(R.r) >= h(R.l)) return node(ops, R.k, R.v, node(ops, k, v, l, R.l), R.r);
    const RL = R.l!;
    return node(ops, RL.k, RL.v, node(ops, k, v, l, RL.l), node(ops, R.k, R.v, RL.r, R.r));
  }
  return node(ops, k, v, l, r);
}

/** Inserts or replaces. O(log n). */
export function avlSet<K, V>(ops: AvlOps<K, V>, n: N<K, V>, k: K, v: V): AvlNode<K, V> {
  if (!n) return node(ops, k, v, null, null);
  const c = ops.compare(k, n.k);
  if (c < 0) return balance(ops, n.k, n.v, avlSet(ops, n.l, k, v), n.r);
  if (c > 0) return balance(ops, n.k, n.v, n.l, avlSet(ops, n.r, k, v));
  return node(ops, k, v, n.l, n.r);
}

function popMin<K, V>(ops: AvlOps<K, V>, n: AvlNode<K, V>): { min: AvlNode<K, V>; rest: N<K, V> } {
  if (!n.l) return { min: n, rest: n.r };
  const { min, rest } = popMin(ops, n.l);
  return { min, rest: balance(ops, n.k, n.v, rest, n.r) };
}

/** Removes `k` if present; returns the same root when it is absent. O(log n). */
export function avlDelete<K, V>(ops: AvlOps<K, V>, n: N<K, V>, k: K): N<K, V> {
  if (!n) return null;
  const c = ops.compare(k, n.k);
  if (c < 0) {
    const l = avlDelete(ops, n.l, k);
    return l === n.l ? n : balance(ops, n.k, n.v, l, n.r);
  }
  if (c > 0) {
    const r = avlDelete(ops, n.r, k);
    return r === n.r ? n : balance(ops, n.k, n.v, n.l, r);
  }
  if (!n.l) return n.r;
  if (!n.r) return n.l;
  const { min, rest } = popMin(ops, n.r);
  return balance(ops, min.k, min.v, n.l, rest);
}

export function avlGet<K, V>(ops: AvlOps<K, V>, n: N<K, V>, k: K): V | undefined {
  while (n) {
    const c = ops.compare(k, n.k);
    if (c === 0) return n.v;
    n = c < 0 ? n.l : n.r;
  }
  return undefined;
}

/** In key order, without recursion depth limits. */
export function* avlEntries<K, V>(n: N<K, V>): Generator<[K, V]> {
  const stack: AvlNode<K, V>[] = [];
  while (n || stack.length) {
    while (n) {
      stack.push(n);
      n = n.l;
    }
    const top = stack.pop()!;
    yield [top.k, top.v];
    n = top.r;
  }
}

export const avlSize = (n: N<unknown, unknown>): number => sz(n);
