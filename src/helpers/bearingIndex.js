/**
 * CSR-backed visibility + bearing index reconstruction.
 *
 * Extracted from grid.js so the agent worker kernel (agentTasks.js) can rebuild
 * these indices IN-WORKER from the packed visibility/bearing CSR buffer +
 * `viewHexes`, without importing grid.js (which would create a circular
 * dependency: grid.js → compute.js → spatialWorker.js → agentTasks.js).
 *
 * The simulation consumes two accessors:
 *  - `visibilityData.data[a][b]` → boolean (is `b` visible from `a`?)
 *  - `bearingMap[a + '::' + b]` (or `bearingMap.get(a, b)`) → bearing degrees
 *
 * Both are backed by the SAME flat CSR buffer (offsets / neighbors / bearings)
 * and resolve lookups via a binary search over each origin's sorted neighbor
 * slice — O(log P_i) instead of an O(P) per-pair Map. The only auxiliary
 * structure is `cellToIndex` (O(N) entries), which is orders of magnitude
 * smaller than the per-pair Map the legacy path built.
 */

/**
 * Binary search for `target` within `neighbors[start..end)`. Returns its
 * position, or -1 if absent. Requires the slice to be sorted by neighbor index
 * (the worker sorts each origin's slice — see `computeVisibilityBearingCSRIndexed`).
 */
export function binarySearchNeighbors(neighbors, start, end, target) {
  let lo = start;
  let hi = end - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const v = neighbors[mid];
    if (v === target) return mid;
    if (v < target) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

/**
 * CSR-backed visibility accessor. Exposes `data[a]` returning a truthy object for
 * origins (so the visibility accessor's `if (visible)` guard still works and
 * falls through to the legacy cache for cells outside the AOI) that supports
 * `visible[b]` → boolean. Lookups are O(log P_i) binary searches over the origin's
 * sorted neighbor slice, not O(P_i) object property walks.
 *
 * The only auxiliary structure is `originCache` (O(N) entries), which replaces
 * the O(P) nested plain object the legacy path built per visible pair.
 */
export function createVisibilityIndex(offsets, neighbors, cellToIndex) {
  const originCache = new Map(); // origin cell → per-origin accessor (O(N))
  const data = new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop !== 'string') return undefined;
        const i = cellToIndex.get(prop);
        if (i === undefined) return undefined; // not an origin → falsy → legacy fallback
        let accessor = originCache.get(prop);
        if (!accessor) {
          const s = offsets[i];
          const e = offsets[i + 1];
          accessor = new Proxy(
            {},
            {
              get(_t2, p2) {
                if (typeof p2 !== 'string') return undefined;
                const j = cellToIndex.get(p2);
                if (j === undefined) return false;
                return binarySearchNeighbors(neighbors, s, e, j) !== -1;
              },
            }
          );
          originCache.set(prop, accessor);
        }
        return accessor;
      },
    }
  );
  return { data, isVisibilityIndex: true };
}

/**
 * CSR-backed bearing accessor. Supports BOTH the `bearingMap.get?.(a + '::' + b)`
 * calls used by compute.js and the `bearingMap[a + '::' + b]` bracket access used
 * by agentTasks.js. Lookups resolve via a binary search over the origin's sorted
 * neighbor slice — O(log P_i) instead of an O(P) Map.
 */
export function createBearingIndex(offsets, neighbors, bearings, cellToIndex) {
  function getBearing(currCell, nCell) {
    const i = cellToIndex.get(currCell);
    if (i === undefined) return undefined;
    const j = cellToIndex.get(nCell);
    if (j === undefined) return undefined;
    const s = offsets[i];
    const e = offsets[i + 1];
    const pos = binarySearchNeighbors(neighbors, s, e, j);
    return pos === -1 ? undefined : bearings[pos];
  }
  function get(key) {
    const sep = key.indexOf('::');
    if (sep < 0) return undefined;
    return getBearing(key.slice(0, sep), key.slice(sep + 2));
  }
  return new Proxy(
    { isBearingIndex: true, getBearing, get },
    {
      get(target, prop, receiver) {
        if (prop === 'get') return get;
        if (prop === 'getBearing') return getBearing;
        if (prop === 'isBearingIndex') return true;
        if (typeof prop === 'string' && prop.indexOf('::') !== -1) return get(prop);
        return Reflect.get(target, prop, receiver);
      },
    }
  );
}

/**
 * Rebuild CSR-backed visibility + bearing accessors from the flat CSR buffer
 * produced by `computeVisibilityBearingCSRIndexed`.
 *
 * `viewHexes` supplies the integer-index → H3 cellId mapping used to turn the
 * CSR's integer neighbor indices back into the string keys the simulation expects.
 *
 * @returns { visibilityData: { data, isVisibilityIndex }, bearingMap: Proxy }
 */
export function reconstructVisibilityBearing(csr, viewHexes) {
  const { buffer, N, P, offsetsBytes, neighborsBytes } = csr || {};
  if (!buffer || !N) {
    const emptyOffsets = new Int32Array(0);
    const emptyNeighbors = new Int32Array(0);
    const emptyBearings = new Float32Array(0);
    const emptyCellToIndex = new Map();
    return {
      visibilityData: createVisibilityIndex(emptyOffsets, emptyNeighbors, emptyCellToIndex),
      bearingMap: createBearingIndex(emptyOffsets, emptyNeighbors, emptyBearings, emptyCellToIndex),
    };
  }
  const visOffsets = new Int32Array(buffer, 0, N + 1);
  const visNeighbors = new Int32Array(buffer, offsetsBytes, P);
  // Bearings are quantized to Uint16 (see packCSR / mergeVisibilityBearingShards);
  // reading them yields plain numbers, so the BearingIndex consumers are unchanged.
  const bearings = new Uint16Array(buffer, offsetsBytes + neighborsBytes, P);

  // O(N) cell-string → index map. This is the ONLY per-cell structure we keep;
  // it replaces the O(P) per-pair Map/object the legacy path built.
  const cellToIndex = new Map();
  for (let i = 0; i < N; i++) cellToIndex.set(viewHexes[i], i);

  const visibilityData = createVisibilityIndex(visOffsets, visNeighbors, cellToIndex);
  const bearingMap = createBearingIndex(visOffsets, visNeighbors, bearings, cellToIndex);
  return { visibilityData, bearingMap };
}
