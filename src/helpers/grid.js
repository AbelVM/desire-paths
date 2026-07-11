import { polygonToCells, latLngToCell, gridPathCells } from 'h3-js';
import { FRICTION_COSTS, AFFORDANCE, PATH_CACHE_MAX, POLY_CACHE_MAX, SIMULATION_PARAMS } from './constants.js';
import {
  runFastScanTask,
  runAoiHexesTask,
  runBuildMappingGraph,
  runBuildR1Adjacency,
  runVisibilityBearingTask,
  runMergeCellsTask,
} from './spatialWorker.js';
import { clearComputeCaches, clearGradientCache } from './compute.js';
import { invalidateGradientGraph } from './dijkstra.js';
import { buildCellToIdx, FrictionArrayMap } from './frictionStore.js';

// Low-allocation AOI key: bounding-box string with limited precision
function _aoiKey(poly) {
  if (!poly || !poly.length) return '';
  let minx = Infinity,
    miny = Infinity,
    maxx = -Infinity,
    maxy = -Infinity;
  for (let i = 0; i < poly.length; i++) {
    const ring = poly[i] || [];
    for (let j = 0; j < ring.length; j++) {
      const coord = ring[j] || [0, 0];
      const lng = coord[0];
      const lat = coord[1];
      if (lng < minx) minx = lng;
      if (lng > maxx) maxx = lng;
      if (lat < miny) miny = lat;
      if (lat > maxy) maxy = lat;
    }
  }
  if (!isFinite(minx)) return '';
  return `${minx.toFixed(6)}:${miny.toFixed(6)}:${maxx.toFixed(6)}:${maxy.toFixed(6)}`;
}

// Low-allocation polygon key: bounding box + point count + endpoints
function _polyKey(coords) {
  if (!coords || !coords.length) return '';
  let minx = Infinity,
    miny = Infinity,
    maxx = -Infinity,
    maxy = -Infinity;
  let points = 0;
  let firstLng = 0,
    firstLat = 0,
    lastLng = 0,
    lastLat = 0;
  for (let i = 0; i < coords.length; i++) {
    const ring = coords[i] || [];
    points += ring.length;
    for (let j = 0; j < ring.length; j++) {
      const coord = ring[j] || [0, 0];
      const lng = coord[0];
      const lat = coord[1];
      if (lng < minx) minx = lng;
      if (lng > maxx) maxx = lng;
      if (lat < miny) miny = lat;
      if (lat > maxy) maxy = lat;
      if (i === 0 && j === 0) {
        firstLng = lng;
        firstLat = lat;
      }
      lastLng = lng;
      lastLat = lat;
    }
  }
  if (!isFinite(minx)) return '';
  return `${minx.toFixed(6)}:${miny.toFixed(6)}:${maxx.toFixed(6)}:${maxy.toFixed(6)}:${points}:${firstLng.toFixed(6)}:${firstLat.toFixed(6)}:${lastLng.toFixed(6)}:${lastLat.toFixed(6)}`;
}

export function getHexes(state, _mapInstance) {
  // No AOI yet (e.g. surface polygons drawn before any start/end node exists) —
  // nothing to generate hexes for. Return an empty array so callers skip
  // gracefully (updateLayers bails on a zero-length hex set).
  if (!state.aoi_polygon || !state.aoi_polygon.length) return [];
  const aoiKey = _aoiKey(state.aoi_polygon);
  const cacheKey = `${aoiKey}:${SIMULATION_PARAMS.h3StrideResolution}`;
  // Return cached hexes when AOI and resolution haven't changed to avoid repeated expensive H3 calls
  if (state._cachedViewHexes && state._cachedAoiKey === cacheKey) return state._cachedViewHexes;
  let hexes;
  try {
    // `state.aoi_polygon` is GeoJSON ([lng, lat]). Use the isGeoJson flag.
    hexes = polygonToCells(state.aoi_polygon, SIMULATION_PARAMS.h3StrideResolution, true);
  } catch (e) {
    console.error('Error generating hexes for AOI. Please check your AOI geometry.', e);
    return;
  }
  state._cachedViewHexes = hexes;
  state._cachedAoiKey = cacheKey;
  return hexes;
}

