import { polygonToCells, latLngToCell, gridPathCells } from 'h3-js';
import {
  FRICTION_COSTS,
  AFFORDANCE,
  H3_STRIDE_RESOLUTION,
  getSurface,
  IMPASSABLE_BLUR_RADIUS,
  IMPASSABLE_BLUR_SIGMA,
  IMPASSABLE_BLUR_FRICTION_ADD,
  IMPASSABLE_BLUR_AFFORDANCE_PENALTY,
} from './constants.js';
import { runFastScanTask, runImpassableBlurTask } from './spatialWorker.js';

// Low-allocation AOI key: bounding-box string with limited precision
function _aoiKey(poly) {
  if (!poly || !poly.length) return '';
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
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
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  let points = 0;
  let firstLng = 0, firstLat = 0, lastLng = 0, lastLat = 0;
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
        firstLng = lng; firstLat = lat;
      }
      lastLng = lng; lastLat = lat;
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
 * Fast Grid Building using unified Bounding Box updates
 */
export async function triggerFastScan() {
  const viewHexes = this.getHexes();
  if (!viewHexes || viewHexes.length === 0) return;
  const features = this.queryRenderedFeatures(this.aoi_px) || [];
  const buildFeatures = [];
  for (let i = 0; i < features.length; i++) {
    const feat = features[i];
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

  // Reset friction maps
  this.cellFrictionMap.clear();

  // Reuse existing multiFrictionMap when AOI hasn't changed to avoid re-allocating objects
  const aoiKey = this._cachedAoiKey || (this.aoi_polygon ? _aoiKey(this.aoi_polygon) : '');
  if (!this.multiFrictionMap || this._lastViewHexesKey !== aoiKey) {
    this.multiFrictionMap = new Map();
    for (let i = 0; i < viewHexes.length; i++) this.multiFrictionMap.set(viewHexes[i], {});
    this._lastViewHexesKey = aoiKey;
  } else {
    for (const obj of this.multiFrictionMap.values()) {
      for (const k in obj) delete obj[k];
    }
  }

  const multiEntries = build.multiFrictionEntries || Object.create(null);
  for (const cell in multiEntries) {
    const target = this.multiFrictionMap.get(cell);
    if (!target) continue;
    const layerMap = multiEntries[cell];
    for (const layer in layerMap) target[layer] = layerMap[layer];
  }

  // Snapshot multiFrictionMap to a plain object for hot lookups
  this._multiFrictionObj = Object.create(null);
  for (const [k, v] of this.multiFrictionMap) this._multiFrictionObj[k] = v;

  // Populate cellFrictionMap from worker output using the viewHexes order
  this._frictionObj = Object.create(null);
  const cellEntries = build.cellFrictionEntries || Object.create(null);
  for (let i = 0, vlen = viewHexes.length; i < vlen; i++) {
    const h = viewHexes[i];
    const minCost = cellEntries[h] || 0;
    this.cellFrictionMap.set(h, minCost);
    this._frictionObj[h] = minCost;
  }

  // Apply gaussian blur from impassable cells to adjacent cells (updates friction map)
  const blurWeights = build.blurWeights || Object.create(null);
  const blurUpdates = build.blurUpdates || [];
  for (let i = 0; i < blurUpdates.length; i++) {
    const [cell, newF] = blurUpdates[i];
    this.cellFrictionMap.set(cell, newF);
    this._frictionObj[cell] = newF;
  }

  this.affordanceMap.clear();
  this._affordanceObj = Object.create(null);
  this._cellState = Object.create(null);
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
  for (let i = 0, vlen = viewHexes.length; i < vlen; i++) {
    const cell = viewHexes[i];
    const fr = (this._frictionObj && typeof this._frictionObj[cell] !== 'undefined') ? this._frictionObj[cell] : 0;
    const multi = (this._multiFrictionObj && typeof this._multiFrictionObj[cell] !== 'undefined') ? this._multiFrictionObj[cell] : null;
    let aff;
    if (fr >= FRICTION_COSTS.IMPASSABLE) aff = impassable;
    else if (fr < midPL) aff = pavement;
    else if (fr < midLH) aff = lightPark;
    else aff = heavyGrass;
    const weight = blurWeights && blurWeights[cell];
    if (typeof weight !== 'undefined') {
      const reduction = Math.min(aff, weight * penalty);
      aff = Math.max(0.0, aff - reduction);
    }
    this.affordanceMap.set(cell, aff);
    this._affordanceObj[cell] = aff;
    this._cellState[cell] = { friction: fr, affordance: aff, multi };
  }

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
    if (val[layerKey] === undefined || layerVal > val[layerKey]) val[layerKey] = layerVal;
  }
}

// Apply a gaussian influence from impassable cells outward.
// Returns a Map(cell -> aggregatedWeight) of influenced non-impassable cells.
async function applyImpassableBlur() {
  const cellFrictionMap = this.cellFrictionMap;
  const frictionObj = Object.create(null);
  for (const [k, v] of cellFrictionMap) frictionObj[k] = v;
  this._frictionObj = frictionObj;

  const { blurWeights, updates } = await runImpassableBlurTask(frictionObj, {
    radius: IMPASSABLE_BLUR_RADIUS,
    sigma: IMPASSABLE_BLUR_SIGMA,
    addFactor: IMPASSABLE_BLUR_FRICTION_ADD,
  });

  for (let i = 0; i < updates.length; i++) {
    const [cell, newF] = updates[i];
    cellFrictionMap.set(cell, newF);
    frictionObj[cell] = newF;
    if (this._cellState && this._cellState[cell]) this._cellState[cell].friction = newF;
  }

  return blurWeights;
}
