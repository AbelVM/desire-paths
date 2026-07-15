import { logger } from './logger.js';
import {
  gridRingUnsafe,
  polygonToCells,
  cellToLatLng,
  gridPathCells,
  latLngToCell,
} from 'h3-js';

// NOTE: a previous module-level lat/lng cache (capped at 4096 entries) was
// removed. `buildMappingGraph` iterates `viewHexes` in order and calls
// `cellToLatLng` once per cell; for any real AOI (N ≫ 4096) the cache was
// smaller than the working set, so it missed 100% of the time and only added
// ~3 Map ops per cell of pure overhead. The radian/sin/cos values are computed
// once in `buildMappingGraph` and stored in `latLngArr`, which is the structure
// the visibility BFS actually consumes — so there is no repeated trig to cache.
import {
  FRICTION_COSTS,
  SIMULATION_PARAMS,
  AFFORDANCE,
  IMPASSABLE_BLUR_RADIUS,
  IMPASSABLE_BLUR_SIGMA,
  IMPASSABLE_BLUR_FRICTION_ADD,
  IMPASSABLE_BLUR_AFFORDANCE_PENALTY,
  PATH_BLUR_RADIUS,
  PATH_BLUR_SIGMA,
  PATH_BLUR_FRICTION_ADD,
  PATH_BLUR_AFFORDANCE_BOOST,
  PATH_BLUR_LANDCOVER_GATE,
  getSurface,
  POLY_CELLS_CACHE_MAX,
  classifyFrictionTier,
} from './constants.js';
import { computeDijkstra, getGradientGraph, getGradientGraphFromArray } from './dijkstra.js';

const FAST_SCAN_LAYERS = new Set([
  'transportation',
  'building',
  'water',
  'landcover',
  'landuse',
  'park',
  'waterway',
  'aeroway',
]);

/**
 * Derive the effective per-cell friction from a per-layer friction map.
 *
 * Ground-surface classification uses ONLY the layer=0 entry. Bridges (layer=1)
 * and tunnels/underground features (layer=-1) do not affect the walkable
 * surface — a bridge over water stays passable, and an underground tunnel does
 * not make the ground above it impassable.
 *
 * @param {Object} multiFrictionEntries cell -> { layerKey: friction }
 * @returns {Object} cell -> effective friction (number)
 */
export function deriveCellFrictionFromLayers(multiFrictionEntries) {
  const cellFrictionEntries = Object.create(null);
  for (const cell in multiFrictionEntries) {
    const layerMap = multiFrictionEntries[cell];
    const v = layerMap['0'];
    if (typeof v === 'number' && isFinite(v)) cellFrictionEntries[cell] = v;
  }
  return cellFrictionEntries;
}

/**
 * Merge two friction values for the SAME (cell, vertical layer) slot.
 *
 * Resolution order (order-independent):
 *  - An IMPASSABLE value always wins — an obstacle blocks the cell.
 *  - Among walkable surfaces, the HARDEST (lowest-friction) wins, so a paved
 *    path/road overrides the softer ground it crosses (park lawn, grass).
 *
 * This replaces the old "per-layer MAX" rule, which correctly made an
 * impassable obstacle win but also let a soft park (LIGHT_PARK) swallow a paved
 * path (PAVEMENT) at the same level — the opposite of the desired behaviour.
 *
 * @param {number|undefined} current already-merged friction for the slot
 * @param {number} next friction of the feature being merged in
 * @returns {number} merged friction for the slot
 */
export function mergeLayerFriction(current, next) {
  const IMPASSABLE = FRICTION_COSTS.IMPASSABLE;
  if (next >= IMPASSABLE) return IMPASSABLE; // obstacle always wins
  if (current === undefined) return next; // seed
  if (current >= IMPASSABLE) return IMPASSABLE; // keep obstacle
  return next < current ? next : current; // hardest walkable wins
}
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
  if (!isFinite(minx)) return '';
  return `${minx.toFixed(4)}:${miny.toFixed(4)}:${maxx.toFixed(4)}:${maxy.toFixed(4)}:${coords.length}`;
}

// Compute the bounding box of a feature's geometry coordinates.
// Accepts an optional pre-computed bbox (e.g. from Mapbox vector tile features)
// to skip the O(V) coordinate walk when the source already provides one.
// Returns null if the geometry is empty/invalid, otherwise [minx, miny, maxx, maxy].
function computeFeatureBbox(geometry, precomputedBbox) {
  if (precomputedBbox && Array.isArray(precomputedBbox) && precomputedBbox.length === 4) {
    return [precomputedBbox[0], precomputedBbox[1], precomputedBbox[2], precomputedBbox[3]];
  }
  if (!geometry || !geometry.coordinates) return null;
  const coords = geometry.coordinates;
  let minx = Infinity,
    miny = Infinity,
    maxx = -Infinity,
    maxy = -Infinity;
  const walk = (arr) => {
    for (let i = 0; i < arr.length; i++) {
      const c = arr[i];
      if (typeof c[0] === 'number') {
        if (c[0] < minx) minx = c[0];
        if (c[0] > maxx) maxx = c[0];
        if (c[1] < miny) miny = c[1];
        if (c[1] > maxy) maxy = c[1];
      } else {
        walk(c);
      }
    }
  };
  walk(coords);
  if (!isFinite(minx)) return null;
  return [minx, miny, maxx, maxy];
}

// Fast bbox intersection test: returns true if a and b overlap.
function bboxesIntersect(a, b) {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

// True when bbox `b` extends past any edge of bbox `a` (i.e. `b` is not fully
// contained in `a`). Used to decide whether a feature must be clipped to the
// AOI bbox before rasterization.
function _extendsBeyond(b, a) {
  return b[0] < a[0] || b[1] < a[1] || b[2] > a[2] || b[3] > a[3];
}

// --- Polygon clipping to the AOI bbox (fast-scan rasterization speedup) ------
// Sutherland–Hodgman clip of a single ring (array of [lng,lat]) against an
// axis-aligned rectangle [minx, miny, maxx, maxy]. The clip region is convex, so
// SH preserves ring simplicity for simple input and never throws.
function _shClip(pts, inside, intersect) {
  const n = pts.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const cur = pts[i];
    const prev = pts[(i + n - 1) % n];
    const curIn = inside(cur);
    const prevIn = inside(prev);
    if (curIn) {
      if (!prevIn) out.push(intersect(prev, cur));
      out.push(cur);
    } else if (prevIn) {
      out.push(intersect(prev, cur));
    }
  }
  return out;
}

function _intersectX(a, b, x) {
  const dx = b[0] - a[0];
  const t = dx === 0 ? 0 : (x - a[0]) / dx;
  return [x, a[1] + t * (b[1] - a[1])];
}

function _intersectY(a, b, y) {
  const dy = b[1] - a[1];
  const t = dy === 0 ? 0 : (y - a[1]) / dy;
  return [a[0] + t * (b[0] - a[0]), y];
}

