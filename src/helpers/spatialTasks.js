import { gridDisk, polygonToCells, cellToLatLng } from 'h3-js';
import {
  FRICTION_COSTS,
  SIMULATION_PARAMS,
  AFFORDANCE,
  IMPASSABLE_BLUR_RADIUS,
  IMPASSABLE_BLUR_SIGMA,
  IMPASSABLE_BLUR_FRICTION_ADD,
  IMPASSABLE_BLUR_AFFORDANCE_PENALTY,
  getSurface,
  POLY_CELLS_CACHE_MAX,
} from './constants.js';
import { computeDijkstra, getGradientGraph } from './dijkstra.js';

const FAST_SCAN_LAYERS = new Set(['transportation', 'building', 'water', 'landcover', 'landuse']);

// Maximum distinct vertical layer keys expected per fast-scan run.
// MVT elevation values are typically small integers (-3..+5), so 64 is more than sufficient.
const MAX_LAYER_KEYS = 64;

// Emit lightweight progress messages when running inside a Worker.
function emitProgress(phase, processed, total) {
  try {
    if (typeof self !== 'undefined' && typeof self.postMessage === 'function') {
      self.postMessage({ progress: true, phase, processed, total });
    }
  } catch (_e) {
    // best-effort only
  }
}
/**
 * Convert AOI polygon to H3 hexes — designed for worker execution.
 * Cached via getCachedPolyCells so repeated calls with same geometry are fast.
 */
export function computeAoiHexes(aoiPolygon, resolution = SIMULATION_PARAMS.h3StrideResolution) {
  if (!aoiPolygon || !aoiPolygon.length) return [];
  try {
    return polygonToCells(aoiPolygon, resolution, true);
  } catch (_e) {
    return [];
  }
}

// --- Deterministic coordinate hash for precise deduplication -----------------
// FNV-1a style hash over downsampled coordinates of ALL rings (outer + holes),
// so polygons that share an outer ring but differ in holes (common for
// landuse/landcover) do not collide in the cell cache.
function _hashCoords(coords) {
  if (!coords || !coords.length) return '';
  let h = 2166136261 >>> 0;
  let totalVerts = 0;
  for (let r = 0; r < coords.length; r++) {
    const ring = coords[r] || [];
    totalVerts += ring.length;
    for (let i = 0; i < ring.length; i++) {
      const c = ring[i] || [0, 0];
      h ^= Math.imul(Math.round(c[0] * 1e4), 16777619) >>> 0;
      h = Math.imul(h, 16777619) >>> 0;
      h ^= Math.imul(Math.round(c[1] * 1e4), 16777619) >>> 0;
      h = Math.imul(h, 16777619) >>> 0;
    }
  }
  if (totalVerts === 0) return '';
  return `${h}:${totalVerts}`;
}

// Cache polygonToCells results to avoid repeated H3 computation for identical geometries
const _polyCellsCache = Object.create(null);
const _polyCellsCacheOrder = [];

// Fast bbox check: compute key only on cache miss
function _computeBboxKey(coords) {
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (let i = 0; i < coords.length; i++) {
    const ring = coords[i] || [];
    for (let j = 0; j < ring.length; j++) {
      const coord = ring[j] || [0, 0];
      if (coord[0] < minx) minx = coord[0];
      if (coord[0] > maxx) maxx = coord[0];
      if (coord[1] < miny) miny = coord[1];
      if (coord[1] > maxy) maxy = coord[1];
    }
  }
  if (!isFinite(minx)) return '';
  return `${minx.toFixed(4)}:${miny.toFixed(4)}:${maxx.toFixed(4)}:${maxy.toFixed(4)}:${coords.length}`;
}

function getCachedPolyCells(coords) {
  // Fast bbox check: compute key only on cache miss (moved from top of function).
  // Include the H3 resolution in the key: the same geometry at a different
  // resolution yields different cells, so without it a resolution change would
  // silently return stale cached cells.
  const key = _computeBboxKey(coords) + ':' + _hashCoords(coords) + ':' + SIMULATION_PARAMS.h3StrideResolution;
  const cached = _polyCellsCache[key];
  if (cached) return cached;

  let result;
  try {
    result = polygonToCells(coords, SIMULATION_PARAMS.h3StrideResolution, true);
  } catch (err) {
    try {
      console.warn && console.warn('computeFastScan: polygonToCells failed for coords', { key, err });
    } catch (_e) {}
    result = [];
  }
  _polyCellsCache[key] = result;
  _polyCellsCacheOrder.push(key);
  if (_polyCellsCacheOrder.length > POLY_CELLS_CACHE_MAX) {
    const old = _polyCellsCacheOrder.shift();
    delete _polyCellsCache[old];
  }
  return result;
}

