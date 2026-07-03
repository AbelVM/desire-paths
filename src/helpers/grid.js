import { polygonToCells, latLngToCell, gridPathCells } from 'h3-js';
import {
  FRICTION_COSTS,
  AFFORDANCE,
  H3_STRIDE_RESOLUTION,
  IMPASSABLE_BLUR_AFFORDANCE_PENALTY,
  VISUAL_DEPTH,
} from './constants.js';
import { runFastScanTask, runAoiHexesTask } from './spatialWorker.js';
import { clearComputeCaches, buildCellStateEntry, precomputeVisibilitySets } from './compute.js';

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

const PATH_CACHE_MAX = 2000;
const POLY_CACHE_MAX = 2000;

export function getHexes() {
  const aoiKey = this.aoi_polygon ? _aoiKey(this.aoi_polygon) : '';
  // Return cached hexes when AOI hasn't changed to avoid repeated expensive H3 calls
  if (this._cachedViewHexes && this._cachedAoiKey === aoiKey) return this._cachedViewHexes;
  let hexes;
  try {
    // `this.aoi_polygon` is GeoJSON ([lng, lat]). Use the isGeoJson flag.
    hexes = polygonToCells(this.aoi_polygon, H3_STRIDE_RESOLUTION, true);
  } catch (e) {
    console.error('Error generating hexes for AOI. Please check your AOI geometry.', e);
    return;
  }
  this._cachedViewHexes = hexes;
  this._cachedAoiKey = aoiKey;
  return hexes;
}

/**
 * Fast Grid Building using unified Bounding Box updates.
 * Runs AOI hex generation in a worker (off main thread) in parallel with
 * queryRenderedFeatures, so H3 computation doesn't block feature fetching.
 */
export async function triggerFastScan() {
  // Start AOI hex generation in a Web Worker — runs off the main thread.
  // This is CPU-intensive (polygonToCells) and blocks for ~50-200ms otherwise.
  const aoiPolygon = this.aoi_polygon;
  const aoiHexPromise = runAoiHexesTask(aoiPolygon).catch(() => []);

  // Fetch features in parallel — queryRenderedFeatures depends on map rendering,
  // which is already done (we waited for moveend in fitAoiBounds).
  const rawFeatures = this.queryRenderedFeatures(this.aoi_px) || [];

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

  this._mappingGeneration = (this._mappingGeneration ?? 0) + 1;
  clearComputeCaches.call(this);

  // Reset friction maps in a single pass over viewHexes
  if (this.cellFrictionMap && typeof this.cellFrictionMap.clear === 'function') {
    this.cellFrictionMap.clear();
  }
  const multiEntries = build.multiFrictionEntries ?? Object.create(null);

  // Reuse existing multiFrictionMap when AOI hasn't changed to avoid re-allocating objects
  const aoiKey = this._cachedAoiKey ?? (this.aoi_polygon ? _aoiKey(this.aoi_polygon) : '');
  if (!this.multiFrictionMap || this._lastViewHexesKey !== aoiKey) {
    this.multiFrictionMap = new Map();
    for (let i = 0; i < viewHexes.length; i++) this.multiFrictionMap.set(viewHexes[i], Object.create(null));
    this._lastViewHexesKey = aoiKey;
  } else {
    for (const obj of this.multiFrictionMap.values()) {
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

  this._frictionObj = Object.create(null);
  this._multiFrictionObj = Object.create(null);
  this.affordanceMap.clear();
  this._affordanceObj = Object.create(null);
  this._cellState = Object.create(null);

  for (let i = 0, vlen = viewHexes.length; i < vlen; i++) {
    const cell = viewHexes[i];
    // Merge multi-friction layer values into the map entry
    const target = this.multiFrictionMap.get(cell);
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
      const vals = Object.values(target);
      fr = vals.length > 0 ? Math.min(...vals) : 0;
    } else {
      // Fallback: look up from build result directly
      fr = build.cellFrictionEntries?.[cell] ?? 0;
    }

    this._frictionObj[cell] = fr;
    this.cellFrictionMap.set(cell, fr);
    this._multiFrictionObj[cell] = target || Object.create(null);

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

    this.affordanceMap.set(cell, aff);
    this._affordanceObj[cell] = aff;
    this._cellState[cell] = buildCellStateEntry(fr, aff, 0, target || null, null, cell);
  }

  // Precompute visibility sets for all AOI cells to eliminate O(N^2) path lookups during simulation
  const visibilityData = precomputeVisibilitySets(this._frictionObj, viewHexes, VISUAL_DEPTH);
  this._precomputedVisibility = { gen: this._mappingGeneration, data: visibilityData };

  this.updateLayers();
}

export function mapPolygonCells(coords, surface) {
  // `coords` is GeoJSON ([lng, lat]) — pass isGeoJson = true
  // Cache polygonToCells results per-feature if geometry unchanged
  const key = _polyKey(coords);
  if (!this._polyCache) this._polyCache = new Map();
  let cells = this._polyCache.get(key);
  if (cells) {
    // Refresh LRU order
    this._polyCache.delete(key);
    this._polyCache.set(key, cells);
  } else {
    cells = polygonToCells(coords, H3_STRIDE_RESOLUTION, true);
    this._polyCache.set(key, cells);
    // Evict oldest if over budget
    if (this._polyCache.size > POLY_CACHE_MAX) {
      const oldest = this._polyCache.keys().next().value;
      this._polyCache.delete(oldest);
    }
  }
  mapCells(this.multiFrictionMap, cells, surface);
}

export function mapLineCells(coords, surface) {
  const cLen = coords.length;
  for (let i = 0; i < cLen - 1; i++) {
    const c1 = latLngToCell(coords[i][1], coords[i][0], H3_STRIDE_RESOLUTION);
    const c2 = latLngToCell(coords[i + 1][1], coords[i + 1][0], H3_STRIDE_RESOLUTION);
    // Cache gridPathCells per segment to avoid duplicate expansion with LRU eviction
    if (!this._pathCache) this._pathCache = new Map();
    const segKey = c1 + '::' + c2;
    let path = this._pathCache.get(segKey);
    if (path) {
      // Refresh LRU order: remove and re-insert
      this._pathCache.delete(segKey);
      this._pathCache.set(segKey, path);
    } else {
      path = gridPathCells(c1, c2);
      this._pathCache.set(segKey, path);
      // Evict oldest if over budget
      if (this._pathCache.size > PATH_CACHE_MAX) {
        const oldest = this._pathCache.keys().next().value;
        this._pathCache.delete(oldest);
      }
    }
    mapCells(this.multiFrictionMap, path, surface);
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