/**
 * Fast Grid Building using unified Bounding Box updates.
 * Runs AOI hex generation in a worker (off main thread) in parallel with
 * queryRenderedFeatures, so H3 computation doesn't block feature fetching.
 */
export async function triggerFastScan(state, mapInstance) {
  // Reuse the warm AOI-hex cache (populated by getHexes) when the AOI and
  // resolution are unchanged, skipping the worker round-trip + polygonToCells on
  // every remap (P3/F1). On a cache miss we fall back to the worker.
  const aoiPolygon = state.aoi_polygon;
  const aoiCacheKey = state.aoi_polygon ? _aoiKey(state.aoi_polygon) : '';
  const cacheKey = `${aoiCacheKey}:${SIMULATION_PARAMS.h3StrideResolution}`;
  const cachedHexes =
    state._cachedViewHexes && state._cachedAoiKey === cacheKey ? state._cachedViewHexes : null;
  const aoiHexPromise = cachedHexes
    ? Promise.resolve(cachedHexes)
    : runAoiHexesTask(aoiPolygon, SIMULATION_PARAMS.h3StrideResolution).catch(() => []);

  // Fetch features in parallel — queryRenderedFeatures depends on map rendering,
  // which is already done (we waited for moveend in fitAoiBounds).
  const rawFeatures = mapInstance.queryRenderedFeatures(state.aoi_px) || [];

  // Wait for both AOI hexes and feature data to be ready
  const viewHexes = await aoiHexPromise;
  if (!viewHexes || viewHexes.length === 0) return;
  // Persist the exact AOI cell order — the visibility/bearing CSR's `cellToIndex`
  // is built from this array, so the agent worker must reconstruct the indices
  // from the SAME ordering (S1-SAB, review6 §3 option 1).
  state._viewHexes = viewHexes;

  // Build the shared r=1 adjacency (pure geometry, off the main thread) in
  // parallel with the fast scan. It is reused by the impassable-blur BFS and the
  // mapping graph, replacing two separate `gridDisk` passes (P1 + P3).
  const r1AdjacencyPromise = runBuildR1Adjacency(viewHexes);

  // Preprocess features into the format expected by workers
  const buildFeatures = [];
  for (let i = 0; i < rawFeatures.length; i++) {
    const feat = rawFeatures[i];
    if (!feat || !feat.geometry) continue;
    buildFeatures.push({
      sourceLayer: feat.sourceLayer,
      properties: feat.properties,
      geometry: {
        type: feat.geometry.type,
        coordinates: feat.geometry.coordinates,
      },
    });
  }

  const build = await runFastScanTask(viewHexes, buildFeatures, r1AdjacencyPromise);

  state._mappingGeneration = (state._mappingGeneration ?? 0) + 1;
  clearComputeCaches(state);

  const multiEntries = build.multiFrictionEntries ?? Object.create(null);

  // Lazy multiFrictionMap (P3): only cells that actually have friction layers
  // from the fast-scan get an entry. Layer-less cells (default terrain) get NO
  // entry — previously EVERY viewHex was pre-populated with an empty layer-map
  // object (N wasted allocations, the largest object allocation in the mapping
  // stage). The interactive obstacle drawer (mapCells) allocates a layer map on
  // demand for any in-AOI cell, so drawing behavior is unchanged; nothing reads
  // an empty layer map. AOI membership at draw time is defined by
  // `cellFrictionMap` (populated for every viewHex below). The Map *object* is
  // reused (cleared in place) when the AOI key is unchanged so consumers holding
  // a reference stay valid.
  const aoiKey = state._cachedAoiKey ?? (state.aoi_polygon ? _aoiKey(state.aoi_polygon) : '');
  if (!state.multiFrictionMap || state._lastViewHexesKey !== aoiKey) {
    state.multiFrictionMap = new Map();
    state._lastViewHexesKey = aoiKey;
  } else {
    state.multiFrictionMap.clear();
  }

  // Single-pass: merge multi-friction, build cellFrictionMap + affordanceMap
  const blurWeights = build.blurWeights ?? Object.create(null);
  // `blurUpdateMap` is returned by the worker (cell→blurred friction), so we use
  // it directly instead of rebuilding an equivalent object from `blurUpdates`.
  const blurUpdateMap = build.blurUpdateMap ?? null;

  // M5: the per-cell `_cellState` object (N `{friction,affordance,desire,multi}`
  // entries) is NO LONGER built; every remaining `_cellState` consumer keeps its
  // `cellState?.[n] ?? flatObj[n]` fallback, so behavior is byte-identical.
  // B: the plain-object friction/affordance snapshots (`_frictionObj`/
  // `_affordanceObj`) are NO LONGER pre-built here either. They were a full second
  // copy of `cellFrictionMap` / `affordanceMap` (~2× steady-state memory for the
  // two hottest fields at N≈5e5) that lived forever even when no sim ran. The
  // Maps are now the single source of truth at mapping/render time; `_frictionObj`/
  // `_affordanceObj` are materialized lazily at sim start (compute.js) from the
  // Maps and dropped by clearComputeCaches on the next remap. `multi` lives in
  // `multiFrictionMap` (never read in the hot path).

  // Assemble per-cell mapping state (friction, affordance, multi-friction layers)
  // in a worker pool, sharded by cell. The heavy per-cell work (layer merge,
  // min-friction, affordance classification, blur application) runs off the main
  // thread in parallel; we only write the results into `state` here (O(N) assigns).
  // P2-9: the merge worker no longer ships the N layer-map objects to/from the
  // worker — it returns only the friction/affordance typed arrays (it never reads
  // the layer-map contents). We write `multiFrictionMap` from the local
  // `multiEntries` (from the fast-scan pass) directly, avoiding a 2× clone of N
  // objects. We also iterate `viewHexes` by index instead of the worker's returned
  // `cells` (N strings), avoiding a redundant clone.
  //
  // P3.1: the canonical friction/affordance representation is now
  // `Float32Array(N)` indexed by `viewHexes` order, with `cellToIdx` as the only
  // remaining N-entry container. `cellFrictionMap` / `affordanceMap` are thin
  // Map-like VIEWS over these arrays (frictionStore.js) so every existing
  // consumer keeps working via the Map interface while the two hottest fields
  // drop from two N-entry Maps to one N-entry index Map + two compact typed
  // arrays (~2x steady-state memory win). The merge loop below writes through
  // the views into the typed arrays.
  const cellToIdx = buildCellToIdx(viewHexes);
  const frictionArr = new Float32Array(viewHexes.length);
  const affArr = new Float32Array(viewHexes.length);
  state.cellToIdx = cellToIdx;
  state.frictionArr = frictionArr;
  state.affArr = affArr;
  state.cellFrictionMap = new FrictionArrayMap(frictionArr, cellToIdx);
  state.affordanceMap = new FrictionArrayMap(affArr, cellToIdx);

  const merged = await runMergeCellsTask({
    cells: viewHexes,
    cellFrictionEntries: build.cellFrictionEntries,
    blurUpdateMap,
    blurWeights,
  });
  for (let i = 0; i < viewHexes.length; i++) {
    const cell = viewHexes[i];
    const fr = merged.frictionArr[i];
    const aff = merged.affArr[i];
    const target = multiEntries[cell];
    state.cellFrictionMap.set(cell, fr);
    // Only cells with actual fast-scan layers get a multiFrictionMap entry.
    if (target) state.multiFrictionMap.set(cell, target);
    state.affordanceMap.set(cell, aff);
  }

  // Snapshot the freshly-built base friction/affordance so Surface Edition
  // overrides can be reverted/restored without a full remap. `surfaceEdits`
  // (painted polygons) persists across remaps because it is keyed by feature id
  // with cached H3 cells; re-applying here keeps edits valid on the new AOI.
  state._baseFrictionArr = frictionArr.slice();
  state._baseAffArr = affArr.slice();
  if (!state.surfaceEdits) state.surfaceEdits = new Map();
  applySurfaceEdits(state);
  // `_multiFrictionObj` is a view over `multiFrictionMap` (same references),
  // so we don't hold a second N-entry container at steady state.
  state._multiFrictionObj = state.multiFrictionMap;

  const visionDepth = state.simulationParams?.visionDepth ?? SIMULATION_PARAMS.visionDepth;

  // Compute visibility sets (BFS flood-fill) and the bearing map between visible
  // cell pairs OFF the main thread. The mapping graph (CSR adjacency + index-
  // aligned friction/lat-lng) is built ONCE in a worker, then the visibility
  // shards run entirely in integer index space — no `gridDisk`, no cell strings,
  // no per-shard friction flatten (P1 + P3). The worker serializes the result to
  // flat CSR typed arrays (no Map) and transfers them via a SharedArrayBuffer
  // (zero-copy when cross-origin isolated) or an ArrayBuffer (memcpy). The large
  // bearing Map is NEVER structured-cloned across the worker boundary — that
  // clone is what previously triggered SIGILL.
  // M3: the main thread no longer eagerly rebuilds the visibility/bearing Proxy
  // indices here. The agent worker rebuilds them IN-WORKER from the raw packed
  // CSR (S1), and the main-thread preview kernel rebuilds them lazily on first
  // use from the same CSR (see `getMainThreadVisibilityBearing` in compute.js).
  // The packed CSR buffer is the single source of truth; we never hold the
  // O(N)-cellToIndex + Proxy structures on the main thread unless a preview
  // actually needs them.
  // NOTE: VISUAL_DEPTH neighbor disks are no longer precomputed here; they are filled
  // lazily and cached during the simulation via getNeighborDisk (see agentTasks.js).
  const mappingGraph = await runBuildMappingGraph(
    state.cellFrictionMap,
    viewHexes,
    await r1AdjacencyPromise
  );
  // Keep the shared r=1 CSR adjacency (viewHexes-indexed). The gradient graph
  // (getGradientGraph) filters this instead of running a per-cell `gridDisk`
  // pass on the main thread / in the agent worker (M3). It is safe to retain:
  // flattenPayloadAndTransfers only transfers `frictionEntries`, so posting it
  // to the mapping-graph / agent workers clones (or SAB-shares) it without
  // detaching the buffers held here.
  state._r1Adjacency = await r1AdjacencyPromise;
  const csr = await runVisibilityBearingTask(mappingGraph, viewHexes, visionDepth);
  // M3: keep ONLY the raw packed CSR buffer (offsets/neighbors/bearings) as the
  // single source of truth. The agent worker rebuilds the visibility + bearing
  // indices IN-WORKER from it plus `viewHexes` (S1-SAB, review6 §3 option 1);
  // structured-cloning the BearingIndex/VisibilityIndex Proxies drops their
  // function-valued traps, so posting them to a worker silently degrades every
  // lookup to the slow trig / path-cell fallback. Shipping the buffer + viewHexes
  // instead keeps the O(log P) index off the main thread. The buffer is SAB-backed
  // when cross-origin isolated (zero-copy share) and an ArrayBuffer otherwise
  // (cloned once). The main-thread preview kernel rebuilds lazily from this same
  // buffer via `getMainThreadVisibilityBearing` (compute.js).
  state._visibilityBearingCSR = { gen: state._mappingGeneration, ...csr };

  // Friction/affordance lookups changed — bump so updateLayers rebuilds the
  // per-view arrays instead of reusing a stale snapshot.
  state._layerDataVersion = (state._layerDataVersion || 0) + 1;
  mapInstance.updateLayers?.();
}