export function normalizeFrictionEntries(source) {
  if (!source) return Object.create(null);

  // Fast path: an already-normalized plain-object lookup is treated as
  // read-only by every caller (blur, gradient graph, mapping graph, agent
  // batches), so alias it directly instead of copying all N keys. This avoids
  // 2-3 full N-key object copies per mapping generation.
  if (
    typeof source === 'object' &&
    !source.__flat &&
    typeof source.entries !== 'function'
  ) {
    return source;
  }

  const lookup = Object.create(null);

  // Support flattened transferable payloads from the main thread:
  // { __flat: true, keys: [...], vals: TypedArray|ArrayBuffer }
  if (
    source &&
    source.__flat &&
    Array.isArray(source.keys) &&
    (ArrayBuffer.isView(source.vals) || source.vals instanceof ArrayBuffer)
  ) {
    const keys = source.keys;
    const vals = ArrayBuffer.isView(source.vals) ? source.vals : new Float32Array(source.vals);
    for (let i = 0; i < keys.length; i++) lookup[keys[i]] = vals[i];
    return lookup;
  }

  if (typeof source.entries === 'function') {
    for (const [cell, value] of source) lookup[cell] = value;
    return lookup;
  }

  const keys = Object.keys(source);
  for (let i = 0; i < keys.length; i++) lookup[keys[i]] = source[keys[i]];
  return lookup;
}

function computeDijkstraGradientForLookup(targetCell, frictionLookup) {
  // Build the gradient graph (CSR adjacency) once per friction source and cache
  // it, so every gradient Dijkstra reuses the mapping-stage neighbor topology
  // instead of recomputing gridDisk(cell, 1) per visited cell.
  const graph = getGradientGraph(frictionLookup);
  return computeDijkstra(targetCell, frictionLookup, null, graph);
}

export function computeDijkstraGradientSnapshot(targetCell, frictionSource) {
  return computeDijkstraGradientForLookup(targetCell, normalizeFrictionEntries(frictionSource));
}

export function computeGradientBatch({ frictionEntries, targets }) {
  const frictionLookup = normalizeFrictionEntries(frictionEntries);
  const gradients = Object.create(null);

  const total = targets ? targets.length : 0;
  const emitEvery = Math.max(1, Math.floor(total / 20));
  for (let i = 0; i < total; i++) {
    const targetCell = targets[i];
    gradients[targetCell] = computeDijkstraGradientForLookup(targetCell, frictionLookup);
    if (i % emitEvery === 0) emitProgress('gradient-batch', i + 1, total);
  }
  if (total > 0) emitProgress('gradient-batch', total, total);

  return gradients;
}

export function collectFastScanEntries({ features = [], viewHexes = [] } = {}) {
  const n = viewHexes.length;

  // Build cell→index map once — used by typed-array writes
  const cellToIdx = Object.create(null);
  for (let i = 0; i < n; i++) cellToIdx[viewHexes[i]] = i;

  // Dynamic key→index map — grows as new layer keys are encountered. Defined
  // before grouping so each group can be assigned a stable key id up front.
  const keyToIdx = Object.create(null);
  let nextIdx = 0;

  function getOrCreateKeyId(key) {
    let idx = keyToIdx[key];
    if (idx === undefined) {
      if (nextIdx >= MAX_LAYER_KEYS) return -1; // safety cap
      idx = nextIdx++;
      keyToIdx[key] = idx;
    }
    return idx;
  }

  // Group features by surface classification tuple to enable batch processing
  // Key: "layerKey|layerVal" → array of {geometry}. Assign each group a stable
  // key id during grouping so the dense typed arrays can be sized to the ACTUAL
  // number of distinct keys (not the fixed MAX_LAYER_KEYS stride).
  const grouped = Object.create(null);
  for (let i = 0; i < features.length; i++) {
    const feature = features[i];
    if (!feature || !feature.geometry) continue;
    if (!FAST_SCAN_LAYERS.has(feature.sourceLayer)) continue;

    const surface = getSurface(feature);
    if (!surface || !surface.layer || !surface.cost) continue;

    const layerKey = surface.layer;
    const layerVal = FRICTION_COSTS[surface.cost];
    if (typeof layerVal === 'undefined') continue;

    const groupKey = `${layerKey}|${layerVal}`;
    let group = grouped[groupKey];
    if (!group) {
      const layerId = getOrCreateKeyId(layerKey);
      if (layerId < 0) continue; // exceeded key budget, skip this group
      group = grouped[groupKey] = { layerKey, layerVal, layerId, geometries: [] };
    }
    group.geometries.push(feature.geometry);
  }

  // Pre-allocate typed arrays sized for the ACTUAL number of distinct layer keys
  // (not the fixed MAX_LAYER_KEYS stride). Distinct (layerKey, layerVal) pairs are
  // bounded by the number of surface types, so this is typically a small fraction
  // of MAX_LAYER_KEYS — cutting both memory footprint and the zeroing cost by
  // roughly MAX_LAYER_KEYS/nextIdx for every fast-scan chunk.
  const width = Math.max(1, nextIdx);
  const layerFrictions = new Float32Array(n * width);
  const hasLayer = new Uint8Array(n * width);

  // Process each group in batch — writes directly into typed arrays
  for (const group of Object.values(grouped)) {
    _applyGroupToBufferTyped(
      group.geometries,
      group.layerId,
      group.layerVal,
      cellToIdx,
      n,
      width,
      layerFrictions,
      hasLayer
    );
  }

  // Build reverse key→index map for output reconstruction
  const idxToKey = new Array(nextIdx);
  for (const k of Object.keys(keyToIdx)) {
    idxToKey[keyToIdx[k]] = k;
  }

  // Build cellFrictionEntries: min friction across all keys per cell
  const cellFrictionEntries = Object.create(null);
  for (let i = 0; i < n; i++) {
    let min = Infinity;
    const base = i * width;
    for (let l = 0; l < nextIdx; l++) {
      if (hasLayer[base + l]) {
        const v = layerFrictions[base + l];
        if (v < min) min = v;
      }
    }
    cellFrictionEntries[viewHexes[i]] = min === Infinity ? 0 : min;
  }

  // Reconstruct multiFrictionEntries from typed arrays for backward compatibility
  const multiFrictionEntries = Object.create(null);
  for (let i = 0; i < n; i++) {
    const base = i * width;
    let hasData = false;
    // Check and build in single pass
    const entry = Object.create(null);
    for (let l = 0; l < nextIdx; l++) {
      if (hasLayer[base + l]) {
        hasData = true;
        entry[idxToKey[l]] = layerFrictions[base + l];
      }
    }
    if (hasData) multiFrictionEntries[viewHexes[i]] = entry;
  }

  return { multiFrictionEntries, cellFrictionEntries };
}

