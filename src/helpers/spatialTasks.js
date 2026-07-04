import { gridDisk, gridRing, polygonToCells } from 'h3-js';
import {
  FRICTION_COSTS,
  H3_STRIDE_RESOLUTION,
  IMPASSABLE_BLUR_RADIUS,
  IMPASSABLE_BLUR_SIGMA,
  IMPASSABLE_BLUR_FRICTION_ADD,
  getSurface,
  POLY_CELLS_CACHE_MAX,
} from './constants.js';
import { computeDijkstra } from './dijkstra.js';

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
export function computeAoiHexes(aoiPolygon) {
  if (!aoiPolygon || !aoiPolygon.length) return [];
  try {
    return polygonToCells(aoiPolygon, H3_STRIDE_RESOLUTION, true);
  } catch (_e) {
    return [];
  }
}

// --- Deterministic coordinate hash for precise deduplication -----------------
// FNV-1a style hash over downsampled coordinates of the first ring.
function _hashCoords(coords) {
  const ring = coords && coords[0];
  if (!ring || !ring.length) return '';
  let h = 2166136261 >>> 0;
  for (let i = 0; i < ring.length; i++) {
    const c = ring[i] || [0, 0];
    h ^= Math.imul(Math.round(c[0] * 1e4), 16777619) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
    h ^= Math.imul(Math.round(c[1] * 1e4), 16777619) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return `${h}:${ring.length}`;
}

// Cache polygonToCells results to avoid repeated H3 computation for identical geometries
const _polyCellsCache = Object.create(null);
const _polyCellsCacheOrder = [];

function getCachedPolyCells(coords) {
  // Build a deterministic key from coordinates using hash + bbox + structure
  let minx = Infinity,
    miny = Infinity,
    maxx = -Infinity,
    maxy = -Infinity;
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
  if (!isFinite(minx)) return [];

  const key = `${_hashCoords(coords)}:${minx.toFixed(4)}:${miny.toFixed(4)}:${maxx.toFixed(4)}:${maxy.toFixed(4)}:${coords.length}`;
  const cached = _polyCellsCache[key];
  if (cached) return cached;

  let result;
  try {
    result = polygonToCells(coords, H3_STRIDE_RESOLUTION, true);
  } catch (err) {
    try {
      console.warn &&
        console.warn('computeFastScan: polygonToCells failed for coords', { key, err });
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
  const lookup = Object.create(null);
  if (!source) return lookup;

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
  return computeDijkstra(targetCell, frictionLookup, (cell) => gridDisk(cell, 1));
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

  // Group features by surface classification tuple to enable batch processing
  // Key: "layerKey|layerVal" → array of {geometry}
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
    if (!grouped[groupKey]) grouped[groupKey] = { layerKey, layerVal, geometries: [] };
    grouped[groupKey].geometries.push(feature.geometry);
  }

  // Pre-allocate typed arrays sized for worst-case (all cells × max distinct keys)
  const layerFrictions = new Float32Array(n * MAX_LAYER_KEYS);
  const hasLayer = new Uint8Array(n * MAX_LAYER_KEYS);

  // Dynamic key→index map — grows as new layer keys are encountered
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

  // Process each group in batch — writes directly into typed arrays
  for (const group of Object.values(grouped)) {
    const layerId = getOrCreateKeyId(group.layerKey);
    if (layerId < 0) continue; // exceeded key budget, skip this group
    _applyGroupToBufferTyped(
      group.geometries,
      layerId,
      group.layerVal,
      cellToIdx,
      n,
      MAX_LAYER_KEYS,
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
    const base = i * MAX_LAYER_KEYS;
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
    let hasData = false;
    const base = i * MAX_LAYER_KEYS;
    for (let l = 0; l < nextIdx; l++) {
      if (hasLayer[base + l]) { hasData = true; break; }
    }
    if (!hasData) continue;

    const entry = Object.create(null);
    for (let l = 0; l < nextIdx; l++) {
      if (hasLayer[base + l]) {
        entry[idxToKey[l]] = layerFrictions[base + l];
      }
    }
    multiFrictionEntries[viewHexes[i]] = entry;
  }

  return { multiFrictionEntries, cellFrictionEntries };
}

/**
 * Writes layer friction values into flat typed arrays.
 * Replaces the old nested-object allocation pattern with O(1) per-cell writes.
 */
function _applyGroupToBufferTyped(geometries, layerId, layerVal, cellToIdx, numCells, maxKeys, layerFrictions, hasLayer) {
  for (let g = 0; g < geometries.length; g++) {
    const geometry = geometries[g];
    if (!geometry || !geometry.coordinates) continue;

    try {
      const coordsArray =
        geometry.type === 'MultiPolygon' ? geometry.coordinates : [geometry.coordinates];
      for (let p = 0; p < coordsArray.length; p++) {
        let cells = [];
        try {
          cells = getCachedPolyCells(coordsArray[p]);
        } catch (err) {
          try {
            console.warn &&
              console.warn('computeFastScan: failed to get cells for geometry', {
                layerId,
                layerVal,
                err,
              });
          } catch (_e) {}
          continue;
        }
        for (let c = 0; c < cells.length; c++) {
          const cell = cells[c];
          const idx = cellToIdx[cell];
          if (idx === undefined) continue;

          const offset = idx * maxKeys + layerId;
          // Max-keeping per (cell, key): store highest friction value for this slot
          // Semantics match the original nested-object implementation
          if (!hasLayer[offset] || layerVal > layerFrictions[offset]) {
            hasLayer[offset] = 1;
            layerFrictions[offset] = layerVal;
          }
        }
      }
    } catch (err) {
      try {
        console.warn &&
          console.warn('computeFastScan: skipping malformed geometry', { layerId, layerVal, err });
      } catch (_e) {}
      continue;
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
  radius = IMPASSABLE_BLUR_RADIUS,
  sigma = IMPASSABLE_BLUR_SIGMA,
  addFactor = IMPASSABLE_BLUR_FRICTION_ADD,
}) {
  const frictionLookup = normalizeFrictionEntries(frictionEntries);

  // Collect impassable sources
  const impassables = [];
  for (const cell in frictionLookup) {
    if (frictionLookup[cell] >= FRICTION_COSTS.IMPASSABLE) impassables.push(cell);
  }
  if (impassables.length === 0 || radius < 1) return { blurWeights: Object.create(null), updates: [] };

  // Pre-compute gaussian weights per distance to avoid repeated Math.exp calls
  const gaussianWeights = new Array(radius + 1);
  for (let d = 1; d <= radius; d++) {
    gaussianWeights[d] = Math.exp(-0.5 * Math.pow(d / sigma, 2));
  }

  // Multi-source BFS: all impassables start at distance 0.
  // Each cell is visited once — its distance equals the nearest impassable.
  const blurWeights = Object.create(null);
  const visited = new Set(impassables);
  let queue = [];
  for (let i = 0; i < impassables.length; i++) {
    try {
      const neighbors = gridDisk(impassables[i], 1);
      for (let n = 0; n < neighbors.length; n++) {
        const nc = neighbors[n];
        if (!visited.has(nc)) {
          visited.add(nc);
          queue.push([nc, 1]);
        }
      }
    } catch (_e) {}
  }

  // Expand BFS ring-by-ring until radius limit or exhaustion
  let currentDist = 1;
  while (currentDist < radius && queue.length > 0) {
    const nextQueue = [];
    for (let i = 0; i < queue.length; i++) {
      const cell = queue[i][0];
      try {
        const neighbors = gridDisk(cell, 1);
        for (let n = 0; n < neighbors.length; n++) {
          const nc = neighbors[n];
          if (!visited.has(nc)) {
            visited.add(nc);
            nextQueue.push([nc, currentDist + 1]);
          }
        }
      } catch (_e) {}
    }
    queue = nextQueue;
    currentDist++;
  }

  // Accumulate gaussian weights — only for cells with valid (non-impassable) friction
  for (let i = 0; i < queue.length; i++) {
    const cell = queue[i][0];
    const dist = queue[i][1];
    if (frictionLookup[cell] >= FRICTION_COSTS.IMPASSABLE) continue;
    blurWeights[cell] = (blurWeights[cell] ?? 0) + gaussianWeights[dist];
  }

  // Build friction updates capped at impassable limit
  const updates = [];
  const impassableLimit = FRICTION_COSTS.IMPASSABLE - 1;
  const keys = Object.keys(blurWeights);
  for (let k = 0; k < keys.length; k++) {
    const cell = keys[k];
    updates.push([
      cell,
      Math.min(impassableLimit, (frictionLookup[cell] ?? 0) + blurWeights[cell] * addFactor),
    ]);
  }

  return { blurWeights, updates };
}