export function mapPolygonCells(state, mapInstance, coords, surface) {
  // `coords` is GeoJSON ([lng, lat]) — pass isGeoJson = true
  // Cache polygonToCells results per-feature if geometry unchanged
  const key = _polyKey(coords);
  if (!state._polyCache) state._polyCache = new Map();
  let cells = state._polyCache.get(key);
  if (cells) {
    // Refresh LRU order
    state._polyCache.delete(key);
    state._polyCache.set(key, cells);
  } else {
    cells = polygonToCells(coords, SIMULATION_PARAMS.h3StrideResolution, true);
    state._polyCache.set(key, cells);
    // Evict oldest if over budget
    if (state._polyCache.size > POLY_CACHE_MAX) {
      const oldest = state._polyCache.keys().next().value;
      state._polyCache.delete(oldest);
    }
  }
  mapCells(state, cells, surface);
  // Drawing obstacles mutates friction outside a remap. The gradient graph
  // topology and per-target gradient cache are keyed by the (stable)
  // cellFrictionMap reference / mapping generation, so drop them so the next
  // run reflects the new barriers instead of reusing a stale gradient (C5).
  invalidateGradientGraph();
  clearGradientCache(state);
}

export function mapLineCells(state, mapInstance, coords, surface) {
  const cLen = coords.length;
  for (let i = 0; i < cLen - 1; i++) {
    const c1 = latLngToCell(coords[i][1], coords[i][0], SIMULATION_PARAMS.h3StrideResolution);
    const c2 = latLngToCell(
      coords[i + 1][1],
      coords[i + 1][0],
      SIMULATION_PARAMS.h3StrideResolution
    );
    // Cache gridPathCells per segment to avoid duplicate expansion with LRU eviction
    if (!state._pathCache) state._pathCache = new Map();
    const segKey = c1 + '::' + c2;
    let path = state._pathCache.get(segKey);
    if (path) {
      // Refresh LRU order: remove and re-insert
      state._pathCache.delete(segKey);
      state._pathCache.set(segKey, path);
    } else {
      path = gridPathCells(c1, c2);
      state._pathCache.set(segKey, path);
      // Evict oldest if over budget
      if (state._pathCache.size > PATH_CACHE_MAX) {
        const oldest = state._pathCache.keys().next().value;
        state._pathCache.delete(oldest);
      }
    }
    mapCells(state, path, surface);
  }
  // Drawing obstacles mutates friction outside a remap — drop the cached
  // gradient graph topology and per-target gradient cache so the next run
  // reflects the new barriers (C5).
  invalidateGradientGraph();
  clearGradientCache(state);
}