/**
 * Writes layer friction values into flat typed arrays.
 * Replaces the old nested-object allocation pattern with O(1) per-cell writes.
 * OPTIMIZED: Reduced try-catch overhead, inlined lookups.
 */
function _applyGroupToBufferTyped(geometries, layerId, layerVal, cellToIdx, numCells, maxKeys, layerFrictions, hasLayer) {
  const offsetBase = layerId;
  for (let g = 0; g < geometries.length; g++) {
    const geometry = geometries[g];
    if (!geometry || !geometry.coordinates) continue;

    const coordsArray = geometry.type === 'MultiPolygon' ? geometry.coordinates : [geometry.coordinates];
    for (let p = 0; p < coordsArray.length; p++) {
      const cells = getCachedPolyCells(coordsArray[p]);
      if (!cells) continue;

      for (let c = 0; c < cells.length; c++) {
        const cell = cells[c];
        const idx = cellToIdx[cell];
        if (idx === undefined) continue;

        const offset = idx * maxKeys + offsetBase;
        // Max-keeping per (cell, key): store highest friction value for this slot
        if (!hasLayer[offset] || layerVal > layerFrictions[offset]) {
          hasLayer[offset] = 1;
          layerFrictions[offset] = layerVal;
        }
      }
    }
  }
}

export function computeFastScanSnapshot({ features = [], viewHexes = [] } = {}) {
  try {
    const { multiFrictionEntries, cellFrictionEntries } = collectFastScanEntries({
      features,
      viewHexes,
    });
    const blur = computeImpassableBlurSnapshot({ frictionEntries: cellFrictionEntries });
    return {
      multiFrictionEntries,
      cellFrictionEntries,
      blurWeights: blur.blurWeights,
      blurUpdates: blur.updates,
    };
  } catch (err) {
    try {
      console.error &&
        console.error('computeFastScanSnapshot failed', {
          err,
          featuresCount: (features && features.length) || 0,
        });
    } catch (_e) {}
    return {
      multiFrictionEntries: Object.create(null),
      cellFrictionEntries: Object.create(null),
      blurWeights: Object.create(null),
      blurUpdates: [],
    };
  }
}

export function computeFastScanChunkSnapshot({ features = [], viewHexes = [] } = {}) {
  try {
    return collectFastScanEntries({ features, viewHexes });
  } catch (err) {
    try {
      console.error &&
        console.error('computeFastScanChunkSnapshot failed', {
          err,
          featuresCount: (features && features.length) || 0,
        });
    } catch (_e) {}
    return { multiFrictionEntries: Object.create(null), cellFrictionEntries: Object.create(null) };
  }
}

