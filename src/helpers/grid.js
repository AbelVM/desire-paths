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

export function getHexes() {
  let hexes;
  try {
    // `this.aoi_polygon` is GeoJSON ([lng, lat]). Use the isGeoJson flag.
    hexes = polygonToCells(this.aoi_polygon, H3_STRIDE_RESOLUTION, true);
  } catch (e) {
    console.error('Error generating hexes for AOI. Please check your AOI geometry.', e);
    return;
  }
  return hexes;
}

/**
 * Fast Grid Building using unified Bounding Box updates
 */
export function triggerFastScan() {
  let viewHexes = this.getHexes();
  const features = this.queryRenderedFeatures(this.aoi_px);
  const len = features.length;

  this.cellFrictionMap.clear();
  this.multiFrictionMap.clear();

  // Initialize with default friction
  this.multiFrictionMap = new Map(viewHexes.map((h) => [h, {}]));

  for (let i = 0; i < len; i++) {
    const feat = features[i];
    if (
      !feat.geometry ||
      !['transportation', 'building', 'water', 'landcover', 'landuse'].includes(feat.sourceLayer)
    )
      continue;

    const surface = getSurface(feat);

    if (feat.geometry.type === 'Polygon') {
      this.mapPolygonCells(feat.geometry.coordinates, surface);
    } else if (feat.geometry.type === 'MultiPolygon') {
      const mLen = feat.geometry.coordinates.length;
      for (let k = 0; k < mLen; k++) {
        this.mapPolygonCells(feat.geometry.coordinates[k], surface);
      }
    }
    // else if (feat.geometry.type === "LineString") {
    //   this.mapLineCells(feat.geometry.coordinates, surface);
    // } else if (feat.geometry.type === "MultiLineString") {
    //   const mLen = feat.geometry.coordinates.length;
    //   for (let k = 0; k < mLen; k++) {
    //     this.mapLineCells(feat.geometry.coordinates[k], surface);
    //   }
    // }
  }

  // Obstacles in other levels do not affect the friction of a cell, but we need to make sure to account for the highest friction
  // per layer, and the lowest across levels. For example, a cell might be tagged as "footway" in one level but also tagged as
  // "highway" in another level (a bridge or tunnel).
  this.multiFrictionMap.forEach((value, key) => {
    // let minCost = Infinity;
    // for (const layer in value) {
    //   if (value[layer] < minCost) {
    //     minCost = value[layer];
    //   }
    // }
    const minCost = value['0'];
    this.cellFrictionMap.set(key, minCost);
  });

  // Apply gaussian blur from impassable cells to adjacent cells (updates friction map)
  const blurWeights = applyImpassableBlur.call(this);

  this.initializeAffordanceMap();

  // Reduce initial affordance for blurred cells proportionally to gaussian weight
  for (let [cell, weight] of blurWeights) {
    if (!this.affordanceMap.has(cell)) continue;
    const current = this.affordanceMap.get(cell) || 0.1;
    const reduction = Math.min(current, weight * IMPASSABLE_BLUR_AFFORDANCE_PENALTY);
    this.affordanceMap.set(cell, Math.max(0.0, current - reduction));
  }

  this.updateLayers();
}

export function mapPolygonCells(coords, surface) {
  // `coords` is GeoJSON ([lng, lat]) — pass isGeoJson = true
  const cells = polygonToCells(coords, H3_STRIDE_RESOLUTION, true);
  mapCells(this.multiFrictionMap, cells, surface);
}

export function mapLineCells(coords, surface) {
  const cLen = coords.length;
  for (let i = 0; i < cLen - 1; i++) {
    const c1 = latLngToCell(coords[i][1], coords[i][0], H3_STRIDE_RESOLUTION);
    const c2 = latLngToCell(coords[i + 1][1], coords[i + 1][0], H3_STRIDE_RESOLUTION);
    mapCells(this.multiFrictionMap, gridPathCells(c1, c2), surface);
  }
}

// Note: This function is designed to be used internally by the mapPolygonCells and mapLineCells functions,
// which handle the geometry parsing and cell generation. It takes a list of cells and a surface type,
// and updates the friction maps accordingly, ensuring that we account for the highest friction
// per level
function mapCells(frictionMap, cells, surface) {
  const cLen = cells.length;
  const s = {};
  s[surface.layer] = FRICTION_COSTS[surface.cost];

  for (let i = 0; i < cLen; i++) {
    const cell = cells[i];
    const val = frictionMap.get(cell);
    if (val === undefined) {
      continue; // This cell is outside of our AOI, so we can skip it
    } else if (
      val !== undefined &&
      (val[surface.layer] === undefined || s[surface.layer] > val[surface.layer])
    ) {
      val[surface.layer] = s[surface.layer];
      frictionMap.set(cell, val);
    }
  }
}

// Apply a gaussian influence from impassable cells outward.
// Returns a Map(cell -> aggregatedWeight) of influenced non-impassable cells.
function applyImpassableBlur() {
  const blurWeights = new Map();

  // Gather all impassable cells
  for (let [cell, friction] of this.cellFrictionMap) {
    if (friction >= FRICTION_COSTS.IMPASSABLE) {
      for (let d = 1; d <= IMPASSABLE_BLUR_RADIUS; d++) {
        let ring = [];
        try {
          ring = gridRing(cell, d);
        } catch (e) {
          // gridRing can throw for pentagons in some edge cases; ignore those cells
          continue;
        }
        for (let rc of ring) {
          if (!this.cellFrictionMap.has(rc)) continue;
          const rcF = this.cellFrictionMap.get(rc);
          if (rcF >= FRICTION_COSTS.IMPASSABLE) continue; // skip other impassable

          const weight = Math.exp(-0.5 * Math.pow(d / IMPASSABLE_BLUR_SIGMA, 2));
          blurWeights.set(rc, (blurWeights.get(rc) || 0) + weight);
        }
      }
    }
  }

  // Apply friction increases based on aggregated weight
  for (let [cell, weight] of blurWeights) {
    const orig = this.cellFrictionMap.get(cell) || 0;
    const added = weight * IMPASSABLE_BLUR_FRICTION_ADD;
    // Ensure we never set a value equal-or-above IMPASSABLE marker
    const newF = Math.min(FRICTION_COSTS.IMPASSABLE - 1, orig + added);
    this.cellFrictionMap.set(cell, newF);
  }

  return blurWeights;
}