// Note: This function is designed to be used internally by the mapPolygonCells and mapLineCells functions,
// which handle the geometry parsing and cell generation. It takes a list of cells and a surface type,
// and updates the friction maps accordingly, ensuring that we account for the highest friction
// per level
function mapCells(state, cells, surface) {
  const frictionMap = state.multiFrictionMap;
  const cellFrictionMap = state.cellFrictionMap;
  const frictionObj = state._frictionObj;
  const layerKey = surface.layer;
  const layerVal = FRICTION_COSTS[surface.cost];
  for (let i = 0, cLen = cells.length; i < cLen; i++) {
    const cell = cells[i];
    let val = frictionMap.get(cell);
    if (!val) {
      // Lazy multiFrictionMap (P3): layer-less AOI cells have no entry until
      // drawn on. Allocate a layer map on demand for in-AOI cells (membership
      // defined by cellFrictionMap, populated for every viewHex at build time);
      // cells with no cellFrictionMap entry are genuinely outside the AOI.
      if (!cellFrictionMap || !cellFrictionMap.has(cell)) continue; // outside AOI
      val = Object.create(null);
      frictionMap.set(cell, val);
    }
    if (!Object.hasOwn(val, layerKey) || layerVal > val[layerKey]) val[layerKey] = layerVal;
    // Recompute the per-cell min friction (cellFrictionMap) from the updated
    // layer map. The gradient graph / Dijkstra read cellFrictionMap (and its
    // snapshot _frictionObj), so without this the drawn barrier is invisible to
    // routing until a full remap (C5).
    let min = Infinity;
    for (const k in val) {
      const v = val[k];
      if (typeof v === 'number' && v < min) min = v;
    }
    const fr = isFinite(min) ? min : 0;
    if (cellFrictionMap) cellFrictionMap.set(cell, fr);
    // `_frictionObj` is the canonical `cellFrictionMap` view (I, review11 §I), so
    // this write is redundant when the alias is in place and a safe no-op when
    // it is still null during mapping (the canonical `cellFrictionMap` write
    // above already updates the single source of truth).
    if (frictionObj) frictionObj.set(cell, fr);
  }
}