export function computeImpassableBlurSnapshot({
  frictionEntries,
  viewHexes,
  r1Adjacency,
  radius = IMPASSABLE_BLUR_RADIUS,
  sigma = IMPASSABLE_BLUR_SIGMA,
  addFactor = IMPASSABLE_BLUR_FRICTION_ADD,
} = {}) {
  const frictionLookup = normalizeFrictionEntries(frictionEntries);

  const useIndexSpace =
    r1Adjacency && viewHexes && r1Adjacency.N === viewHexes.length;

  // Collect impassable sources. In index space these are viewHexes indices
  // (via a locally-built idxOf); otherwise cell strings (legacy path).
  const impassables = [];
  if (useIndexSpace) {
    const idxOf = Object.create(null);
    for (let i = 0; i < viewHexes.length; i++) idxOf[viewHexes[i]] = i;
    for (const cell in frictionLookup) {
      if (frictionLookup[cell] >= FRICTION_COSTS.IMPASSABLE) {
        const idx = idxOf[cell];
        if (idx !== undefined) impassables.push(idx);
      }
    }
  } else {
    for (const cell in frictionLookup) {
      if (frictionLookup[cell] >= FRICTION_COSTS.IMPASSABLE) impassables.push(cell);
    }
  }
  if (impassables.length === 0 || radius < 1) return { blurWeights: Object.create(null), updates: [] };

  // Pre-compute gaussian weights per distance to avoid repeated Math.exp calls
  const gaussianWeights = new Array(radius + 1);
  for (let d = 1; d <= radius; d++) {
    gaussianWeights[d] = Math.exp(-0.5 * Math.pow(d / sigma, 2));
  }

  const blurWeights = Object.create(null);
  const impassableLimit = FRICTION_COSTS.IMPASSABLE - 1;
  const updates = [];

  if (useIndexSpace) {
    // Index-space multi-source BFS over the shared r=1 CSR. No `gridDisk` in the
    // loop and no string-keyed nbrCache/visited/frontier — each cell is expanded
    // at most once and distances are integer indices. `visited` uses 0 = unvisited
    // and -1 = impassable source so the two never collide.
    const { offsets, neighbors, N } = r1Adjacency;
    const visited = new Int32Array(N);
    const frontier = new Int32Array(N);
    let fHead = 0;
    let fTail = 0;
    for (let i = 0; i < impassables.length; i++) {
      visited[impassables[i]] = -1; // impassable source
      frontier[fTail++] = impassables[i];
    }

    let currentDist = 1;
    while (currentDist <= radius && fHead < fTail) {
      const nextFrontier = [];
      for (let i = fHead; i < fTail; i++) {
        const cell = frontier[i];
        const s = offsets[cell];
        const e = offsets[cell + 1];
        for (let x = s; x < e; x++) {
          const nc = neighbors[x];
          if (visited[nc] === 0) {
            visited[nc] = currentDist;
            nextFrontier.push(nc);
          }
        }
      }
      fHead = fTail;
      for (let i = 0; i < nextFrontier.length; i++) frontier[fTail++] = nextFrontier[i];
      currentDist++;
    }

    // Build updates in a single pass over all cells.
    for (let idx = 0; idx < N; idx++) {
      const dist = visited[idx];
      if (dist <= 0) continue; // unvisited (0) or impassable source (-1)
      const cell = viewHexes[idx];
      if (frictionLookup[cell] >= FRICTION_COSTS.IMPASSABLE) continue;
      const weight = gaussianWeights[dist];
      if (weight === undefined) continue;
      blurWeights[cell] = weight;
      updates.push([cell, Math.min(impassableLimit, (frictionLookup[cell] ?? 0) + weight * addFactor)]);
    }
  } else {
    // Legacy string-keyed BFS (no shared adjacency available). Multi-source BFS
    // using cached distance-1 neighbor disks for ring-by-ring expansion.
    const visited = Object.create(null);
    for (let i = 0; i < impassables.length; i++) visited[impassables[i]] = 0;

    const nbrCache = Object.create(null);
    const getNeighbors = (c) => {
      let d = nbrCache[c];
      if (d === undefined) {
        d = gridDisk(c, 1);
        nbrCache[c] = d;
      }
      return d;
    };

    const frontier = [];
    for (let i = 0; i < impassables.length; i++) frontier.push(impassables[i]);

    let currentDist = 1;
    while (currentDist <= radius && frontier.length > 0) {
      const nextFrontier = [];
      for (let i = 0; i < frontier.length; i++) {
        const cell = frontier[i];
        const ring = getNeighbors(cell);
        for (let n = 0; n < ring.length; n++) {
          const nc = ring[n];
          if (nc === cell) continue; // skip the center cell
          if (visited[nc] === undefined) {
            visited[nc] = currentDist;
            nextFrontier.push(nc);
          }
        }
      }
      frontier.length = 0;
      for (let i = 0; i < nextFrontier.length; i++) frontier.push(nextFrontier[i]);
      currentDist++;
    }

    for (const cell in visited) {
      const dist = visited[cell];
      if (dist === 0) continue; // skip impassables
      if (frictionLookup[cell] >= FRICTION_COSTS.IMPASSABLE) continue;
      const weight = gaussianWeights[dist];
      if (weight === undefined) continue;
      blurWeights[cell] = weight;
      updates.push([cell, Math.min(impassableLimit, (frictionLookup[cell] ?? 0) + weight * addFactor)]);
    }
  }

  return { blurWeights, updates };
}
/**
 * Compute visibility sets + bearing map for a (shard of) origin cells and
 * serialize the result to a flat CSR (compressed sparse row) layout.
 *
 * Returns the components (NOT a packed buffer) so the orchestrator can merge
 * shards from multiple workers and pack once:
 *   - `localOffsets`: Int32Array(M+1) — prefix-sum of pair counts for THIS shard's
 *     origins (M = originCells.length, or N when originCells is omitted).
 *   - `visNeighbors`: Int32Array(P) — neighbor cell indices (global, into viewHexes).
 *   - `bearings`: Float32Array(P) — bearing degrees, aligned 1:1 with visNeighbors.
 *   - `globalIdx`: Int32Array(M) — global viewHexes index of each local origin.
 *
 * Cells are referenced by integer index into `viewHexes` (0..N-1), so no string
 * H3 IDs or Maps live in the result. The main thread merges shards (disjoint
 * origins → no conflicts) and reconstructs the plain-object visibility map and
 * the bearing Map in-process, so the simulation's consumers stay untouched and
 * the large bearing Map is never structured-cloned across the boundary.
 *
 * `viewHexes` is the FULL AOI cell list (needed for AOI membership / passability
 * and for the index→cellId mapping); `originCells` is the shard of origins this
 * call is responsible for (defaults to all of `viewHexes`).
 */
