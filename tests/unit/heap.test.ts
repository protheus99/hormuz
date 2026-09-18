import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MinHeap } from '../../src/engine/heap';

const drain = <T,>(h: MinHeap<T>): T[] => {
  const out: T[] = [];
  for (let x = h.pop(); x !== undefined; x = h.pop()) out.push(x);
  return out;
};

describe('MinHeap', () => {
  it('pops items lowest priority first', () => {
    const h = new MinHeap<string>();
    h.push('c', 3); h.push('a', 1); h.push('d', 4); h.push('b', 2);
    expect(h.size).toBe(4);
    expect(h.peek()).toBe('a');
    expect(drain(h)).toEqual(['a', 'b', 'c', 'd']);
    expect(h.size).toBe(0);
  });

  it('returns undefined when empty', () => {
    const h = new MinHeap<number>();
    expect(h.pop()).toBeUndefined();
    expect(h.peek()).toBeUndefined();
  });

  it('breaks ties first-in, first-out, so equal-cost routes are chosen the same way every time', () => {
    const h = new MinHeap<string>();
    for (const name of ['first', 'second', 'third', 'fourth', 'fifth']) h.push(name, 7);
    h.push('cheaper', 2);
    expect(drain(h)).toEqual(['cheaper', 'first', 'second', 'third', 'fourth', 'fifth']);
  });

  it('refuses NaN, which would silently corrupt the ordering', () => {
    expect(() => new MinHeap<number>().push(1, NaN)).toThrow(/NaN/);
  });

  it('matches a stable sort for any mix of pushes and pops', () => {
    fc.assert(fc.property(fc.array(fc.oneof(fc.integer({ min: 0, max: 20 }), fc.constant(null)), { maxLength: 200 }), (ops) => {
      const h = new MinHeap<number>();
      const model: { priority: number; id: number }[] = [];
      ops.forEach((op, id) => {
        if (op === null) {
          model.sort((a, b) => a.priority - b.priority || a.id - b.id);
          expect(h.pop()).toBe(model.shift()?.id);
        } else {
          h.push(id, op);
          model.push({ priority: op, id });
        }
        expect(h.size).toBe(model.length);
      });
    }));
  });
});