// ─────────────────────────────────────────────────────────────
// Surface Edition — complete friction override from painted polygons
// ─────────────────────────────────────────────────────────────
//
// Unlike `mapCells` (which takes the MAX friction per layer and can only raise
// resistance), Surface Edition *completely overrides* the underlying surface of
// every H3 cell inside a painted polygon — even when the new surface is easier
// to walk than what it covers (e.g. paving a path across a meadow, or carving a
// temporary path through a building). This is the core requirement: the drawn
// polygon's surface class wins outright.
//
// Implementation: we keep a snapshot of the base friction/affordance taken right
// after the fast-scan (`_baseFrictionArr` / `_baseAffArr`) plus an ordered list
// of painted edits (`surfaceEdits: Map<featureId, { surfaceClass, cells }>`).
// Re-applying is O(edited cells), not O(all cells): we restore only the cells
// ever touched by an edit back to base, then stamp each edit in draw order (so
// later paints win on overlap). Deleting a polygon just drops its entry and
// re-applies, which restores the underlying surface for free.

/**
 * Recompute the effective friction/affordance from the base snapshot + all
 * painted edits. No-op until a mapping has built the base arrays.
 */
export function applySurfaceEdits(state) {
  const base = state._baseFrictionArr;
  const baseAff = state._baseAffArr;
  const cellFrictionMap = state.cellFrictionMap;
  const affordanceMap = state.affordanceMap;
  const cellToIdx = state.cellToIdx;
  if (!base || !cellFrictionMap || !cellToIdx) return;

  // Union of every cell touched by any edit = the only cells we ever mutate.
  const dirty = new Set();
  for (const edit of state.surfaceEdits.values()) {
    for (const c of edit.cells) dirty.add(c);
  }
  // Restore previously-edited cells to their base values.
  for (const cell of dirty) {
    const i = cellToIdx.get(cell);
    if (i !== undefined) {
      cellFrictionMap.set(cell, base[i]);
      if (affordanceMap) affordanceMap.set(cell, baseAff[i]);
    }
  }
  // Stamp each edit in draw order (later paints override earlier ones).
  for (const edit of state.surfaceEdits.values()) {
    const fr = FRICTION_COSTS[edit.surfaceClass];
    const aff = AFFORDANCE[edit.surfaceClass];
    for (const cell of edit.cells) {
      const i = cellToIdx.get(cell);
      if (i !== undefined) {
        cellFrictionMap.set(cell, fr);
        if (affordanceMap) affordanceMap.set(cell, aff);
      }
    }
  }

  // Friction changed outside a remap — drop the cached gradient graph/topology
  // so the next run reflects the new barriers (mirrors mapCells, C5).
  invalidateGradientGraph();
  clearGradientCache(state);
  state._layerDataVersion = (state._layerDataVersion || 0) + 1;
}