// ---------------------------------------------------------------------------
// Index-space mapping graph (P1 + P3).
//
// The previous gridDisk-based approach rebuilt r=1 adjacency per shard via
// `gridDisk(cell, 1)` (see precomputeVisibilitySets) and looked friction up in a
// plain-object map. That paid ~shards×V `gridDisk` calls and re-flattened the
// friction object once per shard. This module builds the adjacency + an
// index-aligned friction/lat-lng representation ONCE, off the main thread, and
// the visibility shards then run entirely in integer index space — no `gridDisk`,
// no cell strings, no per-shard friction flatten. The result CSR is identical in
// shape (neighbor indices into `viewHexes`), so
// `mergeVisibilityBearingShards` / `packCSR` / `reconstructVisibilityBearing`
// are unchanged.
// ---------------------------------------------------------------------------

// Allocate a buffer for cross-worker transfer of graph/adjacency arrays.
// SharedArrayBuffer (when cross-origin isolated) is shared zero-copy; otherwise
// a plain ArrayBuffer is cloned by memcpy. Mirrors allocTransferBuffer in
// spatialWorker.js so the mapping stage can build SAB-backed arrays in-worker.
function allocTransferBuffer(byteLength) {
  if (
    typeof SharedArrayBuffer !== 'undefined' &&
    typeof globalThis !== 'undefined' &&
    globalThis.crossOriginIsolated === true
  ) {
    return new SharedArrayBuffer(byteLength);
  }
  return new ArrayBuffer(byteLength);
}

/**
 * Build the r=1 (distance-1) adjacency CSR for the FULL viewHexes set, in
 * viewHexes index space, with EVERY cell (including impassable) as an origin.
 *
 * This is pure geometry (depends only on the AOI cell set, not friction), so it
 * is valid both for the impassable-blur BFS (which must expand *from*
 * impassables) and for the mapping graph (which filters impassable rows). It is
 * built ONCE per mapping generation and shared, replacing the two separate
 * `gridDisk` passes that `computeImpassableBlurSnapshot` and `buildMappingGraph`
 * used to each perform — roughly halving the H3 `gridDisk` calls at city scale.
 *
 * @returns { N, offsets:Int32Array(N+1), neighbors:Int32Array(E) }
 *          `idxOf` is intentionally NOT returned: callers that need cell→index
 *          (the blur) build it locally from `viewHexes` (a cheap N-loop, no H3),
 *          which avoids structured-cloning a 500k-key object across workers.
 */
