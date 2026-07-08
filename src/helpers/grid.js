import { polygonToCells, latLngToCell, gridPathCells } from 'h3-js';
import {
  FRICTION_COSTS,
  PATH_CACHE_MAX,
  POLY_CACHE_MAX,
  SIMULATION_PARAMS,
} from './constants.js';
import { runFastScanTask, runAoiHexesTask, runBuildMappingGraph, runVisibilityBearingTask, runMergeCellsTask } from './spatialWorker.js';
import {
  clearComputeCaches,
  buildCellStateEntry,
} from './compute.js';

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

export function getHexes(state, mapInstance) {
  const aoiKey = state.aoi_polygon ? _aoiKey(state.aoi_polygon) : '';
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
  // Start AOI hex generation in a Web Worker — runs off the main thread.
  // This is CPU-intensive (polygonToCells) and blocks for ~50-200ms otherwise.
  const aoiPolygon = state.aoi_polygon;
  const aoiHexPromise = runAoiHexesTask(
    aoiPolygon,
    SIMULATION_PARAMS.h3StrideResolution
  ).catch(() => []);

  // Fetch features in parallel — queryRenderedFeatures depends on map rendering,
  // which is already done (we waited for moveend in fitAoiBounds).
  const rawFeatures = mapInstance.queryRenderedFeatures(state.aoi_px) || [];

  // Wait for both AOI hexes and feature data to be ready
  const viewHexes = await aoiHexPromise;
  if (!viewHexes || viewHexes.length === 0) return;

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

  const build = await runFastScanTask(viewHexes, buildFeatures);

  state._mappingGeneration = (state._mappingGeneration ?? 0) + 1;
  clearComputeCaches(state);

  // Reset friction maps in a single pass over viewHexes
  if (state.cellFrictionMap && typeof state.cellFrictionMap.clear === 'function') {
    state.cellFrictionMap.clear();
  }
  const multiEntries = build.multiFrictionEntries ?? Object.create(null);

  // Reuse existing multiFrictionMap when AOI hasn't changed to avoid re-allocating objects
  const aoiKey = state._cachedAoiKey ?? (state.aoi_polygon ? _aoiKey(state.aoi_polygon) : '');
  if (!state.multiFrictionMap || state._lastViewHexesKey !== aoiKey) {
    state.multiFrictionMap = new Map();
    for (let i = 0; i < viewHexes.length; i++)
      state.multiFrictionMap.set(viewHexes[i], Object.create(null));
    state._lastViewHexesKey = aoiKey;
  } else {
    for (const obj of state.multiFrictionMap.values()) {
      const keys = Object.keys(obj);
      for (let k = 0; k < keys.length; k++) delete obj[keys[k]];
    }
  }

  // Single-pass: merge multi-friction, build frictionObj/cellFrictionMap, affordanceMap/_affordanceObj/_cellState
  const blurWeights = build.blurWeights ?? Object.create(null);
  const blurUpdates = build.blurUpdates ?? null;
  // Index blur updates by cell for O(1) lookup in the per-cell loop.
  const blurUpdateMap = blurUpdates ? Object.create(null) : null;
  if (blurUpdateMap) {
    for (let u = 0; u < blurUpdates.length; u++) {
      blurUpdateMap[blurUpdates[u][0]] = blurUpdates[u][1];
    }
  }

  state._frictionObj = Object.create(null);
  state._multiFrictionObj = Object.create(null);
  state.affordanceMap.clear();
  state._affordanceObj = Object.create(null);
  state._cellState = Object.create(null);
  state._cellStateMappingGen = state._mappingGeneration;

  // Assemble per-cell mapping state (friction, affordance, multi-friction layers)
  // in a worker pool, sharded by cell. The heavy per-cell work (layer merge,
  // min-friction, affordance classification, blur application) runs off the main
  // thread in parallel; we only write the results into `state` here (O(N) assigns).
  const merged = await runMergeCellsTask({
    cells: viewHexes,
    multiEntries,
    cellFrictionEntries: build.cellFrictionEntries,
    blurUpdateMap,
    blurWeights,
  });
  for (let i = 0; i < merged.cells.length; i++) {
    const cell = merged.cells[i];
    const fr = merged.frictionArr[i];
    const aff = merged.affArr[i];
    const target = merged.multiArr[i];
    state._frictionObj[cell] = fr;
    state.cellFrictionMap.set(cell, fr);
    state._multiFrictionObj[cell] = target;
    // Keep multiFrictionMap consistent with _multiFrictionObj (same reference).
    state.multiFrictionMap.set(cell, target);
    state.affordanceMap.set(cell, aff);
    state._affordanceObj[cell] = aff;
    state._cellState[cell] = buildCellStateEntry(fr, aff, 0, target, null, cell);
  }

  const visionDepth = state.simulationParams?.visionDepth ?? SIMULATION_PARAMS.visionDepth;

  // Compute visibility sets (BFS flood-fill) and the bearing map between visible
  // cell pairs OFF the main thread. The mapping graph (CSR adjacency + index-
  // aligned friction/lat-lng) is built ONCE in a worker, then the visibility
  // shards run entirely in integer index space — no `gridDisk`, no cell strings,
  // no per-shard friction flatten (P1 + P3). The worker serializes the result to
  // flat CSR typed arrays (no Map) and transfers them via a SharedArrayBuffer
  // (zero-copy when cross-origin isolated) or an ArrayBuffer (memcpy). The large
  // bearing Map is NEVER structured-cloned across the worker boundary — that
  // clone is what previously triggered SIGILL. We rebuild the plain-object
  // visibility map and the bearing Map IN-PROCESS on the main thread (safe: no
  // cross-boundary clone), so the simulation's consumers are untouched.
  // NOTE: VISUAL_DEPTH neighbor disks are no longer precomputed here; they are filled
  // lazily and cached during the simulation via getNeighborDisk (see compute.js).
  const mappingGraph = await runBuildMappingGraph(state._frictionObj, viewHexes);
  const csr = await runVisibilityBearingTask(mappingGraph, viewHexes, visionDepth);
  const { visibilityData, bearingMap } = reconstructVisibilityBearing(csr, viewHexes);
  state._precomputedVisibility = { gen: state._mappingGeneration, data: visibilityData };
  state._precomputedBearings = { gen: state._mappingGeneration, data: bearingMap };

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
  mapCells(state.multiFrictionMap, cells, surface);
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
    mapCells(state.multiFrictionMap, path, surface);
  }
}

