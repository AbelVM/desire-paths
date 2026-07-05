import { polygonToCells, latLngToCell, gridPathCells } from 'h3-js';
import {
  FRICTION_COSTS,
  AFFORDANCE,
  H3_STRIDE_RESOLUTION,
  IMPASSABLE_BLUR_AFFORDANCE_PENALTY,
  PATH_CACHE_MAX,
  POLY_CACHE_MAX,
  SIMULATION_PARAMS,
} from './constants.js';
import { runFastScanTask, runAoiHexesTask } from './spatialWorker.js';
import {
  clearComputeCaches,
  buildCellStateEntry,
  precomputeVisibilitySets,
  precomputeNeighborDisks,
  precomputeBearingMap,
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
  // Return cached hexes when AOI hasn't changed to avoid repeated expensive H3 calls
  if (state._cachedViewHexes && state._cachedAoiKey === aoiKey) return state._cachedViewHexes;
  let hexes;
  try {
    // `state.aoi_polygon` is GeoJSON ([lng, lat]). Use the isGeoJson flag.
    hexes = polygonToCells(state.aoi_polygon, H3_STRIDE_RESOLUTION, true);
  } catch (e) {
    console.error('Error generating hexes for AOI. Please check your AOI geometry.', e);
    return;
  }
  state._cachedViewHexes = hexes;
  state._cachedAoiKey = aoiKey;
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
  const aoiHexPromise = runAoiHexesTask(aoiPolygon).catch(() => []);

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

  state._frictionObj = Object.create(null);
  state._multiFrictionObj = Object.create(null);
  state.affordanceMap.clear();
  state._affordanceObj = Object.create(null);
  state._cellState = Object.create(null);
  state._cellStateMappingGen = state._mappingGeneration;

  for (let i = 0, vlen = viewHexes.length; i < vlen; i++) {
    const cell = viewHexes[i];
    // Merge multi-friction layer values into the map entry
    const target = state.multiFrictionMap.get(cell);
    if (target) {
      const layerMap = multiEntries[cell];
      if (layerMap) {
        const lk = Object.keys(layerMap);
        for (let l2 = 0; l2 < lk.length; l2++) target[lk[l2]] = layerMap[lk[l2]];
      }
    }

    // Effective friction: min across all layers, or 0 if no data
    let fr = 0;
    if (target) {
      const keys = Object.keys(target);
      if (keys.length > 0) {
        let min = Infinity;
        for (let k = 0; k < keys.length; k++) {
          const v = target[keys[k]];
          if (v < min) min = v;
        }
        fr = min;
      }
    } else {
      // Fallback: look up from build result directly
      fr = build.cellFrictionEntries?.[cell] ?? 0;
    }

    state._frictionObj[cell] = fr;
    state.cellFrictionMap.set(cell, fr);
    state._multiFrictionObj[cell] = target || Object.create(null);

    // Affordance classification
    let aff;
    if (fr >= FRICTION_COSTS.IMPASSABLE) aff = impassable;
    else if (fr < midPL) aff = pavement;
    else if (fr < midLH) aff = lightPark;
    else aff = heavyGrass;

    const weight = blurWeights[cell];
    if (weight != null) {
      aff = Math.max(0.0, aff - Math.min(aff, weight * penalty));
    }

    state.affordanceMap.set(cell, aff);
    state._affordanceObj[cell] = aff;
    state._cellState[cell] = buildCellStateEntry(fr, aff, 0, target || null, null, cell);
  }

  const visionDepth = state.simulationParams?.visionDepth ?? SIMULATION_PARAMS.visionDepth;

  // Precompute neighbor disks for all AOI cells to avoid millions of redundant gridDisk calls
  const neighborDisks = precomputeNeighborDisks(viewHexes, visionDepth);
  state._precomputedNeighborDisks = { gen: state._mappingGeneration, data: neighborDisks };

  // Precompute visibility sets using shared neighbor disks (avoids redundant gridDisk calls)
  const visibilityData = precomputeVisibilitySets(
    state._frictionObj,
    viewHexes,
    visionDepth,
    neighborDisks
  );
  state._precomputedVisibility = { gen: state._mappingGeneration, data: visibilityData };

  // Precompute bearings between all cell pairs within VISUAL_DEPTH to eliminate per-tick trig calls
  // OPTIMIZATION: Pass neighborDisks to avoid redundant gridDisk calls
  const bearingMap = precomputeBearingMap(viewHexes, visionDepth, neighborDisks);
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
    cells = polygonToCells(coords, H3_STRIDE_RESOLUTION, true);
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
    const c1 = latLngToCell(coords[i][1], coords[i][0], H3_STRIDE_RESOLUTION);
    const c2 = latLngToCell(coords[i + 1][1], coords[i + 1][0], H3_STRIDE_RESOLUTION);
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