export function buildR1Adjacency({ viewHexes } = {}) {
  const N = viewHexes ? viewHexes.length : 0;
  const idxOf = Object.create(null);
  for (let i = 0; i < N; i++) idxOf[viewHexes[i]] = i;

  // Single flat `gridDisk` pass into one contiguous temp buffer (not N
  // intermediate arrays), then prefix-sum + compact — the shape that is correct
  // at any N (the old V-arrays form previously corrupted at city scale).
  const temp = new Int32Array(N * 6);
  const deg = new Int32Array(N);
  let tempPos = 0;
  for (let i = 0; i < N; i++) {
    const cell = viewHexes[i];
    const disk = gridDisk(cell, 1);
    for (let k = 0; k < disk.length; k++) {
      const nb = disk[k];
      if (nb === cell) continue; // skip the center
      const j = idxOf[nb];
      if (j === undefined) continue; // out of AOI
      temp[tempPos++] = j;
      deg[i]++;
    }
  }

  const offsets = new Int32Array(N + 1);
  for (let i = 0; i < N; i++) offsets[i + 1] = offsets[i] + deg[i];

  const neighbors = new Int32Array(offsets[N]);
  let w = 0;
  for (let i = 0; i < N; i++) {
    const start = offsets[i];
    const end = offsets[i + 1];
    for (let e = start; e < end; e++) neighbors[w++] = temp[e];
  }

  return { N, offsets, neighbors, idxOf };
}

/**
 * Build the viewHexes-indexed CSR adjacency + aligned friction/lat-lng ONCE.
 *
 * Adjacency is indexed by position in `viewHexes` (0..N-1). Impassable and
 * out-of-AOI neighbors are omitted, exactly as the legacy BFS filtered them, so
 * the index-space flood-fill is equivalent. `frictionArr[i]` holds the friction
 * of `viewHexes[i]` (or -1 for impassable/missing); `latLngArr` stores
 * [lat, lng, latRad, lngRad] per cell so bearings need no `cellToLatLng` call.
 *
 * When `r1Adjacency` (from `buildR1Adjacency`) is supplied, its shared r=1 CSR
 * is reused (impassable origins/neighbors filtered) instead of a second
 * `gridDisk` pass — the P1 + P3 win.
 *
 * @returns { N, adjOffsets:Int32Array(N+1), adjNeighbors:Int32Array(E),
 *            frictionArr:Float32Array(N), latLngArr:Float32Array(4N) }
 */
export function buildMappingGraph({ frictionEntries, viewHexes, r1Adjacency } = {}) {
  const frictionLookup = normalizeFrictionEntries(frictionEntries);
  const N = viewHexes ? viewHexes.length : 0;
  const impassable = FRICTION_COSTS.IMPASSABLE;

  // SAB-backed when cross-origin isolated so posting the graph to the visibility
  // shard workers is zero-copy (no per-shard structured clone of a large graph).
  const frictionArr = new Float32Array(allocTransferBuffer(N * 4));
  const latLngArr = new Float32Array(allocTransferBuffer(N * 4 * 4));
  const idxOf = Object.create(null);
  for (let i = 0; i < N; i++) {
    const cell = viewHexes[i];
    idxOf[cell] = i;
    const f = frictionLookup[cell] ?? 0;
    frictionArr[i] = f < impassable ? f : -1; // -1 marks impassable / missing
    const ll = cellToLatLng(cell);
    const latRad = (ll[0] * Math.PI) / 180;
    const lngRad = (ll[1] * Math.PI) / 180;
    latLngArr[i * 4] = ll[0];
    latLngArr[i * 4 + 1] = ll[1];
    latLngArr[i * 4 + 2] = latRad;
    latLngArr[i * 4 + 3] = lngRad;
  }

  // CSR adjacency in viewHexes index space. Impassable cells get an empty row
  // (they are never BFS origins and never appear as neighbors).
  //
  // When a shared `r1Adjacency` (built once from viewHexes) is supplied, reuse
  // its r=1 CSR and just filter impassable origins/neighbors — this avoids the
  // second `gridDisk` pass the mapping graph would otherwise do, and is exactly
  // the topology the legacy path produced. Otherwise fall back to the single
  // flat `gridDisk` pass (correct at any N; the old V-arrays form previously
  // corrupted at city scale).
  let adjOffsets;
  let adjNeighbors;
  if (r1Adjacency && r1Adjacency.N === N) {
    const r1Off = r1Adjacency.offsets;
    const r1Nb = r1Adjacency.neighbors;
    const deg = new Int32Array(N);
    let E = 0;
    for (let i = 0; i < N; i++) {
      if (frictionArr[i] < 0) continue; // impassable origin → empty row
      const s = r1Off[i];
      const e = r1Off[i + 1];
      for (let x = s; x < e; x++) {
        const j = r1Nb[x];
        if (frictionArr[j] >= 0) {
          deg[i]++;
          E++;
        } // skip impassable neighbor
      }
    }
    adjOffsets = new Int32Array(allocTransferBuffer((N + 1) * 4));
    for (let i = 0; i < N; i++) adjOffsets[i + 1] = adjOffsets[i] + deg[i];
    adjNeighbors = new Int32Array(allocTransferBuffer(E * 4));
    let w = 0;
    for (let i = 0; i < N; i++) {
      if (frictionArr[i] < 0) continue;
      const s = r1Off[i];
      const e = r1Off[i + 1];
      for (let x = s; x < e; x++) {
        const j = r1Nb[x];
        if (frictionArr[j] >= 0) adjNeighbors[w++] = j;
      }
    }
  } else {
    const temp = new Int32Array(N * 6);
    const deg = new Int32Array(N);
    let tempPos = 0;
    for (let i = 0; i < N; i++) {
      if (frictionArr[i] < 0) continue; // impassable cells get an empty row
      const cell = viewHexes[i];
      const disk = gridDisk(cell, 1);
      for (let k = 0; k < disk.length; k++) {
        const nb = disk[k];
        if (nb === cell) continue; // skip the center
        const j = idxOf[nb];
        if (j === undefined) continue; // out of AOI
        if (frictionArr[j] < 0) continue; // impassable neighbor
        temp[tempPos++] = j;
        deg[i]++;
      }
    }

    adjOffsets = new Int32Array(allocTransferBuffer((N + 1) * 4));
    for (let i = 0; i < N; i++) adjOffsets[i + 1] = adjOffsets[i] + deg[i];

    adjNeighbors = new Int32Array(allocTransferBuffer(adjOffsets[N] * 4));
    let w = 0;
    for (let i = 0; i < N; i++) {
      const start = adjOffsets[i];
      const end = adjOffsets[i + 1];
      for (let e = start; e < end; e++) adjNeighbors[w++] = temp[e];
    }
  }

  return { N, adjOffsets, adjNeighbors, frictionArr, latLngArr };
}

