import { polygonToCells, latLngToCell, gridPathCells, gridRing } from 'h3-js';
import {
  FRICTION_COSTS,
  H3_STRIDE_RESOLUTION,
  getSurface,
  IMPASSABLE_BLUR_RADIUS,
  IMPASSABLE_BLUR_SIGMA,
  IMPASSABLE_BLUR_FRICTION_ADD,
  IMPASSABLE_BLUR_AFFORDANCE_PENALTY,
} from './constants.js';

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

// Cache size bounds for LRU eviction
const RING_CACHE_MAX = 2000;
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
export function triggerFastScan() {
  const viewHexes = this.getHexes();
  if (!viewHexes || viewHexes.length === 0) return;
  const features = this.queryRenderedFeatures(this.aoi_px) || [];

  // Reset friction maps
  this.cellFrictionMap.clear();

  // Reuse existing multiFrictionMap when AOI hasn't changed to avoid re-allocating objects
  const aoiKey = this._cachedAoiKey || (this.aoi_polygon ? _aoiKey(this.aoi_polygon) : '');
  if (!this.multiFrictionMap || this._lastViewHexesKey !== aoiKey) {
    this.multiFrictionMap = new Map();
    for (let h of viewHexes) this.multiFrictionMap.set(h, {});
    this._lastViewHexesKey = aoiKey;
  } else {
    // Clear inner objects to reuse allocations
    for (const obj of this.multiFrictionMap.values()) {
      for (const k in obj) delete obj[k];
    }
  }
  // Snapshot multiFrictionMap to a plain object for hot lookups
  this._multiFrictionObj = Object.create(null);
  for (const [k, v] of this.multiFrictionMap) this._multiFrictionObj[k] = v;

  // Precompute allowed layers set and local refs for speed
  const allowed = new Set(['transportation', 'building', 'water', 'landcover', 'landuse']);
  const getSurfaceLocal = getSurface;
  for (let i = 0, fl = features.length; i < fl; i++) {
    const feat = features[i];
    if (!feat || !feat.geometry) continue;
    const src = feat.sourceLayer;
    if (!allowed.has(src)) continue;

    const surface = getSurfaceLocal(feat);

    if (feat.geometry.type === 'Polygon') {
      this.mapPolygonCells(feat.geometry.coordinates, surface);
    } else if (feat.geometry.type === 'MultiPolygon') {
      const m = feat.geometry.coordinates;
      for (let k = 0, mLen = m.length; k < mLen; k++) this.mapPolygonCells(m[k], surface);
    }
  }

  // Populate cellFrictionMap from multiFrictionMap using the viewHexes order (faster than forEach on large maps)
  for (let i = 0, vlen = viewHexes.length; i < vlen; i++) {
    const h = viewHexes[i];
    const val = this._multiFrictionObj[h];
    const minCost = val && val['0'] !== undefined ? val['0'] : 0;
    this.cellFrictionMap.set(h, minCost);
  }

  // Apply gaussian blur from impassable cells to adjacent cells (updates friction map)
  const blurWeights = applyImpassableBlur.call(this);

  this.initializeAffordanceMap();

  // Snapshot affordanceMap to a plain object for hot-loop reads below
  this._affordanceObj = Object.create(null);
  for (const [k, v] of this.affordanceMap) this._affordanceObj[k] = v;
  // Reduce initial affordance for blurred cells proportionally to gaussian weight (skip if no blur)
  if (blurWeights && Object.keys(blurWeights).length > 0) {
    const penalty = IMPASSABLE_BLUR_AFFORDANCE_PENALTY;
    for (const cell in blurWeights) {
      const weight = blurWeights[cell];
      // Prefer consolidated _cellState when available to avoid Map.get in hot loops
      if (this._cellState && this._cellState[cell]) {
        const current = this._cellState[cell].affordance || 0.1;
        const reduction = Math.min(current, weight * penalty);
        const newVal = Math.max(0.0, current - reduction);
        this._cellState[cell].affordance = newVal;
        if (this.affordanceMap && typeof this.affordanceMap.set === 'function') this.affordanceMap.set(cell, newVal);
      } else {
        // Prefer consolidated _affordanceObj snapshot for hot-loop reads/writes
          const current = (this._affordanceObj && typeof this._affordanceObj[cell] !== 'undefined') ? this._affordanceObj[cell] : 0.1;
          const reduction = Math.min(current, weight * penalty);
          const newVal = Math.max(0.0, current - reduction);
          if (this.affordanceMap && typeof this.affordanceMap.set === 'function') this.affordanceMap.set(cell, newVal);
          else if (this.affordanceMap) this.affordanceMap[cell] = newVal;
      }
    }
  }

  // Populate consolidated per-cell state for hot-path consumption
  this._cellState = Object.create(null);
  for (let i = 0, vlen = viewHexes.length; i < vlen; i++) {
    const h = viewHexes[i];
    const fr = (this._frictionObj && typeof this._frictionObj[h] !== 'undefined') ? this._frictionObj[h] : 0;
    // Prefer plain-object affordance snapshot when available to reduce Map.get polymorphism
    const aff = (this._affordanceObj && typeof this._affordanceObj[h] !== 'undefined') ? this._affordanceObj[h] : 0.1;
    const multi = (this._multiFrictionObj && typeof this._multiFrictionObj[h] !== 'undefined') ? this._multiFrictionObj[h] : null;
    this._cellState[h] = { friction: fr, affordance: aff, multi };
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
function applyImpassableBlur() {
  const IMP = FRICTION_COSTS.IMPASSABLE;
  const radius = IMPASSABLE_BLUR_RADIUS;
  const sigma = IMPASSABLE_BLUR_SIGMA;
  const addFactor = IMPASSABLE_BLUR_FRICTION_ADD;

  const cellFrictionMap = this.cellFrictionMap;
  const gridRingLocal = gridRing;

  // Ring cache shared across scans to avoid repeated h3 gridRing calls
  if (!this._ringCache) this._ringCache = new Map();

  // Snapshot the friction map into a plain object for hot-loop reads
  const frictionObj = Object.create(null);
  for (const [k, v] of cellFrictionMap) frictionObj[k] = v;
  // Keep snapshot available for other callers that may reuse it
  this._frictionObj = frictionObj;

  // Collect impassable cells first to reduce iteration overhead
  const impassables = [];
  for (const cell in frictionObj) {
    if (frictionObj[cell] >= IMP) impassables.push(cell);
  }
  if (impassables.length === 0) return new Map();

  // Use a plain object to accumulate blur weights (cheaper than Map in hot loops)
  const blurAcc = Object.create(null);

  for (let i = 0, ilen = impassables.length; i < ilen; i++) {
    const cell = impassables[i];
    for (let d = 1; d <= radius; d++) {
      const ringKey = cell + '::' + d;
      let ring = this._ringCache.get(ringKey);
      if (ring) {
        // Refresh LRU order
        this._ringCache.delete(ringKey);
        this._ringCache.set(ringKey, ring);
      } else {
        try {
          ring = gridRingLocal(cell, d);
          this._ringCache.set(ringKey, ring);
          // Evict oldest if over budget
          if (this._ringCache.size > RING_CACHE_MAX) {
            const oldest = this._ringCache.keys().next().value;
            this._ringCache.delete(oldest);
          }
        } catch (e) {
          continue; // gridRing can throw for pentagons in some edge cases
        }
      }
      const w = Math.exp(-0.5 * Math.pow(d / sigma, 2));
      for (let j = 0, rlen = ring.length; j < rlen; j++) {
        const rc = ring[j];
        if (!(rc in frictionObj)) continue;
        const rcF = frictionObj[rc];
        if (rcF >= IMP) continue; // skip other impassable
        blurAcc[rc] = (blurAcc[rc] || 0) + w;
      }
    }
  }

  // Apply aggregated friction increases and return plain-object blur weights
  const IMP_MINUS = FRICTION_COSTS.IMPASSABLE - 1;
  for (const cell in blurAcc) {
    const weight = blurAcc[cell];
    const orig = frictionObj[cell] || 0;
    const added = weight * addFactor;
    const newF = Math.min(IMP_MINUS, orig + added);
    cellFrictionMap.set(cell, newF);
    if (this._cellState && this._cellState[cell]) this._cellState[cell].friction = newF;
  }

  return blurAcc;
}