// Note: This function is designed to be used internally by the mapPolygonCells and mapLineCells functions,
// which handle the geometry parsing and cell generation. It takes a list of cells and a surface type,
// and updates the friction maps accordingly, ensuring that we account for the highest friction
// per level
function mapCells(frictionMap, cells, surface) {
  const layerKey = surface.layer;
  const layerVal = FRICTION_COSTS[surface.cost];
  for (let i = 0, cLen = cells.length; i < cLen; i++) {
    const cell = cells[i];
    const val = frictionMap.get(cell);
    if (!val) continue; // outside AOI
    if (!Object.hasOwn(val, layerKey) || layerVal > val[layerKey]) val[layerKey] = layerVal;
  }
}

/**
 * Rebuild the plain-object visibility map and the bearing Map from the flat CSR
 * buffer produced by `computeVisibilityBearingCSR`. This runs IN-PROCESS on the
 * main thread: it constructs the structures directly (no cross-worker structured
 * clone of a Map), so it cannot trigger the SIGILL that cloning a large Map does.
 *
 * `viewHexes` supplies the integer-index → H3 cellId mapping used to turn the
 * CSR's integer neighbor indices back into the string keys the simulation expects.
 */
function reconstructVisibilityBearing(csr, viewHexes) {
  const { buffer, N, P, offsetsBytes, neighborsBytes } = csr;
  if (!buffer || N === 0) {
    return { visibilityData: Object.create(null), bearingMap: new Map() };
  }
  const visOffsets = new Int32Array(buffer, 0, N + 1);
  const visNeighbors = new Int32Array(buffer, offsetsBytes, P);
  const bearings = new Float32Array(buffer, offsetsBytes + neighborsBytes, P);

  const visibilityData = Object.create(null);
  const bearingMap = new Map();
  for (let i = 0; i < N; i++) {
    const origin = viewHexes[i];
    const start = visOffsets[i];
    const end = visOffsets[i + 1];
    if (end <= start) continue;
    const visObj = Object.create(null);
    for (let p = start; p < end; p++) {
      const neighbor = viewHexes[visNeighbors[p]];
      visObj[neighbor] = true;
      bearingMap.set(origin + '::' + neighbor, bearings[p]);
    }
    visibilityData[origin] = visObj;
  }
  return { visibilityData, bearingMap };
}