/**
 * Index-space visibility + bearing (shard). Equivalent output to the previous
 * gridDisk-based approach but operates purely on integer indices using the
 * prebuilt CSR adjacency, aligned friction, and lat/lng arrays — no `gridDisk`,
 * no cell strings, no friction-object lookup. `originIdx` is an Int32Array of
 * viewHexes indices this shard owns (so the caller need not ship `viewHexes`).
 */
export function computeVisibilityBearingCSRIndexed({
  adjOffsets,
  adjNeighbors,
  frictionArr,
  latLngArr,
  visionDepth = SIMULATION_PARAMS.visionDepth,
  originIdx,
} = {}) {
  // N is derived from the graph (adjOffsets is length N+1), so `viewHexes` is
  // never required by the shard — callers ship only origin indices + the graph.
  const N = adjOffsets ? adjOffsets.length - 1 : 0;
  const origins = originIdx && originIdx.length ? originIdx : null;
  const M = origins ? origins.length : N;

  const localOffsets = new Int32Array(M + 1);
  // Reused across origins: BFS queue (indices) and a generation-stamped visited
  // marker (avoids per-origin allocation / GC churn).
  const queue = new Int32Array(N);
  const visited = new Int32Array(N);
  let gen = 0;

  // Pass 1: BFS per origin, count visible pairs → localOffsets. No storage, so
  // no M intermediate arrays / P-entry GC churn (the old `visibleLists` held a
  // JS array per origin plus all P neighbor indices as boxed numbers).
  for (let j = 0; j < M; j++) {
    const start = origins ? origins[j] : j;
    if (frictionArr[start] < 0) {
      localOffsets[j + 1] = localOffsets[j];
      continue;
    }
    gen++;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    visited[start] = gen;
    // Ring BFS: pop exactly `levelSize` cells per level. `levelSize` is reset to
    // the number of cells enqueued for the next level (tail - head) after each
    // level, so it can never drift negative and the depth cap is always honored.
    let levelSize = 1;
    let dist = 0;
    let count = 0;
    while (dist < visionDepth && head < tail) {
      for (let i = 0; i < levelSize; i++) {
        const cur = queue[head++];
        const s = adjOffsets[cur];
        const e = adjOffsets[cur + 1];
        for (let x = s; x < e; x++) {
          const nb = adjNeighbors[x];
          if (visited[nb] === gen) continue;
          visited[nb] = gen;
          count++;
          queue[tail++] = nb;
        }
      }
      levelSize = tail - head;
      dist++;
    }
    // Proper prefix sum: localOffsets[j+1] = localOffsets[j] + count_j, so
    // localOffsets[M] is the TOTAL pair count P and (localOffsets[j+1] -
    // localOffsets[j]) is exactly this origin's pair count for the merge.
    localOffsets[j + 1] = localOffsets[j] + count;
  }
  const P = localOffsets[M];

  // Second pass: re-run the BFS per origin, writing neighbor indices + bearings
  // (from latLngArr, no trig on cells) directly into the preallocated output
  // arrays. The offsets from pass 1 make the write position for each origin
  // known up front, so no intermediate storage is needed.
  const visNeighbors = new Int32Array(P);
  const bearings = new Float32Array(P);
  let pp = 0;
  for (let j = 0; j < M; j++) {
    const start = origins ? origins[j] : j;
    if (frictionArr[start] < 0) continue;
    gen++;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    visited[start] = gen;
    let levelSize = 1;
    let dist = 0;
    const b = start * 4;
    const sLatR = latLngArr[b + 2];
    const sLngR = latLngArr[b + 3];
    while (dist < visionDepth && head < tail) {
      for (let i = 0; i < levelSize; i++) {
        const cur = queue[head++];
        const s = adjOffsets[cur];
        const e = adjOffsets[cur + 1];
        for (let x = s; x < e; x++) {
          const nb = adjNeighbors[x];
          if (visited[nb] === gen) continue;
          visited[nb] = gen;
          visNeighbors[pp] = nb;
          const n = nb * 4;
          const nLatR = latLngArr[n + 2];
          const nLngR = latLngArr[n + 3];
          const y = Math.sin(nLngR - sLngR) * Math.cos(nLatR);
          const bx = Math.cos(sLatR) * Math.sin(nLatR) - Math.sin(sLatR) * Math.cos(nLatR) * Math.cos(nLngR - sLngR);
          bearings[pp] = ((Math.atan2(y, bx) * 180) / Math.PI + 360) % 360;
          pp++;
          queue[tail++] = nb;
        }
      }
      levelSize = tail - head;
      dist++;
    }
  }

  const globalIdx = origins ? Int32Array.from(origins) : null;
  return { N, P, localOffsets, visNeighbors, bearings, globalIdx };
}

