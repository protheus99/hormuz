// A binary min-heap, the priority queue behind Dijkstra's shortest paths (spec §3.5, Phase 4).
//
// The heap is a plain array arranged so every parent is no larger than its children: the item at
// index i has children at 2i + 1 and 2i + 2. Push and pop each move one item up or down a single
// branch, so both take O(log n) steps instead of re-sorting the whole list.
//
// Determinism: when two items have equal priority, the one pushed first comes out first. Without
// that rule the order would depend on the heap's internal layout, and two routes of equal cost
// could be chosen differently after an unrelated change.

interface Entry<T> {
  readonly item: T;
  readonly priority: number;
  /** Insertion counter; breaks ties so equal priorities come out first-in, first-out. */
  readonly seq: number;
}

export class MinHeap<T> {
  private readonly entries: Entry<T>[] = [];
  private pushed = 0;

  get size(): number {
    return this.entries.length;
  }

  push(item: T, priority: number): void {
    if (Number.isNaN(priority)) throw new Error('MinHeap: priority must be a number, not NaN');
    this.entries.push({ item, priority, seq: this.pushed++ });
    this.siftUp(this.entries.length - 1);
  }

  /** Removes and returns the item with the lowest priority, or undefined when empty. */
  pop(): T | undefined {
    const top = this.entries[0];
    const last = this.entries.pop();
    if (top === undefined || last === undefined) return undefined;
    if (this.entries.length > 0) {
      this.entries[0] = last;
      this.siftDown(0);
    }
    return top.item;
  }

  /** The lowest-priority item without removing it. */
  peek(): T | undefined {
    return this.entries[0]?.item;
  }

  private siftUp(index: number): void {
    let i = index;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.before(i, parent)) return;
      this.swap(i, parent);
      i = parent;
    }
  }

  private siftDown(index: number): void {
    let i = index;
    for (;;) {
      const left = 2 * i + 1;
      const right = left + 1;
      let smallest = i;
      if (left < this.entries.length && this.before(left, smallest)) smallest = left;
      if (right < this.entries.length && this.before(right, smallest)) smallest = right;
      if (smallest === i) return;
      this.swap(i, smallest);
      i = smallest;
    }
  }

  /** True if the entry at a should come out before the entry at b. */
  private before(a: number, b: number): boolean {
    const x = this.entries[a] as Entry<T>;
    const y = this.entries[b] as Entry<T>;
    return x.priority < y.priority || (x.priority === y.priority && x.seq < y.seq);
  }

  private swap(a: number, b: number): void {
    const x = this.entries[a] as Entry<T>;
    this.entries[a] = this.entries[b] as Entry<T>;
    this.entries[b] = x;
  }
}