function _clipRingToBbox(ring, minx, miny, maxx, maxy) {
  if (!ring || ring.length < 3) return ring;
  let pts = _shClip(ring, (p) => p[0] >= minx, (a, b) => _intersectX(a, b, minx));
  if (pts.length < 3) return pts;
  pts = _shClip(pts, (p) => p[0] <= maxx, (a, b) => _intersectX(a, b, maxx));
  if (pts.length < 3) return pts;
  pts = _shClip(pts, (p) => p[1] >= miny, (a, b) => _intersectY(a, b, miny));
  if (pts.length < 3) return pts;
  pts = _shClip(pts, (p) => p[1] <= maxy, (a, b) => _intersectY(a, b, maxy));
  return pts;
}

// Clip a GeoJSON Polygon's rings ([outer, ...holes]) to the AOI bbox. Returns
// null if the outer ring collapses (no area inside the bbox); holes that
// collapse are dropped. The result is a valid [outer, ...holes] coordinate
// array ready for polygonToCells.
export function _clipPolygonToBbox(coords, minx, miny, maxx, maxy) {
  const outer = _clipRingToBbox(coords[0], minx, miny, maxx, maxy);
  if (outer.length < 3) return null;
  const out = [outer];
  for (let h = 1; h < coords.length; h++) {
    const hole = _clipRingToBbox(coords[h], minx, miny, maxx, maxy);
    if (hole.length >= 3) out.push(hole);
  }
  return out;
}

// Padding applied to the clip bbox (degrees). The AOI bbox is derived from cell
// *centers*, but hexagon cells extend past their centers, so a cell whose center
// sits on the bbox edge could be dropped by h3 when the geometry is clipped
// exactly to that edge. A sub-cell pad keeps every AOI cell center strictly
// inside the clipped geometry; the inAoi filter afterwards keeps only true AOI
// cells, so no extra cells leak into the result.
const CLIP_PAD_DEG = 1e-6; // ~0.11 m, smaller than a res-15 cell radius

// Liang–Barsky clip of a single segment (x0,y0)-(x1,y1) to the axis-aligned
// rectangle. Returns the two clipped endpoints [[cx0,cy0],[cx1,cy1]], or null
// if the segment is fully outside the rectangle. Never throws.
function _clipSegmentLB(x0, y0, x1, y1, minx, miny, maxx, maxy) {
  let t0 = 0;
  let t1 = 1;
  const dx = x1 - x0;
  const dy = y1 - y0;
  // p/q for the four clip edges (left, right, bottom, top).
  const p = [-dx, dx, -dy, dy];
  const q = [x0 - minx, maxx - x0, y0 - miny, maxy - y0];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return null; // parallel to the edge and outside it
    } else {
      const r = q[i] / p[i];
      if (p[i] < 0) {
        if (r > t1) return null;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return null;
        if (r < t1) t1 = r;
      }
    }
  }
  return [
    [x0 + t0 * dx, y0 + t0 * dy],
    [x0 + t1 * dx, y0 + t1 * dy],
  ];
}

// Clip a polyline (array of [lng,lat]) to the AOI bbox. Returns an array of
// clipped sub-polylines (each an array of [lng,lat]); a line that exits and
// re-enters the bbox yields multiple disjoint sub-polylines. A line fully
// outside returns []. Used to shrink gridPathCells input for long linear
// features (rivers, motorways) that extend far past the AOI.
export function _clipLineToBbox(line, minx, miny, maxx, maxy) {
  if (!line || line.length < 2) return [];
  const out = [];
  let cur = null; // current (connected) clipped sub-polyline
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const clipped = _clipSegmentLB(a[0], a[1], b[0], b[1], minx, miny, maxx, maxy);
    if (!clipped) {
      if (cur) {
        out.push(cur);
        cur = null;
      }
      continue;
    }
    const cb = clipped[1];
    if (!cur) {
      cur = [clipped[0], cb];
    } else {
      // Consecutive segments of a continuous polyline share endpoints, so the
      // clipped start of this segment equals the previous clipped end; just
      // append the new end to keep the sub-polyline connected.
      cur.push(cb);
    }
  }
  if (cur) out.push(cur);
  return out;
}

// Rasterize an array of clipped sub-polylines (from _clipLineToBbox) into a flat
// cell array, reusing the line-cell cache per sub-polyline.
function _rasterizeClippedLines(clippedLines) {
  const cells = [];
  for (let i = 0; i < clippedLines.length; i++) {
    const sub = clippedLines[i];
    if (!sub || sub.length < 2) continue;
    const lineCells = getCachedLineCells(sub);
    for (let c = 0; c < lineCells.length; c++) cells.push(lineCells[c]);
  }
  return cells;
}