/**
 * Per-cell mapping assembly for a shard of cells (runs in a worker).
 *
 * Mirrors the body of the old single-threaded merge loop in `triggerFastScan`:
 * for each cell it merges its multi-friction layer map, computes the effective
 * friction (min across layers, or the fast-scan fallback), applies the
 * impassable-blur friction update, classifies affordance (with the blur-weight
 * penalty), and produces the merged layer map. Cells are independent, so this
 * is embarrassingly parallel — the orchestrator shards `viewHexes` and merges
 * the results. Returns flat typed arrays + per-cell layer maps so the main
 * thread only does O(N) assignments (no min-reduction / classification / object
 * construction on the UI thread).
 *
 * @param cells            subset of viewHexes this shard owns
 * @param multiEntries     { cell: layerMap } for these cells (merged layers)
 * @param cellFrictionEntries { cell: number } fast-scan fallback friction
 * @param blurUpdateMap    { cell: number } | null  blur friction overrides
 * @param blurWeights      { cell: number } | null  blur affordance penalties
 */
export function mergeCellsChunk({
  cells = [],
  multiEntries = Object.create(null),
  cellFrictionEntries = Object.create(null),
  blurUpdateMap = null,
  blurWeights = null,
} = {}) {
  const n = cells.length;
  const frictionArr = new Float64Array(n);
  const affArr = new Float64Array(n);
  const multiArr = new Array(n);

  const penalty = IMPASSABLE_BLUR_AFFORDANCE_PENALTY;
  const pavement = AFFORDANCE.PAVEMENT;
  const lightPark = AFFORDANCE.LIGHT_PARK;
  const heavyGrass = AFFORDANCE.HEAVY_GRASS;
  const impassable = AFFORDANCE.IMPASSABLE;
  const p = FRICTION_COSTS.PAVEMENT;
  const l = FRICTION_COSTS.LIGHT_PARK;
  const hg = FRICTION_COSTS.HEAVY_GRASS;
  const midPL = (p + l) / 2;
  const midLH = (l + hg) / 2;

  for (let i = 0; i < n; i++) {
    const cell = cells[i];
    const layerMap = multiEntries[cell];

    // Merge multi-friction layers (max-keeping) into a fresh map.
    let target = null;
    let fr;
    if (layerMap) {
      target = Object.create(null);
      let min = Infinity;
      for (const k in layerMap) {
        const v = layerMap[k];
        target[k] = v;
        if (v < min) min = v;
      }
      fr = min;
    } else {
      fr = cellFrictionEntries[cell] ?? 0;
    }

    // Apply the impassable blur friction override (nudge routing around obstacles).
    if (blurUpdateMap) {
      const blurred = blurUpdateMap[cell];
      if (blurred !== undefined) fr = blurred;
    }

    // Affordance classification.
    let aff;
    if (fr >= impassable) aff = impassable;
    else if (fr < midPL) aff = pavement;
    else if (fr < midLH) aff = lightPark;
    else aff = heavyGrass;

    // Apply the blur affordance penalty (cells adjacent to buildings wear faster).
    if (blurWeights) {
      const weight = blurWeights[cell];
      if (weight != null) aff = Math.max(0.0, aff - Math.min(aff, weight * penalty));
    }

    frictionArr[i] = fr;
    affArr[i] = aff;
    multiArr[i] = target || Object.create(null);
  }

  return { cells, frictionArr, affArr, multiArr };
}