/**
 * Paint (or re-paint) a single terra-draw feature with a surface class.
 * Returns the number of H3 cells covered.
 */
export function applySurfaceOverride(state, feature, surfaceClass) {
  if (!feature || feature.geometry?.type !== 'Polygon') return 0;
  const coords = feature.geometry.coordinates;
  if (!coords || !coords.length) return 0;

  let cells;
  try {
    cells = polygonToCells(coords, SIMULATION_PARAMS.h3StrideResolution, true);
  } catch {
    return 0;
  }
  if (!state.surfaceEdits) state.surfaceEdits = new Map();
  state.surfaceEdits.set(feature.id, { surfaceClass, cells });
  applySurfaceEdits(state);
  return cells.length;
}

/** Remove a painted feature's override and restore the underlying surface. */
export function removeSurfaceOverride(state, id) {
  if (!state.surfaceEdits) return;
  state.surfaceEdits.delete(id);
  applySurfaceEdits(state);
}

/** Wipe every painted surface and reset the friction field to the base map. */
export function clearSurfaceEditions(state) {
  state.surfaceEdits = new Map();
  state._baseFrictionArr = undefined;
  state._baseAffArr = undefined;
  applySurfaceEdits(state);
}

// CSR-backed visibility + bearing index reconstruction lives in `bearingIndex.js`
// (extracted so the agent worker kernel can rebuild the indices in-worker without
// importing this module, which would create a circular dependency).
