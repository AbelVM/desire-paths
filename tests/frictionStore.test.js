import { describe, it, expect } from 'vitest';
import { buildCellToIdx, FrictionArrayMap } from '../src/helpers/frictionStore.js';
import { normalizeFrictionEntries } from '../src/helpers/spatialTasks.js';

const viewHexes = ['a', 'b', 'c', 'd'];

function makeMap() {
  const cellToIdx = buildCellToIdx(viewHexes);
  const arr = new Float32Array(viewHexes.length);
  return { cellToIdx, arr, map: new FrictionArrayMap(arr, cellToIdx) };
}

describe('FrictionArrayMap (P3.1 canonical storage view)', () => {
  it('set/get/has/size round-trip through the typed array', () => {
    const { map } = makeMap();
    // size is the index map (every AOI cell is a friction cell), not the count
    // of values written so far — matches the old Map after the merge loop.
    expect(map.size).toBe(viewHexes.length);
    map.set('a', 1.5);
    map.set('c', 9);
    expect(map.get('a')).toBe(1.5);
    expect(map.get('c')).toBe(9);
    expect(map.get('b')).toBe(0); // present in the index, default 0
    expect(map.has('a')).toBe(true);
    expect(map.has('z')).toBe(false);
    expect(map.size).toBe(viewHexes.length);
  });

  it('keys/values/entries/iteration yield in cellToIdx (viewHexes) order', () => {
    const { map } = makeMap();
    map.set('a', 1);
    map.set('b', 2);
    map.set('c', 3);
    map.set('d', 4);
    expect(Array.from(map.keys())).toEqual(viewHexes);
    expect(Array.from(map.values())).toEqual([1, 2, 3, 4]);
    expect(Array.from(map.entries())).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 3],
      ['d', 4],
    ]);
    const collected = [];
    for (const [cell, v] of map) collected.push([cell, v]);
    expect(collected).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 3],
      ['d', 4],
    ]);
  });

  it('clear() resets the array to 0 and delete() zeroes a slot', () => {
    const { arr, map } = makeMap();
    map.set('a', 5);
    map.set('b', 6);
    map.delete('a');
    expect(map.get('a')).toBe(0);
    map.clear();
    expect(arr.every((v) => v === 0)).toBe(true);
    expect(map.get('b')).toBe(0);
  });

  it('set() on an unknown cell is a no-op (fixed-size array)', () => {
    const { map } = makeMap();
    map.set('zzz', 99);
    expect(map.get('zzz')).toBeUndefined();
    expect(map.size).toBe(viewHexes.length);
  });

  it('is accepted by normalizeFrictionEntries (worker-boundary conversion)', () => {
    const { map } = makeMap();
    map.set('a', 1);
    map.set('b', 2);
    map.set('c', 3);
    map.set('d', 4);
    const flat = normalizeFrictionEntries(map);
    expect(flat.a).toBe(1);
    expect(flat.b).toBe(2);
    expect(flat.c).toBe(3);
    expect(flat.d).toBe(4);
  });

  it('forEach invokes with (value, cell, map) over every indexed cell', () => {
    const { map } = makeMap();
    map.set('a', 1);
    map.set('b', 2);
    map.set('c', 3);
    map.set('d', 4);
    const seen = [];
    map.forEach((v, cell) => seen.push([cell, v]));
    expect(seen).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 3],
      ['d', 4],
    ]);
  });
});