function getCachedPolyCells(coords) {
  // Fast bbox check: compute key only on cache miss (moved from top of function).
  // Include the H3 resolution in the key: the same geometry at a different
  // resolution yields different cells, so without it a resolution change would
  // silently return stale cached cells.
  const key =
    _computeBboxKey(coords) +
    ':' +
    _hashCoords(coords) +
    ':' +
    SIMULATION_PARAMS.h3StrideResolution;
  const cached = _polyCellsCache[key];
  if (cached) return cached;

  let result;
  try {
    result = polygonToCells(coords, SIMULATION_PARAMS.h3StrideResolution, true);
  } catch (err) {
    try {
      logger.warn('computeFastScan: polygonToCells failed for coords', { key, err });
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

// Cache gridPathCells results for line geometries (LineString / MultiLineString).
// A line is rasterized as a CORRIDOR of H3 cells along the polyline (see
// collectFastScanEntries), never as a filled area — passing a line's coordinates
// to polygonToCells would wrongly fill the polygon enclosed by the line's
// vertices (a ~10x over-coverage for a typical footway).
const _lineCellsCache = Object.create(null);
const _lineCellsCacheOrder = [];

// Dedicated hash for line coordinates: each entry is a [lng, lat] PAIR, not a
// ring of pairs, so the polygon hash (_hashCoords) cannot be reused here — it
// would treat every vertex number as a nested coordinate and produce colliding
// keys (and _computeBboxKey returns '' for lines).
function _hashLineCoords(coords) {
  if (!coords || !coords.length) return '';
  let h = 2166136261 >>> 0;
  for (let i = 0; i < coords.length; i++) {
    const c = coords[i] || [0, 0];
    h ^= Math.imul(Math.round((c[0] || 0) * 1e4), 16777619) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
    h ^= Math.imul(Math.round((c[1] || 0) * 1e4), 16777619) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(36);
}

function getCachedLineCells(coords) {
  const res = SIMULATION_PARAMS.h3StrideResolution;
  const key = _hashLineCoords(coords) + ':' + res;
  const cached = _lineCellsCache[key];
  if (cached) return cached;

  // Raw 1-cell-wide corridor along the polyline. Widening is now handled by
  // the accumulative gaussian path-blur (computePathBlurSnapshot) so the
  // corridor stays a thin thread here and the blur produces a smooth falloff
  // gated by landcover class.
  const lineCells = new Set();
  for (let i = 0; i < coords.length - 1; i++) {
    const a = latLngToCell(coords[i][1], coords[i][0], res);
    const b = latLngToCell(coords[i + 1][1], coords[i + 1][0], res);
    if (!a || !b) continue;
    let seg;
    try {
      seg = gridPathCells(a, b);
    } catch (err) {
      try {
        logger.warn('computeFastScan: gridPathCells failed for segment', { key, err });
      } catch (_e) {}
      seg = [];
    }
    for (let k = 0; k < seg.length; k++) lineCells.add(seg[k]);
  }

  const result = Array.from(lineCells);
  _lineCellsCache[key] = result;
  _lineCellsCacheOrder.push(key);
  if (_lineCellsCacheOrder.length > POLY_CELLS_CACHE_MAX) {
    const old = _lineCellsCacheOrder.shift();
    delete _lineCellsCache[old];
  }
  return result;
}

export function normalizeFrictionEntries(source) {
  if (!source) return Object.create(null);

  // Fast path: an already-normalized plain-object lookup is treated as
  // read-only by every caller (blur, gradient graph, mapping graph, agent
  // batches), so alias it directly instead of copying all N keys. This avoids
  // 2-3 full N-key object copies per mapping generation.
  if (typeof source === 'object' && !source.__flat && typeof source.entries !== 'function') {
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

function computeDijkstraGradientForLookup(targetCell, frictionLookup, r1Adjacency, viewHexes, frictionArr) {
  // review12 #7: when the SAB-backed `frictionArr` is shipped AND cross-origin
  // isolated, build the graph from the typed array (stable cache key across
  // batches) instead of re-normalizing a plain-object copy every batch.
  // Otherwise use the normalized plain-object path (preserves prior behavior).
  const useArrayFriction =
    frictionArr &&
    Array.isArray(viewHexes) &&
    viewHexes.length > 0 &&
    frictionArr.buffer instanceof SharedArrayBuffer;
  const graph = useArrayFriction
    ? getGradientGraphFromArray(frictionArr, r1Adjacency, viewHexes)
    : getGradientGraph(frictionLookup, r1Adjacency, viewHexes);
  return computeDijkstra(targetCell, frictionLookup, graph);
}

export function computeGradientBatch({ frictionEntries, targets, r1Adjacency, viewHexes, frictionArr = null } = {}) {
  const frictionLookup = normalizeFrictionEntries(frictionEntries);
  const gradients = Object.create(null);

  const total = targets ? targets.length : 0;
  const emitEvery = Math.max(1, Math.floor(total / 20));
  for (let i = 0; i < total; i++) {
    const targetCell = targets[i];
    gradients[targetCell] = computeDijkstraGradientForLookup(
      targetCell,
      frictionLookup,
      r1Adjacency,
      viewHexes,
      frictionArr
    );
    if (i % emitEvery === 0) emitProgress('gradient-batch', i + 1, total);
  }
  if (total > 0) emitProgress('gradient-batch', total, total);

  return gradients;
}

export function collectFastScanEntries({ features = [], viewHexes = [], aoiBbox = null } = {}) {
  // AOI membership filter. `queryRenderedFeatures` returns geometries that can
  // spill past the AOI hexes, so we keep only cells inside `viewHexes`. A single
  // O(N) Set is the only per-cell auxiliary structure we allocate — the previous
  // version additionally allocated `n*width` typed arrays (`layerFrictions` /
  // `hasLayer`, where `width` is the number of distinct vertical layers) plus a
  // `cellToIdx`/`idxToKey` pair and ran a full N-iteration reduction pass. For a
  // city-scale AOI that was hundreds of MB transient across the chunk workers and
  // is now gone: we accumulate straight into the string-keyed output objects the
  // caller actually consumes.
  const inAoi = viewHexes.length ? new Set(viewHexes) : null;

  // Pre-filter features by AOI bbox to skip expensive polygonToCells / gridPathCells
  // for geometries that are completely outside the AOI. The bbox check is O(1) per
  // feature vs O(V) for rasterization, so this is a net win whenever the viewport
  // is larger than the AOI (the common case after panning/zooming).
  const hasAoiBbox = Array.isArray(aoiBbox) && aoiBbox.length === 4;

  // Group features by surface classification tuple to enable batch processing.
  // Key: "layerKey|layerVal" → array of {geometry}. Distinct (layerKey, layerVal)
  // pairs are bounded by the number of surface types (a handful), so grouping is
  // cheap and the per-cell work stays O(cells · layers) with no wide matrices.
  const grouped = Object.create(null);
  for (let i = 0; i < features.length; i++) {
    const feature = features[i];
    if (!feature || !feature.geometry) continue;
    if (!FAST_SCAN_LAYERS.has(feature.sourceLayer)) continue;

    // Bbox pre-filter: skip features whose geometry bbox does not intersect
    // the AOI bbox. This avoids the expensive polygonToCells / gridPathCells
    // calls for out-of-AOI features. Use the Mapbox pre-computed bbox when
    // available to skip the O(V) coordinate walk entirely.
    let fBbox = null;
    if (hasAoiBbox) {
      fBbox = feature._bbox || (feature._bbox = computeFeatureBbox(feature.geometry, feature.bbox));
      if (fBbox && !bboxesIntersect(fBbox, aoiBbox)) continue;
    }

    const surface = getSurface(feature);
    if (!surface || !surface.layer || !surface.cost) continue;

    const layerKey = surface.layer;
    const layerVal = FRICTION_COSTS[surface.cost];
    if (typeof layerVal === 'undefined') continue;

    const groupKey = `${layerKey}|${layerVal}`;
    let group = grouped[groupKey];
    if (!group) group = grouped[groupKey] = { layerKey, layerVal, geometries: [] };
    // Carry the precomputed feature bbox so the rasterization pass can decide
    // whether to clip the geometry to the AOI bbox (see _clipPolygonToBbox).
    group.geometries.push({ geometry: feature.geometry, bbox: fBbox });
  }

  const multiFrictionEntries = Object.create(null);
  const lineCorridorCells = Object.create(null);

  // Single accumulation pass: for every AOI cell a feature covers, merge into
  // the per-layer slot via `mergeLayerFriction` (impassable wins, else hardest
  // walkable). The effective per-cell friction is derived afterwards from the
  // layer=0 entry only (see deriveCellFrictionFromLayers): bridges (layer=1)
  // and tunnels (layer=-1) do not affect the ground surface. This makes
  // overlapping same-level features resolve to the obstacle (if any) or the
  // hardest walkable surface, and is independent of feature order / chunk sharding.
  for (const group of Object.values(grouped)) {
    const { layerKey, layerVal, geometries } = group;
    for (let g = 0; g < geometries.length; g++) {
      const entry = geometries[g];
      const geometry = entry && entry.geometry;
      if (!geometry || !geometry.coordinates) continue;
      const fBbox = entry ? entry.bbox : null;

      // Rasterize the geometry to H3 cells by type:
      //  - LineString / MultiLineString: a CORRIDOR of cells along the line
      //    (gridPathCells between consecutive vertex cells). Passing a line's
      //    coordinates to polygonToCells would wrongly fill the enclosed area.
      //  - Polygon / MultiPolygon: the filled area (polygonToCells).
      let cells;
      let isLine = false;
      // Clip long linear features (rivers, motorways) to the AOI bbox when they
      // spill past it, so gridPathCells only rasterizes the in-AOI segment. It is
      // exact: AOI ⊂ bbox, so every AOI corridor cell on the original line is also
      // on the clipped line; the inAoi filter afterwards keeps only AOI cells.
      const clip = hasAoiBbox && fBbox && _extendsBeyond(fBbox, aoiBbox);
      const clipBbox = clip
        ? [
            aoiBbox[0] - CLIP_PAD_DEG,
            aoiBbox[1] - CLIP_PAD_DEG,
            aoiBbox[2] + CLIP_PAD_DEG,
            aoiBbox[3] + CLIP_PAD_DEG,
          ]
        : null;
      if (geometry.type === 'LineString') {
        cells = clip
          ? _rasterizeClippedLines(
              _clipLineToBbox(geometry.coordinates, clipBbox[0], clipBbox[1], clipBbox[2], clipBbox[3]),
            )
          : getCachedLineCells(geometry.coordinates);
        isLine = true;
      } else if (geometry.type === 'MultiLineString') {
        cells = [];
        const lines = geometry.coordinates;
        for (let l = 0; l < lines.length; l++) {
          const lineCells = clip
            ? _rasterizeClippedLines(
                _clipLineToBbox(lines[l], clipBbox[0], clipBbox[1], clipBbox[2], clipBbox[3]),
              )
            : getCachedLineCells(lines[l]);
          for (let c = 0; c < lineCells.length; c++) cells.push(lineCells[c]);
        }
        isLine = true;
      } else {
        const coordsArray =
          geometry.type === 'MultiPolygon' ? geometry.coordinates : [geometry.coordinates];
        // Clip each polygon to the AOI bbox when the feature spills past it. This
        // shrinks the polygonToCells input for large features (water bodies,
        // parks, landuse zones) so we rasterize only the in-AOI portion. It is
        // exact: the AOI polygon is contained in its own bbox, so every AOI cell
        // center lies inside the bbox; the inAoi filter afterwards keeps only AOI
        // cells, so the result is identical to rasterizing the full geometry.
        //
        // The AOI bbox is derived from cell *centers*, but hexagon cells extend
        // past their centers, so a cell whose center sits on the bbox edge can be
        // dropped by polygonToCells when the polygon is clipped exactly to that
        // edge. We pad the clip bbox by a small epsilon (well under one cell) so
        // the clipped polygon still fully contains every AOI cell center. The pad
        // only adds a thin margin to the rasterized area; the inAoi filter keeps
        // only true AOI cells, so no extra cells leak into the result.
        const clip = hasAoiBbox && fBbox && _extendsBeyond(fBbox, aoiBbox);
        cells = [];
        for (let p = 0; p < coordsArray.length; p++) {
          const polyCoords = clip
            ? _clipPolygonToBbox(
                coordsArray[p],
                aoiBbox[0] - CLIP_PAD_DEG,
                aoiBbox[1] - CLIP_PAD_DEG,
                aoiBbox[2] + CLIP_PAD_DEG,
                aoiBbox[3] + CLIP_PAD_DEG,
              )
            : coordsArray[p];
          if (!polyCoords) continue;
          const polyCells = getCachedPolyCells(polyCoords);
          if (!polyCells) continue;
          for (let c = 0; c < polyCells.length; c++) cells.push(polyCells[c]);
        }
      }

      for (let c = 0; c < cells.length; c++) {
        const cell = cells[c];
        if (inAoi && !inAoi.has(cell)) continue; // outside AOI
        if (isLine) lineCorridorCells[cell] = true;
        let entry = multiFrictionEntries[cell];
        if (!entry) {
          entry = Object.create(null);
          multiFrictionEntries[cell] = entry;
        }
        // Per (cell, layer) merge: impassable wins, else hardest walkable.
        entry[layerKey] = mergeLayerFriction(entry[layerKey], layerVal);
      }
    }
  }

  // Effective per-cell friction: layer=0 only (ground surface). Bridges and
  // underground features do not affect the walkable surface.
  const cellFrictionEntries = deriveCellFrictionFromLayers(multiFrictionEntries);

  return { multiFrictionEntries, cellFrictionEntries, lineCorridorCells };
}

export function computeFastScanSnapshot({ features = [], viewHexes = [], aoiBbox = null } = {}) {
  try {
    const { multiFrictionEntries, cellFrictionEntries, lineCorridorCells } = collectFastScanEntries({
      features,
      viewHexes,
      aoiBbox,
    });
    const blur = computeImpassableBlurSnapshot({ frictionEntries: cellFrictionEntries });
    const pathBlur = computePathBlurSnapshot({
      corridorCells: Object.keys(lineCorridorCells),
      multiFrictionEntries,
      cellFrictionEntries,
    });
    return {
      multiFrictionEntries,
      cellFrictionEntries,
      lineCorridorCells,
      blurWeights: blur.blurWeights,
      blurUpdates: blur.updates,
      blurUpdateMap: blur.blurUpdateMap,
      pathBlurWeights: pathBlur.pathBlurWeights,
      pathBlurUpdates: pathBlur.updates,
      pathBlurUpdateMap: pathBlur.pathBlurUpdateMap,
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
      lineCorridorCells: Object.create(null),
      blurWeights: Object.create(null),
      blurUpdates: [],
      blurUpdateMap: null,
      pathBlurWeights: Object.create(null),
      pathBlurUpdates: [],
      pathBlurUpdateMap: null,
    };
  }
}

export function computeFastScanChunkSnapshot({ features = [], viewHexes = [], aoiBbox = null } = {}) {
  try {
    return collectFastScanEntries({ features, viewHexes, aoiBbox });
  } catch (err) {
    try {
      console.error &&
        console.error('computeFastScanChunkSnapshot failed', {
          err,
          featuresCount: (features && features.length) || 0,
        });
    } catch (_e) {}
    return { multiFrictionEntries: Object.create(null), cellFrictionEntries: Object.create(null), lineCorridorCells: Object.create(null) };
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

  // Always run in index space over the shared r=1 CSR. The legacy string-keyed
  // BFS (gridDisk + per-cell nbrCache) is removed — production always supplies
  // r1Adjacency + viewHexes (grid.js), and the fallback allocated a neighbor-disk
  // cache per cell for no benefit. Derive viewHexes/r1Adjacency when a caller
  // omits them (e.g. direct unit tests) so the single code path still works, and
  // degrade to an empty result on malformed input (e.g. invalid H3 ids).
  const vh = viewHexes && viewHexes.length ? viewHexes : Object.keys(frictionLookup);
  let adj = r1Adjacency;
  if (!adj || adj.N !== vh.length) {
    try {
      adj = buildR1Adjacency({ viewHexes: vh });
    } catch (_e) {
      return { blurWeights: Object.create(null), updates: [] };
    }
  }

  // Collect impassable sources as viewHexes indices. `vh` is already
  // index-ordered (vh[i] is the cell at index i), so we scan it directly — no
  // idxOf N-key object and no `for...in` over the friction map (P3/H1).
  const impassables = [];
  for (let i = 0; i < vh.length; i++) {
    if (frictionLookup[vh[i]] >= FRICTION_COSTS.IMPASSABLE) impassables.push(i);
  }
  if (impassables.length === 0 || radius < 1)
    return { blurWeights: Object.create(null), updates: [] };

  // Pre-compute gaussian weights per distance to avoid repeated Math.exp calls
  const gaussianWeights = new Array(radius + 1);
  for (let d = 1; d <= radius; d++) {
    gaussianWeights[d] = Math.exp(-0.5 * Math.pow(d / sigma, 2));
  }

  const blurWeights = Object.create(null);
  const impassableLimit = FRICTION_COSTS.IMPASSABLE - 1;
  const updates = [];

  // Accumulate the gaussian blur weight from EVERY impassable source within
  // `radius` (not just the nearest). A cell bordered by several barriers — a
  // concave corner or alcove — therefore receives the SUM of their contributions
  // and is penalized more than a cell next to a single barrier, matching real
  // life where building edges and tight corners are rougher / less walkable.
  const { offsets, neighbors, N } = adj;
  const accum = new Float32Array(N);
  if (impassables.length && radius >= 1) {
    // Per-source BFS over the shared r=1 CSR. `seen` is a generation marker so we
    // avoid zeroing the whole array per source; `genQ` is reused across sources.
    const seen = new Int32Array(N);
    const genQ = new Int32Array(N);
    let gen = 0;
    for (let si = 0; si < impassables.length; si++) {
      const src = impassables[si];
      gen++;
      let qh = 0;
      let qt = 0;
      seen[src] = gen;
      genQ[qt++] = src;
      let d = 0;
      while (d < radius && qh < qt) {
        // Ring-buffer BFS: process exactly the current frontier, appending the
        // next level after it. Each cell is enqueued at most once per source
        // (seen check), so there is no per-level allocation.
        const levelEnd = qt;
        d++;
        const w = gaussianWeights[d];
        for (let i = qh; i < levelEnd; i++) {
          const cell = genQ[i];
          const s = offsets[cell];
          const e = offsets[cell + 1];
          for (let x = s; x < e; x++) {
            const nc = neighbors[x];
            if (seen[nc] !== gen) {
              seen[nc] = gen;
              // Propagate through barriers (prior behavior) but only accumulate
              // weight for walkable cells. `nc` is a viewHexes index, so resolve
              // the cell string via `vh[nc]` before the friction lookup.
              if (frictionLookup[vh[nc]] < FRICTION_COSTS.IMPASSABLE) {
                accum[nc] += w;
              }
              genQ[qt++] = nc;
            }
          }
        }
        qh = levelEnd;
      }
    }
  }

  // Build updates in a single pass over all cells. `blurUpdateMap` is the
  // cell→newFriction override the merge step needs; returning it directly avoids
  // the main thread rebuilding an equivalent object from `updates` (an O(U) loop
  // + allocation) on every mapping build.
  const blurUpdateMap = Object.create(null);
  for (let idx = 0; idx < N; idx++) {
    const weight = accum[idx];
    if (weight <= 0) continue;
    const cell = vh[idx];
    if (frictionLookup[cell] >= FRICTION_COSTS.IMPASSABLE) continue;
    blurWeights[cell] = weight;
    const fr = Math.min(impassableLimit, (frictionLookup[cell] ?? FRICTION_COSTS.PAVEMENT) + weight * addFactor);
    blurUpdateMap[cell] = fr;
    updates.push([cell, fr]);
  }

  return { blurWeights, updates, blurUpdateMap };
}

/**
 * Accumulative gaussian blur that widens a raw 1-cell line corridor into a
 * smooth, landcover-gated path. Mirrors the BFS pattern of
 * `computeImpassableBlurSnapshot` but reduces friction and boosts affordance
 * (the opposite direction) so the widened corridor becomes more walkable.
 *
 * Landcover gating: cells classified as IMPASSABLE or HEAVY_GRASS by the
 * fast-scan layer map are excluded from widening — the BFS does not propagate
 * through them, so paths do not expand into bush / keep-off terrain.
 *
 * @param {string[]} corridorCells       raw 1-cell corridor from line features
 * @param {Object}   multiFrictionEntries { cell: { layer: friction } } fast-scan layers
 * @param {Object}   cellFrictionEntries { cell: number } effective per-cell friction
 * @param {string[]} [viewHexes]         AOI cell list (defaults to friction keys)
 * @param {Object}   [r1Adjacency]       shared r=1 CSR (built on fallback)
 * @param {number}   [radius]            gaussian radius in H3 rings (default PATH_BLUR_RADIUS)
 * @param {number}   [sigma]             gaussian sigma (default PATH_BLUR_SIGMA)
 * @param {number}   [frictionAdd]       max friction reduction (default PATH_BLUR_FRICTION_ADD)
 * @param {boolean}  [landcoverGate]     gate by landcover class (default PATH_BLUR_LANDCOVER_GATE)
 *
 * @returns {{ pathBlurWeights: Object, pathBlurUpdateMap: Object, updates: Array }}
 */
export function computePathBlurSnapshot({
  corridorCells = [],
  multiFrictionEntries = Object.create(null),
  cellFrictionEntries = Object.create(null),
  viewHexes,
  r1Adjacency,
  radius = PATH_BLUR_RADIUS,
  sigma = PATH_BLUR_SIGMA,
  frictionAdd = PATH_BLUR_FRICTION_ADD,
  landcoverGate = PATH_BLUR_LANDCOVER_GATE,
} = {}) {
  const frictionLookup = normalizeFrictionEntries(cellFrictionEntries);

  const vh = viewHexes && viewHexes.length ? viewHexes : Object.keys(frictionLookup);
  let adj = r1Adjacency;
  if (!adj || adj.N !== vh.length) {
    try {
      adj = buildR1Adjacency({ viewHexes: vh });
    } catch (_e) {
      return { pathBlurWeights: Object.create(null), pathBlurUpdateMap: Object.create(null), updates: [] };
    }
  }

  if (!corridorCells.length || radius < 1)
    return { pathBlurWeights: Object.create(null), pathBlurUpdateMap: Object.create(null), updates: [] };

  // Build cell→index map for corridor lookup
  const cellToIdx = Object.create(null);
  for (let i = 0; i < vh.length; i++) cellToIdx[vh[i]] = i;

  // Collect corridor source indices
  const sources = [];
  for (let s = 0; s < corridorCells.length; s++) {
    const idx = cellToIdx[corridorCells[s]];
    if (idx !== undefined) sources.push(idx);
  }
  if (sources.length === 0)
    return { pathBlurWeights: Object.create(null), pathBlurUpdateMap: Object.create(null), updates: [] };

  // Pre-compute gaussian weights per distance
  const gaussianWeights = new Array(radius + 1);
  for (let d = 1; d <= radius; d++) {
    gaussianWeights[d] = Math.exp(-0.5 * Math.pow(d / sigma, 2));
  }

  // Landcover gating: mark cells prohibited by any layer (IMPASSABLE or HEAVY_GRASS)
  const prohibited = new Int8Array(vh.length);
  if (landcoverGate && multiFrictionEntries) {
    for (let i = 0; i < vh.length; i++) {
      const cell = vh[i];
      const layers = multiFrictionEntries[cell];
      if (!layers) continue;
      const vals = Object.values(layers);
      for (let l = 0; l < vals.length; l++) {
        if (vals[l] >= FRICTION_COSTS.HEAVY_GRASS) {
          prohibited[i] = 1;
          break;
        }
      }
    }
  }

  const pathBlurWeights = Object.create(null);
  const pathBlurUpdateMap = Object.create(null);
  const updates = [];

  // Accumulate gaussian weight from EVERY corridor source within radius.
  // A cell bordered by several path segments receives the SUM of their
  // contributions and is widened more than a cell next to a single segment.
  const { offsets, neighbors, N } = adj;
  const accum = new Float32Array(N);
  if (sources.length && radius >= 1) {
    const seen = new Int32Array(N);
    const genQ = new Int32Array(N);
    let gen = 0;
    for (let si = 0; si < sources.length; si++) {
      const src = sources[si];
      gen++;
      let qh = 0;
      let qt = 0;
      seen[src] = gen;
      genQ[qt++] = src;
      let d = 0;
      while (d < radius && qh < qt) {
        const levelEnd = qt;
        d++;
        const w = gaussianWeights[d];
        for (let i = qh; i < levelEnd; i++) {
          const cell = genQ[i];
          const s = offsets[cell];
          const e = offsets[cell + 1];
          for (let x = s; x < e; x++) {
            const nc = neighbors[x];
            if (seen[nc] !== gen) {
              seen[nc] = gen;
              // Landcover gate: mark as seen but do not enqueue or accumulate
              if (prohibited[nc]) continue;
              genQ[qt++] = nc;
              if ((frictionLookup[vh[nc]] ?? FRICTION_COSTS.PAVEMENT) < FRICTION_COSTS.IMPASSABLE) {
                accum[nc] += w;
              }
            }
          }
        }
        qh = levelEnd;
      }
    }
  }

  // Build updates in a single pass. Corridor cells themselves (d=0) are not
  // modified — they already carry the path's surface friction. Only neighbors
  // reached by the BFS (d>=1) get the widening treatment.
  for (let idx = 0; idx < N; idx++) {
    const weight = accum[idx];
    if (weight <= 0) continue;
    const cell = vh[idx];
    if (frictionLookup[cell] >= FRICTION_COSTS.IMPASSABLE) continue;

    pathBlurWeights[cell] = weight;
    const baseFriction = frictionLookup[cell] ?? FRICTION_COSTS.PAVEMENT;
    const reducedFriction = Math.max(FRICTION_COSTS.PAVEMENT, baseFriction - weight * frictionAdd);
    pathBlurUpdateMap[cell] = reducedFriction;
    updates.push([cell, reducedFriction, weight]);
  }

  return { pathBlurWeights, pathBlurUpdateMap, updates };
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
// `gridDisk(cell, 1)` and looked friction up in a plain-object map. That paid ~shards×V `gridDisk` calls and re-flattened the
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
  // `idxOf` is built only for this function's own use (the single gridDisk pass)
  // and is deliberately dropped from the return value — returning it would
  // structured-clone a ~500k-key object across the worker boundary (into both
  // the blur and mapping-graph workers) on every mapping build.
  const idxOf = Object.create(null);
  for (let i = 0; i < N; i++) idxOf[viewHexes[i]] = i;

  // Single flat `gridDisk` pass into one contiguous temp buffer (not N
  // intermediate arrays), then prefix-sum + compact — the shape that is correct
  // at any N (the old V-arrays form previously corrupted at city scale).
  // The temp/deg buffers are short-lived scratch; only `offsets`/`neighbors` are
  // returned. Allocate those via `allocTransferBuffer` so they are SAB-backed
  // when the page is cross-origin isolated and can be SHARED (zero-copy) with
  // the blur and mapping-graph workers instead of structured-cloned (P1).
  const temp = new Int32Array(N * 6);
  const deg = new Int32Array(N);
  let tempPos = 0;
  for (let i = 0; i < N; i++) {
    const cell = viewHexes[i];
    // `gridRingUnsafe(cell, 1)` returns the 6 ring-1 neighbors directly (no
    // center, no validation) — faster than `gridDisk(cell, 1)` and exactly the
    // neighbor set adjacency wants. `viewHexes` are guaranteed-valid H3 cells.
    const disk = gridRingUnsafe(cell, 1);
    for (let k = 0; k < disk.length; k++) {
      const nb = disk[k];
      if (nb === cell) continue; // skip the center
      const j = idxOf[nb];
      if (j === undefined) continue; // out of AOI
      temp[tempPos++] = j;
      deg[i]++;
    }
  }

  const offsets = new Int32Array(allocTransferBuffer((N + 1) * 4));
  for (let i = 0; i < N; i++) offsets[i + 1] = offsets[i] + deg[i];

  const neighbors = new Int32Array(allocTransferBuffer(offsets[N] * 4));
  let w = 0;
  for (let i = 0; i < N; i++) {
    const start = offsets[i];
    const end = offsets[i + 1];
    for (let e = start; e < end; e++) neighbors[w++] = temp[e];
  }

  return { N, offsets, neighbors };
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
 *            frictionArr:Float32Array(N), latLngArr:Float32Array(8N) }
 */
export function buildMappingGraph({ frictionEntries, viewHexes, r1Adjacency } = {}) {
  const frictionLookup = normalizeFrictionEntries(frictionEntries);
  const N = viewHexes ? viewHexes.length : 0;
  const impassable = FRICTION_COSTS.IMPASSABLE;

  // SAB-backed when cross-origin isolated so posting the graph to the visibility
  // shard workers is zero-copy (no per-shard structured clone of a large graph).
  const frictionArr = new Float32Array(allocTransferBuffer(N * 4));
  // 8 floats/cell: [lat, lng, latRad, lngRad, sinLat, cosLat, sinLng, cosLng].
  // The per-cell sin/cos are precomputed once here (this loop already pays the
  // N `cellToLatLng` calls) so the visibility BFS can derive each bearing with a
  // single `atan2` instead of ~5 trig calls per visible pair (P0).
  const latLngArr = new Float32Array(allocTransferBuffer(N * 8 * 4));
  for (let i = 0; i < N; i++) {
    const cell = viewHexes[i];
    const f = frictionLookup[cell] ?? FRICTION_COSTS.PAVEMENT;
    frictionArr[i] = f < impassable ? f : -1; // -1 marks impassable / missing
    const ll = cellToLatLng(cell);
    const latRad = (ll[0] * Math.PI) / 180;
    const lngRad = (ll[1] * Math.PI) / 180;
    const b = i * 8;
    latLngArr[b] = ll[0];
    latLngArr[b + 1] = ll[1];
    latLngArr[b + 2] = latRad;
    latLngArr[b + 3] = lngRad;
    latLngArr[b + 4] = Math.sin(latRad);
    latLngArr[b + 5] = Math.cos(latRad);
    latLngArr[b + 6] = Math.sin(lngRad);
    latLngArr[b + 7] = Math.cos(lngRad);
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
    // Fallback path only: build cell→index for the gridDisk neighbor lookup
    // below. The shared r1Adjacency path reuses its CSR instead, so it must not
    // pay for this ~500k-key object on the common code path.
    const idxOf = Object.create(null);
    for (let i = 0; i < N; i++) idxOf[viewHexes[i]] = i;
    const temp = new Int32Array(N * 6);
    const deg = new Int32Array(N);
    let tempPos = 0;
    for (let i = 0; i < N; i++) {
      if (frictionArr[i] < 0) continue; // impassable cells get an empty row
      const cell = viewHexes[i];
      const disk = gridRingUnsafe(cell, 1);
      for (let k = 0; k < disk.length; k++) {
        const nb = disk[k];
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
 * In-place quicksort of `order[lo..hi]` by the key `arr[base + order[k]]`
 * (neighbor index). Used to sort each origin's CSR slice so bearings/visibility
 * can be binary-searched (O(log P_i) per neighbor) instead of materializing a
 * per-pair Map. Recurses into the smaller side only to bound stack depth.
 */
function sortNeighborsSlice(order, lo, hi, arr, base) {
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const pivot = arr[base + order[mid]];
    let i = lo;
    let j = hi;
    while (i <= j) {
      while (arr[base + order[i]] < pivot) i++;
      while (arr[base + order[j]] > pivot) j--;
      if (i <= j) {
        const t = order[i];
        order[i] = order[j];
        order[j] = t;
        i++;
        j--;
      }
    }
    if (j - lo < hi - i) {
      if (lo < j) sortNeighborsSlice(order, lo, j, arr, base);
      lo = i;
    } else {
      if (i < hi) sortNeighborsSlice(order, i, hi, arr, base);
      hi = j;
    }
  }
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

  // Single BFS pass: for each origin we flood-fill to visionDepth and, as each
  // visible neighbor is first discovered, append its index to `visNeighbors` and
  // write its bearing (origin→neighbor, from latLngArr) into `bearings`. This
  // folds the old "count pass" + "write pass" into ONE traversal — the BFS was
  // the dominant cost (degree-6 expansion of ~3·d² cells/origin), so running it
  // once instead of twice roughly halves the shard's CPU. `localOffsets` is the
  // running prefix sum of pair counts, so the merge step still works unchanged.
  //
  // `visNeighbors`/`bearings` grow on demand (doubling) so we never over-allocate
  // to the worst-case P (which would be ~3·visionDepth²·M Int32s — gigabytes for
  // a city) yet never overflow mid-origin (each origin contributes at most
  // `maxPairsPerOrigin` pairs, reserved up front before its BFS).
  const maxPairsPerOrigin = 1 + 3 * visionDepth * (visionDepth + 1);
  let cap = Math.max(16, Math.min(M * maxPairsPerOrigin, M * 64));
  let visNeighbors = new Int32Array(cap);
  // Bearings are quantized to integer degrees in [0,360) and packed to Uint16
  // downstream (P2/D3), so store them as Uint16 here directly — this halves the
  // intermediate bearing memory (the old Float32 buffer was 2× the final size
  // and only re-quantized at pack time). Values fit: 360 < 65535.
  let bearings = new Uint16Array(cap);
  let writePos = 0;

  // Scratch for sorting each origin's neighbor slice by index (see below). Sized
  // to the worst-case pairs for one origin, so no per-origin allocation/GC churn.
  const sortIdx = new Int32Array(maxPairsPerOrigin);
  const sortNbr = new Int32Array(maxPairsPerOrigin);
  const sortBrg = new Uint16Array(maxPairsPerOrigin);

  for (let j = 0; j < M; j++) {
    const start = origins ? origins[j] : j;
    if (frictionArr[start] < 0) {
      localOffsets[j + 1] = localOffsets[j];
      continue;
    }
    // Reserve this origin's worst-case pair count so the BFS below never overflows.
    if (writePos + maxPairsPerOrigin > visNeighbors.length) {
      let nc = visNeighbors.length;
      while (nc < writePos + maxPairsPerOrigin) nc *= 2;
      const vg = new Int32Array(nc);
      vg.set(visNeighbors.subarray(0, writePos));
      visNeighbors = vg;
      const bg = new Uint16Array(nc);
      bg.set(bearings.subarray(0, writePos));
      bearings = bg;
    }

    gen++;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    visited[start] = gen;
    const b = start * 8;
    // Precomputed per-origin sin/cos (latLngArr stride is 8 floats/cell).
    const sSinLat = latLngArr[b + 4];
    const sCosLat = latLngArr[b + 5];
    const sSinLng = latLngArr[b + 6];
    const sCosLng = latLngArr[b + 7];
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
          visNeighbors[writePos] = nb;
          const n = nb * 8;
          // Per-cell sin/cos are precomputed in buildMappingGraph, so the
          // longitude-difference sin/cos are pure multiply/add (no trig per
          // pair). Only `atan2` remains — ~5x fewer trig calls than before (P0).
          const nSinLat = latLngArr[n + 4];
          const nCosLat = latLngArr[n + 5];
          const nSinLng = latLngArr[n + 6];
          const nCosLng = latLngArr[n + 7];
          const sinDLng = nSinLng * sCosLng - nCosLng * sSinLng;
          const cosDLng = nCosLng * sCosLng + nSinLng * sSinLng;
          const y = sinDLng * nCosLat;
          const bx = sCosLat * nSinLat - sSinLat * nCosLat * cosDLng;
          // Round to integer degrees; packing quantizes to Uint16 (P2/D3) which
          // truncates, so rounding here keeps the quantization error symmetric
          // (±0.5°) instead of biased toward zero.
          bearings[writePos] = Math.round(((Math.atan2(y, bx) * 180) / Math.PI + 360) % 360);
          writePos++;
          queue[tail++] = nb;
        }
      }
      levelSize = tail - head;
      dist++;
    }

    // Sort this origin's [start, end) slice by neighbor index so the CSR can be
    // binary-searched in getBestNextStep (O(log P_i) per neighbor) instead of
    // materializing a per-pair Map. The slice is contiguous and fully written
    // here (writePos === localOffsets[j] + count); later origins only append
    // after writePos, so sorting now is safe and the order survives the
    // merge/pack steps that copy slices in place.
    const s0 = localOffsets[j];
    const e0 = writePos;
    const len = e0 - s0;
    if (len > 1) {
      for (let k = 0; k < len; k++) sortIdx[k] = k;
      sortNeighborsSlice(sortIdx, 0, len - 1, visNeighbors, s0);
      for (let k = 0; k < len; k++) {
        sortNbr[k] = visNeighbors[s0 + sortIdx[k]];
        sortBrg[k] = bearings[s0 + sortIdx[k]];
      }
      for (let k = 0; k < len; k++) {
        visNeighbors[s0 + k] = sortNbr[k];
        bearings[s0 + k] = sortBrg[k];
      }
    }

    // Proper prefix sum: localOffsets[j+1] = localOffsets[j] + count_j, so
    // localOffsets[M] is the TOTAL pair count P and (localOffsets[j+1] -
    // localOffsets[j]) is exactly this origin's pair count for the merge.
    localOffsets[j + 1] = localOffsets[j] + count;
  }
  const P = writePos;

  // Trim to exact size (drop any unused growth headroom) for a compact transfer.
  if (P < visNeighbors.length) {
    const vTrim = new Int32Array(P);
    vTrim.set(visNeighbors.subarray(0, P));
    visNeighbors = vTrim;
    const bTrim = new Uint16Array(P);
    bTrim.set(bearings.subarray(0, P));
    bearings = bTrim;
  }

  const globalIdx = origins ? Int32Array.from(origins) : null;
  return { N, P, localOffsets, visNeighbors, bearings, globalIdx };
}

/**
 * Per-cell mapping assembly for a shard of cells (runs in a worker).
 *
 * Mirrors the body of the old single-threaded merge loop in `triggerFastScan`:
 * for each cell it merges its multi-friction layer map, computes the effective
 * friction (layer=0 only, or the fast-scan fallback), applies the
 * impassable-blur friction update, classifies affordance (with the blur-weight
 * penalty), and produces the merged layer map. Cells are independent, so this
 * is embarrassingly parallel — the orchestrator shards `viewHexes` and merges
 * the results. Returns flat typed arrays + per-cell layer maps so the main
 * thread only does O(N) assignments (no min-reduction / classification / object
 * construction on the UI thread).
 *
 * @param cells            subset of viewHexes this shard owns
 * @param cellFrictionEntries { cell: number } fast-scan fallback friction
 * @param blurUpdateMap    { cell: number } | null  blur friction overrides
 * @param blurWeights      { cell: number } | null  blur affordance penalties
 *
 * NOTE: the per-cell layer map (`multiFrictionMap` entry) is NOT handled here.
 * The merge worker never reads its contents — it only needs the already-reduced
 * min friction (`cellFrictionEntries`). Shipping the N layer-map objects to the
 * worker and back was pure structured-clone waste (P2-9); the main thread holds
 * `multiEntries` from the fast-scan pass and writes it into `multiFrictionMap`
 * directly. So this function returns only the typed friction/affordance arrays.
 */
export function mergeCellsChunk({
  cells = [],
  cellFrictionEntries = Object.create(null),
  blurUpdateMap = null,
  blurWeights = null,
  pathBlurUpdateMap = null,
  pathBlurWeights = null,
} = {}) {
  const n = cells.length;
  // Float32 is ample: friction lives in [1, ~7] (+ blur) and affordance in
  // [0, 1], so the 24-bit mantissa preserves every value exactly. Using
  // Float32 (not Float64) halves the per-cell working memory in the merge
  // worker; the caller writes these straight into Float32Array-backed
  // FrictionArrayMaps, so there is no precision loss on the way out.
  const frictionArr = new Float32Array(n);
  const affArr = new Float32Array(n);

  const penalty = IMPASSABLE_BLUR_AFFORDANCE_PENALTY;
  const affordanceBoost = PATH_BLUR_AFFORDANCE_BOOST;

  for (let i = 0; i < n; i++) {
    const cell = cells[i];

    // `cellFrictionEntries[cell]` already holds the effective friction (the min
    // across vertical layers of the per-layer MAX friction, computed once in the
    // fast-scan pass), so reuse it directly instead of re-reducing the layer map
    // here.
    let fr = cellFrictionEntries[cell] ?? FRICTION_COSTS.PAVEMENT;

    // Apply the impassable blur friction override (nudge routing around obstacles).
    if (blurUpdateMap) {
      const blurred = blurUpdateMap[cell];
      if (blurred !== undefined) fr = blurred;
    }

    // Apply the path blur friction reduction (widen the corridor into adjacent
    // walkable cells, gated by landcover class in the BFS that produced
    // `pathBlurUpdateMap`). Applied AFTER impassable blur so obstacle avoidance
    // still wins when a path runs tight against a building.
    if (pathBlurUpdateMap) {
      const widened = pathBlurUpdateMap[cell];
      if (widened !== undefined) fr = widened;
    }

    // Affordance classification via the single canonical tier classifier.
    let aff = AFFORDANCE[classifyFrictionTier(fr).toUpperCase()];

    // Apply the blur affordance penalty (cells adjacent to buildings wear faster).
    if (blurWeights) {
      const weight = blurWeights[cell];
      if (weight != null) aff = Math.max(0.0, aff - Math.min(aff, weight * penalty));
    }

    // Apply the path blur affordance boost (widened corridor cells are more
    // attractive). Applied AFTER the impassable penalty so obstacle proximity
    // still reduces attractiveness.
    if (pathBlurWeights) {
      const weight = pathBlurWeights[cell];
      if (weight != null) aff = Math.min(1.0, aff + Math.min(1.0 - aff, weight * affordanceBoost));
    }

    frictionArr[i] = fr;
    affArr[i] = aff;
  }

  // `cells` is the caller's own `viewHexes` slice; the main thread iterates
  // `viewHexes` by index and never reads it back, so dropping it here avoids
  // structured-cloning N cell strings across the worker boundary (P1).
  return { frictionArr, affArr };
}
