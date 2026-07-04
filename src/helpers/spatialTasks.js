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

// Cache polygonToCells results to avoid repeated H3 computation for identical geometries
const _polyCellsCache = Object.create(null);
const _polyCellsCacheOrder = [];

function getCachedPolyCells(coords) {
  // Build a deterministic key from coordinates
  let minx = Infinity,
    miny = Infinity,
    maxx = -Infinity,
    maxy = -Infinity;
  let points = 0;
  for (let i = 0; i < coords.length; i++) {
    const ring = coords[i] || [];
    points += ring.length;
    for (let j = 0; j < ring.length; j++) {
      const coord = ring[j] || [0, 0];
      const lng = coord[0],
        lat = coord[1];
      if (lng < minx) minx = lng;
      if (lng > maxx) maxx = lng;
      if (lat < miny) miny = lat;
      if (lat > maxy) maxy = lat;
    }
  }
  if (!isFinite(minx)) return [];
  const key = `${minx.toFixed(4)}:${miny.toFixed(4)}:${maxx.toFixed(4)}:${maxy.toFixed(4)}:${points}`;
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

// Cache gridDisk results to avoid redundant H3 neighbor lookups in blur computation
const BLUR_NEIGHBOR_CACHE_MAX = 2048;
const _blurNeighborCache = Object.create(null);
const _blurNeighborCacheOrder = [];

function getBlurNeighbors(cell, radius) {
  const key = `${cell}:${radius}`;
  let cached = _blurNeighborCache[key];
  if (cached) return cached;

  // gridDisk returns center + neighbors; skip index 0 (center) for blur
  try {
    cached = gridDisk(cell, radius);
  } catch (_error) {
    cached = [];
  }

  _blurNeighborCache[key] = cached;
  _blurNeighborCacheOrder.push(key);
  if (_blurNeighborCacheOrder.length > BLUR_NEIGHBOR_CACHE_MAX) {
    const old = _blurNeighborCacheOrder.shift();
    delete _blurNeighborCache[old];
  }

  return cached;
}

export function computeImpassableBlurSnapshot({
  frictionEntries,
  radius = IMPASSABLE_BLUR_RADIUS,
  sigma = IMPASSABLE_BLUR_SIGMA,
  addFactor = IMPASSABLE_BLUR_FRICTION_ADD,
}) {
  const frictionLookup = normalizeFrictionEntries(frictionEntries);
  const impassables = [];

  for (const cell in frictionLookup) {
    if (frictionLookup[cell] >= FRICTION_COSTS.IMPASSABLE) impassables.push(cell);
  }

  const blurWeights = Object.create(null);
  if (impassables.length === 0) return { blurWeights, updates: [] };

  // Pre-compute gaussian weights per distance to avoid repeated Math.exp calls
  const gaussianWeights = new Array(radius + 1);
  for (let d = 1; d <= radius; d++) {
    gaussianWeights[d] = Math.exp(-0.5 * Math.pow(d / sigma, 2));
  }

  // Use gridDisk instead of gridRing: returns center+neighbors in one H3 call vs. ring-only
  // Cache results since nearby impassables share many neighbors
  const totalImp = impassables.length;
  const emitEveryImp = Math.max(1, Math.floor(totalImp / 20));
  for (let i = 0; i < totalImp; i++) {
    const cell = impassables[i];
    const neighbors = getBlurNeighbors(cell, radius);

    for (let n = 1; n < neighbors.length; n++) {
      // skip center (index 0)
      const neighborCell = neighbors[n];
      const friction = frictionLookup[neighborCell];
      if (typeof friction !== 'number' || friction >= FRICTION_COSTS.IMPASSABLE) continue;

      // Compute distance from impassable to this neighbor for correct gaussian weight
      // For radius=1, all immediate neighbors are at distance 1
      let dist = 1;
      if (radius > 1) {
        // Determine actual ring distance by checking which ring contains this cell
        try {
          const prevRing = getBlurNeighbors(cell, radius - 1);
          for (let p = 0; p < prevRing.length; p++) {
            if (prevRing[p] === neighborCell) {
              dist = radius - 1;
              break;
            }
          }
        } catch (_e) {}
      }

      const weight = gaussianWeights[dist];
      blurWeights[neighborCell] = (blurWeights[neighborCell] ?? 0) + weight;
    }

    if (i % emitEveryImp === 0) emitProgress('impassable-blur', i + 1, totalImp);
  }
  if (totalImp > 0) emitProgress('impassable-blur', totalImp, totalImp);

  const updates = [];
  const impassableLimit = FRICTION_COSTS.IMPASSABLE - 1;
  const blurWeightKeys = Object.keys(blurWeights);
  for (let k = 0; k < blurWeightKeys.length; k++) {
    const cell = blurWeightKeys[k];
    const nextFriction = Math.min(
      impassableLimit,
      (frictionLookup[cell] ?? 0) + blurWeights[cell] * addFactor
    );
    updates.push([cell, nextFriction]);
  }

  return { blurWeights, updates };
}
