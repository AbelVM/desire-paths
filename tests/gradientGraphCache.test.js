import { describe, it, expect, beforeEach } from 'vitest';
import { latLngToCell } from 'h3-js';
import {
  getGradientGraph,
  getGradientGraphFromArray,
  invalidateGradientGraph,
} from '../src/helpers/dijkstra.js';

// Build a SAB-backed Float32Array (the shape `state.frictionArr` takes when the
// page is cross-origin isolated — review12 #7).
function makeSabFrictionArr(n, fill = 1) {
  const sab = new SharedArrayBuffer(n * 4);
  const arr = new Float32Array(sab);
  arr.fill(fill);
  return arr;
}

function cluster(n) {
  const cells = [];
  for (let i = 0; i < n; i++) {
    cells.push(latLngToCell(40.7 + i * 0.0005, -74.0 + i * 0.0005, 9));
  }
  return cells;
}

describe('getGradientGraphFromArray cache (review12 #7)', () => {
  beforeEach(() => invalidateGradientGraph());

  it('returns the same cached graph across calls with a stable SAB buffer', () => {
    const viewHexes = cluster(4);
    const arr = makeSabFrictionArr(viewHexes.length, 2);
    const g1 = getGradientGraphFromArray(arr, null, viewHexes);
    const g2 = getGradientGraphFromArray(arr, null, viewHexes);
    expect(g1).toBe(g2); // cache hit: identical object reference
  });

  it('builds a new graph when a different SAB buffer is supplied', () => {
    const viewHexes = cluster(3);
    const a1 = makeSabFrictionArr(viewHexes.length, 2);
    const a2 = makeSabFrictionArr(viewHexes.length, 2); // distinct buffer
    const g1 = getGradientGraphFromArray(a1, null, viewHexes);
    const g2 = getGradientGraphFromArray(a2, null, viewHexes);
    expect(g1).not.toBe(g2); // different buffers → different cache keys
  });

  it('keys the cache on the buffer identity, not the view wrapper', () => {
    const viewHexes = cluster(3);
    const sab = new SharedArrayBuffer(viewHexes.length * 4);
    const view1 = new Float32Array(sab);
    const view2 = new Float32Array(sab); // same buffer, different wrapper
    const g1 = getGradientGraphFromArray(view1, null, viewHexes);
    const g2 = getGradientGraphFromArray(view2, null, viewHexes);
    expect(g1).toBe(g2); // same underlying SAB → cache hit
  });

  it('produces a graph equivalent to the Map-source path for the same friction', () => {
    const viewHexes = cluster(5);
    const arr = makeSabFrictionArr(viewHexes.length, 2.5);
    const map = new Map(viewHexes.map((c, i) => [c, arr[i]]));

    const gArr = getGradientGraphFromArray(arr, null, viewHexes);
    const gMap = getGradientGraph(map, null, viewHexes);

    expect(gArr.V).toBe(gMap.V);
    expect(gArr.adjOffsets).toEqual(gMap.adjOffsets);
    expect(gArr.adjNeighbors).toEqual(gMap.adjNeighbors);
    expect(Array.from(gArr.frictionArr)).toEqual(Array.from(gMap.frictionArr));
  });
});
